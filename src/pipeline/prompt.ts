// AI 解析プロンプトの組立（I/O 非依存）。
// 1 回の呼び出しで「AI セキュリティ関連性の二次判定・日本語要約/詳細・ラベル分類」を行わせる。

export interface AnalysisPromptInput {
  title: string;
  /** 本文（取得成功時）または RSS 抜粋（フォールバック時） */
  body: string;
  source: string;
  /** 既存ラベル一覧（表記揺れ防止のため候補として提示） */
  existingLabels: string[];
  /** 本文取得に失敗し RSS 抜粋を body に渡しているか。true なら判定指示を緩める */
  fetchFailed?: boolean;
}

export interface AnalysisPrompt {
  system: string;
  user: string;
}

const SYSTEM_PROMPT = [
  "あなたは AI セキュリティ分野の専門エディターです。与えられた記事を分析し、次の各フィールドを返してください。",
  "- relevant: AI/LLM のセキュリティ（プロンプトインジェクション、ジェイルブレイク、敵対的攻撃、モデルの脆弱性など）に直接関係する記事なら true。単なる AI 一般の話題やセキュリティ一般の話題は false。",
  "- summary: 日本語の短い要約（2〜3文）。",
  "- detail: 日本語の要点。各要点を 1 つの文字列とした配列（3〜5 項目）。",
  "- labels: 記事のサブトピックを表すラベルの配列。既存ラベルがあれば優先して再利用する。『セキュリティ』のようなカテゴリ名そのものはラベルに含めない。",
  "- originalLang: 原文の言語コード（例: en, ja）。",
  "要約・要点は必ず日本語で書くこと。記事本文を逐語的に転載しないこと。",
].join("\n");

/** 記事と既存ラベルから AI への入力（system / user）を組み立てる。 */
export function buildAnalysisPrompt(input: AnalysisPromptInput): AnalysisPrompt {
  const labelList =
    input.existingLabels.length > 0
      ? input.existingLabels.join(", ")
      : "(まだ無し)";
  const lines = [
    `ソース: ${input.source}`,
    `タイトル: ${input.title}`,
    `既存ラベル: ${labelList}`,
  ];
  if (input.fetchFailed) {
    lines.push(
      "備考: 本文取得に失敗しています。RSS抜粋のみでの判定で構いません。AI セキュリティ関連性が読み取れる場合は relevant=true としてください。",
    );
  }
  lines.push("本文:", input.body);
  return { system: SYSTEM_PROMPT, user: lines.join("\n") };
}
