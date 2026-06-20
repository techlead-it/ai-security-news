import { describe, it, expect } from "vite-plus/test";
import { buildArticleOgHtml, buildDefaultOgHtml } from "./og-template";
import type { ArticleDto } from "../pipeline/types";

const article: ArticleDto = {
  id: 42,
  title: "プロンプトインジェクションが企業システムを狙う",
  source: "Example",
  url: "https://example.org/article/42",
  category: { name: "セキュリティ", slug: "security" },
  labels: [
    { name: "プロンプトインジェクション", slug: "prompt-injection" },
    { name: "LLM", slug: "llm" },
  ],
  summary: "新しい AI 攻撃ベクトル。",
  detail: "本文",
  publishedAt: "2026-06-20T00:00:00Z",
  fetchFailed: false,
};

describe("buildArticleOgHtml", () => {
  it("includes the article title, publish date and tags", () => {
    const html = buildArticleOgHtml(article);
    expect(html).toContain("プロンプトインジェクションが企業システムを狙う");
    expect(html).toContain("2026-06-20");
    expect(html).toContain("セキュリティ");
    expect(html).toContain("プロンプトインジェクション");
    expect(html).toContain("LLM");
    expect(html).toContain("AI SECURITY NEWS");
  });

  it("escapes HTML special characters in the title to prevent injection", () => {
    const html = buildArticleOgHtml({
      ...article,
      title: '<script>alert("x")</script>',
    });
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("renders without a publish date when publishedAt is null", () => {
    const html = buildArticleOgHtml({ ...article, publishedAt: null });
    expect(html).not.toContain("2026-06-20");
    expect(html).toContain("プロンプトインジェクションが企業システムを狙う");
  });

  it("limits the number of tags rendered to keep the layout intact", () => {
    const many = {
      ...article,
      labels: Array.from({ length: 10 }, (_, i) => ({
        name: `ラベル${i}`,
        slug: `label-${i}`,
      })),
    };
    const html = buildArticleOgHtml(many);
    expect(html).toContain("ラベル0");
    expect(html).toContain("ラベル1");
    expect(html).not.toContain("ラベル9");
  });
});

describe("buildDefaultOgHtml", () => {
  it("uses the site name and description", () => {
    const html = buildDefaultOgHtml();
    expect(html).toContain("AI SECURITY NEWS");
    expect(html).toContain("AIセキュリティ・ダイジェスト");
  });
});
