// 有声书导出服务：把小说的所有段落串行合成 -> 拼接为单个 mp3
// 任务清单持久化到 data/exports/{taskId}.json，支持断点续传
// 复用 audioCache 走缓存：已合成的段秒级拷贝，未合成的调 TTS
const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');
const { readJson, writeJson, remove, listFiles, ensureDir } = require('../storage/fileStorage');
const { shortId } = require('../utils/id');
const ttsService = require('./ttsService');
const audioCache = require('./audioCacheService');
const settingsService = require('./settingsService');
const novelService = require('./novelService');
const { resolveSegmentSpeaker } = require('./tts/voiceResolver');
const logger = require('../utils/logger');

const DATA_DIR = path.resolve(process.cwd(), process.env.DATA_DIR || './data');
const EXPORTS_DIR = path.join(DATA_DIR, 'exports');

ensureDir(EXPORTS_DIR);

// 内存中维护运行中任务的 AbortController
const runningTasks = new Map(); // taskId -> AbortController

function taskFile(taskId) {
  return path.join(EXPORTS_DIR, `${taskId}.json`);
}

function taskDir(taskId) {
  return path.join(EXPORTS_DIR, taskId);
}

function partsDir(taskId) {
  return path.join(taskDir(taskId), 'parts');
}

function outputPath(taskId) {
  return path.join(taskDir(taskId), 'output.mp3');
}

function chaptersPath(taskId) {
  return path.join(taskDir(taskId), 'chapters.json');
}

function lrcPath(taskId) {
  return path.join(taskDir(taskId), 'output.lrc');
}

/**
 * 创建导出任务（不立即运行，仅落盘任务清单）
 * @param {object} opts { novelId, startSegId?, endSegId?, includeNarration? }
 * @returns {object} task
 */
function createTask(opts) {
  const { novelId, startSegId, endSegId, includeNarration } = opts || {};
  if (!novelId) {
    const err = new Error('缺少 novelId');
    err.code = 'INVALID_ARGS';
    throw err;
  }
  const novel = novelService.getNovel(novelId);
  if (!novel) {
    const err = new Error('novel not found');
    err.code = 'NOVEL_NOT_FOUND';
    throw err;
  }

  const taskId = shortId('ex');
  const now = new Date().toISOString();

  // 按段顺序 + 范围筛选
  const sorted = (novel.segments || []).slice().sort((a, b) => a.order - b.order);
  let startIdx = 0;
  let endIdx = sorted.length - 1;
  if (startSegId) {
    const i = sorted.findIndex((s) => s.id === startSegId);
    if (i >= 0) startIdx = i;
  }
  if (endSegId) {
    const i = sorted.findIndex((s) => s.id === endSegId);
    if (i >= 0) endIdx = i;
  }
  if (startIdx > endIdx) [startIdx, endIdx] = [endIdx, startIdx];
  const sliced = sorted.slice(startIdx, endIdx + 1);
  const includeN = includeNarration !== false; // 默认 true
  const filtered = includeN ? sliced : sliced.filter((s) => s.type !== 'narration');

  const task = {
    id: taskId,
    novelId,
    novelTitle: novel.title,
    status: 'pending', // pending | running | done | error | canceled
    options: {
      startSegId: startSegId || null,
      endSegId: endSegId || null,
      includeNarration: includeN,
    },
    segments: filtered.map((s, i) => ({
      segId: s.id,
      idx: i,
      order: s.order,
      type: s.type,
      characterId: s.characterId || null,
      status: 'pending', // pending | done | error | skipped
      size: 0,
      cached: false,
      error: null,
    })),
    total: filtered.length,
    done: 0,
    currentIdx: -1,
    error: null,
    outputSize: 0,
    createdAt: now,
    updatedAt: now,
    finishedAt: null,
  };

  ensureDir(partsDir(taskId));
  writeJson(taskFile(taskId), task);
  logger.info(`export task created: ${taskId} (novel=${novelId}, segments=${filtered.length})`);
  return task;
}

function getTask(taskId) {
  return readJson(taskFile(taskId));
}

function saveTask(task) {
  task.updatedAt = new Date().toISOString();
  writeJson(taskFile(task.id), task);
}

function listTasks(novelId) {
  const files = listFiles(EXPORTS_DIR, '.json');
  const tasks = [];
  for (const f of files) {
    const t = readJson(path.join(EXPORTS_DIR, f));
    if (!t || !t.id) continue;
    if (novelId && t.novelId !== novelId) continue;
    tasks.push(t);
  }
  tasks.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  return tasks;
}

