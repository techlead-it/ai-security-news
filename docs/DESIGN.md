# ai-rss 設計ドキュメント

生成日: 2026-06-18
ジェネレーター: analyzing-requirements

## システム概要

複数の RSS フィードから **AIセキュリティ関連**の情報を自動収集し、日本語の要約・詳細・元リンクに整理して閲覧できる Web サイト。記事はカテゴリ／ラベルで分類され、ラベルによる絞り込みと全文検索ができる。

- **解決する問題**: AIセキュリティの情報は媒体が分散し、英語が多く、追うコストが高い。収集・翻訳要約・分類を自動化し、日本語で一覧・絞り込みできる場を提供する。
- **ビジネス価値**: 情報収集の手間を削減し、AIセキュリティ動向を継続的に把握できる。
- **対象ユーザー**: AIセキュリティに関心のある開発者・研究者（当面は運用者本人を主対象とする個人サイト）。
- **MVP方針**: テーマを **AIセキュリティのみ**に絞る。カテゴリ／ラベルのデータモデルは将来の他テーマ拡張を見据えて2階層で設計する。
- **運用方針**: 完全サーバーレス（Cloudflare のみで完結）。Claude Code・自宅サーバーへの依存を持たない。

## ゴールと検証手順

### 最終的なゴール

- Cron による定期実行（3日に1回）で、対象 RSS から新着のAIセキュリティ記事が自動収集され、D1 に蓄積される
- 各記事に **日本語の要約（短）と詳細（要点）**、元リンク、ソース名、公開日、ラベルが付与されている
- サイトで記事一覧（新着順）が閲覧でき、**ラベルをクリックすると該当記事だけに絞り込まれる**
- サイトで日本語キーワードによる**全文検索**ができる
- AIセキュリティ以外の記事が混入していない（関連性フィルタが機能している）
- GitHub への push で GitHub Actions が動き、Cloudflare Workers に自動デプロイされる

### 検証手順

#### 手動検証
1. ローカルで `wrangler dev` ＋ D1 ローカルを起動し、収集パイプラインを1回実行 → D1 に日本語要約・ラベル付きのAIセキュリティ記事が挿入されることを確認
2. ブラウザでサイトを開き、一覧が新着順で表示されることを確認
3. ラベル（例: `プロンプトインジェクション`）をクリック → そのラベルの記事だけに絞り込まれることを確認
4. 検索ボックスに日本語キーワードを入力 → 該当記事がヒットすることを確認
5. 記事詳細を開き、要約・詳細・元リンク・ソース・公開日が表示されることを確認
6. 収集された記事を目視し、**Llama系モデルの日本語要約品質を評価**（Claude API 切替の要否判断）
7. 同じフィードを再度収集 → 既存記事が重複登録されない（dedup）ことを確認
8. 取得失敗サイトの記事が「RSS抜粋ベース＋フラグ付き」で登録されることを確認

#### 自動検証
- 単体テスト: `vp test`（パイプラインの純粋ロジック＝関連性判定・dedupキー生成・ラベル正規化・要約プロンプト組立など）
- 型チェック: `vp check --no-lint --no-fmt`
- ビルド: `vp build`
- CI/CD: GitHub Actions `deploy.yml` が push 時に test → 型チェック → build → `wrangler deploy` を実行

### 完了条件チェックリスト
- [ ] Cron Worker が対象 RSS を取得し、新着のAIセキュリティ記事を D1 に登録できる
- [ ] 記事に日本語要約・詳細・ラベルが付与される
- [ ] 一覧・ラベル絞り込み・全文検索・記事詳細が動作する
- [ ] 重複登録が発生しない
- [ ] 本文取得失敗時に RSS 抜粋でフォールバックし、フラグが立つ
- [ ] 関連性フィルタで非AIセキュリティ記事が除外される
- [ ] GitHub Actions による Cloudflare 自動デプロイが成功する
- [ ] `vp test` / `vp check` / `vp build` が成功する

## 機能要件

