import type { FeedItem } from "./types";
import type { HttpClient } from "./http";
import { htmlToText } from "./text";

// AI 入力と CPU を抑えるための本文長の上限・最小しきい値
const MAX_BODY = 6000;
const MIN_BODY = 200;

function stripChrome(html: string): string {
  return html
    .replace(/<nav[\s\S]*?<\/nav>/gi, " ")
    .replace(/<header[\s\S]*?<\/header>/gi, " ")
    .replace(/<footer[\s\S]*?<\/footer>/gi, " ")
    .replace(/<aside[\s\S]*?<\/aside>/gi, " ");
}

// 本文を内包する代表的なクラス名（部分一致）。順序は優先度どおり。
const CONTENT_CLASS_PATTERNS = [
  "entry-content",
  "post-content",
  "article-content",
  "article-body",
];

function pickByClass(html: string, classFragment: string): string | null {
  const re = new RegExp(
    `<(div|section)[^>]*class=["'][^"']*${classFragment}[^"']*["'][^>]*>([\\s\\S]*?)</\\1>`,
    "i",
  );
  const m = html.match(re);
  return m ? m[2] : null;
}

function mainRegion(html: string): string {
  const article = html.match(/<article[^>]*>([\s\S]*?)<\/article>/i);
  if (article) return article[1];
  const main = html.match(/<main[^>]*>([\s\S]*?)<\/main>/i);
  if (main) return main[1];
  const roleMain = html.match(
    /<(div|section)[^>]*role=["']main["'][^>]*>([\s\S]*?)<\/\1>/i,
  );
  if (roleMain) return roleMain[2];
  for (const fragment of CONTENT_CLASS_PATTERNS) {
    const byClass = pickByClass(html, fragment);
    if (byClass) return byClass;
  }
  return html;
}

/** HTML から記事本文のプレーンテキストを抽出する（軽量・上限付き）。 */
export function extractArticleText(html: string): string {
  const text = htmlToText(stripChrome(mainRegion(html)));
  return text.length > MAX_BODY ? text.slice(0, MAX_BODY) : text;
}

export interface ResolvedBody {
  /** 要約に渡す本文（取得成功時は抽出本文、失敗時は RSS 抜粋） */
  body: string;
  /** 本文取得に失敗し RSS 抜粋で代替したか */
  fetchFailed: boolean;
}

/**
 * 記事本文を取得・抽出する。取得失敗・到達不可・本文が薄い場合は
 * RSS 抜粋で代替し `fetchFailed=true` を立てる。
 */
export async function resolveArticleBody(
  item: FeedItem,
  http: HttpClient,
): Promise<ResolvedBody> {
  try {
    const res = await http.fetch(item.url);
    if (res.ok) {
      const body = extractArticleText(res.text);
      if (body.length >= MIN_BODY) return { body, fetchFailed: false };
    }
  } catch {
    // ネットワークエラーはフォールバックへ
  }
  return { body: item.excerpt, fetchFailed: true };
}
