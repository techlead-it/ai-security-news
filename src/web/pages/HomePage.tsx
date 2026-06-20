import { Link, useSearchParams } from "react-router";
import { useApi } from "../api/context";
import { useAsync } from "../hooks/useAsync";
import { ArticleCard } from "../components/ArticleCard";
import { SearchBox } from "../components/SearchBox";

export function HomePage() {
  const api = useApi();
  const [params, setParams] = useSearchParams();
  const label = params.get("label") ?? undefined;
  const q = params.get("q") ?? undefined;

  function setFilter(next: { label?: string | null; q?: string | null }) {
    const sp = new URLSearchParams(params);
    for (const [key, value] of Object.entries(next)) {
      if (value == null || value === "") sp.delete(key);
      else sp.set(key, value);
    }
    setParams(sp);
  }

  const labels = useAsync(() => api.listLabels("security"), []);
  const articles = useAsync(
    () => api.listArticles({ label, q, perPage: 50 }),
    [label, q],
  );

  return (
    <div className="mx-auto min-h-screen max-w-6xl px-4 pb-16">
      <header className="py-8">
        <div className="flex items-start justify-between gap-4">
          <h1 className="text-2xl font-bold tracking-tight">
            AIセキュリティ・ダイジェスト
          </h1>
          <Link
            to="/sources"
            className="shrink-0 whitespace-nowrap font-mono text-xs text-accent"
          >
            ソース一覧 →
          </Link>
        </div>
        <p className="mt-1 text-sm text-muted">
          各種ソースから AI セキュリティ関連記事を収集し、日本語で要約しています。
        </p>
        <div className="mt-4">
          <SearchBox initialValue={q ?? ""} onSearch={(value) => setFilter({ q: value })} />
        </div>
      </header>

      {labels.status === "ready" && labels.data.length > 0 && (
        <div className="mb-6 flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setFilter({ label: null })}
            className={`rounded-full px-2.5 py-0.5 text-xs ${
              label ? "bg-accent-soft text-accent" : "bg-accent text-surface"
            }`}
          >
            すべて
          </button>
          {labels.data.map((l) => (
            <button
              key={l.slug}
              type="button"
              onClick={() => setFilter({ label: l.slug })}
              className={`rounded-full px-2.5 py-0.5 text-xs ${
                label === l.slug
                  ? "bg-accent text-surface"
                  : "bg-accent-soft text-accent"
              }`}
            >
              {l.name} ({l.count})
            </button>
          ))}
        </div>
      )}

      {articles.status === "loading" && (
        <p className="text-sm text-muted">読み込み中…</p>
      )}
      {articles.status === "error" && (
        <p className="text-sm text-warn">
          記事の読み込みに失敗しました。時間をおいて再度お試しください。
        </p>
      )}
      {articles.status === "ready" && articles.data.items.length === 0 && (
        <p className="text-sm text-muted">該当する記事がありません。</p>
      )}
      {articles.status === "ready" && articles.data.items.length > 0 && (
        <>
          <p className="mb-4 text-sm text-muted">
            {articles.data.total} 件の記事
          </p>
          <ul className="grid auto-rows-fr gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {articles.data.items.map((article) => (
              <li key={article.id} className="h-full">
                <ArticleCard
                  article={article}
                  onLabelClick={(slug) => setFilter({ label: slug })}
                />
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
