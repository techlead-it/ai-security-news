import { describe, it, expect } from "vite-plus/test";
import { createFakeAiEngine } from "./fake";

const input = {
  title: "t",
  body: "b",
  source: "s",
  existingLabels: [],
};

describe("createFakeAiEngine", () => {
  it("returns a relevant analysis with all fields by default", async () => {
    const engine = createFakeAiEngine();
    const result = await engine.analyze(input);
    expect(result.relevant).toBe(true);
    expect(typeof result.summary).toBe("string");
    expect(typeof result.detail).toBe("string");
    expect(Array.isArray(result.labels)).toBe(true);
    expect(result).toHaveProperty("originalLang");
  });

  it("returns the canned analysis when provided", async () => {
    const engine = createFakeAiEngine({
      relevant: false,
      summary: "固定要約",
      detail: "固定詳細",
      labels: ["ジェイルブレイク"],
      originalLang: "ja",
    });
    expect(await engine.analyze(input)).toEqual({
      relevant: false,
      summary: "固定要約",
      detail: "固定詳細",
      labels: ["ジェイルブレイク"],
      originalLang: "ja",
    });
  });
});
