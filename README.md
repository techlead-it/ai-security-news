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

Workers AI バインディングはローカル開発でも実際の Cloudflare AI を呼ぶ。`wrangler.jsonc` の
ai に `"remote": true` を付けてあるので、`CLOUDFLARE_API_TOKEN`（Workers AI 実行権限つき）を
環境変数に設定して `wrangler dev` を起動すれば、ローカル D1 + リモート AI で動かせる。

## デプロイ（本番）

公開URL: https://ai-rss.techlead-it.workers.dev

`main` への push で `.github/workflows/deploy.yml` が test → 型チェック → build →
D1 マイグレーション適用 → `wrangler deploy` を実行する（マイグレーションは冪等）。
スキーマ変更は `migrations/` に `NNNN_*.sql` を追加して push するだけで本番に自動適用される。

### CI のトークン構成（最小権限で分離）

| GitHub Secret | 用途 | 権限 |
|---|---|---|
| `CLOUDFLARE_API_TOKEN` | `wrangler deploy` | Workers Scripts: Edit |
| `CLOUDFLARE_D1_TOKEN` | `wrangler d1 migrations apply --remote` | D1: Read + Write |
| `CLOUDFLARE_ACCOUNT_ID` | アカウント ID | — |

> 実行時の D1/Workers AI は Worker のバインディング（`env.DB` / `env.AI`）でアクセスするため、
> デプロイ済み Worker は API トークンを使わない。トークンが要るのは wrangler の管理操作だけ。

### セットアップ状況（済み）

- D1 `ai-rss` 作成済み・`wrangler.jsonc` に `database_id` 設定済み（公開可能な識別子）
- リモート D1 にマイグレーション適用済み
- 上記 3 シークレット登録済み

### Cron / 手動トリガー

- Cron Trigger（`wrangler.jsonc` の `triggers.crons`、3日に1回）はデプロイ時に反映される。
- 本番 D1 を即時に埋めたい場合は、`CLOUDFLARE_API_TOKEN`（AI/D1 実行権限つき）を設定して
  `wrangler dev --remote --test-scheduled` を起動し、`curl http://localhost:8787/__scheduled` で収集を実行する
  （リモートバインディング＝本番 D1 に書き込まれる）。

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
