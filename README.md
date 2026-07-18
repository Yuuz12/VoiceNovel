# 语音小说 · VoiceNovel

基于火山方舟语音合成（doubao-seed-tts-2.0）与小米 MIMO TTS（MiMo-V2.5-TTS 系列）、OpenAI 兼容 LLM 的小说语音播放应用。
让小说中不同角色拥有不同音色，实现"多人有声书"体验。TTS 服务可在火山方舟与小米 MIMO 之间自由切换，两家配置独立保存。

## 功能特性

- **小说管理**：粘贴或上传 .txt 文件，自动/手动分段
- **角色识别**：规则启发式 + LLM 智能两种模式，自动识别说话角色
- **音色匹配**：内置 80+ 豆包 2.0 音色，LLM 根据角色性格一键推荐匹配音色
- **流式播放**：HTTP Chunked TTS + WebSocket 透传，按段自动连播
- **音频缓存**：已合成段落落盘，重复播放秒播、节省 API 费用
- **可配置**：TTS / LLM / 旁白音色 / 对话符号 / 段落间隔 全部可调
- **暗色主题**：现代深色 UI，CSS 变量便于二次定制

## 技术栈

- **后端**：Node.js 18+ / Express / ws（WebSocket）
- **前端**：原生 HTML/CSS/JS，无构建步骤
- **存储**：JSON 文件（`data/` 目录）
- **TTS（可切换，配置独立保存）**：
  - 火山方舟 Agent Plan HTTP Chunked 接口
    `POST https://openspeech.bytedance.com/api/v3/plan/tts/unidirectional`
  - 小米 MIMO TTS（MiMo-V2.5-TTS 系列，OpenAI 兼容 chat/completions）
    `POST https://api.xiaomimimo.com/v1/chat/completions`，三模式：预置音色 / 文本描述定制 / 音频样本复刻
- **LLM**：OpenAI 兼容 Chat Completions API

## 快速开始

### 1. 安装依赖

```bash
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

打开浏览器访问 `http://localhost:3000`，点击顶部 **设置** 标签：

