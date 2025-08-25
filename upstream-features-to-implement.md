# 本家リポジトリから実装すべき機能仕様書

## 概要
GLips/Figma-Context-MCPの本家リポジトリから、kazuph/figma-cliに取り込むべき機能の実装仕様をまとめたドキュメントです。
直接マージするとコンフリクトが大きいため、実装意図を理解して独自に再実装する方針です。

## 1. セキュリティ強化 【最優先】

### 1.1 パストラバーサル攻撃の防止
**該当コミット**: 5a18eef (feat(security): add path sanitization to prevent directory traversal)

**実装内容**:
- ファイルパスの正規化とサニタイゼーション
- `path.normalize()`でパスを正規化
- `../`などの相対パスを除去
- `path.resolve()`で絶対パスに変換
- カレントディレクトリ外へのアクセスを防ぐチェック

**実装箇所**: `src/services/figma.ts`の画像ダウンロード処理

```typescript
// 実装例
const sanitizedPath = path.normalize(localPath).replace(/^(\.\.(\/|\\|$))+/, '');
const resolvedPath = path.resolve(sanitizedPath);
if (!resolvedPath.startsWith(path.resolve(process.cwd()))) {
  throw new Error("Invalid path specified. Directory traversal is not allowed.");
}
```

### 1.2 入力値検証の強化
**該当コミット**: 651974e (feat(security): add input validation to download images tool)

**実装内容**:
- Zodスキーマに正規表現バリデーションを追加
- fileKey: 英数字のみ (`/^[a-zA-Z0-9]+$/`)
- nodeId: `数字:数字`形式 (`/^\d+:\d+$/`)
- fileName: 安全な文字のみ (`/^[a-zA-Z0-9_.-]+$/`)

**実装箇所**: `src/mcp/tools/download-figma-images-tool.ts`

## 2. テスト・リンター設定の更新

### 2.1 ESLint v9形式への移行
**該当コミット**: 33fc392 (Update tests and linter to run properly)

**実装内容**:
- `.eslintrc`から`eslint.config.js`への移行
- Flat Config形式の採用
- TypeScriptサポートの設定
- Prettierとの統合

**新しい設定ファイル構造**:
```javascript
import js from "@eslint/js";
import tseslint from "@typescript-eslint/eslint-plugin";
import tsparser from "@typescript-eslint/parser";
import prettier from "eslint-config-prettier";

export default [
  js.configs.recommended,
  // TypeScript設定
  // Prettier統合
  // ignore設定
];
```

### 2.2 Jest設定の改善
- テスト設定の修正と最適化
- TypeScriptテストのサポート強化

## 3. グラデーション処理の改善

### 3.1 CSS形式への変換
**該当コミット**: 618bbe9 (Calculate gradient values instead of passing raw Figma data)

**実装内容**:
- Figmaの生のグラデーションデータをCSS形式に変換
- グラデーションハンドルの位置を計算してCSS percentageに変換
- 線形、放射、角度、ダイヤモンドグラデーションのサポート
- コンテナ外のハンドル位置にも対応

**主要な変更点**:
- `gradientHandlePositions`と`gradientStops`の生データではなく、計算済みのCSS文字列を返す
- 例: `linear-gradient(45deg, rgba(255,0,0,1) 0%, rgba(0,0,255,1) 100%)`

## 4. 画像処理の拡張

### 4.1 画像表示モードのサポート
**該当コミット**: edf4182 (Add support for Fill, Fit, Crop and Tile image types)

**実装内容**:
- Fill（塗りつぶし）モードのサポート
- Fit（フィット）モードのサポート  
- Crop（クロップ）モードのサポート
- Tile（タイル）モードのサポート
- 画像処理ユーティリティの追加（`src/utils/image-processing.ts`）

**必要な依存関係**:
- 画像処理ライブラリの追加（sharp等）

### 4.2 パターンフィルのサポート
**該当コミット**: a8b59bf (Add support for pattern fills in Figma)

**実装内容**:
- パターン塗りつぶしの処理
- 繰り返しパターンの実装

## 5. オプション機能

### 5.1 画像ダウンロードスキップオプション
**該当コミット**: 4a44681 (Add --skip-image-downloads option)

**実装内容**:
- `--skip-image-downloads`フラグの追加
- 画像ダウンロードツールの条件付き表示
- 設定管理の拡張

## 実装優先順位

1. **緊急（即座に実装）**:
   - セキュリティ修正（1.1, 1.2）

2. **高（次のリリースまでに）**:
   - ESLint v9移行（2.1）
   - Jest設定改善（2.2）

3. **中（必要に応じて）**:
   - グラデーション処理改善（3.1）
   - 画像表示モード（4.1）

4. **低（オプション）**:
   - パターンフィル（4.2）
   - ダウンロードスキップ（5.1）

## 実装時の注意事項

1. **互換性の維持**:
   - 既存のCLI最適化機能を壊さない
   - YAMLベースの出力形式を維持

2. **テスト**:
   - 各機能実装後に必ずテストを追加
   - セキュリティ修正は特に入念にテスト

3. **段階的実装**:
   - 一度に全て実装せず、優先度順に段階的に実装
   - 各段階でビルドとテストを確認

4. **依存関係**:
   - 新しい依存関係は慎重に検討
   - バンドルサイズへの影響を考慮

## 参考情報

- 本家リポジトリ: https://github.com/GLips/Figma-Context-MCP
- フォーク: https://github.com/kazuph/figma-cli
- 本家との差分: 19 commits ahead, 25 commits behind