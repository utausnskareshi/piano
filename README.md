# Piano - 3オクターブシンセサイザーPWA

3オクターブをサポートするシンセサイザー PWA。100音色・50曲を内蔵し、オフラインで動作します。

公開URL: <https://utausnskareshi.github.io/piano/>

## 主な機能

- **3オクターブ対応** — 1オクターブ分の鍵盤を表示し、低/中/高ボタンで切り替え
- **100音色** — General MIDI 風カテゴリ（ピアノ、オルガン、ギター、ベース、ストリングス、ブラス、リード、パッド、エスニック等）
- **WebAssembly DSP** — Rust で書かれたポリフォニック合成エンジン（16 ボイス、ADSR、フィルタ、Karplus-Strong、FM、加算、減算、ドローバー）
- **3つの演奏モード**
  - 自由演奏: 鍵盤を自由に演奏（録音保存可能）
  - 学習モード: 次に押すべき鍵盤がハイライトされる
  - 自動演奏モード: どの鍵盤を押しても曲の音が順番に鳴る
- **50曲内蔵** — 童謡・伝承曲・クラシック・賛美歌（すべてパブリックドメインまたは独自編曲）
- **曲追加** — テキストで `C D E F G A B C+` のように貼り付けて保存
- **オフライン対応** — Service Worker による事前キャッシュ
- **Sustain ペダル / リバーブ / ベロシティ対応 / 演奏録音**

## 曲データの記法

- 音名: `C D E F G A B`（大文字小文字どちらでも可）
- 半音: 音名の後に `#` を付ける（例: `F#`）
- オクターブ: 低 = `-`、中 = なし、高 = `+`（例: `C-` `C` `C+`）
- 休符: `_`
- 長く伸ばす音: 末尾に `~` を付ける（2倍長として再生）
- 区切り: スペース・改行・カンマ・`|`（小節線）はすべて無視されます

例:

```
C-D-E-F-G-A-B-CDEFGABC+D+E+F+G+A+B+
```

これは3オクターブの上昇音階（C4 → B6）です。

## ローカル開発

### 前提

- Node.js 20+
- Rust（`rustup target add wasm32-unknown-unknown` 済）

Rust が無い環境でも、JS フォールバック合成エンジンが自動で使われるため動作します。
ただし WASM ビルドの方が音質・レイテンシともに優れます。

### コマンド

```bash
npm install
npm run dev          # 開発サーバ (http://localhost:5173/piano/)
npm run build        # 本番ビルド (Rust → WASM, アイコン生成, Vite ビルド)
npm run preview      # ビルド成果物のプレビュー
```

### 個別ビルド

```bash
npm run build:wasm   # Rust DSP コアを WASM にビルド (public/wasm/synth.wasm)
npm run build:icons  # PWA アイコン (public/icons/*.png)
```

## アーキテクチャ

```
piano/
├── index.html
├── manifest（vite-plugin-pwa が生成）
├── src/
│   ├── main.ts             ルーター・ブートストラップ
│   ├── state.ts            アプリ状態（IndexedDB と同期）
│   ├── styles.css
│   ├── audio/
│   │   ├── engine.ts       AudioContext / AudioWorkletNode 管理
│   │   ├── worklet.ts      AudioWorkletProcessor (WASM + JS フォールバック)
│   │   └── presets.ts      100 音色プリセット
│   ├── data/
│   │   ├── parser.ts       楽譜テキストパーサ
│   │   └── songs.ts        50 曲内蔵データ
│   ├── store/
│   │   └── db.ts           IndexedDB ラッパ (ユーザー曲・設定)
│   └── ui/
│       ├── landing.ts      ヘルプ / インストール手順
│       ├── keyboard.ts     演奏画面 (3 モード対応)
│       ├── instruments.ts  音色選択
│       ├── songs.ts        曲選択
│       └── add-song.ts     曲追加
├── wasm/
│   ├── Cargo.toml
│   └── src/lib.rs          Rust DSP コア (16 ボイス、合成方式 5 種)
├── scripts/
│   ├── build-wasm.mjs
│   └── build-icons.mjs
├── public/                 (CI で生成: icons/, wasm/synth.wasm)
└── .github/workflows/deploy.yml
```

### 合成方式

WASM と JS フォールバックの両方で、5 種類の合成方式を使い分けて 100 音色を表現します:

| ID | 方式 | 用途 |
|----|------|------|
| 0 | 減算合成 (2 OSC + ノイズ + LP フィルタ) | リード、パッド、ストリングス |
| 1 | FM 合成 (2 オペレータ) | エレピ、ベル、シンセブラス |
| 2 | Karplus-Strong | ピアノ、ギター、ハープ |
| 3 | 加算合成 (3 倍音) | コーラス、笛系 |
| 4 | ドローバー風加算 (4 倍音) | オルガン |

それぞれにフィルタ ADSR、アンプ ADSR、LFO、ドライブ（waveshaper）、リバーブを適用します。

### iOS / Android のオーディオ ロック解除

iOS Safari は最初のユーザー操作（タップ）まで `AudioContext` を開始できません。
本アプリは「演奏を始める」ボタンや鍵盤への最初のタッチで `engine.start()` を呼び、
`AudioContext` を resume します。

## ライセンス・著作権

- ソースコード: MIT License
- 内蔵 50 曲: 全曲ともパブリックドメインに属する楽曲（伝統民謡・童謡、または作曲者の没後 70 年以上経過したクラシック）に基づく簡易な単旋律編曲で、CC0（パブリックドメイン）として公開
- 「ハッピーバースデー」は米国で 2016 年に著作権が無効化され、日本でも公有とみなされる扱い（WTO TRIPS 協定下）
- 万一、特定の楽曲の収録に問題があると思われる場合は、Issue を立ててください。速やかに対応します

## クレジット

- 作曲者: パブリックドメイン（J.S.バッハ、モーツァルト、ベートーヴェン、ショパン、ドビュッシー、パッヘルベル、ヴィヴァルディ、ブラームス、シューベルト、チャイコフスキー、ヘンデル、グリーグ、ビゼー、エルガー、サティ、ヘンリー・C・ワーク、フランツ・グルーバー、J.E.ウィナー、伝承曲 ほか）
- 使用 OSS: [Vite](https://vitejs.dev/), [vite-plugin-pwa](https://vite-pwa-org.netlify.app/), [TypeScript](https://www.typescriptlang.org/), [sharp](https://sharp.pixelplumbing.com/), [peaceiris/actions-gh-pages](https://github.com/peaceiris/actions-gh-pages)（いずれも MIT または Apache 2.0）
