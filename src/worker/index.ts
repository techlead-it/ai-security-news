import type {
  ExportedHandler,
  Request as CfRequest,
  Response as CfResponse,
} from "@cloudflare/workers-types";
import type { Env } from "./env";
import { runCollection } from "../pipeline/collect";
import { FEEDS } from "../pipeline/feeds/definitions";
import { httpClient } from "../pipeline/http";
import { createWorkersAiEngine } from "../ai/workers-ai";
import { createWorkersAiChatEngine } from "../ai/chat";
import { Repository } from "../repository/repository";
import { routeApi } from "./api";
import { handleChatRequest } from "./chat";
import {
  buildArticleOgp,
  buildDefaultOgp,
  buildHomeOgp,
  injectOgp,
  type OgpMeta,
} from "./ogp";
import { renderArticleOg, renderDefaultOg, serveOgImage } from "./og-image";

// Worker は API(/api/*) と静的アセット(SPA) 配信、OG 画像生成、Cron 収集の起動を担う。
// SPA ルート(/, /home, /articles/:id 等) では取得した index.html に HTMLRewriter で
// OGP メタタグを書き換えてからクライアントへ返す。
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const pathname = url.pathname;

    // chat は SSE で response body を流すため JSON 統一の routeApi には乗せず別経路で処理する。
    const chatMatch = pathname.match(/^\/api\/articles\/(\d+)\/chat$/);
    if (chatMatch && request.method === "POST") {
      const id = Number.parseInt(chatMatch[1], 10);
      const res = await handleChatRequest(
        request as unknown as Request,
        id,
        new Repository(env.DB),
        createWorkersAiChatEngine(env.AI),
      );
      return res as unknown as CfResponse;
    }

    const apiResult = await routeApi(
      request.method,
      pathname,
      url.searchParams,
      new Repository(env.DB),
      FEEDS,
    );
    if (apiResult) {
      // global の Response(DOM 型) を Worker の CF Response 型へ橋渡しする
      return new Response(JSON.stringify(apiResult.body), {
        status: apiResult.status,
        headers: { "content-type": "application/json; charset=utf-8" },
      }) as unknown as CfResponse;
    }

    const ogResponse = await routeOgImage(pathname, request, env);
    if (ogResponse) return ogResponse;

    const assetResponse = await env.ASSETS.fetch(request);
    if (!isHtmlResponse(assetResponse)) {
      return assetResponse;
    }
    const ogp = await resolveOgpForPath(url, env);
    return injectOgp(assetResponse, ogp);
  },

  async scheduled(_controller, env) {
    try {
      await runCollection({
        feeds: FEEDS,
        http: httpClient,
        ai: createWorkersAiEngine(env.AI),
        repo: new Repository(env.DB),
        logger: (message) => console.log(message),
      });
    } catch (err) {
      // 例外を握り潰すと Cloudflare の cron 履歴には「内部エラー」とだけ
      // 残り原因が一切追えないため、必ずスタックを console に出してから再throw する。
      console.error("[cron] runCollection failed:", err);
      throw err;
    }
  },
} satisfies ExportedHandler<Env>;

function isHtmlResponse(response: CfResponse): boolean {
  const contentType = response.headers.get("content-type") ?? "";
  return contentType.includes("text/html");
}

async function resolveOgpForPath(url: URL, env: Env): Promise<OgpMeta> {
  const { origin, pathname } = url;
  if (pathname === "/" || pathname === "/home") return buildHomeOgp(origin);

  const articleMatch = pathname.match(/^\/articles\/(\d+)$/);
  if (articleMatch) {
    const id = Number.parseInt(articleMatch[1], 10);
    const article = await new Repository(env.DB).getArticle(id);
    if (article) return buildArticleOgp(article, origin);
  }
  return buildDefaultOgp(origin);
}

async function routeOgImage(
  pathname: string,
  request: CfRequest,
  env: Env,
): Promise<CfResponse | null> {
  if (pathname === "/og/default.png") {
    return serveOgImage(request, renderDefaultOg);
  }
  const articleMatch = pathname.match(/^\/og\/articles\/(\d+)\.png$/);
  if (articleMatch) {
    const id = Number.parseInt(articleMatch[1], 10);
    const article = await new Repository(env.DB).getArticle(id);
    if (!article) {
      return new Response("Not found", { status: 404 }) as unknown as CfResponse;
    }
    return serveOgImage(request, () => renderArticleOg(article));
  }
  return null;
}