1. **TTS 服务配置**：顶部切换 provider，两家配置独立保存、切换不丢。
   - **火山方舟 TTS**：填入火山方舟 Agent Plan 专属 API Key（获取：[Volcengine 控制台](https://console.volcengine.com/ark/region:ark+cn-beijing/openManagement?LLM=%7B%7D&OpenModelVisible=false&advancedActiveKey=agentPlan)）
     - Resource ID 默认 `seed-tts-2.0`
     - **Base URL**：默认 `https://openspeech.bytedance.com/api/v3/plan/tts/unidirectional`，若有 Agent Plan 专属地址请改为对应 URL，避免额外费用
   - **小米 MIMO TTS**：填入 MIMO API Key，选择合成模式：
     - `preset` 预置精品音色（冰糖/茉莉/苏打/白桦 等 8 个）
     - `voicedesign` 文本描述定制音色（为旁白/每个角色填写独立描述，如「低沉沙哑的老前辈」）
     - `voiceclone` 音频样本复刻音色（上传 mp3 样本，为旁白/每个角色绑定独立样本）
   - 点击"测试连接"应返回示例音频大小
2. **LLM 配置**：填入 OpenAI 兼容服务的 Base URL / API Key / Model
   - 例如 OpenAI 官方：`https://api.openai.com/v1` + `gpt-4o-mini`
   - 或 DeepSeek、智谱、月之暗面等兼容服务
3. **旁白音色**：按当前 provider+模式配置（预置模式从音色目录选；voicedesign 填描述；voiceclone 选样本），可试听
4. **对话符号**：默认包含 `"..."`、`「...」`、`『...』`、`“...”`，可增删
5. 点击 **保存设置**

### 4. 使用流程

1. 回到 **小说库**，点击 **+ 新建**
2. 输入标题，粘贴小说正文（或上传 .txt），勾选"上传时自动分段"，点 **创建**
3. 系统自动按对话符号分段并识别角色，左侧列表展示段落、右侧展示角色
4. （可选）点击右侧 **LLM 提取角色** 补充角色性别/描述信息
5. （可选）点击右侧 **一键智能匹配音色** 让 LLM 为角色分配音色
6. 也可手动为每个角色选择音色、调整语速/音量、试听
7. 点击播放器 ► 按钮开始播放，自动按段连播，对话用角色音色、旁白用旁白音色
8. 点击任意段落可跳转播放；播放进度实时显示

## 目录结构

```
VoiceNovel/
├── server.js                  # 入口
├── package.json
├── .env.example               # 环境变量模板（可选，前端设置页优先）
├── src/
│   ├── config/voices.js       # 音色目录（火山 80+ / MIMO 8 条，按 provider 分组）
│   ├── services/
│   │   ├── ttsService.js      # TTS 入口垫片（转发到 tts/ 调度器）
│   │   ├── tts/               # 多 provider 调度：index/volcanoProvider/mimoProvider/voiceResolver
│   │   ├── llmService.js      # OpenAI 兼容 LLM 客户端
│   │   ├── novelService.js    # 小说 CRUD + 规则分段
│   │   ├── characterService.js# 音色自动匹配
│   │   ├── settingsService.js # 设置持久化 + 旧结构迁移
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
    ├── voice_samples/         # MIMO voiceclone 上传的样本
    └── logs/app.log
```

## REST API 一览

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/health` | 健康检查 |
| GET | `/api/voices?provider=&grouped=` | 音色目录（按 provider） |
| GET/PUT | `/api/settings` | 读取/更新设置 |
| GET | `/api/tts/preview?speaker=&text=` | 单段试听 mp3（speaker 由 provider+mode 解释） |
| GET | `/api/tts/test` | 测试 TTS 连接（当前 provider） |
| POST | `/api/tts/voice-sample` | 上传 MIMO 复刻样本（base64） |
| GET | `/api/tts/voice-samples` | 列出已上传复刻样本 |
| DELETE | `/api/tts/voice-sample?path=` | 删除复刻样本 |
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

- **"未配置火山方舟/MIMO TTS API Key"**：去设置页切换到对应 provider，填入其 API Key 并保存（两家 Key 独立保存）
- **"请先填写音色设计描述"/"请先选择复刻样本"**：MIMO 切到 voicedesign/voiceclone 模式后，需为旁白和角色配置对应的描述或样本
- **"LLM 请求失败"**：检查 Base URL 是否可达、API Key 是否有效、Model 名称是否正确
- **播放无声**：浏览器可能拦截自动播放，需先点击页面任意位置触发交互
- **TTS 返回错误码**：查看 `data/logs/app.log`，火山方舟看 `x-tt-logid`，MIMO 看 `[mimo/<mode>]` 日志行
- **缓存越来越大**：设置页底部可查看大小并清空

## 接口规范对照

### 火山方舟接口规范

严格遵循 `接入语音模型文档.md`：
- 请求头 `X-Api-Key` / `X-Api-Resource-Id` / `X-Api-Connect-Id` / `X-Control-Require-Usage-Tokens-Return`
- 请求体 `req_params: { text, speaker, audio_params: { format, sample_rate } }`
- 响应解析：每行一个 JSON，`data` 字段为 base64 音频块，`code == 20000000` 表示结束
- 日志记录响应头 `x-tt-logid`，每次请求生成唯一 `X-Api-Connect-Id`

### 小米 MIMO 接口规范

OpenAI 兼容 chat/completions（非流式）：
- 鉴权 `Authorization: Bearer $MIMO_API_KEY`
- 目标文本放 `role:"assistant"` 的 `content`；风格指令/设计描述放 `role:"user"` 的 `content`
- `audio: { format: "mp3", voice }`：preset=音色名；voicedesign=省略 voice；voiceclone=`data:{mime};base64,{b64}`
- `model` 按模式：`mimo-v2.5-tts` / `mimo-v2.5-tts-voicedesign` / `mimo-v2.5-tts-voiceclone`
- 响应音频在 `choices[0].message.audio.data`（base64），实现中兼容多种变体

## 许可

MIT
