// TTS 公共错误类型，所有 provider 共用
class TTSError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'TTSError';
    this.code = code;
  }
}

module.exports = { TTSError };
