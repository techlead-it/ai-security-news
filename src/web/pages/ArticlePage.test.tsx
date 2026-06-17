import { describe, it, expect } from "vite-plus/test";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { ArticlePage } from "./ArticlePage";
import { ApiProvider } from "../api/context";
import type { ApiClient } from "../api/client";
import type { ArticleDto } from "../../pipeline/types";

const article: ArticleDto = {
  id: 7,
  title: "プロンプトインジェクションの新手法",
  source: "Embrace The Red",
  url: "https://example.com/post",
  category: { name: "セキュリティ", slug: "security" },
  labels: [{ name: "プロンプトインジェクション", slug: "prompt-injection" }],
  summary: "ガードレールを回避する新手法の要約。",
  detail: "- 要点1\n- 要点2",
  publishedAt: "2026-06-17T09:00:00Z",
  fetchFailed: false,
};

function fakeApi(overrides: Partial<ApiClient> = {}): ApiClient {
  return {
    listArticles: async () => ({ items: [], page: 1, perPage: 50, total: 0 }),
    getArticle: async () => article,
    listLabels: async () => [],
    listCategories: async () => [],
    listSources: async () => [],
    ...overrides,
  };
}

function renderArticle(api: ApiClient) {
  return render(
    <ApiProvider client={api}>
      <MemoryRouter initialEntries={["/articles/7"]}>
        <Routes>
          <Route path="/articles/:id" element={<ArticlePage />} />
        </Routes>
      </MemoryRouter>
    </ApiProvider>,
  );
}

describe("ArticlePage", () => {
  it("renders the detail bullet list as markdown list items", async () => {
    renderArticle(fakeApi());
    await screen.findByText("要点1");
    const items = screen.getAllByRole("listitem");
    expect(items.map((li) => li.textContent)).toEqual(["要点1", "要点2"]);
  });

  it("links to the original article in a new tab", async () => {
    renderArticle(fakeApi());
    const link = await screen.findByRole("link", { name: /元記事を読む/ });
    expect(link).toHaveAttribute("href", "https://example.com/post");
    expect(link).toHaveAttribute("target", "_blank");
  });
});
