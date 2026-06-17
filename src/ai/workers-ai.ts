import type { Ai } from "@cloudflare/workers-types";
import type { AiEngine } from "./engine";
import type { ArticleAnalysis } from "../pipeline/types";
import { buildAnalysisPrompt } from "../pipeline/prompt";

// 採用モデル（docs/MODELS.md 参照）。要約・分類とも単一モデルで実行する。
export const SUMMARY_MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";

function responseText(raw: unknown): string {
  if (typeof raw === "string") return raw;
  const r = (raw as { response?: unknown }).response;
  return typeof r === "string" ? r : "";
}

function extractJsonObject(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) {
    throw new Error("AI response did not contain a JSON object");
  }
  return candidate.slice(start, end + 1);
}

/** Workers AI のテキスト応答から ArticleAnalysis を取り出す。 */
export function parseAnalysis(raw: unknown): ArticleAnalysis {
  const json = extractJsonObject(responseText(raw));
  let obj: Record<string, unknown>;
  try {
    obj = JSON.parse(json) as Record<string, unknown>;
  } catch {
    throw new Error("AI response is not valid JSON");
  }
  return {
    relevant: obj.relevant === true,
    summary: typeof obj.summary === "string" ? obj.summary : "",
    detail: typeof obj.detail === "string" ? obj.detail : "",
    labels: Array.isArray(obj.labels)
      ? obj.labels.filter((l): l is string => typeof l === "string")
      : [],
    originalLang: typeof obj.originalLang === "string" ? obj.originalLang : null,
  };
}

/** Workers AI バインディングを使う AI エンジン実装。 */
export function createWorkersAiEngine(ai: Ai, model = SUMMARY_MODEL): AiEngine {
  return {
    async analyze(input) {
      const { system, user } = buildAnalysisPrompt(input);
      const raw = await ai.run(model, {
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      });
      return parseAnalysis(raw);
    },
  };
}
