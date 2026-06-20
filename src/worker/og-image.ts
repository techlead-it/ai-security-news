import type {
  CacheStorage as CfCacheStorage,
  Request as CfRequest,
  Response as CfResponse,
} from "@cloudflare/workers-types";
import { ImageResponse } from "workers-og";
import type { ArticleDto } from "../pipeline/types";
import {
  buildArticleOgHtml,
  buildDefaultOgHtml,
  FONT_FAMILY,
  OG_HEIGHT,
  OG_WIDTH,
} from "./og-template";

declare const caches: CfCacheStorage;

interface Fonts {
  regular: ArrayBuffer;
  bold: ArrayBuffer;
}

let fontsPromise: Promise<Fonts> | null = null;

function loadFonts(): Promise<Fonts> {
  if (!fontsPromise) {
    fontsPromise = fetchFonts().catch((err) => {
      fontsPromise = null;
      throw err;
    });
  }
  return fontsPromise;
}

async function fetchFonts(): Promise<Fonts> {
  const [regular, bold] = await Promise.all([
    fetchGoogleFont("Noto+Sans+JP", 400),
    fetchGoogleFont("Noto+Sans+JP", 700),
  ]);
  return { regular, bold };
}

async function fetchGoogleFont(
  family: string,
  weight: number,
): Promise<ArrayBuffer> {
  const cacheKey = new Request(
    `https://og-fonts.internal/${family}-${weight}.ttf`,
  ) as unknown as CfRequest;
  const cached = await caches.default.match(cacheKey);
  if (cached) return await cached.arrayBuffer();

  const cssResp = await fetch(
    `https://fonts.googleapis.com/css2?family=${family}:wght@${weight}&display=swap`,
    // 古い User-Agent を使うと TTF (satori が扱える) を返す。
    { headers: { "User-Agent": "Mozilla/5.0 (Windows NT 6.0)" } },
  );
  const css = await cssResp.text();
  const match = css.match(/src:\s*url\((https:\/\/[^)]+\.ttf)\)/);
  if (!match) {
    throw new Error(`Google Fonts CSS から TTF URL を取得できません: ${css}`);
  }
  const fontResp = await fetch(match[1]);
  const buf = await fontResp.arrayBuffer();
  const cacheable = new Response(buf, {
    headers: { "Cache-Control": "public, max-age=2592000" },
  });
  await caches.default.put(cacheKey, cacheable.clone() as unknown as CfResponse);
  return buf;
}

async function renderHtml(html: string): Promise<CfResponse> {
  const fonts = await loadFonts();
  return new ImageResponse(html, {
    width: OG_WIDTH,
    height: OG_HEIGHT,
    fonts: [
      { name: FONT_FAMILY, data: fonts.regular, weight: 400, style: "normal" },
      { name: FONT_FAMILY, data: fonts.bold, weight: 700, style: "normal" },
    ],
  }) as unknown as CfResponse;
}

export async function renderArticleOg(
  article: ArticleDto,
): Promise<CfResponse> {
  return renderHtml(buildArticleOgHtml(article));
}

export async function renderDefaultOg(): Promise<CfResponse> {
  return renderHtml(buildDefaultOgHtml());
}

export async function serveOgImage(
  request: CfRequest,
  generate: () => Promise<CfResponse>,
): Promise<CfResponse> {
  // Cache API は GET レスポンスのみ保存可能。HEAD など他のメソッドでも
  // GET と同じキーでルックアップ/保存できるよう、URL ベースの GET リクエストをキーにする。
  const cacheKey = new Request(request.url, { method: "GET" }) as unknown as CfRequest;
  const cached = await caches.default.match(cacheKey);
  if (cached) return cached;

  const generated = await generate();
  const body = await generated.arrayBuffer();
  const response = new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=86400, s-maxage=86400",
    },
  }) as unknown as CfResponse;
  await caches.default.put(cacheKey, response.clone());
  return response;
}
