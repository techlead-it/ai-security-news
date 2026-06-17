import type { HttpClient } from "./http";
import type { FeedDef, FeedFailure } from "./feeds/fetch";
import type { AiEngine } from "../ai/engine";
import type { Repository } from "../repository/repository";
import type { ArticleAnalysis, FeedItem } from "./types";
import { collectFeedItems } from "./feeds/fetch";
import { dedupKey } from "./dedup";
import { isLikelyAiSecurity } from "./relevance";
import { resolveArticleBody } from "./extract";
import { normalizeLabel } from "./labels";
import { NeuronLimitError } from "../ai/errors";

const CATEGORY_NAME = "セキュリティ";
const CATEGORY_SLUG = "security";
const DEFAULT_CAP = 30;
const DEFAULT_MAX_RETRIES = 3;
const RETRY_BASE_MS = 1000;

export interface PipelineDeps {
  feeds: FeedDef[];
  http: HttpClient;
  ai: AiEngine;
  repo: Repository;
  /** 1 tick の処理上限。超過分は次回に繰り越す */
  cap?: number;
  /** AI 一時エラーのリトライ回数 */
  maxRetries?: number;
  sleep?: (ms: number) => Promise<void>;
  logger?: (message: string) => void;
}

export interface CollectionSummary {
  fetched: number;
  newCount: number;
  saved: number;
  excluded: number;
  fetchFailed: number;
  aiErrors: number;
  deferred: number;
  neuronLimitReached: boolean;
  /** フィード単位の取得失敗（HTTPエラー or 例外）。観測ログ用 */
  feedFailures: FeedFailure[];
  /** ソース別の保存件数。観測ログ用 */
  savedBySource: Record<string, number>;
}

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/** dedupKey でバッチ内重複を排除した記事一覧と、その dedup キーを返す。 */
function dedupeWithinBatch(items: FeedItem[]): Array<{ item: FeedItem; key: string }> {
  const seen = new Set<string>();
  const result: Array<{ item: FeedItem; key: string }> = [];
  for (const item of items) {
    const key = dedupKey(item);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push({ item, key });
  }
  return result;
}

/**
 * ソース別にラウンドロビンで cap 件まで採用する。
 * 高頻度フィードが先頭で枠を独占して低頻度フィードが永続的に取り込まれない
 * スタベーションを防ぐ。各ソースのキューは入力順を保つ。
 */
function pickRoundRobin(
  items: FeedItem[],
  cap: number,
): { picked: FeedItem[]; deferred: number } {
  const queues = new Map<string, FeedItem[]>();
  for (const item of items) {
    const q = queues.get(item.source);
    if (q) q.push(item);
    else queues.set(item.source, [item]);
  }
  const picked: FeedItem[] = [];
  while (picked.length < cap) {
    let progressed = false;
    for (const q of queues.values()) {
      if (picked.length >= cap) break;
      const next = q.shift();
      if (next !== undefined) {
        picked.push(next);
        progressed = true;
      }
    }
    if (!progressed) break;
  }
  return { picked, deferred: items.length - picked.length };
}

async function analyzeWithRetry(
  ai: AiEngine,
  input: Parameters<AiEngine["analyze"]>[0],
  maxRetries: number,
  sleep: (ms: number) => Promise<void>,
): Promise<ArticleAnalysis> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await ai.analyze(input);
    } catch (err) {
      if (err instanceof NeuronLimitError) throw err;
      if (attempt >= maxRetries) throw err;
      await sleep(RETRY_BASE_MS * 2 ** attempt);
    }
  }
}

/**
 * 収集パイプライン本体。取得→新着抽出→一次フィルタ→上限キャップ→本文取得→
 * 二次判定→要約→ラベル分類→永続化を実行する。全 I/O は注入されたフェイクで置換可能。
 */
