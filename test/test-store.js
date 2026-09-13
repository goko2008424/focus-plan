/* 核心逻辑测试：在 Node 中模拟浏览器环境，验证 store.js（账本/顺延/工具/导入导出）
 * 运行：node test/test-store.js
 */
'use strict';

// ---- 浏览器环境 shim ----
global.window = global;
const mem = {};
global.localStorage = {
  getItem: function (k) { return k in mem ? mem[k] : null; },
  setItem: function (k, v) { mem[k] = String(v); },
  removeItem: function (k) { delete mem[k]; }
};
// 无 indexedDB → 镜像自动降级为 no-op，验证 localStorage 主通道

const fs = require('fs');
const path = require('path');
eval(fs.readFileSync(path.join(__dirname, '..', 'js', 'store.js'), 'utf8'));

const S = window.App.store;
let passed = 0, failed = 0;
function assert(cond, name) {
  if (cond) { passed++; console.log('  ✓', name); }
  else { failed++; console.log('  ✗ FAIL:', name); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async function () {
  console.log('== 初始化 ==');
  S.load();
  await sleep(50); // 等 IDB 降级分支 settle
  assert(!!S.getDay(S.todayKey()), '加载后存在今日数据');
  assert(S.settings().redeemTable.length === 4, '默认兑换表 4 项');

  console.log('== 账本 ==');
  S.addLedger(S.todayKey(), 'earn-ideal', { points: 10, note: '理想任务：读英语' });
  S.addLedger(S.todayKey(), 'earn-extra', { points: 5, leisure: 0, note: '拓展：练吉他' });
  S.addLedger(S.todayKey(), 'reward-base', { leisure: 30, note: '保底奖励' });
  assert(S.pointsTotal() === 15, '积分合计 15');
  assert(S.leisureTotal() === 30, '休闲合计 30');
  const ledger = S.ledger();
  const ok = S.undoLastLedger(ledger[ledger.length - 1].id);
  assert(ok && S.leisureTotal() === 0, '撤销最近一笔后休闲归 0');
  S.addLedger(S.todayKey(), 'redeem', { points: -15, note: '兑换：零食' });
  assert(S.pointsTotal() === 0, '兑换扣分后余额 0');

  console.log('== 顺延（去重） ==');
  const today = S.todayKey(), tomorrow = S.tomorrowKey();
  S.getDay(today).tasks.required.push({ id: 'a1', text: '数学习题' });
  S.getDay(today).tasks.required.push({ id: 'a2', text: '背单词' });
  S.getDay(today).tasks.required.forEach(function (t) { t.done = t.id === 'a1' ? true : false; });
  S.getDay(tomorrow).tasks.required.push({ id: 'b1', text: '背单词' }); // 明天已有同文本
  S.rolloverTasks(today, tomorrow);
  const tomorrowReq = S.getDay(tomorrow).tasks.required.map(function (t) { return t.text; });
  assert(tomorrowReq.filter(function (t) { return t === '背单词'; }).length === 1, '同文本不重复顺延');
  assert(tomorrowReq.indexOf('数学习题') < 0, '已完成任务（数学习题）不顺延');
  assert(tomorrowReq.indexOf('背单词') >= 0, '未完成（背单词）顺延过去');

  console.log('== 时间工具 ==');
  assert(S.minOfDay('08:30') === 510, "minOfDay('08:30') === 510");
  assert(S.hhmmOf(510) === '08:30', "hhmmOf(510) === '08:30'");
  assert(S.hhmmOf(-30) === '23:30', 'hhmmOf(-30) 回绕 23:30');
  assert(S.fmtDur(90) === '1小时30分钟', 'fmtDur(90)');
  assert(S.fmtDur(45) === '45分钟', 'fmtDur(45)');
  assert(S.fmtClock(3661000) === '1:01:01', 'fmtClock(3661000)');
  assert(S.fmtDateCN('2026-09-02') === '2026年9月2日 周三', 'fmtDateCN');

  console.log('== 导出/导入 ==');
  const jsonStr = JSON.stringify(S.data());
  assert(S.importJSON(jsonStr) === true, '导入合法 JSON 成功');
  assert(S.pointsTotal() === 0 && S.getDay(today) !== undefined, '导入恢复数据');
  assert(S.importJSON('{"bad":true}') === false, '拒绝非法 JSON');

  console.log('== CSV 转义 ==');
  S.getDay(S.todayKey()).timeline.push({
    id: 't1', start: 510, end: 560, minutes: 50,
    content: '带"引号"的内容', category: 'study', countAsStudy: true, auto: false
  });
  // 直接验证 CSV 单元格转义逻辑（通过导出函数内部使用）
  // exportCSV 依赖 Blob/URL（浏览器 API），此处仅验证数据可序列化
  const serialized = JSON.parse(JSON.stringify(S.data()));
  assert(serialized.days[S.todayKey()].timeline.length === 1, '时间轴记录可序列化');

  console.log('');
  console.log(passed + ' 通过, ' + failed + ' 失败');
  process.exit(failed ? 1 : 0);
})();