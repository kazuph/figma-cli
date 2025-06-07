# Figma CLI

FigmaのMCPサーバー機能をCLIコマンドとして利用できるツールです。

## セットアップ

1. リポジトリをクローン:
```bash
git clone https://github.com/GLips/Figma-Context-MCP.git
cd Figma-Context-MCP
```

2. 依存関係をインストール:
```bash
npm install
```

3. `.env`ファイルを作成してFigma API keyを設定:
```
FIGMA_API_KEY=your_figma_api_key_here
```

4. ビルド:
```bash
npm run build
```

## 使用方法

### 1. Figmaファイルのデータを取得

```bash
# 基本的な使用方法
node dist/figma-cli.js get-data <fileKey>

# 特定のノードを取得
node dist/figma-cli.js get-data <fileKey> <nodeId>

# 深度を指定
node dist/figma-cli.js get-data <fileKey> --depth 2

# JSON形式で出力
node dist/figma-cli.js get-data <fileKey> --format json

# 詳細ログを有効化
node dist/figma-cli.js get-data <fileKey> --verbose
```

### 2. 画像をダウンロード

```bash
node dist/figma-cli.js download-images <fileKey> <localPath> --nodes '[{"nodeId":"1:23","fileName":"icon.svg"}]'

# PNG画像のスケールを指定
node dist/figma-cli.js download-images <fileKey> <localPath> --nodes '[{"nodeId":"1:23","fileName":"icon.png"}]' --png-scale 3

# SVGオプションを指定
node dist/figma-cli.js download-images <fileKey> <localPath> --nodes '[{"nodeId":"1:23","fileName":"icon.svg"}]' --svg-outline-text false
```

## コマンド一覧

### `get-data`
Figmaファイルからレイアウト情報を取得します。

**引数:**
- `fileKey`: Figmaファイルキー（必須）
- `nodeId`: 取得するノードID（オプション）

**オプション:**
- `--depth <number>`: ノードツリーを辿る深度
- `--format <json|yaml>`: 出力形式（デフォルト: yaml）
- `--verbose`: 詳細ログを有効化

### `download-images`
FigmaファイルからSVG/PNG画像をダウンロードします。

**引数:**
- `fileKey`: Figmaファイルキー（必須）
- `localPath`: 保存先ディレクトリパス（必須）

**オプション:**
- `--nodes <json>`: ダウンロードするノードのJSON配列（必須）
- `--png-scale <number>`: PNG画像のスケール（デフォルト: 2）
- `--svg-outline-text <boolean>`: SVGでテキストをアウトライン化（デフォルト: true）
- `--svg-include-id <boolean>`: SVGにIDを含める（デフォルト: false）
- `--svg-simplify-stroke <boolean>`: SVGでストロークを簡略化（デフォルト: true）

## 全般オプション

- `--figma-api-key <string>`: Figma APIキー
- `--figma-oauth-token <string>`: Figma OAuthトークン
- `--use-oauth`: API keyの代わりにOAuthを使用
- `--help`: ヘルプを表示
- `--version`: バージョンを表示

## 例

```bash
# Figmaファイル全体の情報を取得
node dist/figma-cli.js get-data abc123def456

# 特定のコンポーネントの情報を取得
node dist/figma-cli.js get-data abc123def456 1:23

# アイコンをSVGでダウンロード
node dist/figma-cli.js download-images abc123def456 ./assets --nodes '[{"nodeId":"1:23","fileName":"icon.svg"}]'

# 複数の画像を一度にダウンロード
node dist/figma-cli.js download-images abc123def456 ./assets --nodes '[
  {"nodeId":"1:23","fileName":"icon1.svg"},
  {"nodeId":"1:24","fileName":"icon2.png"},
  {"nodeId":"1:25","fileName":"background.png","imageRef":"some-ref"}
]'
```

## 実装されたMCPツール

1. **get_figma_data** → `get-data`コマンド
2. **download_figma_images** → `download-images`コマンド

MCPサーバーの全機能がCLIコマンドとして利用可能です。