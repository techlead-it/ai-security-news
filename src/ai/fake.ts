import type { AiEngine } from "./engine";
import type { ArticleAnalysis } from "../pipeline/types";

const DEFAULT: ArticleAnalysis = {
  relevant: true,
  summary: "（フェイク）AI セキュリティ記事の要約",
  detail: "- （フェイク）要点1\n- （フェイク）要点2",
  labels: ["プロンプトインジェクション"],
  originalLang: "en",
};

/** テスト用の固定出力 AI エンジン。canned で出力を上書きできる。 */
export function createFakeAiEngine(
  canned: Partial<ArticleAnalysis> = {},
): AiEngine {
  const analysis: ArticleAnalysis = { ...DEFAULT, ...canned };
  return {
    async analyze() {
      return analysis;
    },
  };
}
