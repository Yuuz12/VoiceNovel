# 语音小说 · VoiceNovel

基于方舟 Agent Plan 语音合成（doubao-seed-tts-2.0）与 OpenAI 兼容 LLM 的小说语音播放应用。
让小说中不同角色拥有不同音色，实现"多人有声书"体验。

## 功能特性

- 📚 **小说管理**：粘贴或上传 .txt 文件，自动/手动分段
- 🎭 **角色识别**：规则启发式 + LLM 智能两种模式，自动识别说话角色
- 🎙️ **音色匹配**：内置 80+ 豆包 2.0 音色，LLM 根据角色性格一键推荐匹配音色
- 🔊 **流式播放**：HTTP Chunked TTS + WebSocket 透传，按段自动连播
- 💾 **音频缓存**：已合成段落落盘，重复播放秒播、节省 API 费用
- ⚙️ **可配置**：TTS / LLM / 旁白音色 / 对话符号 / 段落间隔 全部可调
- 🎨 **暗色主题**：现代深色 UI，CSS 变量便于二次定制

## 技术栈

- **后端**：Node.js 18+ / Express / ws（WebSocket）
- **前端**：原生 HTML/CSS/JS，无构建步骤
- **存储**：JSON 文件（`data/` 目录）
- **TTS**：方舟 Agent Plan HTTP Chunked 接口
  `POST https://openspeech.bytedance.com/api/v3/plan/tts/unidirectional`
- **LLM**：OpenAI 兼容 Chat Completions API

## 快速开始

### 1. 安装依赖

```bash
cd d:\Project\VoiceNovel
npm install
```

### 2. 启动服务

```bash
npm start
```

或开发模式（文件变更自动重启）：

```bash
npm run dev
```

默认监听 `http://localhost:3000`。

### 3. 配置 API Key

打开浏览器访问 `http://localhost:3000`，点击顶部 **⚙️ 设置** 标签：

