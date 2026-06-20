import { Link } from "react-router";
import type { ArticleDto } from "../../pipeline/types";
import { formatDate } from "../lib/format";

export function ArticleCard({
  article,
  onLabelClick,
}: {
  article: ArticleDto;
  onLabelClick?: (slug: string) => void;
}) {
  return (
    <article className="relative flex h-full flex-col rounded-[--radius-card] border border-line bg-surface p-5 shadow-sm transition hover:border-accent hover:shadow-md">
      <div className="flex items-center gap-2 font-mono text-xs text-muted">
        <span>{article.source}</span>
        {article.publishedAt && (
          <>
            <span aria-hidden>·</span>
            <time dateTime={article.publishedAt}>
              {formatDate(article.publishedAt)}
            </time>
          </>
        )}
        {article.fetchFailed && (
          <span className="rounded bg-warn-soft px-1.5 py-0.5 text-warn">
            抜粋ベース
          </span>
        )}
      </div>

      <h2 className="mt-2 line-clamp-2 text-lg font-semibold leading-snug">
        <Link
          to={`/articles/${article.id}`}
          className="before:absolute before:inset-0 hover:text-accent"
        >
          {article.title}
        </Link>
      </h2>

      <p className="mt-2 line-clamp-4 text-sm leading-relaxed text-ink/80">
        {article.summary}
      </p>

      <div className="relative z-10 mt-auto flex flex-wrap gap-1.5 pt-3">
        {article.labels.map((label) => (
          <button
            key={label.slug}
            type="button"
            onClick={() => onLabelClick?.(label.slug)}
            className="rounded-full bg-accent-soft px-2.5 py-0.5 text-xs text-accent hover:bg-accent hover:text-surface"
          >
            {label.name}
          </button>
        ))}
      </div>
    </article>
  );
}
