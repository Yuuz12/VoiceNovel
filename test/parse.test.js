// 规则分段 + 角色识别回归测试（无第三方依赖）
// 运行：npm test
const assert = require('assert');
const { parseWithRules } = require('../src/services/novelService');

const SAMPLE = `林墨推开门走了进来。"你好啊，小华。"林墨微笑着说道。"哦，你来了。"小华抬起头，"我正在看书呢。"

王大爷从院子里走过来。"你们两个又在偷懒了。"王大爷冷哼一声。林墨笑了笑。`;

const PARSING = {
  dialogSymbols: [['"', '"']],
  maxSegmentLength: 200,
  autoSegmentOnUpload: true,
};

let passed = 0;
let failed = 0;

function check(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed += 1;
  } catch (e) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${e.message}`);
    failed += 1;
  }
}

console.log('parseWithRules 角色识别测试：');
const result = parseWithRules(SAMPLE, PARSING);
const { segments, characters } = result;

// 工具：根据对话文本找到对应段
function findDialog(text) {
  return segments.find((s) => s.type === 'dialog' && s.text === text);
}
function charNameById(id) {
  if (!id) return null;
  const c = characters.find((x) => x.id === id);
  return c ? c.name : null;
}

check('"你好啊，小华" 归因给 林墨', () => {
  const seg = findDialog('你好啊，小华。');
  assert.ok(seg, '未找到该对话段');
  assert.strictEqual(charNameById(seg.characterId), '林墨');
});

check('"你们两个又在偷懒了" 归因给 王大爷', () => {
  const seg = findDialog('你们两个又在偷懒了。');
  assert.ok(seg, '未找到该对话段');
  assert.strictEqual(charNameById(seg.characterId), '王大爷');
});

check('"哦，你来了" 未归因（characterId 为 null）', () => {
  const seg = findDialog('哦，你来了。');
  assert.ok(seg, '未找到该对话段');
  assert.strictEqual(seg.characterId, null);
});

check('角色名列表中不存在 "林墨微笑着" 等错误捕获', () => {
  const badNames = characters.map((c) => c.name).filter((n) => n.length >= 4 && n.includes('微笑'));
  assert.deepStrictEqual(badNames, [], `存在错误角色名: ${JSON.stringify(badNames)}`);
});

check('角色列表包含 林墨 与 王大爷', () => {
  const names = characters.map((c) => c.name);
  assert.ok(names.includes('林墨'), `角色列表缺少林墨: ${JSON.stringify(names)}`);
  assert.ok(names.includes('王大爷'), `角色列表缺少王大爷: ${JSON.stringify(names)}`);
});

console.log(`\n${passed} 通过, ${failed} 失败`);
if (failed > 0) {
  process.exit(1);
}
