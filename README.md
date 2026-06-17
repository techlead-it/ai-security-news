# ai-rss

各種 RSS から **AI セキュリティ関連**の記事を自動収集し、日本語の要約・要点・元リンク・
ラベルに整理して閲覧できる完全サーバーレスサイト。Cloudflare のみで完結する。

- 収集: Cloudflare Workers の Cron Trigger（3日に1回）→ RSS 取得 → 関連性フィルタ →
  本文取得 → Workers AI で日本語要約・分類 → D1 へ保存
- 配信: 同一 Worker が `/api/*`（D1 クエリ）と React SPA（静的アセット）を配信
- 検索: D1 + FTS5（trigram）で日本語の全文検索・ラベル絞り込み

設計は `docs/DESIGN.md`、タスクは `docs/TODO.md`、モデル選定は `docs/MODELS.md` を参照。

## 技術スタック

React 19 + Vite+ (`vp`) + TypeScript + Tailwind CSS v4 + React Router v7 (HashRouter) /
Cloudflare Workers (Cron + Fetch) / Workers AI / D1 (SQLite + FTS5)。

## 開発

```bash
vp install
vp test                          # 単体・統合テスト（node:sqlite による実SQLite統合含む）
vp check --no-lint --no-fmt      # 型チェック
vp build                         # SPA を dist/ へビルド

# Worker + ローカル D1 + SPA を一体で起動
vp build
vp exec wrangler d1 migrations apply ai-rss --local   # 初回・スキーマ変更時
vp exec wrangler dev --test-scheduled                 # 起動（収集は手動トリガー可）

# 収集パイプラインを手動実行（別ターミナルで。<port> は wrangler dev の表示ポート）
curl "http://localhost:<port>/__scheduled?cron=0+0+*%2F3+*+*"
```

Workers AI バインディングはローカル開発でも実際の Cloudflare AI を呼ぶため、
`CLOUDFLARE_API_TOKEN`（Workers AI 実行権限を持つもの）を環境変数に設定して `wrangler dev` を起動する。

## デプロイ（本番）

`main` への push で `.github/workflows/deploy.yml` が test → 型チェック → build →
D1 マイグレーション適用 → `wrangler deploy` を実行する。

### 一度きりのセットアップ

1. **D1 を作成**し、`wrangler.jsonc` の `database_id` を実 ID に差し替える:
   ```bash
   vp exec wrangler d1 create ai-rss   # 出力された database_id を wrangler.jsonc に反映
   ```
2. **API トークンの権限**: GitHub Secrets の `CLOUDFLARE_API_TOKEN` は
   `Workers Scripts:Edit` に加えて `D1:Edit` と `Workers AI:Read` を含める必要がある
   （`demo-site-builder` の token 発行スクリプトは Workers Scripts のみ付与するため、
   D1/AI を使う本プロジェクトでは権限を追加した token を登録し直す）。
3. 初回は手元から `vp exec wrangler d1 migrations apply ai-rss --remote` で
   リモート D1 にスキーマを適用しておく（以降は CI が冪等に適用）。

### Cron / 手動トリガー

- Cron Trigger（`wrangler.jsonc` の `triggers.crons`）はデプロイ時に反映される。
- 本番の手動収集はダッシュボードの Cron 実行、または再デプロイで起動する。

## ディレクトリ構成

```
migrations/            D1 マイグレーション（スキーマ + シード）
src/pipeline/          収集パイプライン（I/O 非依存のドメインロジック中心）
  feeds/               RSS 取得・パース・フィード定義
src/ai/                AI エンジン抽象 + Workers AI 実装 + フェイク
src/repository/        D1 リポジトリ（dedup / FTS5 / 一覧クエリ）
src/worker/            Worker エントリ（API ルーティング + Cron）
src/web/               React SPA（一覧・絞り込み・検索・詳細）
```
