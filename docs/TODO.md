# TODO: ai-rss（AIセキュリティ情報収集サイト MVP）

作成日: 2026-06-18
生成元: planning-tasks
設計書: docs/DESIGN.md

## 概要

複数のRSSからAIセキュリティ関連記事を自動収集し、日本語要約＋元リンク＋ラベルに整理して閲覧できる完全サーバーレスサイト（Cloudflare Cron Worker → Workers AI → D1 → 同一WorkerでReact SPA配信）を、TDDで実装する。

設計原則: ドメインロジック（pipeline）は I/O（D1・AI・HTTP）に依存させず、インターフェース注入でフェイク差し替え可能にする（テスト容易性・低結合）。各記事処理は失敗分離し、収集は dedup により冪等。

## 実装タスク

### フェーズ0: デモサイトの scaffold とデプロイ確立（demo-site-builder スキル）

> 機能実装より先に「push すれば自動デプロイ・表示される」状態を作る。scaffold／シークレット登録／初回デプロイをスキルに任せる。

- [ ] `demo-site-builder` スキルを起動し、`skanehira/demo-site-template` から ai-rss を scaffold（プレースホルダ置換: `__PROJECT_NAME__`=ai-rss, `__COMPATIBILITY_DATE__`）
- [ ] `vp install` / `vp dev` / `vp test` / `vp build` の動作確認
- [ ] Cloudflare シークレット（`CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID`）の登録（スキル内で実施）
- [ ] Cloudflare Workers へ初回デプロイし、**公開URLでデモサイトが表示される**ことを確認
- [ ] GitHub Actions（`deploy.yml`）による push → 自動デプロイが回ることを確認
- [ ] ローカル変更 → push → サイト反映までの一連の流れを確認
- [ ] [REVIEW] フェーズ実装の簡易セルフレビューと修正
- [ ] [CHECK] `vp test` / `vp check --no-lint --no-fmt` / `vp build` の実行と確認

### フェーズ1: 基盤構築（D1 / Workers AI / Cron）

- [x] `wrangler.jsonc` に D1 バインディング・Workers AI バインディング・Cron Trigger（3日に1回）・`workflow_dispatch` 相当の手動実行を設定
- [x] D1 マイグレーション基盤を用意（schema: `categories` / `labels` / `articles` / `article_labels` / `articles_fts`、index 定義）
- [x] 初期シード: カテゴリ `セキュリティ` と初期ラベル（`プロンプトインジェクション` `ジェイルブレイク` `データポイズニング` `敵対的攻撃` `モデル窃取` `サプライチェーン` `脆弱性開示` `ガバナンス/規制`）
- [x] Worker テスト基盤（`node:sqlite` を D1 互換アダプタでラップし FTS5 含め実SQLでテスト）の確認
- [x] ディレクトリ構成の確立（`worker/` `repository/` ほか、テストはコロケーション）
- [x] [REVIEW] フェーズ実装の簡易セルフレビューと修正
- [x] [CHECK] `vp test` / `vp check --no-lint --no-fmt` / `vp build` の実行と確認

### フェーズ2: ドメインロジック（I/O非依存の純粋関数）

- [x] [RED] dedupキー生成（url優先・無ければguid）のテスト作成
- [x] [GREEN] dedupキー生成の実装
- [x] [RED] 一次関連性キーワードフィルタ（AIセキュリティ判定）のテスト作成（該当/非該当/境界）
- [x] [GREEN] キーワードフィルタの実装
- [x] [RED] ラベル正規化（既存ラベル一覧を渡し表記揺れを既存名に寄せる／新規は採用）のテスト作成
- [x] [GREEN] ラベル正規化の実装
- [x] [RED] 要約・分類プロンプト組立（記事本文＋既存ラベルから AI 入力を生成）のテスト作成
- [x] [GREEN] プロンプト組立の実装
- [x] [RED] API レスポンス整形（記事→DTO、ラベル/カテゴリ埋め込み）のテスト作成
- [x] [GREEN] レスポンス整形の実装
- [x] [REFACTOR] 重複排除・命名整理・型名の明確化
- [x] [REVIEW] フェーズ実装の簡易セルフレビューと修正
- [x] [CHECK] `vp test` / `vp check --no-lint --no-fmt` / `vp build` の実行と確認

### フェーズ3: RSS取得・パース層

- [x] [RED] フィードパース（タイトル・URL・公開日・抜粋・GUID 抽出）のテスト作成（RSS/Atom フィクスチャ）
- [x] [GREEN] フィードパースの実装
- [x] [RED] フィード取得の一時失敗時にスキップして他フィード処理を継続するテスト作成（HTTPクライアントはフェイク注入）
- [x] [GREEN] フィード取得（インターフェース化したHTTPクライアント経由）の実装
- [x] [RED] フィード定義（対象ソース一覧＋arXiv cs.CRのキーワード絞り込み）の読み込みテスト作成
- [x] [GREEN] フィード定義の実装
- [x] [REFACTOR] 取得層の整理
- [x] [REVIEW] フェーズ実装の簡易セルフレビューと修正
- [x] [CHECK] `vp test` / `vp check --no-lint --no-fmt` / `vp build` の実行と確認

