import { useCallback, useEffect, useRef } from "react";
import useSWRInfinite from "swr/infinite";
import type { ApiClient, ListParams } from "../api/client";
import type { ArticleDto, ArticleListResponse } from "../../pipeline/types";

export type InfiniteArticlesState =
  | { status: "loading" }
  | { status: "error"; error: Error }
  | {
      status: "ready";
      items: ArticleDto[];
      total: number;
      hasMore: boolean;
      isLoadingMore: boolean;
      loadMore: () => void;
      loadMoreError?: Error;
    };

type FetchParams = Pick<ListParams, "label" | "q" | "perPage">;

type ArticlesKey = readonly ["articles", string, string, number, number];

function asError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value));
}

/**
 * 無限スクロール用の記事ページング状態。useSWRInfinite を薄くラップする。
 * params (label/q/perPage) が変わると key が変わり SWR の cache が独立し、
 * 同じ params で再マウントされた場合は cache から即時復元され loading を経由しない。
 */
export function useInfiniteArticles(
  api: ApiClient,
  params: FetchParams,
): InfiniteArticlesState {
  const { label, q, perPage } = params;

  const getKey = useCallback(
    (
      pageIndex: number,
      previous: ArticleListResponse | null,
    ): ArticlesKey | null => {
      if (previous && previous.items.length === 0) return null;
      if (previous && previous.items.length >= previous.total) return null;
      return [
        "articles",
        label ?? "",
        q ?? "",
        perPage ?? 0,
        pageIndex + 1,
      ] as const;
    },
    [label, q, perPage],
  );

  const { data, error, isLoading, size, setSize, mutate } = useSWRInfinite<
    ArticleListResponse,
    Error,
    (pageIndex: number, prev: ArticleListResponse | null) => ArticlesKey | null
  >(
    getKey,
    (key) => {
      const [, l, query, pp, page] = key;
      return api.listArticles({
        label: l || undefined,
        q: query || undefined,
        page,
        perPage: pp || undefined,
      });
    },
    {
      revalidateFirstPage: false,
      parallel: false,
    },
  );

  const pages = data ?? [];
  const items = pages.flatMap((p) => p.items);
  const total = pages.length > 0 ? pages[pages.length - 1].total : 0;
  const hasMore = items.length > 0 && items.length < total;
  // 期待ページ数まで揃っていない && 失敗していない = 追加ロード中
  const isLoadingMore = size > pages.length && !error;

  // 連続 loadMore 呼び出しで setSize を多重起動しないためのガード。
  // pending=true の間は次の loadMore を無視し、新しいページが届いたら解除する。
  const pendingRef = useRef(false);
  useEffect(() => {
    if (size <= pages.length || error) pendingRef.current = false;
  }, [size, pages.length, error]);

  const loadMore = useCallback(() => {
    if (pendingRef.current) return;
    pendingRef.current = true;
    if (error) {
      // 失敗ページの再試行。size は既に次ページ分まで進んでいるので、
      // mutate で再 revalidate するだけで失敗ページが再 fetch される。
      void mutate();
      return;
    }
    void setSize((prev) => prev + 1);
  }, [setSize, mutate, error]);

  if (isLoading && pages.length === 0) return { status: "loading" };
  if (error && pages.length === 0) {
    return { status: "error", error: asError(error) };
  }

  return {
    status: "ready",
    items,
    total,
    hasMore,
    isLoadingMore,
    loadMore,
    loadMoreError: pages.length > 0 && error ? asError(error) : undefined,
  };
}
