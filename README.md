# 语音小说 · VoiceNovel v1.0.1

基于多 provider TTS（火山方舟 / 小米 MIMO / OpenAI / MiniMax / 阿里云百炼）与 LLM 的小说语音播放应用。
让小说中不同角色拥有不同音色，实现"多人有声书"体验。TTS 服务可自由切换，配置独立保存。

## 功能特性

- **小说管理**：粘贴或上传 .txt 文件，自动/手动分段
- **角色识别**：规则启发式 + LLM 智能两种模式，自动识别说话角色
- **多音色库**：5 套 TTS 服务音色目录，150+ 预制音色，按 provider 分组展示
- **音色匹配**：LLM 根据角色性格一键推荐匹配音色
- **流式播放**：HTTP TTS + WebSocket 透传，按段自动连播
- **音频缓存**：已合成段落落盘，重复播放秒播、节省 API 费用
- **可配置**：TTS provider + LLM + 旁白音色（按 provider 独立保存）/ 对话符号 / 段落间隔
- **音频标签**：`[高兴]`、`[悲伤]` 等方括号标注自动映射为对应 provider 的情感/emotion 指令

## 技术栈

- **后端**：Node.js 18+ / Express / ws（WebSocket）
- **前端**：原生 HTML/CSS/JS，无构建步骤
- **存储**：JSON 文件（`data/` 目录）
- **TTS（可切换，配置与旁白音色独立保存）**：
  - **火山方舟**：Agent Plan HTTP Chunked 接口 `doubao-seed-tts-2.0`，80+ 音色
  - **小米 MIMO**：MiMo-V2.5-TTS 系列（三模式：预置/文本描述定制/音频样本复刻）
  - **OpenAI**：tts-1 / tts-1-hd / gpt-4o-mini-tts（支持 instructions 指令式音色设计）
  - **MiniMax**：speech-02-hd / speech-01-turbo（支持预制音色 + 设计/复刻 voice_id + emotion）
  - **阿里云百炼**：cosyvoice-v3-flash / cosyvoice-v2（支持方言 + 9 语种 + 情感 instruction）
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

#### 3.1 TTS 服务配置

顶部切换 provider（`volcano` / `mimo` / `openai` / `minimax` / `bailian`），各 provider 配置独立保存、切换不丢，旁白音色按 provider 独立记忆。

| Provider | 需要填写 | 默认地址 |
|---|---|---|
| **火山方舟** | API Key、Resource ID（默认 `seed-tts-2.0`，可改 ARK_TTS_RESOURCE_ID） | `https://openspeech.bytedance.com/api/v3/plan/tts/unidirectional` |
| **小米 MIMO** | API Key | `https://api.xiaomimimo.com/v1/chat/completions` |
| **OpenAI** | API Key、Model（默认 `gpt-4o-mini-tts`） | `https://api.openai.com/v1/audio/speech` |
| **MiniMax** | API Key、Model（默认 `speech-02-hd`） | `https://api.minimaxi.com/v1/t2a_v2` |
| **阿里云百炼** | DASHSCOPE_API_KEY、Model（默认 `cosyvoice-v3-flash`） | `https://dashscope.aliyuncs.com/api/v1/services/aigc/text2audio/text-to-audio` |

**三模式（仅 mimo/minimax/bailian 支持）**：
- `preset` → 从预置音色列表选
- `voicedesign` → 文本描述设计音色（为旁白/每个角色填写独立描述，如「低沉沙哑的老前辈」）
- `voiceclone` → 音频样本复刻音色（上传 mp3 样本，为旁白/每个角色绑定独立样本）

> 点击"测试连接"应返回示例音频大小。

#### 3.2 LLM 配置

填入 OpenAI 兼容服务的 Base URL / API Key / Model
- 例如 OpenAI 官方：`https://api.openai.com/v1` + `gpt-4o-mini`
- 或 DeepSeek、智谱、月之暗面等兼容服务

#### 3.3 旁白音色

按 **当前 provider + 模式** 配置：
- 预置模式：从该 provider 音色目录选
- voicedesign 模式：填描述文本
- voiceclone 模式：选样本文件
- 可试听；切换 provider 后自动恢复对应的旁白音色

#### 3.4 对话符号

默认包含 `"..."`、`「...」`、`『...』`、`“...”`，可增删

#### 3.5 保存设置

点击 **保存设置**

### 4. 使用流程

1. 回到 **小说库**，点击 **+ 新建**
2. 输入标题，粘贴小说正文（或上传 .txt），点 **创建**
3. 点击一键提取匹配，完成后再点LLM智能分段
4. 排查对话绑定角色识别结果，确认是否符合预期
5. （可选）在段落中插入情感标签，如「[高兴]今天天气真好。」→ 合成时自动带上对应情感
6. 也可手动为每个角色选择音色、调整语速/音量、试听
7. 点击播放器 播放 按钮开始播放，自动按段连播，对话用角色音色、旁白用旁白音色
8. 点击任意段落可跳转播放；播放进度实时显示

## 目录结构

```
VoiceNovel/
├── server.js                  # 入口
├── package.json
├── .env.example               # 环境变量模板（可选，前端设置页优先）
├── src/
│   ├── config/voices.js       # 音色目录（按 provider 分 5 套）
│   ├── services/
│   │   ├── ttsService.js      # TTS 入口垫片（转发到 tts/ 调度器）
│   │   ├── tts/               # 5 provider 调度：volcano/mimo/openai/minimax/bailian/voiceResolver
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
    ├── voice_samples/         # voiceclone 模式上传的样本
    └── logs/app.log
```

