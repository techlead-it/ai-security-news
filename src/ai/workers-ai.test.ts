import { describe, it, expect } from "vite-plus/test";
import type { Ai } from "@cloudflare/workers-types";
import {
  parseAnalysis,
  createWorkersAiEngine,
  SUMMARY_MODEL,
} from "./workers-ai";

describe("parseAnalysis", () => {
  it("parses a fenced JSON response", () => {
    const raw = {
      response:
        '```json\n{"relevant":true,"summary":"要約","detail":"- 要点","labels":["プロンプトインジェクション"],"originalLang":"en"}\n```',
    };
    expect(parseAnalysis(raw)).toEqual({
      relevant: true,
      summary: "要約",
      detail: "- 要点",
      labels: ["プロンプトインジェクション"],
      originalLang: "en",
    });
  });

  it("extracts the JSON object even with surrounding prose", () => {
    const raw = {
      response:
        'はい、こちらが結果です: {"relevant": false, "summary": "x", "detail": "y", "labels": [], "originalLang": "ja"} 以上です。',
    };
    const result = parseAnalysis(raw);
    expect(result.relevant).toBe(false);
    expect(result.labels).toEqual([]);
  });

  it("throws when no JSON object is present", () => {
    expect(() => parseAnalysis({ response: "no json here" })).toThrow();
  });
});

describe("createWorkersAiEngine", () => {
  it("calls the model with system+user messages and returns the parsed analysis", async () => {
    const calls: Array<{ model: string; inputs: unknown }> = [];
    const ai = {
      run: async (model: string, inputs: unknown) => {
        calls.push({ model, inputs });
        return {
          response:
            '{"relevant":true,"summary":"日本語要約","detail":"- 要点","labels":["ジェイルブレイク"],"originalLang":"en"}',
        };
      },
    } as unknown as Ai;

    const engine = createWorkersAiEngine(ai);
    const result = await engine.analyze({
      title: "Jailbreak roundup",
      body: "本文テキスト",
      source: "Embrace The Red",
      existingLabels: ["ジェイルブレイク"],
    });

    expect(result.summary).toBe("日本語要約");
    expect(result.relevant).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0].model).toBe(SUMMARY_MODEL);
    const inputs = calls[0].inputs as {
      messages: Array<{ role: string; content: string }>;
    };
    expect(inputs.messages[0].role).toBe("system");
    expect(inputs.messages[1].content).toContain("Jailbreak roundup");
    expect(inputs.messages[1].content).toContain("Embrace The Red");
  });
});