/**
 * 统计所有导出任务占用磁盘大小（含 parts + output.mp3 + chapters.json + .cue）
 * @returns {{ bytes: number, count: number, taskCount: number }}
 */
function getExportsSize() {
  const files = listFiles(EXPORTS_DIR, '.json');
  let bytes = 0;
  let fileCount = 0;
  for (const f of files) {
    const taskId = f.replace(/\.json$/, '');
    const dir = taskDir(taskId);
    if (!fs.existsSync(dir)) continue;
    // 递归统计目录大小
    const stack = [dir];
    while (stack.length) {
      const cur = stack.pop();
      let entries;
      try { entries = fs.readdirSync(cur, { withFileTypes: true }); } catch (_) { continue; }
      for (const e of entries) {
        const full = path.join(cur, e.name);
        if (e.isDirectory()) {
          stack.push(full);
        } else {
          try {
            const st = fs.statSync(full);
            if (st.isFile()) {
              bytes += st.size;
              fileCount++;
            }
          } catch (_) {}
        }
      }
    }
  }
  return { bytes, count: fileCount, taskCount: files.length };
}

/**
 * 清空所有导出任务（删除所有 taskId.json + 对应目录）
 * @returns {{ removed: number }}
 */
function clearAllTasks() {
  const files = listFiles(EXPORTS_DIR, '.json');
  let removed = 0;
  for (const f of files) {
    const taskId = f.replace(/\.json$/, '');
    try {
      deleteTask(taskId);
      removed++;
    } catch (err) {
      logger.error(`clearAllTasks delete failed: ${taskId}`, { error: err.message });
    }
  }
  logger.info(`all export tasks cleared: ${removed} tasks`);
  return { removed };
}

function deleteTask(taskId) {
  // 取消运行中任务
  cancelTask(taskId);
  // 删除任务文件
  remove(taskFile(taskId));
  // 删除任务目录（parts + output）
  const dir = taskDir(taskId);
  removeDirRecursive(dir);
  logger.info(`export task deleted: ${taskId}`);
}

/**
 * 跨平台递归删除目录（Windows 下 fs.rmSync 偶发静默失败，加 execSync 兜底）
 */