## REST API 一览

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/health` | 健康检查 |
| GET | `/api/voices?provider=&grouped=` | 音色目录（按 provider，默认 volcano） |
| GET/PUT | `/api/settings` | 读取/更新设置 |
| GET | `/api/tts/preview?speaker=&text=` | 单段试听 mp3（speaker 由 provider+mode 解释） |
| GET | `/api/tts/test` | 测试当前 provider TTS 连接 |
| POST | `/api/tts/voice-sample` | 上传 voiceclone 复刻样本（base64） |
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

1. LLM 接收全部角色描述 + 当前 provider 可用音色目录，返回每个角色的推荐 `voiceId`
2. 规则校验：
   - 音色 ID 必须在当前 provider 内置目录中
   - 性别必须匹配（女角色不分配男声）
   - 同一小说内尽量不重复（冲突时给次要角色分配次优音色）
3. LLM 不可用时降级为按性别轮询分配
4. 用户手动配置优先于自动匹配，已配置的角色不会被覆盖

## 接口规范对照

### 火山方舟 TTS

- 请求头 `X-Api-Key` / `X-Api-Resource-Id` / `X-Api-Connect-Id` / `X-Control-Require-Usage-Tokens-Return`
- 请求体 `req_params: { text, speaker, audio_params: { format, sample_rate } }`
- 响应解析：每行一个 JSON，`data` 字段为 base64 音频块，`code == 20000000` 表示结束
- 日志记录响应头 `x-tt-logid`，每次请求生成唯一 `X-Api-Connect-Id`

### 小米 MIMO TTS

OpenAI 兼容 chat/completions（非流式）：
- 鉴权 `Authorization: Bearer $MIMO_API_KEY`
- 目标文本放 `role:"assistant"` 的 `content`；风格指令/设计描述放 `role:"user"` 的 `content`
- `audio: { format: "mp3", voice }`：preset=音色名；voicedesign=省略 voice；voiceclone=`data:{mime};base64,{b64}`
- `model` 按模式：`mimo-v2.5-tts` / `mimo-v2.5-tts-voicedesign` / `mimo-v2.5-tts-voiceclone`
- 响应音频在 `choices[0].message.audio.data`（base64）

### OpenAI TTS

- 鉴权 `Authorization: Bearer $OPENAI_API_KEY`
- 请求体 `model / input / voice / response_format / speed(0.25~4.0) / instructions`
- 仅 `gpt-4o-mini-tts` 支持 `instructions`；响应直接返回 mp3 二进制流
- 音频标签 `[高兴]` 等提取为情感指令拼入 `instructions`

### MiniMax TTS

`POST https://api.minimaxi.com/v1/t2a_v2`
- 鉴权 `Authorization: Bearer $MINIMAX_API_KEY`
- `voice_setting: { voice_id, speed(0.5~2.0), vol(0~10), emotion }`
- `emotion` 由音频标签映射：`happy|sad|angry|fearful|disgusted|surprised|calm|neutral`
- 响应音频在 `data.audio`（hex 编码字符串，自动兼容 base64）

### 阿里云百炼 CosyVoice

`POST https://dashscope.aliyuncs.com/api/v1/services/aigc/text2audio/text-to-audio`
- 鉴权 `Authorization: Bearer $DASHSCOPE_API_KEY`
- `input: { text, voice, format, sample_rate(默认24000), rate(-0.5~2.0), volume(0~100), instruction }`
- `instruction` 由音频标签映射情感，如 `你说话的情感是高兴。`
- V3 系列支持方言（粤语/东北/陕北）和多语种（韩/日/英）

## 音频标签（情感）

所有 provider 支持在段落文本中用方括号插入情感和肢体语言标签，例如：

```
[高兴]今天天气真好。
[悲伤]怎么会这样……
[愤怒]你再说一遍！
[用拳头指向我]你怎么能这样对他！
```

标签按 provider 映射为对应指令：
| Provider | 映射方式 |
|---|---|
| 火山方舟 / 小米 MIMO | 由内置 Emotion 处理，部分忽略 |
| OpenAI (gpt-4o-mini-tts) | 拼入 `instructions` |
| MiniMax | 映射为 `voice_setting.emotion` |
| 阿里云百炼 V3 | 映射为 `input.instruction` |

## 故障排查

- **"未配置 XX TTS API Key"**：去设置页切换到对应 provider，填入其 API Key 并保存（各家 Key 独立保存）
- **"请先填写音色设计描述"/"请先选择复刻样本"**：mimo/minimax/bailian 切到 voicedesign/voiceclone 模式后，需为旁白和角色配置对应的描述或样本
- **"LLM 请求失败"**：检查 Base URL 是否可达、API Key 是否有效、Model 名称是否正确
- **播放无声**：浏览器可能拦截自动播放，需先点击页面任意位置触发交互
- **TTS 返回错误码**：查看 `data/logs/app.log`，火山方舟看 `x-tt-logid`，其他看 `<provider>` 日志行
- **切换 provider 后音色丢失**：各家音色独立，需在设置页为当前 provider 重新选择或 LLM 匹配
- **缓存越来越大**：设置页底部可查看大小并清空

## 许可

MIT © 2026 VoiceNovel
