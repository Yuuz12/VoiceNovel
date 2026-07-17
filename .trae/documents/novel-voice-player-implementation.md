# 小说语音播放应用 — 实现计划

## Context（背景与目标）

用户需要基于方舟 Agent Plan 语音合成服务（doubao-seed-tts-2.0）开发一个**小说语音播放应用**，让用户能够上传小说文本、自动/手动分段、识别说话角色、为不同角色匹配不同音色，并通过 TTS 流式播放整本小说。核心痛点：传统 TTS 朗读长文本时所有角色都用同一音色，导致用户无法区分角色身份。本应用通过 LLM 分析角色性格 → 自动匹配音色 → 持久化映射 → 按段流式播放，实现"多人有声书"体验。

技术决策（用户已确认）：
- **TTS 接口**：HTTP Chunked（`POST https://openspeech.bytedance.com/api/v3/plan/tts/unidirectional`），后端通过自家 WebSocket 把分块音频透传给浏览器实现边收边播
- **前端**：原生 HTML/CSS/JS，Express 静态托管，无构建步骤
- **持久化**：JSON 文件（`data/` 目录）
- **音频缓存**：已合成段落落盘到 `data/audio_cache/`，重复播放直接读本地

## 架构总览

```
浏览器 (原生 JS)  ──HTTP/WS──▶  Express Server (Node.js)
                                   ├─ /api/novels      (小说 CRUD + 分段)
                                   ├─ /api/characters  (角色提取 + 音色匹配)
                                   ├─ /api/settings    (用户配置)
                                   ├─ /api/voices      (音色目录)
                                   ├─ /api/tts/stream  (SSE 流式播放)
                                   └─ WS /ws/playback  (实时音频块透传)
                                          │
                                          ▼
                              ┌───────────────────────┐
                              │  TTS Service          │── HTTP Chunked ──▶ 方舟 TTS API
                              │  LLM Service          │── OpenAI 格式  ──▶ 用户配置的 LLM
                              │  Storage (JSON 文件)  │
                              │  Voice Catalog        │ (内置 ~50 个音色元数据)
                              └───────────────────────┘
```

## 目录结构

```
d:\Project\VoiceNovel\
├── package.json
├── server.js                          # 入口：Express + WS 服务器
├── .env.example                       # 环境变量模板
├── src/
│   ├── config/
│   │   └── voices.js                  # 豆包 2.0 音色目录（含性别/场景/风格元数据）
│   ├── services/
│   │   ├── ttsService.js              # 方舟 TTS HTTP Chunked 客户端
│   │   ├── llmService.js              # OpenAI 兼容 LLM 客户端
│   │   ├── novelService.js            # 小说 CRUD、分段、解析
│   │   ├── characterService.js        # 角色提取、音色自动匹配
│   │   ├── settingsService.js         # 设置读写
│   │   └── audioCacheService.js       # 音频缓存（SHA256 键）
│   ├── routes/
│   │   ├── novels.js
│   │   ├── characters.js
│   │   ├── settings.js
│   │   ├── voices.js
│   │   └── tts.js                     # SSE 流式播放端点
│   ├── ws/
│   │   └── playbackSocket.js          # WS 透传 TTS 分块音频
│   ├── storage/
│   │   └── fileStorage.js             # JSON 文件原子读写
│   └── utils/
│       ├── logger.js                  # 控制台 + 文件日志
│       └── id.js                      # 短 ID 生成
├── public/
│   ├── index.html                     # 单页应用入口
│   ├── styles/
│   │   ├── main.css                   # 全局样式 + 主题变量
│   │   ├── player.css                 # 播放器组件
│   │   └── config.css                 # 配置面板
│   ├── scripts/
│   │   ├── app.js                     # 应用主入口 + 路由
│   │   ├── api.js                     # 后端 API 封装
│   │   ├── player.js                  # 音频队列播放器（MediaSource + AudioContext）
│   │   ├── novelManager.js            # 小说上传/分段 UI
│   │   ├── characterPanel.js          # 角色音色配置 UI
│   │   ├── settingsPanel.js           # 全局设置 UI
│   │   └── utils.js                   # 前端工具函数
│   └── assets/
│       └── icon.svg
└── data/                              # 运行时数据（gitignore）
    ├── novels/                        # 每本小说一个 JSON
    ├── settings.json
    └── audio_cache/                   # 命名: {sha256}.mp3
```

## 数据模型

