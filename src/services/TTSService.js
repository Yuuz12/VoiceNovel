// TTS 服务（转发到 provider 调度器）
// 现已支持多 provider 可切换：火山方舟 / 小米 MIMO
// 实际实现见 src/services/tts/{volcanoProvider,mimoProvider,index}.js
// 本文件保留以兼容现有 require('../services/ttsService') / require('../services/TTSService') 调用。
module.exports = require('./tts/index');
