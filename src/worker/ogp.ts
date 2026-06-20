import type {
  Element as CfElement,
  HTMLRewriter as CfHTMLRewriter,
  Response as CfResponse,
} from "@cloudflare/workers-types";
import type { ArticleDto } from "../pipeline/types";

const SITE_NAME = "AIセキュリティ・ダイジェスト";
const SITE_DESCRIPTION =
  "各種ソースから AI セキュリティ関連記事を収集し、日本語で要約しています。";
const LOCALE = "ja_JP";
const DEFAULT_OG_IMAGE_PATH = "/og/default.png";
const HOME_PATH = "/home";
const DESCRIPTION_MAX = 200;

export interface OgpMeta {
  title: string;
  description: string;
  url: string;
  image: string;
  type: "website" | "article";
  siteName: string;
  locale: string;
}

export interface OgpAttrUpdate {
  selector: string;
  attribute: string;
  value: string;
}

export function buildHomeOgp(origin: string): OgpMeta {
  return {
    title: SITE_NAME,
    description: SITE_DESCRIPTION,
    url: `${origin}${HOME_PATH}`,
    image: `${origin}${DEFAULT_OG_IMAGE_PATH}`,
    type: "website",
    siteName: SITE_NAME,
    locale: LOCALE,
  };
}

export function buildDefaultOgp(origin: string): OgpMeta {
  return buildHomeOgp(origin);
}

export function buildArticleOgp(article: ArticleDto, origin: string): OgpMeta {
  return {
    title: `${article.title} | ${SITE_NAME}`,
    description: truncate(article.summary, DESCRIPTION_MAX),
    url: `${origin}/articles/${article.id}`,
    image: `${origin}/og/articles/${article.id}.png`,
    type: "article",
    siteName: SITE_NAME,
    locale: LOCALE,
  };
}

export function ogpAttributeUpdates(ogp: OgpMeta): OgpAttrUpdate[] {
  const attr = (selector: string, value: string): OgpAttrUpdate => ({
    selector,
    attribute: "content",
    value,
  });
  return [
    attr('meta[name="description"]', ogp.description),
    attr('meta[property="og:type"]', ogp.type),
    attr('meta[property="og:site_name"]', ogp.siteName),
    attr('meta[property="og:title"]', ogp.title),
    attr('meta[property="og:description"]', ogp.description),
    attr('meta[property="og:url"]', ogp.url),
    attr('meta[property="og:image"]', ogp.image),
    attr('meta[property="og:locale"]', ogp.locale),
    attr('meta[name="twitter:card"]', "summary_large_image"),
    attr('meta[name="twitter:title"]', ogp.title),
    attr('meta[name="twitter:description"]', ogp.description),
    attr('meta[name="twitter:image"]', ogp.image),
  ];
}

declare const HTMLRewriter: typeof CfHTMLRewriter;

export function injectOgp(response: CfResponse, ogp: OgpMeta): CfResponse {
  let rewriter = new HTMLRewriter().on("title", {
    element(el: CfElement) {
      el.setInnerContent(ogp.title);
    },
  });
  for (const update of ogpAttributeUpdates(ogp)) {
    rewriter = rewriter.on(update.selector, {
      element(el: CfElement) {
        el.setAttribute(update.attribute, update.value);
      },
    });
  }
  return rewriter.transform(response);
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
}
