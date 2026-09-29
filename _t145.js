/* v145 探针：自动备份「connection is closing」自愈
 * 场景：页面开着（备份库连接已建立）→ 库被外部删掉（页面的连接会收到 versionchange）
 *  → 修后行为：连接主动放手、句柄缓存清空；下一次备份自动重连（库重建）成功。 */
window.__errs = window.__errs || [];
if (!window.__errsHook) {
  window.__errsHook = 1;
  addEventListener('error', function (e) { __errs.push('ERR ' + (e.message || e)); });
  addEventListener('unhandledrejection', function (e) { __errs.push('REJ ' + e.reason); });
}
var out = []; var done = false;
function flush() { window.__probeResult = out.join('\n') + '\n=== ' + (done ? '完成' : '进行中'); }
function ok(name, cond, extra) { out.push((cond ? 'PASS ' : 'FAIL ') + name + (extra !== undefined ? ' | ' + extra : '')); flush(); }
function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

function deleteDb(ms) {
  return new Promise(function (resolve) {
    var settled = false;
    var timer = setTimeout(function () { if (!settled) { settled = true; resolve('timeout'); } }, ms || 10000);
    var rq = indexedDB.deleteDatabase('focus-plan-backups');
    rq.onsuccess = function () { if (!settled) { settled = true; clearTimeout(timer); resolve('success'); } };
    rq.onerror = function () { if (!settled) { settled = true; clearTimeout(timer); resolve('error'); } };
    rq.onblocked = function () { /* 等 success/timeout 裁决 */ };
  });
}

async function run() {
  await sleep(1400);
  try {
    // ① 初始：备份功能活着（init 已跑过，meta 里可能有 daily 兜底份）
    var m0 = await App.backup._metaAll();
    ok('①1 初始备份功能正常（连得上）', Array.isArray(m0), 'meta=' + m0.length + ' 条');

    // ② 删库（页面的旧连接必须主动放手，否则 deleteDatabase 会 onblocked 卡死）
    var r = await deleteDb(10000);
    ok('②1 库删除成功（旧连接放手了，没被 blocked）', r === 'success', r);

    // ③ 自愈：直接再备份一份 —— tx 撞上死句柄 → 重连 → 库重建 → 写入成功
    var rec = null; var snapErr = '';
    try { rec = await App.backup.snap('manual'); } catch (e) { snapErr = (e && e.message) || e; }
    ok('③1 连接死过之后 snap manual 成功（自愈重连）', !!rec && !snapErr, snapErr || ('at=' + (rec && rec.at)));
    var m1 = await App.backup._metaAll();
    ok('③2 库重建后 meta 有记录', m1.length >= 1 && m1.some(function (x) { return x.kind === 'manual'; }), 'meta=' + m1.length + ' 条');

    // ④ 删除备份（双 store 事务 dropReal 也走自愈版 tx）
    var id1 = (m1[0] || {}).id;
    var delN = await App.backup.remove(id1);
    ok('④1 删备份正常（dropReal 双 store）', delN === 1, 'removed=' + delN);
    var m2 = await App.backup._metaAll();
    ok('④2 删后 meta 减少', m2.length === m1.length - 1, (m1.length) + '→' + (m2.length));

    // ⑤ 设置页备份区渲染不报错
    try { App.app.switchView('settings'); } catch (e) {}
    await sleep(400);
    var box = document.getElementById('bk-box');
    ok('⑤1 备份区渲染了', !!box && box.innerHTML.length > 100, box ? box.innerHTML.length : 0);
    ok('⑤2 没有"用不了"字样', !box || box.innerHTML.indexOf('用不了') < 0);

    ok('⑥ 零报错', __errs.length === 0, __errs.join(' ; ').slice(0, 200));
  } catch (e) {
    ok('异常中断', false, (e && e.message) || e);
  }
  done = true; flush();
}
run();