function removeDirRecursive(dir) {
  try {
    if (!fs.existsSync(dir)) return;
    fs.rmSync(dir, { recursive: true, force: true });
    // rmSync 在 Windows 上可能静默失败，二次检查
    if (fs.existsSync(dir)) {
      if (process.platform === 'win32') {
        require('child_process').execSync(`rd /s /q "${dir}"`, { stdio: 'ignore' });
      } else {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    }
  } catch (err) {
    logger.error(`removeDirRecursive failed: ${dir}`, { error: err.message });
  }
}

function cancelTask(taskId) {
  const ctrl = runningTasks.get(taskId);
  if (ctrl) {
    ctrl.abort();
    runningTasks.delete(taskId);
    logger.info(`export task canceled: ${taskId}`);
    return true;
  }
  return false;
}

/**
 * 运行导出任务（串行合成所有段 -> 拼接 output.mp3）
 * @param {string} taskId
 * @param {object} opts { onProgress, signal }
 *   - onProgress(p): 进度回调，p = { type, done, total, currentIdx, currentSegId, title, size, cached, message? }
 *   - signal: AbortSignal
 */
async function runTask(taskId, opts) {
  opts = opts || {};
  const { onProgress, signal } = opts;

  const task = getTask(taskId);
  if (!task) throw new Error(`task not found: ${taskId}`);
  if (task.status === 'running') {
    throw new Error('task already running');
  }

  // 注册 AbortController
  const controller = new AbortController();
  runningTasks.set(taskId, controller);
  // 外部 signal 联动
  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener('abort', () => controller.abort(), { once: true });
  }

  task.status = 'running';
  task.error = null;
  saveTask(task);

  const send = (p) => {
    try { if (onProgress) onProgress(p); } catch (_) {}
  };

  send({ type: 'start', total: task.total, done: task.done, taskId });

  try {
    const settings = settingsService.get();
    const novel = novelService.getNovel(task.novelId);
    if (!novel) throw new Error('novel not found');

    const keyParams = audioCache.keyParamsFromSettings(settings);

    // 串行处理每段
    for (let i = 0; i < task.segments.length; i++) {
      if (controller.signal.aborted) throw abortError();

      const segInfo = task.segments[i];
      // 断点续传：跳过已 done 的段
      if (segInfo.status === 'done') {
        send({
          type: 'skip',
          done: task.done,
          total: task.total,
          currentIdx: i,
          currentSegId: segInfo.segId,
          cached: true,
        });
        continue;
      }

      const seg = (novel.segments || []).find((s) => s.id === segInfo.segId);
      if (!seg || !seg.text || !seg.text.trim()) {
        // 空段：跳过
        segInfo.status = 'skipped';
        segInfo.size = 0;
        task.currentIdx = i;
        saveTask(task);
        send({
          type: 'skip',
          done: task.done,
          total: task.total,
          currentIdx: i,
          currentSegId: segInfo.segId,
          message: '空段跳过',
        });
        continue;
      }

      // 解析 speaker
      const { speaker, characterName, speed, volume } = resolveSegmentSpeaker(novel, seg, settings);
      if (!speaker) {
        segInfo.status = 'error';
        segInfo.error = '未配置音色';
        task.currentIdx = i;
        saveTask(task);
        send({
          type: 'error-segment',
          done: task.done,
          total: task.total,
          currentIdx: i,
          currentSegId: segInfo.segId,
          message: '未配置音色，跳过',
        });
        // 跳过此段继续
        continue;
      }

      const title = seg.type === 'dialog'
        ? `第 ${i + 1} 段 · ${characterName || '对话'}`
        : `第 ${i + 1} 段 · 旁白`;

      send({
        type: 'progress',
        done: task.done,
        total: task.total,
        currentIdx: i,
        currentSegId: segInfo.segId,
        title,
        cached: false,
      });

      // 走缓存
      const key = audioCache.computeKey(speaker, seg.text, { speed, volume, ...keyParams });
      let buf = null;
      if (audioCache.has(key)) {
        buf = audioCache.read(key);
        segInfo.cached = true;
      }

      if (!buf) {
        // 调 TTS 合成
        try {
          buf = await ttsService.synthesize(seg.text, speaker, { speed, volume });
          // 写回缓存
          audioCache.write(key, buf);
          segInfo.cached = false;
        } catch (err) {
          if (controller.signal.aborted) throw abortError();
          segInfo.status = 'error';
          segInfo.error = err.message;
          task.currentIdx = i;
          saveTask(task);
          send({
            type: 'error-segment',
            done: task.done,
            total: task.total,
            currentIdx: i,
            currentSegId: segInfo.segId,
            message: `合成失败：${err.message}`,
          });
          continue;
        }
      }

      if (controller.signal.aborted) throw abortError();

      // 写到 parts/{idx}.mp3
      const partPath = path.join(partsDir(taskId), `${String(i).padStart(5, '0')}.mp3`);
      fs.writeFileSync(partPath, buf);

      segInfo.status = 'done';
      segInfo.size = buf.length;
      task.done = (task.done || 0) + 1;
      task.currentIdx = i;
      saveTask(task);

      send({
        type: 'segment-done',
        done: task.done,
        total: task.total,
        currentIdx: i,
        currentSegId: segInfo.segId,
        title,
        size: buf.length,
        cached: segInfo.cached,
      });
    }

    if (controller.signal.aborted) throw abortError();

    // 全部完成 -> 拼接 output.mp3
    send({ type: 'merging', done: task.done, total: task.total });

    const chapters = [];
    const out = outputPath(taskId);
    const writeStream = fs.createWriteStream(out);
    let offset = 0;
    let totalSize = 0;
    let totalDuration = 0;
    let chapterIdx = 0;

    for (let i = 0; i < task.segments.length; i++) {
      const segInfo = task.segments[i];
      if (segInfo.status !== 'done') continue;
      const partPath = path.join(partsDir(taskId), `${String(i).padStart(5, '0')}.mp3`);
      if (!fs.existsSync(partPath)) continue;
      const buf = fs.readFileSync(partPath);
      writeStream.write(buf);

      const characterName = (() => {
        const c = (novel.characters || []).find((x) => x.id === segInfo.characterId);
        return c ? c.name : null;
      })();
      const title = segInfo.type === 'dialog'
        ? `第 ${i + 1} 段 · ${characterName || '对话'}`
        : `第 ${i + 1} 段 · 旁白`;
      const duration = getMp3Duration(buf);

      chapters.push({
        index: chapterIdx++,
        segIndex: i,
        segId: segInfo.segId,
        byteOffset: offset,
        byteLength: buf.length,
        startTime: totalDuration,
        duration,
        type: segInfo.type,
        characterId: segInfo.characterId,
        title,
      });
      offset += buf.length;
      totalSize += buf.length;
      totalDuration += duration;
    }

    await new Promise((resolve, reject) => {
      writeStream.end(() => resolve());
      writeStream.on('error', reject);
    });

    // 写 chapters.json
    const chaptersData = {
      taskId,
      novelId: task.novelId,
      novelTitle: task.novelTitle,
      format: 'mp3',
      totalBytes: totalSize,
      segmentCount: chapters.length,
      chapters,
      createdAt: new Date().toISOString(),
    };
    writeJson(chaptersPath(taskId), chaptersData);

    // 写 .cue 文件（CD 标准章节格式，部分播放器支持）
    const cuePath = path.join(taskDir(taskId), 'output.cue');
    // 用实际 mp3 时长（精确到帧 bitrate），比字节比例估算更准
    let cueContent = `FILE "output.mp3" MP3\n`;
    for (let i = 0; i < chapters.length; i++) {
      const c = chapters[i];
      cueContent += `  TRACK ${String(i + 1).padStart(2, '0')} AUDIO\n`;
      cueContent += `    TITLE "${escapeCueString(c.title)}"\n`;
      cueContent += `    INDEX 01 ${formatCueTime(c.startTime)}\n`;
    }
    fs.writeFileSync(cuePath, cueContent, 'utf-8');

    // 写 .lrc 字幕文件（按句切分，去音频标签，按字数比例分配时间）
    const lrcFile = lrcPath(taskId);
    let lrcContent = '';
    lrcContent += `[ti:${escapeLrcString(task.novelTitle)}]\n`;
    lrcContent += `[al:有声书]\n`;
    lrcContent += `[by:VoiceNovel]\n`;
    lrcContent += `[length:${formatLrcTime(totalDuration)}]\n`;
    lrcContent += `\n`;
    for (const c of chapters) {
      const seg = (novel.segments || []).find((s) => s.id === c.segId);
      if (!seg) continue;
      // 去掉音频标签 [高兴] 等
      const cleanText = audioCache.stripExpressionTags(seg.text || '');
      const sentences = splitSentences(cleanText);
      if (sentences.length === 0) continue;
      // 按字数比例分配段内时间
      const totalChars = sentences.reduce((sum, s) => sum + s.length, 0) || 1;
      let charOffset = 0;
      for (const s of sentences) {
        const ratio = charOffset / totalChars;
        const time = c.startTime + ratio * c.duration;
        lrcContent += `[${formatLrcTime(time)}]${escapeLrcString(s)}\n`;
        charOffset += s.length;
      }
    }
    fs.writeFileSync(lrcFile, lrcContent, 'utf-8');

    // 任务标记完成
    task.status = 'done';
    task.outputSize = totalSize;
    task.finishedAt = new Date().toISOString();
    saveTask(task);

    send({
      type: 'done',
      done: task.done,
      total: task.total,
      outputSize: totalSize,
      chapterCount: chapters.length,
      taskId,
    });

    logger.info(`export task done: ${taskId} (size=${totalSize}, chapters=${chapters.length})`);
    return task;
  } catch (err) {
    if (isAbortError(err)) {
      task.status = 'canceled';
      task.finishedAt = new Date().toISOString();
      saveTask(task);
      send({ type: 'canceled', taskId });
      logger.info(`export task canceled: ${taskId}`);
    } else {
      task.status = 'error';
      task.error = err.message;
      task.finishedAt = new Date().toISOString();
      saveTask(task);
      send({ type: 'error', message: err.message, code: err.code || 'INTERNAL_ERROR' });
      logger.error(`export task failed: ${taskId}`, { error: err.message, stack: err.stack });
    }
    throw err;
  } finally {
    runningTasks.delete(taskId);
  }
}