### `data/novels/{novelId}.json`
```jsonc
{
  "id": "n_a1b2c3",
  "title": "示例小说",
  "rawText": "完整原文",
  "createdAt": "2026-07-17T...",
  "updatedAt": "2026-07-17T...",
  "segments": [
    {
      "id": "s_001",
      "type": "narration",            // "narration" | "dialog"
      "text": "段落文本",
      "characterId": null,            // narration 为 null
      "speaker": "zh_female_vv_uranus_bigtts", // 解析时确定的音色
      "order": 0
    }
  ],
  "characters": [
    {
      "id": "c_x1y2",
      "name": "林墨",
      "description": "20岁女大学生，性格内向温柔",
      "gender": "female",
      "voiceId": "zh_female_wenroushunv_uranus_bigtts",
      "voiceConfig": { "speed": 0, "volume": 0, "emotion": "neutral" },
      "appearances": 5                 // 出现次数（用于排序）
    }
  ]
}
```

### `data/settings.json`
```jsonc
{
  "tts": {
    "apiKey": "",                      // 方舟 Agent Plan 专属 API Key
    "resourceId": "seed-tts-2.0",
    "audioFormat": "mp3",
    "sampleRate": 24000
  },
  "llm": {
    "baseUrl": "https://api.openai.com/v1",
    "apiKey": "",
    "model": "gpt-4o-mini"
  },
  "narration": {
    "voiceId": "zh_male_yizhipiannan_uranus_bigtts",  // 旁白默认音色
    "speed": 0,
    "volume": 0
  },
  "parsing": {
    "dialogSymbols": [
      ["\"", "\""], ["「", "」"], ["『", "』"], ["“", "”"]
    ],
    "maxSegmentLength": 200,           // 自动分段时单段最大字符数
    "autoSegmentOnUpload": true        // 上传时是否自动分段
  },
  "playback": {
    "defaultSpeed": 1.0,
    "gapBetweenSegments": 300          // 段落间隔 ms
  }
}
```

## 关键实现要点

### 1. TTS Service (`src/services/ttsService.js`)

- 使用 Node.js 原生 `fetch`（Node 18+ 内置）调用方舟 HTTP Chunked 接口
- 端点：`POST https://openspeech.bytedance.com/api/v3/plan/tts/unidirectional`
- 请求头：
  - `X-Api-Key`: 用户在设置中配置的方舟 Agent Plan 专属 API Key
  - `X-Api-Resource-Id`: `seed-tts-2.0`
  - `Content-Type: application/json`
  - `Connection: keep-alive`
  - `X-Control-Require-Usage-Tokens-Return: *`
- 请求体：`{ req_params: { text, speaker, audio_params: { format, sample_rate } } }`
- 响应：每行一个 JSON，`data` 字段为 base64 音频块；`code == 20000000` 表示结束
- 提供 `async *synthesizeStream(text, speaker, params)` 生成器，逐块 yield `Buffer`
- 每次调用生成唯一 `X-Api-Connect-Id`（UUID），日志记录响应头 `X-Tt-Logid` 便于排查
- 错误处理：HTTP 非 200、`code > 0`、网络中断分别抛出明确错误

### 2. LLM Service (`src/services/llmService.js`)

- OpenAI 兼容 Chat Completions API（`POST {baseUrl}/chat/completions`）
- 三个核心 prompt：
  1. **角色提取**：输入小说全文（超长则按 8K token 分批），输出 JSON 角色列表（name/gender/description/personality）
  2. **自动分段**：输入原文，按对话符号切分并标注 `type`/`characterId`/`text`，保留旁白
  3. **音色推荐**：输入角色描述 + 可用音色列表，为每个角色推荐最匹配的 `voiceId` + 理由
- 使用 `response_format: { type: "json_object" }` 强制 JSON 输出
- 超时 60s，重试 1 次

### 3. 角色音色自动匹配算法 (`characterService.js`)

**策略**：先 LLM 推荐，再规则校验
1. 调 LLM 拿到每个角色的推荐 `voiceId`
2. 校验该 ID 在内置音色目录中存在
3. 校验性别一致性（女角色不分配男声，反之亦然）
4. 同一小说内不重复使用同一音色（避免角色混淆）；冲突时给次要角色分配次优音色
5. 用户可手动覆盖任意分配，覆盖后持久化

**音色目录** (`src/config/voices.js`)：从官方列表精选 ~50 个，每个含字段：
```js
{ id: "zh_female_vv_uranus_bigtts", name: "Vivi 2.0", gender: "female",
  scenario: "通用场景", style: "年轻活力女声", tags: ["通用","女声","年轻"] }
```
覆盖：通用、角色扮演、有声阅读、视频配音等场景；男声/女声均衡；包含旁白专用（如"译制片男""儒雅青年"）。