### フェーズ4: 本文取得・抽出とフォールバック

- [x] [RED] HTMLから本文テキスト抽出のテスト作成（正常HTMLフィクスチャ）
- [x] [GREEN] 本文抽出（CPUを浪費しない軽量方式）の実装
- [x] [RED] 取得失敗（403/到達不可/本文薄い）時にRSS抜粋で代替し `fetch_failed=1` を立てるテスト作成
- [x] [GREEN] フォールバック処理の実装
- [x] [REFACTOR] 抽出ロジックの整理
- [x] [REVIEW] フェーズ実装の簡易セルフレビューと修正
- [x] [CHECK] `vp test` / `vp check --no-lint --no-fmt` / `vp build` の実行と確認

### フェーズ5: AIエンジン（要約・分類）

- [x] [RED] AIエンジンのインターフェース契約テスト作成（要約/詳細生成・関連性二次判定・ラベル分類）。テストはフェイクで固定出力
- [x] [GREEN] AIエンジンのインターフェースとフェイク実装
- [x] [RED] Workers AI 実装が入力プロンプトを正しく組み立て・出力をパースするテスト作成（AIバインディングはモック）
- [x] [GREEN] Workers AI 実装（既定 Llama 系モデル。モデルIDは実装時に最新確認）
- [x] [RED] 二次関連性判定で非AIセキュリティ記事を除外するテスト作成
- [x] [GREEN] 二次関連性判定の実装
- [x] [REFACTOR] エンジン抽象境界の整理（将来 Claude API 実装を差し替え可能に）
- [x] [REVIEW] フェーズ実装の簡易セルフレビューと修正
- [x] [CHECK] `vp test` / `vp check --no-lint --no-fmt` / `vp build` の実行と確認

### フェーズ6: 永続化層（D1 Repository）

- [x] [RED] 記事 upsert と dedup（既存url/guidはスキップ）の統合テスト作成（D1ローカル）
- [x] [GREEN] 記事 upsert・dedup の実装（パラメータ化クエリ）
- [x] [RED] カテゴリ・ラベルの取得/新規追加・article_labels 紐付けのテスト作成
- [x] [GREEN] カテゴリ・ラベル永続化の実装
- [x] [RED] FTS5 インデックス更新と日本語キーワード検索のテスト作成
- [x] [GREEN] FTS5 更新・検索の実装
- [x] [RED] 一覧クエリ（category/label/q/ページング）のテスト作成
- [x] [GREEN] 一覧クエリの実装（index活用）
- [x] [REFACTOR] クエリ・マッピングの整理
- [x] [REVIEW] フェーズ実装の簡易セルフレビューと修正
- [x] [CHECK] `vp test` / `vp check --no-lint --no-fmt` / `vp build` の実行と確認

### フェーズ7: 収集パイプライン統合（Cron handler）

- [x] [RED] パイプライン全体フロー（取得→新着抽出→一次フィルタ→本文取得→二次判定→要約→ラベル分類→永続化）のテスト作成（全I/Oをフェイク注入）
- [x] [GREEN] パイプライン統合の実装
- [x] [RED] 1tickの処理件数キャップ（上限N件、残りは次回）のテスト作成 ※Nの初期値を決定
- [x] [GREEN] 件数キャップの実装
- [x] [RED] 記事単位の失敗分離（1記事のAI/取得失敗が全体を止めない）のテスト作成
- [x] [GREEN] 失敗分離の実装
- [x] [RED] Neuron日次上限到達時に処理済み分をコミットして正常終了するテスト作成
- [x] [GREEN] 上限到達ハンドリングの実装
- [x] [RED] AI一時エラーのリトライ（指数バックオフ）後スキップのテスト作成
- [x] [GREEN] リトライの実装
- [x] [RED] 収集サマリログ（取得/新規/除外/取得失敗/AIエラー件数）出力のテスト作成
- [x] [GREEN] サマリログの実装
- [x] [GREEN] Cron handler / 手動トリガーから本パイプラインを起動
- [x] [REFACTOR] パイプライン構成の整理
- [x] [REVIEW] フェーズ実装の簡易セルフレビューと修正
- [x] [CHECK] `vp test` / `vp check --no-lint --no-fmt` / `vp build` の実行と確認

### フェーズ8: API（Worker fetch handler）

- [x] [RED] `GET /api/articles`（絞り込み・検索・ページング）正常系のテスト作成
- [x] [GREEN] 一覧APIの実装
- [x] [RED] クエリパラメータ検証（page/perPage/q/label/category の上限クランプ・不正値）のテスト作成
- [x] [GREEN] バリデーションの実装
- [x] [RED] `GET /api/articles/:id`（詳細・存在しないID）のテスト作成
- [x] [GREEN] 詳細APIの実装
- [x] [RED] `GET /api/labels?category=`（件数付き）・`GET /api/categories` のテスト作成
- [x] [GREEN] ラベル/カテゴリAPIの実装
- [x] [RED] `/api/*` 以外を SPA(index.html) にフォールバック配信するテスト作成
- [x] [GREEN] ルーティング・静的配信の実装
- [x] [REFACTOR] レスポンス形式・エラー応答の統一
- [x] [REVIEW] フェーズ実装の簡易セルフレビューと修正
- [x] [CHECK] `vp test` / `vp check --no-lint --no-fmt` / `vp build` の実行と確認