### 必須機能（MUST have）
- **RSS収集**: 設定済みフィード一覧から記事メタ（タイトル・URL・公開日・抜粋・GUID）を取得
- **重複排除**: 記事URL（無ければGUID）を一意キーに、登録済み記事をスキップ
- **関連性フィルタ**: 「AIセキュリティに関する記事か」を判定し非該当を除外（一次=キーワード、二次=Workers AI 分類）
- **本文取得**: 元記事を fetch して本文テキストを抽出。失敗時は RSS 抜粋で代替し `fetch_failed` フラグを立てる
- **日本語要約生成**: ソース言語に関わらず日本語の要約（短）と詳細（要点）を Workers AI で生成
- **ラベル分類**: 記事にカテゴリ（MVPは `セキュリティ` 固定）と複数ラベルを自動付与。付与前に既存ラベル一覧を参照し表記揺れを抑制
- **永続化**: 記事・カテゴリ・ラベル・関連を D1 に保存（FTS5 で日本語全文検索インデックスを保持）
- **定期実行**: Cron Trigger により3日に1回パイプラインを実行
- **記事一覧表示**: 新着順の一覧（タイトル・ソース・公開日・要約・ラベル）
- **ラベル絞り込み**: ラベルクリックで該当記事のみ表示
- **全文検索**: 日本語キーワードで記事を検索
- **記事詳細表示**: 要約・詳細・元リンク・メタ情報を表示
- **手動トリガー**: 検証用に収集を手動起動できる（`workflow_dispatch` または `wrangler` 経由）

### オプション機能（NICE to have）
- カテゴリの追加によるテーマ拡張（セキュリティ以外）
- Workers AI から Claude API への要約エンジン切替
- 取得失敗サイト向けのブラウザレンダリング取得（Cloudflare Browser Rendering 等）
- 1tickあたり処理上限を超えた残記事の次回繰り越し処理の最適化（Queues/Workflows 等）

## 非機能要件

### パフォーマンス要件
- サイト表示: 一覧初期表示の API レスポンス 500ms 以内（D1 クエリ＋エッジ配信）
- 収集処理: 1 Cron 実行は Workers 無料枠の制約内に収める（後述の制約参照）

### セキュリティ要件
- 認証・認可: **不要**（公開・読み取り専用サイト。書き込みは Cron Worker 内部のみ）
- データ: 著作権配慮のため**記事全文は保存しない**。要約・詳細（要点）・元リンク・メタ情報のみ保持
- 出力: 要約・詳細は React によりエスケープ表示（XSS対策）。元記事URLは検証の上リンク化
- シークレット: `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` を GitHub Secrets で管理

### 可用性・信頼性
- 配信可用性: Cloudflare のエッジ配信に準拠
- バックアップ: D1 は配信用の派生データ。必要に応じ `wrangler d1 export` でSQLダンプを取得しリポジトリ管理可能
- 収集の冪等性: dedup により再実行しても重複が増えない

## アーキテクチャ設計

### システム構成

完全サーバーレス。単一の Cloudflare Worker が「定期収集（Cron）」「API 提供」「SPA 静的配信」を担う。

```
[RSS フィード群] ──fetch──> [Cron Worker(収集パイプライン)]
                                  │  Workers AI(要約/分類)
                                  ▼
                              [D1 (SQLite + FTS5)]
                                  ▲
                                  │ query
[ブラウザ] ──HTTP──> [Worker: API(/api/*) + 静的配信(/) ] ──> [React SPA]
```

レイヤー（収集パイプライン）:
- **取得層**: RSS フィードの取得・パース、本文 fetch
- **判定層**: 関連性フィルタ（キーワード → Workers AI 分類）
- **生成層**: 日本語要約・詳細生成、ラベル分類
- **永続化層**: D1 への upsert、FTS5 インデックス更新

### 技術スタック
- **フロントエンド**: React 19 + React Router v7（HashRouter）+ TypeScript + Tailwind CSS v4 + Vite+（`vp`）（`skanehira/demo-site-template` を起点）
- **バックエンド/実行基盤**: Cloudflare Workers（Cron Trigger + Fetch handler）
- **AI**: Workers AI（デフォルトの Llama 系 instruct モデル。モデルIDは実装時に最新を確認）。将来 Claude API へ切替可能な抽象境界を設ける
- **データベース**: Cloudflare D1（SQLite）＋ FTS5 仮想テーブル
- **テスト**: Vitest 互換（`vp test`）
- **インフラ/デプロイ**: GitHub Actions → `wrangler deploy`
- **HTMLパース**: Worker 上で軽量にテキスト抽出（HTMLRewriter ベース等。CPU を浪費しない方式）

選定理由:
- 使い慣れたテンプレートで scaffold を省略でき、Cloudflare 内で収集〜配信〜DBが完結 → 運用が単純で無料枠に収まりやすい
- ラベル絞り込み・全文検索は本質的にクエリ問題であり、D1 + FTS5 がクライアント側処理より正確（特に日本語検索）かつ無制限保持でもスケールする

### モジュール構成
- `pipeline/`（収集パイプライン。フレームワーク非依存の純粋ロジックを中心に）
  - `feeds`: フィード定義と取得・パース
  - `relevance`: 関連性判定（キーワード＋AI分類）
  - `extract`: 本文取得・抽出とフォールバック
  - `summarize`: 要約・詳細生成（AIエンジンをインターフェース化し Workers AI 実装を注入）
  - `labels`: ラベル正規化・分類（既存ラベル参照）
  - `repository`: D1 への永続化・dedup・FTS5 更新