function abortError() {
  const err = new Error('aborted');
  err.code = 'ABORTED';
  err.name = 'AbortError';
  return err;
}

function isAbortError(err) {
  return err && (err.code === 'ABORTED' || err.name === 'AbortError');
}

/**
 * 解析 MP3 Buffer 的播放时长（秒）
 * 通过读取第一个有效帧的 bitrate，按 CBR 估算：时长 = 字节数 * 8 / bitrate
 * 支持 ID3v2 头跳过 + MPEG1/MPEG2/MPEG2.5 Layer3 bitrate 表
 * @param {Buffer} buf
 * @returns {number} 秒（找不到帧头时按 128kbps 估算）
 */
function getMp3Duration(buf) {
  if (!buf || buf.length < 4) return 0;
  let offset = 0;
  // 跳过 ID3v2 头（'ID3' + version + flags + 4 字节同步安全大小）
  if (buf[0] === 0x49 && buf[1] === 0x44 && buf[2] === 0x33) {
    const size = ((buf[6] & 0x7f) << 21) | ((buf[7] & 0x7f) << 14) | ((buf[8] & 0x7f) << 7) | (buf[9] & 0x7f);
    offset = 10 + size;
  }
  // 找第一个帧同步字 0xFF + (0xE0 ~ 0xFF)
  for (let i = offset; i < Math.min(buf.length - 4, offset + 8192); i++) {
    if (buf[i] !== 0xFF) continue;
    const b1 = buf[i + 1];
    if ((b1 & 0xE0) !== 0xE0) continue;
    const versionBits = (b1 >> 3) & 0x03; // 00=MPEG2.5, 01=reserved, 10=MPEG2, 11=MPEG1
    const layerBits = (b1 >> 1) & 0x03;   // 01=Layer3, 10=Layer2, 11=Layer1
    if (layerBits !== 0x01) continue;     // 只处理 Layer3
    if (versionBits === 0x01) continue;   // reserved
    const bitrateIndex = (buf[i + 2] >> 4) & 0x0F;
    if (bitrateIndex === 0 || bitrateIndex === 15) continue;
    const isMpeg1 = versionBits === 0x03;
    // MPEG1 Layer3 bitrate 表（kbps）
    const bitrateTableMpeg1 = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0];
    // MPEG2/2.5 Layer3 bitrate 表（kbps）
    const bitrateTableMpeg2 = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, 0];
    const bitrate = isMpeg1 ? bitrateTableMpeg1[bitrateIndex] : bitrateTableMpeg2[bitrateIndex];
    if (!bitrate) continue;
    return buf.length * 8 / (bitrate * 1000);
  }
  // 找不到帧头，按 128kbps 估算
  return buf.length * 8 / (128 * 1000);
}

