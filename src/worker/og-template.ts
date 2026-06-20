import type { ArticleDto } from "../pipeline/types";

export const OG_WIDTH = 1200;
export const OG_HEIGHT = 630;
export const FONT_FAMILY = "NotoSansJP";
const MAX_TAGS = 3;
const SITE_LABEL = "AI SECURITY NEWS";
const SITE_TAGLINE = "AIセキュリティ・ダイジェスト";

export function buildArticleOgHtml(article: ArticleDto): string {
  const publishedAt = article.publishedAt
    ? article.publishedAt.slice(0, 10)
    : "";
  const tags = [
    article.category.name,
    ...article.labels.slice(0, MAX_TAGS - 1).map((l) => l.name),
  ]
    .filter(Boolean)
    .slice(0, MAX_TAGS);

  const tagHtml = tags
    .map(
      (t) =>
        `<span style="display:flex;padding:8px 22px;border:2px solid #bfa66a;border-radius:9999px;color:#bfa66a;font-size:24px;">${escapeHtml(t)}</span>`,
    )
    .join("");

  return (
    `<div style="width:${OG_WIDTH}px;height:${OG_HEIGHT}px;display:flex;flex-direction:column;background:#1c1a15;color:#f5e8c7;padding:64px 72px;font-family:${FONT_FAMILY};">` +
    `<div style="display:flex;align-items:center;font-size:30px;color:#bfa66a;letter-spacing:0.12em;font-weight:700;">${SITE_LABEL}</div>` +
    `<div style="flex:1;display:flex;align-items:center;">` +
    `<div style="display:flex;font-size:62px;font-weight:700;line-height:1.3;letter-spacing:-0.01em;">${escapeHtml(article.title)}</div>` +
    `</div>` +
    `<div style="display:flex;justify-content:space-between;align-items:flex-end;font-size:26px;color:#8b8170;">` +
    `<div style="display:flex;align-items:center;">${publishedAt}</div>` +
    `<div style="display:flex;gap:12px;">${tagHtml}</div>` +
    `</div>` +
    `</div>`
  );
}

export function buildDefaultOgHtml(): string {
  return (
    `<div style="width:${OG_WIDTH}px;height:${OG_HEIGHT}px;display:flex;flex-direction:column;background:#1c1a15;color:#f5e8c7;padding:64px 72px;font-family:${FONT_FAMILY};">` +
    `<div style="display:flex;align-items:center;font-size:34px;color:#bfa66a;letter-spacing:0.12em;font-weight:700;">${SITE_LABEL}</div>` +
    `<div style="flex:1;display:flex;flex-direction:column;justify-content:center;">` +
    `<div style="display:flex;font-size:72px;font-weight:700;line-height:1.2;white-space:nowrap;">${SITE_TAGLINE}</div>` +
    `<div style="display:flex;margin-top:24px;font-size:30px;color:#8b8170;">AI セキュリティ関連記事を日本語で要約してお届け</div>` +
    `</div>` +
    `</div>`
  );
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