### フェーズ9: フロントエンド SPA

- [x] [RED] 記事一覧コンポーネント（新着順・タイトル/ソース/公開日/要約/ラベル表示）のレンダリングテスト作成
- [x] [GREEN] 一覧コンポーネントの実装（API取得はデータソース注入）
- [x] [RED] ラベルクリックで絞り込み遷移するインタラクションテスト作成
- [x] [GREEN] ラベル絞り込み（ルーティング）の実装
- [x] [RED] 検索ボックスで日本語キーワード検索するテスト作成
- [x] [GREEN] 検索UIの実装
- [x] [RED] 記事詳細（要約・詳細・元リンク・メタ・取得失敗フラグ表示）のテスト作成
- [x] [GREEN] 記事詳細の実装
- [x] [RED] 空状態・ローディング・エラー表示のエッジケーステスト作成
- [x] [GREEN] エッジケース対応
- [x] [REFACTOR] スタイルとロジックの分離・コンポーネント整理
- [x] [REVIEW] フェーズ実装の簡易セルフレビューと修正
- [x] [CHECK] `vp test` / `vp check --no-lint --no-fmt` / `vp build` の実行と確認

### フェーズ10: CI/CD・デプロイ（フェーズ0で確立済みの基盤に追補）

> 基本のデプロイ（test→型チェック→build→`wrangler deploy`）とシークレットはフェーズ0で確立済み。ここでは D1/Cron 導入に伴う追補のみ。

- [x] D1 マイグレーション適用を CI もしくは運用手順として整備（デプロイ時にスキーマ適用）
- [x] Cron Trigger 設定がデプロイに反映されることを確認
- [x] README にセットアップ・運用手順（シークレット・マイグレーション・手動トリガー）を記載
- [x] [REVIEW] フェーズ実装の簡易セルフレビューと修正
- [x] [CHECK] `vp test` / `vp check --no-lint --no-fmt` / `vp build` の実行と確認

### フェーズ11: 品質保証・検証

- [ ] [STRUCTURAL] 全体のコード整理（動作変更なし）
- [ ] 全テスト実行と確認（単体・統合・最小E2Eスモーク）
- [ ] DESIGN.md 検証手順の手動検証（収集→一覧→ラベル絞り込み→検索→詳細→dedup→fetch失敗フォールバック）
- [ ] 収集記事の目視で **Llama要約品質を評価** → Claude API 切替の要否判断（評価結果を記録）
- [ ] 完了条件チェックリスト（DESIGN.md）の全項目確認
- [ ] [REVIEW] フェーズ実装の簡易セルフレビューと修正
- [ ] [CHECK] `vp test` / `vp check --no-lint --no-fmt` / `vp build` の実行と確認

## 実装ノート

### 確定値・実装着手時に決める値
- 1tickあたりの処理上限 N = **10**（初期値・暫定。「まず動けばよい」方針。サブリクエスト~50/CPU制約に対し安全側。運用しながら調整）
- Workers AI モデル（確定）: 初期採用は **`@cf/meta/llama-3.3-70b-instruct-fp8-fast` 単一**（要約・分類とも）。分類のコスト最適化代替として `@cf/qwen/qwen3-30b-a3b-fp8` を候補に保持。AIエンジンはインターフェース化済みでモデルID差し替え可能。詳細・代替・実機検証項目は `docs/MODELS.md`（フェーズ11で日本語要約品質を実測しチューニング）
- 対象RSSフィード（確定）: DESIGN.md「対象 RSS ソース」のとおり（専門 / ベンダー・標準 / ニュース / arXiv cs.CR キーワード絞り込み）。各URLの到達性のみ実装着手時に確認し、提供のないものは差し替え

### MUSTルール遵守事項
- TDD: RED → GREEN → REFACTOR → REVIEW → CHECK サイクルを厳守（テストなしにコードなし）
- 設計: ドメインロジックは I/O 非依存。AI/HTTP/D1 はインターフェース注入でフェイク差し替え可能に（DIP・低結合・高凝集）
- YAGNI: MVPに不要な抽象・機能を作らない（カテゴリ2階層は将来拡張要件として明示合意済みのため可）
- Tidy First: 構造変更（[STRUCTURAL]）と動作変更（[BEHAVIORAL]）を分離。両方必要なら構造変更を先に
- コミット: Conventional Commit ＋ `[STRUCTURAL]`/`[BEHAVIORAL]` プレフィックス必須。関心事ごとに分割
- 著作権: 記事全文は保存しない（要約・要点・リンクのみ）

### 参照ドキュメント
- 設計書: docs/DESIGN.md
- TDD: rules/core/tdd.md ／ 設計: rules/core/design.md ／ コミット: rules/core/commit.md
