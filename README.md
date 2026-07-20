# 语音小说 · VoiceNovel v1.0.2

基于多 provider TTS（火山方舟 / 小米 MIMO / OpenAI / MiniMax / 阿里云百炼）与 LLM 的小说语音播放应用。
让小说中不同角色拥有不同音色，实现"多人有声书"体验。TTS 服务可自由切换，配置独立保存。

## 功能特性

- **小说管理**：粘贴或上传 .txt 文件，自动/手动分段
- **角色识别**：规则启发式 + LLM 智能两种模式，自动识别说话角色
- **多音色库**：5 套 TTS 服务音色目录，150+ 预制音色，按 provider 分组展示
- **音色匹配**：LLM 根据角色性格一键推荐匹配音色
- **流式播放**：HTTP TTS + WebSocket 透传，按段自动连播
- **有声书导出**：一键导出整本小说为 MP3 + LRC 字幕 + 章节信息（JSON/CUE），后台合成、断点续传、缓存复用
- **音频缓存**：已合成段落落盘，重复播放秒播、节省 API 费用；缓存与导出完全隔离，互不干扰
- **导出管理**：列出/下载/删除历史导出任务，分别管理音频缓存与导出文件占用的磁盘空间
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
- 推荐使用速度快的模型，如 `deepseek-v4-flash`

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
3. 点击一键提取匹配，完成后再点 LLM 智能分段
4. 排查对话绑定角色识别结果，确认是否符合预期
5. （可选）在段落中插入情感标签，如「[高兴]今天天气真好。」→ 合成时自动带上对应情感
6. 也可手动为每个角色选择音色、调整语速/音量、试听
7. 点击播放器 播放 按钮开始播放，自动按段连播，对话用角色音色、旁白用旁白音色
8. 点击任意段落可跳转播放；播放进度实时显示

### 5. 导出有声书

1. 在小说详情页顶部操作栏，点击 **导出有声书**
2. 在弹窗中选择起止段落、是否包含旁白，点击 **开始导出**
3. 后台合成所有段落（已缓存的秒级完成，未缓存的走 TTS 实时合成），实时显示进度日志
4. 导出完成后，可直接下载：
   - **MP3**：完整拼接的有声书
   - **LRC**：标准 LRC 字幕文件（按句切分，自动剔除 `[高兴]` 等音频标签，支持播放器歌词同步）
   - **章节**：JSON 章节信息（含每段字节偏移、时长、标题）
5. 关闭窗口后任务仍在后台运行，可在 **导出历史** 中查看/继续下载
6. 在 **设置** 页的「有声书导出管理」可统一管理所有导出任务占用的磁盘空间

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
│   │   ├── audioCacheService.js
│   │   └── exportService.js   # 有声书导出：任务管理 + 合成 + 拼接 + LRC 字幕
│   ├── routes/                # REST 路由
│   │   └── export.js          # 导出路由：创建/列表/进度/SSE/下载/删除
│   ├── ws/playbackSocket.js   # WebSocket 播放透传
│   ├── storage/fileStorage.js # JSON 原子读写
│   └── utils/                 # logger / id
├── public/                    # 前端静态资源
│   ├── index.html
│   ├── styles/
│   └── scripts/
│       └── novelManager.js    # 含导出配置/进度/历史模态框
└── data/                      # 运行时数据（自动创建，gitignore）
    ├── novels/                # 每本小说一个 JSON
    ├── settings.json
    ├── audio_cache/           # sha256 命名的 mp3（TTS 播放缓存）
    ├── voice_samples/         # voiceclone 模式上传的样本
    ├── exports/               # 有声书导出任务
    │   └── {taskId}/
    │       ├── output.mp3     # 拼接完成的完整 mp3
    │       ├── output.lrc     # LRC 字幕
    │       ├── output.cue     # CUE 章节文件
    │       ├── chapters.json  # 章节信息（含时长）
    │       └── parts/         # 分段 mp3（00000.mp3, 00001.mp3, ...）
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
| GET/DELETE | `/api/cache` | 音频缓存大小 / 清空（仅清播放缓存，不动导出文件） |
| GET/POST | `/api/novels` | 列出 / 创建小说 |
| GET/PUT/DELETE | `/api/novels/:id` | 详情 / 更新 / 删除 |
| POST | `/api/novels/:id/segment` | 规则重新分段 |
| POST | `/api/novels/:id/segment-llm` | LLM 智能分段 |
| GET | `/api/novels/:id/characters` | 角色列表 |
| PUT | `/api/novels/:id/characters/:cid` | 更新角色音色/参数 |
| POST | `/api/novels/:id/characters/extract` | LLM 提取角色 |
| POST | `/api/novels/:id/characters/auto-match` | LLM 自动匹配音色 |
| POST | `/api/export` | 创建导出任务（后台运行） |
| GET | `/api/export` | 列出所有导出任务（?novelId= 过滤） |
| GET | `/api/export/size` | 所有导出任务占用磁盘大小 |
| GET | `/api/export/:taskId` | 查询任务状态 |
| GET | `/api/export/:taskId/stream` | SSE 推送导出进度 |
| POST | `/api/export/:taskId/cancel` | 取消运行中的任务 |
| DELETE | `/api/export/:taskId` | 删除任务及文件 |
| DELETE | `/api/export/all` | 清空所有导出任务 |
| GET | `/api/export/:taskId/download` | 下载成品 mp3 |
| GET | `/api/export/:taskId/chapters` | 下载章节信息 JSON |
| GET | `/api/export/:taskId/lrc` | 下载 LRC 字幕 |