### 4. 文本分段与解析 (`novelService.js`)

- **手动分段**：用户在前端用分隔符（默认换行+空行）切分，或拖动分隔条
- **自动分段（规则）**：按用户配置的对话符号配对（如 `"..."`、`「...」`）切出对话，其余为旁白；段落过长按 `maxSegmentLength` 二次切分，在句末标点（。！？…）切
- **LLM 智能分段**（可选高级功能）：调用 LLM 服务，识别每段是旁白还是某角色对话
- 解析时同时建立 `characters[]` 列表，记录出现次数

### 5. 音频缓存 (`audioCacheService.js`)

- 缓存键：`sha256(speaker + "|" + text + "|" + speed + "|" + volume)` 前 32 字符
- 命中时直接 `fs.createReadStream` 返回 mp3
- 未命中时调用 TTS，同时写入 `data/audio_cache/{key}.mp3`
- 提供 `clearCache()` 与 `getCacheSize()` API
- 避免磁盘爆炸：可配置最大缓存大小，超过时按 LRU 清理

### 6. 实时播放透传 (`src/ws/playbackSocket.js`)

- 浏览器建立 `ws://localhost:3000/ws/playback`
- 客户端发送 `{ novelId, segmentId }` 请求播放某段
- 服务端：先查缓存 → 命中则分块推送 mp3 bytes；未命中则调 `ttsService.synthesizeStream()` 边收边推
- 服务端消息类型：
  - `{ type: "meta", segmentId, totalSize?, cached: bool }`
  - `{ type: "audio", data: "<base64>" }` （分块）
  - `{ type: "end", segmentId }`
  - `{ type: "error", message }`
- 客户端用 `MediaSource` API 拼接 mp3 块实现边收边播；备用方案：累积到 Blob 后用 `<audio>` 播放

### 7. 前端核心模块

**`public/index.html`** — 单页布局：
- 顶部导航：小说列表 / 设置
- 左栏：小说文本 + 分段列表（可拖拽重排、可编辑）
- 中栏：播放器（上一段/播放/下一段/进度/段落跳转）+ 当前段落文本高亮
- 右栏：角色音色配置面板（角色名/性别/描述/音色下拉/试听按钮/语速音量滑块）

**`player.js`** — 音频队列播放器：
- 维护播放队列 `queue: segmentId[]`
- 当前段播完自动播下一段（按 `gapBetweenSegments` 间隔）
- 支持暂停/继续/跳转/速率调节
- 通过 WS 接收分块，边收边播

**`characterPanel.js`** — 角色配置：
- 列出所有角色 + 当前音色
- "一键 LLM 推荐"按钮：调 `/api/characters/auto-match`
- 每个角色可下拉选音色（按性别/场景分组）+ 试听 + 调速/音量
- 改动即时调 `/api/characters/:id` 持久化

**`settingsPanel.js`** — 全局设置：
- TTS 配置：API Key（密码框）、Resource ID、音频格式
- LLM 配置：Base URL、API Key、Model
- 旁白音色选择 + 试听
- 对话符号配置（可增删符号对）
- 自动分段参数（最大段长、是否上传时自动分段）
- 缓存管理（查看大小、清空）

