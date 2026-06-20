import { describe, it, expect } from "vite-plus/test";
import type { Ai } from "@cloudflare/workers-types";
import {
  createWorkersAiChatEngine,
  createFakeChatEngine,
  CHAT_MODEL,
  CHAT_MAX_BODY,
  CHAT_MAX_TOKENS,
} from "./chat";

function sseStream(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const c of chunks) controller.enqueue(encoder.encode(c));
      controller.close();
    },
  });
}

async function collect(iter: AsyncIterable<string>): Promise<string[]> {
  const out: string[] = [];
  for await (const c of iter) out.push(c);
  return out;
}

describe("createWorkersAiChatEngine", () => {
  it("yields response text chunks parsed from SSE data events", async () => {
    const ai = {
      run: async () =>
        sseStream([
          'data: {"response":"こん"}\n\n',
          'data: {"response":"にちは"}\n\n',
          "data: [DONE]\n\n",
        ]),
    } as unknown as Ai;

    const engine = createWorkersAiChatEngine(ai);
    const chunks = await collect(
      engine.stream({ title: "T", body: "B" }, [
        { role: "user", content: "教えて" },
      ]),
    );
    expect(chunks).toEqual(["こん", "にちは"]);
  });

  it("handles SSE chunks split across multiple reads", async () => {
    const ai = {
      run: async () =>
        sseStream([
          'data: {"response":"前',
          '半"}\n\ndata: {"response":"後半"}\n\n',
          "data: [DONE]\n\n",
        ]),
    } as unknown as Ai;
    const engine = createWorkersAiChatEngine(ai);
    const chunks = await collect(
      engine.stream({ title: "T", body: "B" }, [
        { role: "user", content: "q" },
      ]),
    );
    expect(chunks).toEqual(["前半", "後半"]);
  });

  it("sends the configured model with stream:true and system+user messages containing the article", async () => {
    const calls: Array<{ model: string; inputs: unknown }> = [];
    const ai = {
      run: async (model: string, inputs: unknown) => {
        calls.push({ model, inputs });
        return sseStream(["data: [DONE]\n\n"]);
      },
    } as unknown as Ai;

    const engine = createWorkersAiChatEngine(ai);
    await collect(
      engine.stream(
        { title: "AI セキュリティの最新動向", body: "本文の全文" },
        [{ role: "user", content: "要点は？" }],
      ),
    );
    expect(calls).toHaveLength(1);
    expect(calls[0].model).toBe(CHAT_MODEL);
    const inputs = calls[0].inputs as {
      stream: boolean;
      messages: Array<{ role: string; content: string }>;
    };
    expect(inputs.stream).toBe(true);
    expect(inputs.messages[0].role).toBe("system");
    expect(inputs.messages[0].content).toContain("AI セキュリティの最新動向");
    expect(inputs.messages[0].content).toContain("本文の全文");
    expect(inputs.messages[1]).toEqual({ role: "user", content: "要点は？" });
  });

  it("yields a stringified number when the model returns response as a numeric token (e.g. \"2\" alone)", async () => {
    const ai = {
      run: async () =>
        sseStream([
          'data: {"response":"1. 入力"}\n\n',
          'data: {"response":2}\n\n',
          'data: {"response":". 出力"}\n\n',
          "data: [DONE]\n\n",
        ]),
    } as unknown as Ai;
    const engine = createWorkersAiChatEngine(ai);
    const chunks = await collect(
      engine.stream({ title: "T", body: "B" }, [
        { role: "user", content: "q" },
      ]),
    );
    expect(chunks).toEqual(["1. 入力", "2", ". 出力"]);
  });

  it("caps the article body at CHAT_MAX_BODY when embedding it into the system message", async () => {
    const calls: Array<{ inputs: unknown }> = [];
    const ai = {
      run: async (_model: string, inputs: unknown) => {
        calls.push({ inputs });
        return sseStream(["data: [DONE]\n\n"]);
      },
    } as unknown as Ai;

    const longBody = "あ".repeat(CHAT_MAX_BODY + 1000);
    const engine = createWorkersAiChatEngine(ai);
    await collect(
      engine.stream({ title: "T", body: longBody }, [
        { role: "user", content: "q" },
      ]),
    );
    const systemContent = (
      calls[0].inputs as { messages: Array<{ content: string }> }
    ).messages[0].content;
    // 本文部分の長さは CHAT_MAX_BODY に切られていること
    const bodyOnly = systemContent.split("---記事本文---\n")[1] ?? "";
    expect(bodyOnly.length).toBe(CHAT_MAX_BODY);
  });

  it("passes CHAT_MAX_TOKENS to ai.run so the model's small default does not truncate long answers", async () => {
    // Workers AI のデフォルト max_tokens は 256 と小さく、日本語応答が途中で
    // 切れる。inputs に明示的に上限を渡すことを契約として固定する。
    const calls: Array<{ inputs: unknown }> = [];
    const ai = {
      run: async (_model: string, inputs: unknown) => {
        calls.push({ inputs });
        return sseStream(["data: [DONE]\n\n"]);
      },
    } as unknown as Ai;

    const engine = createWorkersAiChatEngine(ai);
    await collect(
      engine.stream({ title: "T", body: "B" }, [
        { role: "user", content: "q" },
      ]),
    );
    const inputs = calls[0].inputs as { max_tokens?: number };
    expect(inputs.max_tokens).toBe(CHAT_MAX_TOKENS);
  });

  it("ignores malformed SSE lines without breaking the stream", async () => {
    const ai = {
      run: async () =>
        sseStream([
          "data: not-json\n\n",
          'data: {"response":"OK"}\n\n',
          "data: [DONE]\n\n",
        ]),
    } as unknown as Ai;
    const engine = createWorkersAiChatEngine(ai);
    const chunks = await collect(
      engine.stream({ title: "T", body: "B" }, [
        { role: "user", content: "q" },
      ]),
    );
    expect(chunks).toEqual(["OK"]);
  });
});

describe("createFakeChatEngine", () => {
  it("yields the canned chunks in order", async () => {
    const engine = createFakeChatEngine(["A", "BC", "D"]);
    const chunks = await collect(
      engine.stream({ title: "t", body: "b" }, [
        { role: "user", content: "q" },
      ]),
    );
    expect(chunks).toEqual(["A", "BC", "D"]);
  });
});
