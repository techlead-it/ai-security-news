import type {
  ExportedHandler,
  Response as CfResponse,
} from "@cloudflare/workers-types";
import type { Env } from "./env";
import { runCollection } from "../pipeline/collect";
import { FEEDS } from "../pipeline/feeds/definitions";
import { httpClient } from "../pipeline/http";
import { createWorkersAiEngine } from "../ai/workers-ai";
import { Repository } from "../repository/repository";
import { routeApi } from "./api";

// Worker は API(/api/*) と静的アセット(SPA) 配信、Cron 収集の起動を担う。
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const result = await routeApi(
      request.method,
      url.pathname,
      url.searchParams,
      new Repository(env.DB),
    );
    if (result) {
      // global の Response(DOM 型) を Worker の CF Response 型へ橋渡しする
      return new Response(JSON.stringify(result.body), {
        status: result.status,
        headers: { "content-type": "application/json; charset=utf-8" },
      }) as unknown as CfResponse;
    }
    return env.ASSETS.fetch(request);
  },

  async scheduled(_controller, env) {
    await runCollection({
      feeds: FEEDS,
      http: httpClient,
      ai: createWorkersAiEngine(env.AI),
      repo: new Repository(env.DB),
      logger: (message) => console.log(message),
    });
  },
} satisfies ExportedHandler<Env>;
