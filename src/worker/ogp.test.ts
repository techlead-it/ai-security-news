import { describe, it, expect } from "vite-plus/test";
import {
  buildArticleOgp,
  buildDefaultOgp,
  buildHomeOgp,
  ogpAttributeUpdates,
} from "./ogp";
import type { ArticleDto } from "../pipeline/types";

const ORIGIN = "https://example.com";

const sampleArticle: ArticleDto = {
  id: 42,
  title: "プロンプトインジェクションが企業システムを狙う",
  source: "Example",
  url: "https://example.org/article/42",
  category: { name: "セキュリティ", slug: "security" },
  labels: [{ name: "プロンプトインジェクション", slug: "prompt-injection" }],
  summary: "新しい AI 攻撃ベクトルが報告されました。",
  detail: "# 詳細\n\n本文...",
  publishedAt: "2026-06-20T00:00:00Z",
  fetchFailed: false,
};

describe("buildHomeOgp", () => {
  it("returns site-wide OGP for the home page", () => {
    expect(buildHomeOgp(ORIGIN)).toEqual({
      title: "AIセキュリティ・ダイジェスト",
      description:
        "各種ソースから AI セキュリティ関連記事を収集し、日本語で要約しています。",
      url: "https://example.com/home",
      image: "https://example.com/og/default.png",
      type: "website",
      siteName: "AIセキュリティ・ダイジェスト",
      locale: "ja_JP",
    });
  });
});

describe("buildDefaultOgp", () => {
  it("uses the home URL as canonical for unknown SPA routes", () => {
    const meta = buildDefaultOgp(ORIGIN);
    expect(meta.url).toBe("https://example.com/home");
    expect(meta.type).toBe("website");
    expect(meta.image).toBe("https://example.com/og/default.png");
  });
});

describe("buildArticleOgp", () => {
  it("uses the article title and summary as OGP content", () => {
    expect(buildArticleOgp(sampleArticle, ORIGIN)).toEqual({
      title:
        "プロンプトインジェクションが企業システムを狙う | AIセキュリティ・ダイジェスト",
      description: "新しい AI 攻撃ベクトルが報告されました。",
      url: "https://example.com/articles/42",
      image: "https://example.com/og/articles/42.png",
      type: "article",
      siteName: "AIセキュリティ・ダイジェスト",
      locale: "ja_JP",
    });
  });

  it("truncates long summaries to keep descriptions under 200 chars", () => {
    const longSummary = "あ".repeat(300);
    const meta = buildArticleOgp(
      { ...sampleArticle, summary: longSummary },
      ORIGIN,
    );
    expect(meta.description.length).toBe(200);
    expect(meta.description.endsWith("…")).toBe(true);
  });
});

describe("ogpAttributeUpdates", () => {
  it("emits a content-attribute update for every required OGP/Twitter meta", () => {
    const updates = ogpAttributeUpdates(buildHomeOgp(ORIGIN));
    const expectedSelectors = [
      'meta[name="description"]',
      'meta[property="og:type"]',
      'meta[property="og:site_name"]',
      'meta[property="og:title"]',
      'meta[property="og:description"]',
      'meta[property="og:url"]',
      'meta[property="og:image"]',
      'meta[property="og:locale"]',
      'meta[name="twitter:card"]',
      'meta[name="twitter:title"]',
      'meta[name="twitter:description"]',
      'meta[name="twitter:image"]',
    ];
    expect(updates.map((u) => u.selector)).toEqual(expectedSelectors);
    for (const u of updates) {
      expect(u.attribute).toBe("content");
      expect(typeof u.value).toBe("string");
      expect(u.value.length).toBeGreaterThan(0);
    }
  });

  it("uses og:image and twitter:image from the same source", () => {
    const meta = buildArticleOgp(sampleArticle, ORIGIN);
    const updates = ogpAttributeUpdates(meta);
    const ogImage = updates.find((u) => u.selector === 'meta[property="og:image"]');
    const twitterImage = updates.find(
      (u) => u.selector === 'meta[name="twitter:image"]',
    );
    expect(ogImage?.value).toBe("https://example.com/og/articles/42.png");
    expect(twitterImage?.value).toBe("https://example.com/og/articles/42.png");
  });
});
