import { Link, useParams } from "react-router";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useApi } from "../api/context";
import { useAsync } from "../hooks/useAsync";
import { formatDate } from "../lib/format";

export function ArticlePage() {
  const api = useApi();
  const { id } = useParams();
  const articleId = Number(id);
  const state = useAsync(() => api.getArticle(articleId), [articleId]);

  return (
    <div className="mx-auto min-h-screen max-w-3xl px-4 pb-16">
      <header className="py-6">
        <Link to="/home" className="font-mono text-xs text-accent">
          ← 一覧へ戻る
        </Link>
      </header>

      {state.status === "loading" && (
        <p className="text-sm text-muted">読み込み中…</p>
      )}
      {state.status === "error" && (
        <p className="text-sm text-warn">記事の読み込みに失敗しました。</p>
      )}
      {state.status === "ready" && state.data === null && (
        <p className="text-sm text-muted">記事が見つかりませんでした。</p>
      )}
      {state.status === "ready" && state.data !== null && (
        <article>
          <div className="flex flex-wrap items-center gap-2 font-mono text-xs text-muted">
            <span>{state.data.source}</span>
            {state.data.publishedAt && (
              <>
                <span aria-hidden>·</span>
                <time dateTime={state.data.publishedAt}>
                  {formatDate(state.data.publishedAt)}
                </time>
              </>
            )}
            {state.data.fetchFailed && (
              <span className="rounded bg-warn-soft px-1.5 py-0.5 text-warn">
                抜粋ベース
              </span>
            )}
          </div>

          <h1 className="mt-2 text-2xl font-bold leading-snug">
            {state.data.title}
          </h1>

          {state.data.labels.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {state.data.labels.map((label) => (
                <Link
                  key={label.slug}
                  to={`/home?label=${encodeURIComponent(label.slug)}`}
                  className="rounded-full bg-accent-soft px-2.5 py-0.5 text-xs text-accent"
                >
                  {label.name}
                </Link>
              ))}
            </div>
          )}

          <section className="mt-6">
            <h2 className="text-sm font-semibold text-muted">要約</h2>
            <div className="prose prose-sm mt-1 max-w-none">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {state.data.summary}
              </ReactMarkdown>
            </div>
          </section>

          <section className="mt-6">
            <h2 className="text-sm font-semibold text-muted">要点</h2>
            <div className="prose prose-sm mt-1 max-w-none">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {state.data.detail}
              </ReactMarkdown>
            </div>
          </section>

          <div className="mt-8">
            <a
              href={state.data.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block rounded-md bg-accent px-4 py-2 text-sm text-surface"
            >
              元記事を読む ↗
            </a>
          </div>
        </article>
      )}
    </div>
  );
}