WebSocket：`ws://localhost:3000/ws/playback`
- 客户端 → `{type:"play", novelId, segmentId}` / `{type:"stop"}`
- 服务端 → `{type:"meta"}` / `{type:"audio", data:"<base64>"}` / `{type:"end"}` / `{type:"error"}`

## 有声书导出说明

### 导出流程

1. `POST /api/export` 创建任务（按 novelId + 可选的起止段落/旁白过滤），任务清单落盘到 `data/exports/{taskId}.json`
2. 后台 `runTask` 串行处理所有段落：
   - 复用 `audioCache` 走缓存：已合成的段秒级拷贝到 `parts/{idx}.mp3`
   - 未命中时调 `ttsService.synthesize` 合成并写回缓存
   - 解析 MP3 帧头 bitrate 计算精确时长（支持 MPEG1/MPEG2/MPEG2.5 Layer3，跳过 ID3v2 头）
3. 全部完成 → 拼接为 `output.mp3`
4. 生成 `output.lrc`（按句切分 / 字数比例分配时间 / 去音频标签）+ `output.cue`（CD 章节格式）+ `chapters.json`
5. 任务标记 `done`，SSE 推送 `done` 事件后主动关闭连接

### 断点续传

- 任务清单每隔一段就落盘一次，中断后重跑自动跳过 status=done 的段
- 导出缓存与播放缓存共享，多次导出相同范围会命中缓存秒级完成

### 存储隔离

| 目录 | 作用 | 清理方式 |
|---|---|---|
| `data/audio_cache/` | TTS 播放缓存（sha256 命名） | 设置页「清空缓存」 |
| `data/exports/{taskId}/` | 导出任务（mp3/lrc/cue/chapters/parts） | 设置页「清空全部导出」或任务级删除 |

**关键设计**：`DELETE /api/cache` 只清 `audio_cache`，不会删 `exports`；反之亦然。缓存命中是导出加速的核心——首次导出走 TTS，第二次同范围导出走缓存秒级完成。

### LRC 字幕格式

```
[ti:小说标题]
[al:有声书]
[by:VoiceNovel]
[length:总时长]

[00:00.00]第一句歌词。
[00:02.50]第二句歌词。
...
```

- 按中英文句末标点（。！？!?…）切分句子
- 按字数比例在段时长内分配时间戳
- 自动剔除方括号音频标签（`[高兴]` → 不在 LRC 中显示）

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
- **导出进度停滞**：刷新任务状态，已完成的段会跳过；可在导出历史中查看失败段的错误信息
- **导出文件体积过大**：在设置页查看"导出管理"可单独清理历史导出任务（不影响播放缓存）
- **缓存越来越大**：设置页"音频缓存"区可查看大小并清空，不影响已导出的有声书

## 许可

MIT © 2026 VoiceNovel
