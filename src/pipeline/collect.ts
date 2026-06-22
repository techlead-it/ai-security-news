import type { HttpClient } from "./http";
import type { FeedDef, FeedFailure } from "./feeds/fetch";
import type { AiEngine } from "../ai/engine";
import type { Repository } from "../repository/repository";
import type { ArticleAnalysis, FeedItem } from "./types";
import { collectFeedItems } from "./feeds/fetch";
import { dedupKey } from "./dedup";
import { isLikelyAiSecurity } from "./relevance";
import { resolveArticleBody, MAX_AI_BODY } from "./extract";
import { normalizeLabel } from "./labels";
import { NeuronLimitError } from "../ai/errors";

const CATEGORY_NAME = "セキュリティ";
const CATEGORY_SLUG = "security";
const DEFAULT_CAP = 30;
const DEFAULT_MAX_RETRIES = 3;
const RETRY_BASE_MS = 1000;
// 記事処理の並列度。直列だと 30 件 × 数秒/件 で wall time が cron 上限に当たり
// 「内部エラー」終了になっていたため、本文 fetch + AI 解析を同時実行する。
// Workers AI のレート制限・サブリクエスト本数とのバランスで控えめに 6 本とする
// （feeds/fetch.ts の MAX_CONCURRENT_FETCHES と一貫）。
const DEFAULT_ANALYZE_CONCURRENCY = 6;

export interface PipelineDeps {
  feeds: FeedDef[];
  http: HttpClient;
  ai: AiEngine;
  repo: Repository;
  /** 1 tick の処理上限。超過分は次回に繰り越す */
  cap?: number;
  /** AI 一時エラーのリトライ回数 */
  maxRetries?: number;
  /** 記事処理の並列度（本文 fetch + AI 解析を同時に走らせる本数） */
  analyzeConcurrency?: number;
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

interface ProcessContext {
  http: HttpClient;
  ai: AiEngine;
  repo: Repository;
  categoryId: number;
  maxRetries: number;
  sleep: (ms: number) => Promise<void>;
  log: (message: string) => void;
  labelNamesSet: Set<string>;
}

type ProcessOutcome =
  | { kind: "saved"; source: string; fetchFailed: boolean }
  | { kind: "excluded"; fetchFailed: boolean }
  | { kind: "aiError"; fetchFailed: boolean }
  | { kind: "neuronLimit"; fetchFailed: boolean };

/** 1 記事ぶんの本文取得 → AI 解析 → 永続化を行い、集計用の結果を返す。例外は内部で吸収する。 */
async function processItem(
  item: FeedItem,
  ctx: ProcessContext,
): Promise<ProcessOutcome> {
  let fetchFailed = false;
  try {
    const resolved = await resolveArticleBody(item, ctx.http);
    fetchFailed = resolved.fetchFailed;

    const existingLabels = Array.from(ctx.labelNamesSet);
    const aiBody =
      resolved.body.length > MAX_AI_BODY
        ? resolved.body.slice(0, MAX_AI_BODY)
        : resolved.body;

    let analysis: ArticleAnalysis;
    try {
      analysis = await analyzeWithRetry(
        ctx.ai,
        {
          title: item.title,
          body: aiBody,
          source: item.source,
          existingLabels,
          fetchFailed,
        },
        ctx.maxRetries,
        ctx.sleep,
      );
    } catch (err) {
      if (err instanceof NeuronLimitError) {
        ctx.log("Neuron 日次上限に到達。処理済み分をコミットして終了します。");
        return { kind: "neuronLimit", fetchFailed };
      }
      const errorName =
        err instanceof Error ? err.constructor.name : typeof err;
      const message = err instanceof Error ? err.message : String(err);
      ctx.log(
        `AI 解析に失敗（スキップ）: ${item.url}: ${errorName}: ${message}`,
      );
      return { kind: "aiError", fetchFailed };
    }

    if (!analysis.relevant) return { kind: "excluded", fetchFailed };

    const labelIds: number[] = [];
    for (const raw of analysis.labels) {
      const name = normalizeLabel(raw, existingLabels);
      // 空ラベルやカテゴリ名そのもの（例: セキュリティ）はラベルにしない
      if (name === "" || name === CATEGORY_NAME) continue;
      labelIds.push(await ctx.repo.getOrCreateLabel(ctx.categoryId, name));
      ctx.labelNamesSet.add(name);
    }

    await ctx.repo.saveArticle({
      url: item.url,
      guid: item.guid,
      source: item.source,
      title: item.title,
      categoryId: ctx.categoryId,
      summary: analysis.summary,
      detail: analysis.detail,
      originalLang: analysis.originalLang,
      publishedAt: item.publishedAt,
      fetchFailed,
      labelIds,
      body: resolved.bodyForStorage,
    });
    return { kind: "saved", source: item.source, fetchFailed };
  } catch (err) {
    // 記事単位の予期せぬ失敗は分離し、全体を止めない
    const message = err instanceof Error ? err.message : String(err);
    ctx.log(`記事処理に失敗（スキップ）: ${item.url}: ${message}`);
    return { kind: "aiError", fetchFailed };
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
  const concurrency = deps.analyzeConcurrency ?? DEFAULT_ANALYZE_CONCURRENCY;
  const ctx: ProcessContext = {
    http: deps.http,
    ai: deps.ai,
    repo: deps.repo,
    categoryId,
    maxRetries,
    sleep,
    log,
    labelNamesSet,
  };

  // 並列バッチ。1 バッチ内の全件が settled してから集計し、Neuron 上限を踏んでいたら
  // 次バッチには進まない。並列内で同時に Neuron 上限を踏みうるが、既に進行中だった処理は
  // 結果が活きるよう待ち切る（途中破棄しない）。
  for (let i = 0; i < picked.length; i += concurrency) {
    const batch = picked.slice(i, i + concurrency);
    const results = await Promise.all(batch.map((item) => processItem(item, ctx)));
    for (const r of results) {
      if (r.fetchFailed) summary.fetchFailed++;
      switch (r.kind) {
        case "saved":
          summary.saved++;
          summary.savedBySource[r.source] =
            (summary.savedBySource[r.source] ?? 0) + 1;
          break;
        case "excluded":
          summary.excluded++;
          break;
        case "aiError":
          summary.aiErrors++;
          break;
        case "neuronLimit":
          summary.neuronLimitReached = true;
          break;
      }
    }
    if (summary.neuronLimitReached) break;
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
