# chrome-summarizer-ja

現在アクティブなタブの Web ページ本文（Mozilla Readability で抽出）を、Chrome 組み込みの **Summarizer API** でオンデバイス要約します。要約結果の言語が日本語でない場合は、**Language Detector API** と **Translator API** でオンデバイス翻訳し、日本語で表示します。

参考: [GoogleChrome / chrome-extensions-samples の on-device 要約サンプル](https://github.com/GoogleChrome/chrome-extensions-samples/tree/main/functional-samples/ai.gemini-on-device-summarization)

## 前提条件

- **Google Chrome（デスクトップ）138 以降**（組み込み AI API の対象環境であること）
- オンデバイス AI 用の**ハードウェア・空き容量・ネットワーク**の要件を満たすこと（概要は [Chrome の組み込み AI ドキュメント](https://developer.chrome.com/docs/ai) を参照）
- **Node.js**（ビルド用。推奨: 18 以降）

## Chrome へのインストール手順

1. このリポジトリを取得し、プロジェクトのルートディレクトリ（`package.json` がある場所）を開きます。

2. 依存関係をインストールします。

   ```bash
   npm install
   ```

3. 拡張機能をビルドします（`dist` フォルダが生成されます）。

   ```bash
   npm run build
   ```

4. Chrome で **`chrome://extensions`** を開きます。

5. 右上の **「デベロッパーモード」** をオンにします。

6. **「パッケージ化されていない拡張機能を読み込む」** をクリックし、手順 3 で生成された **`dist` フォルダ** を選択します（ソース直下ではなく、必ず `dist` を指定してください）。

7. ツールバーの拡張機能アイコンをクリックすると **サイドパネル** が開きます。`http` / `https` のページを表示した状態で、抽出された本文に基づき要約と（必要なら）日本語訳が表示されます。

8. 初回に翻訳モデルの準備で失敗する場合は、サイドパネルの **「モデルをウォームアップ」** を押してください。Summarizer / LanguageDetector / Translator（`en -> ja`）の順に準備し、完了後は通常の要約・翻訳が安定しやすくなります。

## 配布用 ZIP の作成

プロジェクトルートで次を実行すると、`npm run build` のあと **`dist` の中身をルートにした ZIP**（例: `chrome-summarizer-ja-v1.0.0.zip`）が同じフォルダに生成されます。

```bash
npm run package
```

生成物のファイル名は `package.json` の `version` に連動します。

## GitHub Releases（自動配布）

`.github/workflows/release.yml` を追加してあり、`v1.0.1` のようなタグを push すると GitHub Actions が次を自動実行します。

1. タグ（`vX.Y.Z`）と `package.json` の `version` 一致チェック（不一致なら失敗）
2. `npm ci`
3. `npm run package` で ZIP 生成
4. `sha256` チェックサム生成
5. GitHub Release 作成（または更新）と成果物アップロード

アップロードされる成果物:

- `chrome-summarizer-ja-vX.Y.Z.zip`
- `chrome-summarizer-ja-vX.Y.Z.zip.sha256`

例:

```bash
git tag v1.0.1
git push origin v1.0.1
```

## ZIP を受け取った場合の Chrome への取り込み

Chrome の **「パッケージ化されていない拡張機能を読み込む」** は、ZIP ファイルそのものではなく **展開後のフォルダ** を指定します。

1. 受け取った ZIP を任意の場所に保存し、**すべて展開**します（中に `manifest.json` が含まれる状態にします）。
2. Chrome で **`chrome://extensions`** を開きます。
3. 右上の **「デベロッパーモード」** をオンにします。
4. **「パッケージ化されていない拡張機能を読み込む」** をクリックし、展開したフォルダのうち **`manifest.json` が直下にあるフォルダ** を選択します。  
   （ZIP を展開すると、フォルダの1段下にファイルが並ぶ場合と、さらにサブフォルダに入る場合があります。エラーになるときは、Chrome に選ばせるフォルダが `manifest.json` を含む階層か確認してください。）
5. ツールバーから拡張機能を開き、前述と同様に利用します。

### ソースを変更したあと

`sidepanel/`、`scripts/`、`background.js`、`manifest.json` などを編集したら、再度次を実行してから Chrome の拡張機能ページで **「更新」**（または一度削除して `dist` を読み込み直す）を行ってください。

```bash
npm run build
```

## 動作の注意

- Reader 向けの記事として本文が認識できないページでは、抽出に失敗し要約できないことがあります。
- 要約入力はモデル都合でおおよそ **約 4000 文字** を目安に警告を表示します。
- 言語判定の信頼度が低い場合は、誤翻訳を避けるため **翻訳をスキップ** します。
- オンデバイスで対応していない言語ペアの場合、**要約のみ**表示し、翻訳は行いません。
- ウォームアップボタンは `en -> ja` 翻訳ペアを事前準備します。別言語の翻訳は、実際にその言語を処理した際に追加で準備される場合があります。

## アイコン

アイコン画像は上記 Google 公式サンプルと同一リポジトリの `images` を利用しています（Apache 2.0）。