/**
 * 按句末标点切分文本为句子数组（保留标点）
 * @param {string} text
 * @returns {string[]}
 */
function splitSentences(text) {
  if (!text) return [];
  // 按中英文句末标点切分（。！？!?…），保留标点
  const sentences = text.split(/(?<=[。！？!?…])/).map((s) => s.trim()).filter(Boolean);
  return sentences.length > 0 ? sentences : [text];
}

/**
 * 格式化 LRC 时间戳 mm:ss.xx（xx 为百分秒，2 位）
 * @param {number} seconds
 * @returns {string}
 */
function formatLrcTime(seconds) {
  if (!isFinite(seconds) || seconds < 0) seconds = 0;
  const mm = Math.floor(seconds / 60);
  const ss = Math.floor(seconds % 60);
  const xx = Math.floor((seconds * 100) % 100);
  return `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}.${String(xx).padStart(2, '0')}`;
}

/**
 * 转义 LRC 文本中的换行/方括号（避免破坏 LRC 格式）
 * @param {string} s
 * @returns {string}
 */
function escapeLrcString(s) {
  return String(s || '')
    .replace(/\r?\n/g, ' ')
    .replace(/\[/g, '【')
    .replace(/\]/g, '】');
}

function escapeCueString(s) {
  return String(s || '').replace(/"/g, '\\"');
}

function formatCueTime(seconds) {
  if (!isFinite(seconds)) seconds = 0;
  const mm = Math.floor(seconds / 60);
  const ss = Math.floor(seconds % 60);
  const ff = Math.floor((seconds - Math.floor(seconds)) * 75); // CUE 采用 75fps
  return `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}:${String(ff).padStart(2, '0')}`;
}

module.exports = {
  EXPORTS_DIR,
  createTask,
  getTask,
  listTasks,
  getExportsSize,
  clearAllTasks,
  deleteTask,
  cancelTask,
  runTask,
  outputPath,
  chaptersPath,
  lrcPath,
  taskDir,
  getMp3Duration,
};
