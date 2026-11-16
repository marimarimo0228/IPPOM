# IPPOMグランプリ

合言葉で集まった最大6人が、1人の回答者と5人の審査員に分かれて遊ぶブラウザ大喜利ゲームです。人数が足りない審査員席はNPCが埋めます。

本サイトは授業課題として制作した非公式のパロディ作品です。テレビ番組および放送局とは一切関係ありません。

仕様は [docs/spec.md](docs/spec.md) にあります。

## 実装の進み具合

| 段階 | 内容 | 状態 |
| --- | --- | --- |
| 1 | ローカルで1人プレイ（NPC審査員5人は乱数採点）、枠の演出、成績発表 | 完了 |
| 2 | Firebase で部屋を同期、複数人プレイ、`/screen` | 未着手 |
| 3 | 切断時の扱い、部屋の削除、セキュリティルール | 未着手 |
| 4 | Groq によるNPC採点（`/api/judge`） | 未着手 |
| 5 | サイトの合言葉（`/gate`）と公開期限 | 未着手 |
| 6 | 仕上げと受け入れ確認 | 未着手 |

段階1の時点では、部屋は1台のブラウザの中だけにあります。部屋の合言葉は表示されるだけで、ほかの端末とはつながりません。

## ローカルで動かす

Node.js 22 以上が必要です。

```bash
npm install
```

```bash
npm run dev
```

http://localhost:3000 を開きます。段階1は環境変数なしで動きます。

### 段階1の動作確認

1. 表示名（10文字まで）と部屋の合言葉（4〜20文字）を入れて「入室する」を押す。
2. ロビーで審査員5席がすべて NPC になっていることを確認し、「開始」を押す。
3. お題が3秒表示されたあと、回答を入力して「回答する」を押す（Enter でも送信できる）。
4. 回答が大きく表示され、黄色い枠が1点につき1段、外側から内側へ点灯する。
5. 「2回目へ」を押してもう1回答え、「成績発表へ」を押す。
6. 1回目と2回目の点数が並び、高い方が光り、成績のハンコが押される。

合計点を固定したいときは、URLに `?total=` を付けて入室します（0〜10）。

- http://localhost:3000/?total=10 … 10点（IPPOM と紙吹雪）
- http://localhost:3000/?total=6 … 6点以上は最後の1段の前で止まる
- http://localhost:3000/?total=0 … 0点

この指定は開発時（`npm run dev`）は常に有効で、本番では `NEXT_PUBLIC_DEBUG=1` を設定したときだけ有効になります。

### そのほかのコマンド

| コマンド | 内容 |
| --- | --- |
| `npm test` | 進行ロジックの単体テスト |
| `npm run lint` | ESLint |
| `npm run build` | 本番ビルド（お題データの検証を先に行う） |
| `npm run validate` | お題データの検証だけを行う |

## 環境変数

名前の一覧は [.env.example](.env.example) にあります。値はローカルでは `.env.local`、本番では Vercel の「Settings」→「Environment Variables」に入れます。`.env.local` は `.gitignore` で除外されており、コミットされません。

| 名前 | 用途 | 秘密か | 使う段階 |
| --- | --- | --- | --- |
| `GROQ_API_KEY` | NPC採点の Groq API。未設定なら乱数採点 | 秘密 | 4 |
| `GROQ_MODEL` | 使うモデル名 | 秘密ではない | 4 |
| `SITE_PASSPHRASE` | サイト全体の合言葉 | 秘密 | 5 |
| `SESSION_SECRET` | Cookie の署名用の鍵 | 秘密 | 5 |
| `PUBLIC_UNTIL` | 公開終了日（`2026-12-31`）。フッターの注記にも表示される | 秘密ではない | 1（表示のみ）、5 |
| `NEXT_PUBLIC_DEBUG` | `1` で本番でも `?total=` を有効にする | 秘密ではない | 1 |
| `NEXT_PUBLIC_FIREBASE_*` | Firebase の接続設定 | ブラウザに出てよい | 2 |

秘密の3つ（`GROQ_API_KEY`、`SITE_PASSPHRASE`、`SESSION_SECRET`）には `NEXT_PUBLIC_` を付けず、コードやコミットに書きません。

### 取得手順

それぞれを使う段階の実装時に、画面の手順を確かめてから詳しく追記します。現時点の概要は次のとおりです。

- **`GROQ_API_KEY`**：[console.groq.com](https://console.groq.com) でアカウントを作り、「API Keys」でキーを発行する。
- **`GROQ_MODEL`**：Groq の現行モデル一覧から、安価で速いものを選ぶ（段階4で決める）。
- **`SITE_PASSPHRASE`**：授業関係者に伝える合言葉を自分で決める。
- **`SESSION_SECRET`**：十分に長い乱数にする。次のコマンドで作れる。

  ```bash
  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
  ```

- **`PUBLIC_UNTIL`**：`2026-12-31` のように公開終了日を書く。
- **`NEXT_PUBLIC_FIREBASE_*`**：[Firebase コンソール](https://console.firebase.google.com) でプロジェクトと Realtime Database を作り、ウェブアプリを追加したときに表示される設定値を写す（段階2で手順を追記する）。

## お題の追加

お題は [content/odai.json](content/odai.json) と `public/odai/`（画像）にあり、コードを触らずに差し替えられます。

1. 画像お題の場合は、画像を `public/odai/` に置く（横1600px以内、16:9 または 4:3 を推奨）。
2. `content/odai.json` に1件追記する。
3. 再デプロイする（ローカルでは `npm run dev` を起動し直す）。

```json
{
  "id": "odai-006",
  "type": "text",
  "text": "（ここにお題文）",
  "enabled": true
}
```

```json
{
  "id": "odai-007",
  "type": "image",
  "text": "写真でひとこと",
  "image": "/odai/odai-007.jpg",
  "alt": "（画像の説明。NPC判定と読み上げに使う）",
  "credit": "（撮影者・出典）",
  "enabled": true
}
```

必須項目が欠けていたり、画像ファイルがなかったりすると、起動とビルドがエラーで止まります。

お題と写真は自作のものを使ってください。番組で実際に出たお題文や、他人が撮った写真・キャラクター・芸能人の写真は使いません。いま入っている5件は動作確認用のダミーです。

## 文言と効果音の差し替え

- サイト名、「IPPOM」の文字、成績の文字、注記、制作者名と連絡先は [content/site.json](content/site.json) にまとめてあります。
- 効果音は Web Audio で合成しています。音声ファイルに差し替える方法は [public/sounds/README.md](public/sounds/README.md) にあります。
- 番組のロゴ・効果音・曲・放送画面は使いません。

## フォルダの構成

| 場所 | 内容 |
| --- | --- |
| `content/` | お題と文言の設定 |
| `public/odai/` | お題の画像 |
| `public/sounds/` | 効果音の差し替え用（初期状態は空） |
| `scripts/validate-content.mjs` | お題データの検証 |
| `src/lib/game/` | 進行ロジック（状態の進め方、成績、演出の時間割）とテスト |
| `src/lib/room/` | 部屋のデータの読み書きと、ホスト端末の進行役 |
| `src/lib/sound.ts` | 効果音の合成 |
| `src/components/` | 画面の部品 |
| `src/app/` | ページ（`/` と `/room`） |

時間や文字数などの「仮」の値は [src/lib/game/constants.ts](src/lib/game/constants.ts) にまとめてあります。