- `worker/`（Cron handler、API ルーティング、静的配信）
- `web/`（React SPA: 一覧・絞り込み・検索・詳細）

依存方向はパイプラインのドメインロジックが I/O（D1・AI・HTTP）に依存しないよう、境界をインターフェースで切る（テスト容易性のためフェイクを注入可能にする）。

## データ設計

### エンティティ定義
```
categories                      -- 最上位分類（MVPは「セキュリティ」のみ）
- id: INTEGER (PK)
- name: TEXT (unique)           -- 表示名（例: セキュリティ）
- slug: TEXT (unique)           -- URL用（例: security）

labels                          -- カテゴリ配下のラベル
- id: INTEGER (PK)
- category_id: INTEGER (FK -> categories.id)
- name: TEXT                    -- 表示名（例: プロンプトインジェクション）
- slug: TEXT                    -- URL用
- UNIQUE(category_id, name)

articles
- id: INTEGER (PK)
- url: TEXT (unique)            -- dedup キー（無ければ guid を採用）
- guid: TEXT
- source: TEXT                  -- ソース名（例: Simon Willison）
- title: TEXT
- category_id: INTEGER (FK -> categories.id)
- summary: TEXT                 -- 日本語・短い要約
- detail: TEXT                  -- 日本語・要点（箇条書き）
- original_lang: TEXT           -- 原文言語
- published_at: TEXT (ISO8601)
- fetched_at: TEXT (ISO8601)
- fetch_failed: INTEGER (0/1)   -- 本文取得失敗フラグ（RSS抜粋ベース要約）

article_labels                  -- 記事とラベルの多対多
- article_id: INTEGER (FK -> articles.id)
- label_id: INTEGER (FK -> labels.id)
- PRIMARY KEY(article_id, label_id)

articles_fts                    -- FTS5 仮想テーブル（title, summary, detail を対象）
```

### データフロー
1. Cron 起動 → フィード一覧を取得・パース
2. 各記事URLで D1 を照合し、新着のみ抽出（1tick あたり上限 N 件にキャップ）
3. 一次キーワードフィルタ → 通過分のみ本文 fetch（失敗時は抜粋で代替・フラグ）
4. Workers AI で「AIセキュリティか」を二次判定 → 非該当を除外
5. Workers AI で日本語要約・詳細を生成
6. 既存ラベル一覧を読み込み、ラベルを分類・正規化（新規ラベルは追加）
7. articles / article_labels に upsert、FTS5 を更新
8. 残記事は次回 Cron tick で処理

## API設計

公開・読み取り専用。Worker が `/api/*` を処理し、それ以外は SPA を配信。

### エンドポイント一覧
```
GET /api/articles?category=&label=&q=&page=&perPage=   - 記事一覧（絞り込み・検索・ページング）
GET /api/articles/:id                                  - 記事詳細
GET /api/labels?category=                              - ラベル一覧（件数付き）
GET /api/categories                                    - カテゴリ一覧
```

### リクエスト/レスポンス例
```json
// GET /api/articles?label=prompt-injection&page=1&perPage=20
Response:
{
  "items": [
    {
      "id": 123,
      "title": "...",
      "source": "Simon Willison",
      "url": "https://...",
      "category": { "name": "セキュリティ", "slug": "security" },
      "labels": [{ "name": "プロンプトインジェクション", "slug": "prompt-injection" }],
      "summary": "...",
      "publishedAt": "2026-06-15T00:00:00Z",
      "fetchFailed": false
    }
  ],
  "page": 1,
  "perPage": 20,
  "total": 42
}
```

## セキュリティ設計
### 認証・認可フロー
- 公開読み取り専用のため認証なし。D1 への書き込みは Cron Worker の内部処理に限定し、外部に書き込みAPIを公開しない。

### セキュリティ対策
- **入力検証**: クエリパラメータ（page/perPage/q/label/category）を検証・上限クランプ
- **XSS対策**: React による自動エスケープ。要約・詳細はプレーンテキストとして扱う
- **SQLインジェクション対策**: D1 のパラメータ化クエリ（bind）を徹底
- **著作権**: 記事全文は保存・再掲しない（要約・要点・リンクのみ）

## パフォーマンス設計
### 最適化戦略
- **クエリ**: 一覧・絞り込みは index（category_id, published_at, article_labels）で最適化。検索は FTS5
- **配信**: 静的アセットは Workers Static Assets でエッジ配信
- **収集**: 1tick の処理件数をキャップし、サブリクエスト/CPU 制約内に収める