export async function runCollection(
  deps: PipelineDeps,
): Promise<CollectionSummary> {
  const cap = deps.cap ?? DEFAULT_CAP;
  const maxRetries = deps.maxRetries ?? DEFAULT_MAX_RETRIES;
  const sleep = deps.sleep ?? defaultSleep;
  const log = deps.logger ?? (() => {});
  const summary: CollectionSummary = {
    fetched: 0,
    newCount: 0,
    saved: 0,
    excluded: 0,
    fetchFailed: 0,
    aiErrors: 0,
    deferred: 0,
    neuronLimitReached: false,
    feedFailures: [],
    savedBySource: {},
  };

  const categoryId = await deps.repo.getOrCreateCategory(
    CATEGORY_NAME,
    CATEGORY_SLUG,
  );

  const { items, failures } = await collectFeedItems(deps.feeds, deps.http);
  summary.fetched = items.length;
  summary.feedFailures = failures;
  for (const failure of failures) {
    log(`フィード取得失敗 ${failure.source}: ${failure.reason}`);
  }

  const candidates = dedupeWithinBatch(items);
  const existing = await deps.repo.listExistingKeys(
    candidates.map((c) => c.key),
  );
  const fresh = candidates.filter((c) => !existing.has(c.key));
  summary.newCount = fresh.length;

  // 一次キーワードフィルタ（安価）で明らかな無関係を除外
  const passedFirst = fresh.filter((c) => {
    const ok = isLikelyAiSecurity(`${c.item.title} ${c.item.excerpt}`);
    if (!ok) summary.excluded++;
    return ok;
  });

  // ソース別ラウンドロビンで cap 件まで採用。高頻度フィードに枠を独占されない
  const { picked, deferred } = pickRoundRobin(
    passedFirst.map((c) => c.item),
    cap,
  );
  summary.deferred = deferred;

  // ラベル一覧はループ前に1回取得し、ループ中に作成した新規ラベルはローカル Set
  // に追記する。1記事ごとに D1 へ再問い合わせするのを避けるため。
  const labelNamesSet = new Set(await deps.repo.listLabelNames(categoryId));

  for (const item of picked) {
    try {
      const { body, fetchFailed } = await resolveArticleBody(item, deps.http);
      if (fetchFailed) summary.fetchFailed++;

      const existingLabels = Array.from(labelNamesSet);

      let analysis: ArticleAnalysis;
      try {
        analysis = await analyzeWithRetry(
          deps.ai,
          {
            title: item.title,
            body,
            source: item.source,
            existingLabels,
            fetchFailed,
          },
          maxRetries,
          sleep,
        );
      } catch (err) {
        if (err instanceof NeuronLimitError) {
          summary.neuronLimitReached = true;
          log("Neuron 日次上限に到達。処理済み分をコミットして終了します。");
          break;
        }
        summary.aiErrors++;
        log(`AI 解析に失敗（スキップ）: ${item.url}`);
        continue;
      }

      // 二次関連性判定で AI セキュリティ以外を除外
      if (!analysis.relevant) {
        summary.excluded++;
        continue;
      }

      const labelIds: number[] = [];
      for (const raw of analysis.labels) {
        const name = normalizeLabel(raw, existingLabels);
        // 空ラベルやカテゴリ名そのもの（例: セキュリティ）はラベルにしない
        if (name === "" || name === CATEGORY_NAME) continue;
        labelIds.push(await deps.repo.getOrCreateLabel(categoryId, name));
        labelNamesSet.add(name);
      }

      await deps.repo.saveArticle({
        url: item.url,
        guid: item.guid,
        source: item.source,
        title: item.title,
        categoryId,
        summary: analysis.summary,
        detail: analysis.detail,
        originalLang: analysis.originalLang,
        publishedAt: item.publishedAt,
        fetchFailed,
        labelIds,
      });
      summary.saved++;
      summary.savedBySource[item.source] =
        (summary.savedBySource[item.source] ?? 0) + 1;
    } catch (err) {
      // 記事単位の予期せぬ失敗は分離し、全体を止めない
      summary.aiErrors++;
      const message = err instanceof Error ? err.message : String(err);
      log(`記事処理に失敗（スキップ）: ${item.url}: ${message}`);
    }
  }

  log(
    `収集サマリ: 取得=${summary.fetched} 新規=${summary.newCount} ` +
      `保存=${summary.saved} 除外=${summary.excluded} ` +
      `取得失敗=${summary.fetchFailed} AIエラー=${summary.aiErrors} ` +
      `繰越=${summary.deferred} Neuron上限=${summary.neuronLimitReached}`,
  );
  const breakdown = Object.entries(summary.savedBySource)
    .map(([source, n]) => `${source}=${n}`)
    .join(" ");
  if (breakdown) log(`保存内訳: ${breakdown}`);
  return summary;
}
