import { XMLParser } from "fast-xml-parser";
import type { FeedItem } from "../types";
import { htmlToText } from "../text";

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
});

type XmlNode = Record<string, unknown>;

function toArray<T>(value: T | T[] | undefined | null): T[] {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

/** 文字列・数値・`{ "#text": ... }` ノードからテキストを取り出す。 */
function textOf(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  if (typeof value === "object") {
    const text = (value as XmlNode)["#text"];
    if (typeof text === "string") return text;
    if (typeof text === "number") return String(text);
  }
  return "";
}

function toIso(dateText: string): string | null {
  if (!dateText) return null;
  const ms = Date.parse(dateText);
  if (Number.isNaN(ms)) return null;
  return new Date(ms).toISOString();
}

interface AtomLinkCandidate {
  href: string;
  rel: string;
  type: string;
}

function toAtomLinkCandidate(node: unknown): AtomLinkCandidate | null {
  if (typeof node === "string") {
    // 文字列の <link>https://...</link> はテキストノード扱い。rel 既定は alternate (Atom 1.0)。
    return { href: node, rel: "alternate", type: "" };
  }
  if (!node || typeof node !== "object") return null;
  const obj = node as XmlNode;
  const href = obj["@_href"];
  if (typeof href !== "string" || href.length === 0) return null;
  // Atom 1.0 で rel 未指定は "alternate" 扱い。
  const rel = typeof obj["@_rel"] === "string" ? (obj["@_rel"] as string) : "alternate";
  const type = typeof obj["@_type"] === "string" ? (obj["@_type"] as string) : "";
  return { href, rel, type };
}

/**
 * Atom entry の <link> 群から本文 HTML の URL を選ぶ。
 * 優先順位: rel="alternate" type="text/html" > rel="alternate" > 配列先頭。
 * Blogger 等は rel="replies"/"edit"/"self" を先頭に置くため、無条件先頭採用だと
 * コメントフィードの URL を取ってしまう。
 */
function pickAtomLink(link: unknown): string {
  const candidates = toArray<unknown>(link)
    .map(toAtomLinkCandidate)
    .filter((c): c is AtomLinkCandidate => c !== null);
  if (candidates.length === 0) return "";
  return (
    candidates.find((c) => c.rel === "alternate" && c.type === "text/html")
      ?.href ??
    candidates.find((c) => c.rel === "alternate")?.href ??
    candidates[0].href
  );
}

function parseRssItems(channel: XmlNode, source: string): FeedItem[] {
  return toArray<XmlNode>(channel.item as XmlNode | XmlNode[]).map((item) => {
    // pubDate が無いフィード（RDF系・dc namespace 利用）は dc:date を fallback で見る
    const date = textOf(item.pubDate) || textOf(item["dc:date"]);
    return {
      url: textOf(item.link).trim(),
      guid: item.guid != null ? textOf(item.guid) : null,
      source,
      title: htmlToText(textOf(item.title)),
      excerpt: htmlToText(textOf(item.description)),
      publishedAt: toIso(date),
    };
  });
}

function parseAtomEntries(feed: XmlNode, source: string): FeedItem[] {
  return toArray<XmlNode>(feed.entry as XmlNode | XmlNode[]).map((entry) => ({
    url: pickAtomLink(entry.link).trim(),
    guid: entry.id != null ? textOf(entry.id) : null,
    source,
    title: htmlToText(textOf(entry.title)),
    excerpt: htmlToText(textOf(entry.content ?? entry.summary)),
    publishedAt: toIso(textOf(entry.updated ?? entry.published)),
  }));
}

/** RSS 2.0 / Atom フィードの XML をパースして記事メタの配列に変換する。 */
export function parseFeed(xml: string, source: string): FeedItem[] {
  let doc: XmlNode;
  try {
    doc = parser.parse(xml) as XmlNode;
  } catch {
    return [];
  }
  const rss = doc.rss as XmlNode | undefined;
  if (rss?.channel) return parseRssItems(rss.channel as XmlNode, source);
  const feed = doc.feed as XmlNode | undefined;
  if (feed) return parseAtomEntries(feed, source);
  return [];
}