1. **方舟 TTS 配置**：填入方舟 Agent Plan 专属 API Key（获取：[Volcengine 控制台](https://console.volcengine.com/ark/region:ark+cn-beijing/openManagement?LLM=%7B%7D&OpenModelVisible=false&advancedActiveKey=agentPlan)）
   - Resource ID 默认 `seed-tts-2.0`
   - **Base URL**：默认 `https://openspeech.bytedance.com/api/v3/plan/tts/unidirectional`，若你有 Agent Plan 专属地址请改为对应 URL，避免额外费用
   - 点击"测试连接"应返回示例音频大小
2. **LLM 配置**：填入 OpenAI 兼容服务的 Base URL / API Key / Model
   - 例如 OpenAI 官方：`https://api.openai.com/v1` + `gpt-4o-mini`
   - 或 DeepSeek、智谱、月之暗面等兼容服务
3. **旁白音色**：从 80+ 音色中选择，可试听
4. **对话符号**：默认包含 `"..."`、`「...」`、`『...』`、`“...”`，可增删
5. 点击 **💾 保存设置**

### 4. 使用流程

1. 回到 **📚 小说库**，点击 **+ 新建**
2. 输入标题，粘贴小说正文（或上传 .txt），勾选"上传时自动分段"，点 **创建**
3. 系统自动按对话符号分段并识别角色，左侧列表展示段落、右侧展示角色
4. （可选）点击右侧 **🔍 LLM 提取角色** 补充角色性别/描述信息
5. （可选）点击右侧 **🎭 一键智能匹配音色** 让 LLM 为角色分配音色
6. 也可手动为每个角色选择音色、调整语速/音量、试听
7. 点击播放器 ▶ 按钮开始播放，自动按段连播，对话用角色音色、旁白用旁白音色
8. 点击任意段落可跳转播放；播放进度实时显示

## 目录结构

```
VoiceNovel/
├── server.js                  # 入口
├── package.json
├── .env.example               # 环境变量模板（可选，前端设置页优先）
├── src/
│   ├── config/voices.js       # 音色目录（80+ 条）
│   ├── services/
│   │   ├── ttsService.js      # 方舟 TTS 客户端
│   │   ├── llmService.js      # OpenAI 兼容 LLM 客户端
│   │   ├── novelService.js    # 小说 CRUD + 规则分段
│   │   ├── characterService.js# 音色自动匹配
│   │   ├── settingsService.js # 设置持久化
│   │   └── audioCacheService.js
│   ├── routes/                # REST 路由
│   ├── ws/playbackSocket.js   # WebSocket 播放透传
│   ├── storage/fileStorage.js # JSON 原子读写
│   └── utils/                 # logger / id
├── public/                    # 前端静态资源
│   ├── index.html
│   ├── styles/
│   └── scripts/
└── data/                      # 运行时数据（自动创建，gitignore）
    ├── novels/                # 每本小说一个 JSON
    ├── settings.json
    ├── audio_cache/           # sha256 命名的 mp3
    └── logs/app.log
```

## REST API 一览

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/health` | 健康检查 |
| GET | `/api/voices` | 音色目录 |
| GET/PUT | `/api/settings` | 读取/更新设置 |
| GET | `/api/tts/preview?speaker=&text=` | 单段试听 mp3 |
| GET | `/api/tts/test` | 测试 TTS 连接 |
| GET/DELETE | `/api/cache` | 缓存大小 / 清空 |
| GET/POST | `/api/novels` | 列出 / 创建小说 |
| GET/PUT/DELETE | `/api/novels/:id` | 详情 / 更新 / 删除 |
| POST | `/api/novels/:id/segment` | 规则重新分段 |
| POST | `/api/novels/:id/segment-llm` | LLM 智能分段 |
| GET | `/api/novels/:id/characters` | 角色列表 |
| PUT | `/api/novels/:id/characters/:cid` | 更新角色音色/参数 |
| POST | `/api/novels/:id/characters/extract` | LLM 提取角色 |
| POST | `/api/novels/:id/characters/auto-match` | LLM 自动匹配音色 |

WebSocket：`ws://localhost:3000/ws/playback`
- 客户端 → `{type:"play", novelId, segmentId}` / `{type:"stop"}`
- 服务端 → `{type:"meta"}` / `{type:"audio", data:"<base64>"}` / `{type:"end"}` / `{type:"error"}`

## 角色音色自动匹配算法

1. LLM 接收全部角色描述 + 可用音色目录，返回每个角色的推荐 `voiceId`
2. 规则校验：
   - 音色 ID 必须在内置目录中
   - 性别必须匹配（女角色不分配男声）
   - 同一小说内尽量不重复（冲突时给次要角色分配次优音色）
3. LLM 不可用时降级为按性别轮询分配
4. 用户手动配置优先于自动匹配，已配置的角色不会被覆盖

## 故障排查

- **"未配置 TTS API Key"**：去设置页填入方舟 API Key 并保存
- **"LLM 请求失败"**：检查 Base URL 是否可达、API Key 是否有效、Model 名称是否正确
- **播放无声**：浏览器可能拦截自动播放，需先点击页面任意位置触发交互
- **TTS 返回错误码**：查看 `data/logs/app.log` 中的 `x-tt-logid`，便于方舟侧排查
- **缓存越来越大**：设置页底部可查看大小并清空

## 接口规范对照

严格遵循 `接入语音模型文档.md`：
- 请求头 `X-Api-Key` / `X-Api-Resource-Id` / `X-Api-Connect-Id` / `X-Control-Require-Usage-Tokens-Return`
- 请求体 `req_params: { text, speaker, audio_params: { format, sample_rate } }`
- 响应解析：每行一个 JSON，`data` 字段为 base64 音频块，`code == 20000000` 表示结束
- 日志记录响应头 `x-tt-logid`，每次请求生成唯一 `X-Api-Connect-Id`

## 许可

MIT