### スケーラビリティ
- 記事は無制限保持でも D1 + ページング + FTS5 で対応
- 収集量増加時は処理上限の調整、将来的に Queues/Workflows で分割

## 開発・運用
### 開発環境
- `vp install` → `vp dev`（SPA）/ `wrangler dev`（Worker + D1 ローカル）
- D1 ローカルにスキーマ・シードを適用し、実フィードでパイプラインを試行

### CI/CDパイプライン
- `.github/workflows/deploy.yml`: push（main）→ `vp install` → `vp test` → `vp check --no-lint --no-fmt` → `vp build` → `wrangler deploy`
- D1 マイグレーションの適用手順を CI もしくは手動運用手順として定義

### モニタリング・ロギング
- Cron 実行ごとに「取得件数／新規件数／除外件数／取得失敗件数／AIエラー件数」を Worker ログに出力

## エラー戦略
### エラー分類
- **回復可能**: フィード取得の一時失敗、本文 fetch 失敗、AI の一時エラー
- **回復不可能（その記事をスキップ）**: パース不能、必須メタ欠落

### エラーハンドリング方針
- **本文 fetch 失敗**: RSS 抜粋で要約を生成し `fetch_failed=1`。当該記事は登録継続
- **Workers AI 失敗**: 数回リトライ（指数バックオフ）後も失敗ならその記事を当該 tick ではスキップし、次回再試行（未登録のまま）
- **Neuron 日次上限到達**: それ以上の AI 呼び出しを停止し、処理済み分までコミットして正常終了（次回 tick で継続）
- **1記事の失敗が全体を止めない**: 記事単位で try/catch し、失敗はログに記録して続行

### エラーログ・通知
- **ログレベル**: ERROR（記事スキップ・上限到達）/ WARN（fetch失敗フォールバック）/ INFO（収集サマリ）
- **アラート条件**: MVP では Worker ログ確認のみ（通知連携は対象外）

## テスト戦略
### テストピラミッド
- **単体テスト（主軸）**: 関連性キーワード判定、dedupキー生成、ラベル正規化、要約プロンプト組立、レスポンス整形など I/O 非依存ロジック
- **統合テスト**: D1 ローカルに対する repository（upsert/dedup/FTS5 検索）、API ハンドラ
- **E2E（最小）**: ローカル起動でのスモーク（一覧→ラベル絞り込み→検索→詳細）

### テストデータ
- **データ戦略**: 代表的な RSS/HTML のフィクスチャ（英語・日本語・取得失敗ケース）をシード
- **モック/スタブ方針**: Workers AI・HTTP fetch はインターフェース化し、テストではフェイク（固定要約・固定分類）を注入

### CI統合
- **実行タイミング**: push（main）/ PR
- **失敗時の動作**: テスト・型チェック・ビルドのいずれか失敗で `wrangler deploy` をブロック

## 制約と前提
### 技術的制約
- **Workers AI 無料枠**: 1日 10,000 Neurons、超過時はエラー（課金されず停止）
- **Workers 無料枠**: 1呼び出しのサブリクエスト ~50 件・CPU タイト（fetch等の I/O 待ちは CPU 非計上）、1日 100,000 リクエスト、Cron Trigger はアカウントあたり数個まで
- **Cloudflare Queues は有料**: MVP では使わず、1tick の処理件数キャップで対応
- **本文取得はブラウザ無し**: 素の fetch + HTMLパースのみ。JS必須/403サイトは取りこぼし、RSS抜粋で代替
- **要約品質**: Workers AI（Llama系）の日本語要約品質は Claude 比で劣る可能性。評価後に Claude API 切替を判断

### ビジネス制約
- MVP はAIセキュリティのみ。低コスト（無料枠優先）で運用

### 依存関係
- Cloudflare Workers / Workers AI / D1、対象 RSS フィードの提供有無（実装時に到達性を検証）
- 起点テンプレート `skanehira/demo-site-template`

### 対象 RSS ソース（実装時に到達性を検証）
- 専門: Simon Willison's Weblog / Embrace The Red / Trail of Bits / NCC Group Research
- ベンダー・標準: OWASP GenAI(LLM Top 10) / Google Security Blog / Microsoft MSRC / AIセキュリティ企業ブログ（Protect AI/HiddenLayer/Lakera のうち RSS 提供のあるもの）
- ニュース（AIセキュリティでフィルタ）: The Hacker News / BleepingComputer / Dark Reading
- 研究: arXiv cs.CR（LLM/プロンプトインジェクション等のキーワードで絞り込み）

## 参照
- タスク分解: planning-tasks スキルで TODO.md を生成
- 起点: `skanehira/demo-site-template`