### 8. REST API 设计

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/voices` | 列出内置音色目录（按场景分组） |
| GET | `/api/voices/:id/preview` | 用指定音色试听示例文本 |
| GET | `/api/settings` | 读取设置 |
| PUT | `/api/settings` | 更新设置 |
| GET | `/api/novels` | 列出所有小说 |
| POST | `/api/novels` | 创建小说（body: title, text, autoSegment） |
| GET | `/api/novels/:id` | 获取小说详情 |
| PUT | `/api/novels/:id` | 更新（标题、segments） |
| DELETE | `/api/novels/:id` | 删除小说 |
| POST | `/api/novels/:id/segment` | 手动/自动重新分段 |
| POST | `/api/novels/:id/segment-llm` | LLM 智能分段 |
| GET | `/api/novels/:id/characters` | 列出角色 |
| PUT | `/api/novels/:id/characters/:cid` | 更新角色音色/参数 |
| POST | `/api/novels/:id/characters/auto-match` | LLM 一键推荐音色 |
| POST | `/api/novels/:id/characters/extract` | LLM 提取角色清单 |
| GET | `/api/tts/preview` | GET ?speaker=&text= 试听单段 |
| GET | `/api/cache/size` | 缓存大小 |
| DELETE | `/api/cache` | 清空缓存 |

## 实现步骤（建议执行顺序）

### Step 1：项目骨架与依赖
- 创建 `package.json`（依赖：express, ws, dotenv, uuid；engines: node>=18）
- 创建 `.env.example`、`.gitignore`
- 创建 `server.js`：Express + ws 服务器，静态托管 `public/`，挂载路由
- 创建 `src/utils/logger.js`、`src/utils/id.js`、`src/storage/fileStorage.js`

### Step 2：音色目录与设置
- 编写 `src/config/voices.js`（精选 ~50 个音色 + 元数据）
- 编写 `src/services/settingsService.js` + `src/routes/settings.js`
- 编写 `src/routes/voices.js`

### Step 3：TTS 服务
- 编写 `src/services/ttsService.js`（HTTP Chunked 客户端 + 流式生成器）
- 编写 `src/routes/tts.js`（`/preview` 端点）
- 编写 `src/services/audioCacheService.js`

### Step 4：小说与角色服务
- 编写 `src/services/novelService.js`（CRUD + 规则分段）
- 编写 `src/services/llmService.js`（角色提取 / LLM 分段 / 音色推荐 prompt）
- 编写 `src/services/characterService.js`（匹配算法）
- 编写 `src/routes/novels.js`、`src/routes/characters.js`

### Step 5：实时播放 WS
- 编写 `src/ws/playbackSocket.js`
- 在 `server.js` 注册 WS 路径 `/ws/playback`

### Step 6：前端 UI
- `public/index.html` 布局骨架
- `public/scripts/api.js` 后端 API 封装
- `public/scripts/player.js` 播放器
- `public/scripts/novelManager.js`、`characterPanel.js`、`settingsPanel.js`
- `public/scripts/app.js` 主入口
- `public/styles/*.css`（含主题变量、响应式）

### Step 7：联调与文档
- 启动 `npm install && npm start`
- 浏览器打开 `http://localhost:3000`
- 编写 `README.md`（安装、配置 API Key、使用流程）

## 关键复用与对照

- TTS 协议严格对照 `接入语音模型文档.md` 第 33-39 行的 HTTP 接口规范，请求头/体/响应解析与文档第 294-363 行 Python 示例一致（Node.js 等价实现）
- 音色 `voice_type` 字段直接使用官方列表值（如 `zh_female_vv_uranus_bigtts`），不引入格式转换
- `X-Api-Connect-Id` 用 `uuid` 包生成，遵循文档第 1417 行建议
- 日志记录响应头 `x-tt-logid`，遵循文档第 1415 行建议

## 验证方案（端到端测试）

1. **启动检查**：
   ```
   cd d:\Project\VoiceNovel
   npm install
   npm start
   ```
   访问 `http://localhost:3000` 应看到主界面（无小说时显示空状态）

2. **设置 TTS**：在"设置"页填入方舟 Agent Plan API Key → 点"测试连接"应返回示例音频

3. **上传小说**：粘贴一段含对话的小说文本（如《三体》节选）→ 自动分段应识别出旁白与对话 → 角色面板应列出识别到的角色

4. **音色匹配**：点"一键 LLM 推荐"→ 每个角色应分到不同音色，性别匹配正确 → 试听每个角色音色

5. **播放**：点播放 → 应按段落顺序播放，对话用对应角色音色、旁白用旁白音色 → 刷新页面再播放同段应秒播（命中缓存）

6. **持久化验证**：重启服务后，小说、角色映射、设置应全部保留

7. **错误场景**：
   - 不填 API Key 直接播放 → 应提示"请先配置 TTS API Key"
   - LLM 未配置时点"一键推荐" → 应明确提示并允许手动配置
   - 网络中断播放 → 应显示错误并支持重试当前段

## 注意事项与边界

- Node.js 最低版本 18（使用内置 `fetch` 与 `crypto.randomUUID`）
- LLM 上下文超长时按 ~8K 字符分批处理，最后合并去重
- 同一小说内角色音色唯一性约束可被用户手动覆盖（用户优先）
- 音频缓存键不含 `novelId`，相同文本+音色跨小说复用（节省费用）
- WS 连接断开时清理正在进行的 TTS 流，避免泄漏
- 前端使用 `MediaSource` 时注意 mp3 的 `codecs="audio/mpeg"` 兼容性，退化方案为 Blob URL 整段播放
