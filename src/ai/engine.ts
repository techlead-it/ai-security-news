import type { AnalysisPromptInput } from "../pipeline/prompt";
import type { ArticleAnalysis } from "../pipeline/types";

/**
 * 記事解析エンジンの抽象境界。
 * 1 回の呼び出しで二次関連性判定・日本語要約/詳細・ラベル分類をまとめて行う。
 * 実装は Workers AI（既定）だが、将来 Claude API 等に差し替え可能。
 */
export interface AiEngine {
  analyze(input: AnalysisPromptInput): Promise<ArticleAnalysis>;
}
