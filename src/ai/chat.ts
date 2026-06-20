import type { Ai } from "@cloudflare/workers-types";
import { parseSseResponseChunks } from "./sse";

/** 記事チャットに使う Workers AI モデル（解析用と共通）。 */
export const CHAT_MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";

/** AI に投入する記事 body 長の上限。モデルの context window と Neuron 消費を抑える。 */
export const CHAT_MAX_BODY = 6000;

/**
 * 応答生成トークンの上限。Workers AI のデフォルト 256 は日本語で 200〜400 文字
 * 程度しかなく、箇条書きや長文回答が途中で切れる。明示指定で十分な長さを確保する。
 */
export const CHAT_MAX_TOKENS = 2048;

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ChatArticle {
  title: string;
  body: string;
}

/**
 * 記事 context つきチャットの抽象境界。
 * 記事 body を context にしてユーザの質問に応答し、テキストチャンクを順次 yield する。
 */
export interface ChatEngine {
  stream(
    article: ChatArticle,
    messages: ChatMessage[],
  ): AsyncIterable<string>;
}

const SYSTEM_INSTRUCTION =
  "あなたはAIセキュリティに詳しい日本語アシスタントです。\n" +
  "ユーザーが読んでいる記事に関する質問に、与えられた記事本文の内容に基づいて日本語で回答してください。\n" +
  "記事に書かれていないことを尋ねられた場合は、推測せずに「記事には記載がありません」と伝えてください。";

function buildSystemMessage(article: ChatArticle): string {
  const body =
    article.body.length > CHAT_MAX_BODY
      ? article.body.slice(0, CHAT_MAX_BODY)
      : article.body;
  return `${SYSTEM_INSTRUCTION}

---記事タイトル---
${article.title}

---記事本文---
${body}`;
}

export function createWorkersAiChatEngine(
  ai: Ai,
  model = CHAT_MODEL,
): ChatEngine {
  return {
    async *stream(article, userMessages) {
      const raw = (await ai.run(model, {
        messages: [
          { role: "system", content: buildSystemMessage(article) },
          ...userMessages,
        ],
        stream: true,
        max_tokens: CHAT_MAX_TOKENS,
      })) as unknown as ReadableStream<Uint8Array>;
      yield* parseSseResponseChunks(raw);
    },
  };
}

export function createFakeChatEngine(chunks: string[]): ChatEngine {
  return {
    async *stream() {
      for (const c of chunks) yield c;
    },
  };
}
