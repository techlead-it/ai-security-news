import { describe, it, expect, beforeEach } from "vite-plus/test";
import { routeApi } from "./api";
import { Repository } from "../repository/repository";
import { createTestD1 } from "../repository/d1-fake";

let repo: Repository;

async function seed() {
  const categoryId = await repo.getOrCreateCategory("セキュリティ", "security");
  const labelId = await repo.getOrCreateLabel(categoryId, "プロンプトインジェクション");
  await repo.saveArticle({
    url: "https://example.com/1",
    guid: null,
    source: "Test",
    title: "プロンプトインジェクション攻撃",
    categoryId,
    summary: "要約1",
    detail: "詳細1",
    originalLang: "ja",
    publishedAt: "2026-06-17T00:00:00Z",
    fetchFailed: false,
    labelIds: [labelId],
  });
  await repo.saveArticle({
    url: "https://example.com/2",
    guid: null,
    source: "Test",
    title: "データポイズニングの脅威",
    categoryId,
    summary: "要約2",
    detail: "詳細2",
    originalLang: "ja",
    publishedAt: "2026-06-16T00:00:00Z",
    fetchFailed: false,
    labelIds: [],
  });
}

function call(method: string, path: string, query = "") {
  return routeApi(method, path, new URLSearchParams(query), repo);
}

beforeEach(async () => {
  repo = new Repository(createTestD1());
  await seed();
});

describe("routeApi /api/articles", () => {
  it("returns the article list with pagination meta", async () => {
    const res = await call("GET", "/api/articles");
    expect(res?.status).toBe(200);
    const body = res?.body as { items: unknown[]; total: number; page: number };
    expect(body.total).toBe(2);
    expect(body.items).toHaveLength(2);
    expect(body.page).toBe(1);
  });

  it("clamps perPage and defaults invalid pagination", async () => {
    const res = await call("GET", "/api/articles", "page=abc&perPage=999");
    const body = res?.body as { page: number; perPage: number };
    expect(body.page).toBe(1);
    expect(body.perPage).toBe(50); // clamped to max
  });

  it("filters by label slug", async () => {
    const res = await call("GET", "/api/articles", "label=prompt-injection");
    const body = res?.body as { total: number };
    expect(body.total).toBe(1);
  });

  it("full-text searches via q", async () => {
    const res = await call("GET", "/api/articles", "q=ポイズニング");
    const body = res?.body as { total: number; items: Array<{ title: string }> };
    expect(body.total).toBe(1);
    expect(body.items[0].title).toBe("データポイズニングの脅威");
  });
});

describe("routeApi /api/articles/:id", () => {
  it("returns a single article", async () => {
    const res = await call("GET", "/api/articles/1");
    expect(res?.status).toBe(200);
    const body = res?.body as { id: number; detail: string };
    expect(body.id).toBe(1);
    expect(body.detail).toBe("詳細1");
  });

  it("returns 404 for a missing article", async () => {
    const res = await call("GET", "/api/articles/999");
    expect(res?.status).toBe(404);
  });
});

describe("routeApi taxonomy endpoints", () => {
  it("lists labels with counts", async () => {
    const res = await call("GET", "/api/labels", "category=security");
    expect(res?.status).toBe(200);
    const body = res?.body as Array<{ slug: string; count: number }>;
    const pi = body.find((l) => l.slug === "prompt-injection");
    expect(pi?.count).toBe(1);
  });

  it("lists categories", async () => {
    const res = await call("GET", "/api/categories");
    expect(res?.body).toEqual([{ name: "セキュリティ", slug: "security" }]);
  });
});

describe("routeApi routing rules", () => {
  it("returns null for non-api paths so the SPA is served", async () => {
    expect(await call("GET", "/home")).toBeNull();
    expect(await call("GET", "/")).toBeNull();
  });

  it("returns 404 for unknown api routes", async () => {
    expect((await call("GET", "/api/unknown"))?.status).toBe(404);
  });

  it("rejects non-GET methods", async () => {
    expect((await call("POST", "/api/articles"))?.status).toBe(405);
  });
});
