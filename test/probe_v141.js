/* v141 探针：计时内容可不填 + 复习行删除 + 同名冲突照样收走 */
window.__errs = window.__errs || [];
if (!window.__errsHook) {
  window.__errsHook = 1;
  addEventListener('error', function (e) { __errs.push('ERR ' + (e.message || e)); });
  addEventListener('unhandledrejection', function (e) { __errs.push('REJ ' + ((e.reason && e.reason.message) || e.reason)); });
}
var out = [], done = false;
function flush() { window.__probeResult = out.join('\n') + '\n=== ' + (done ? '完成' : '进行中'); }
function ok(name, cond) { out.push((cond ? 'OK  ' : 'FAIL') + ' ' + name); flush(); }
function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
function q(sel) { try { return (App.ui && App.ui.query) ? App.ui.query(sel) : document.querySelector(sel); } catch (e) { return document.querySelector(sel); } }
function qAll(sel) { return Array.prototype.slice.call(document.querySelectorAll(sel)); }

function tk() { return App.store.todayKey(); }
function S() { return App.store; }
function tomorrowKey() { var d = new Date(Date.now() + 86400000); return App.store.dateKey(d); }

(async function () {
  try {
    var T = tk();
    var day = S().getDay(T);
    if (!day.tasks.required) day.tasks.required = [];

    /* ---------- A. 计时内容可不填（空着 → 按任务名记） ---------- */
    var aText = '【v141测】做物理卷子';
    var aTask = { id: App.store.uid(), text: aText, mode: 'normal', points: 1 };
    day.tasks.required.push(aTask);
    S().save();
    ok('A0 种子任务就位', S().getDay(T).tasks.required.some(function (x) { return x.id === aTask.id; }));

    App.tasks.startTimer('required', aTask.id);
    await sleep(160);
    var pc = q('#plan-content');
    ok('A1 计时弹窗+输入框在', !!pc);
    ok('A2 占位提示带"留空 = 按任务名记"', pc && pc.getAttribute('placeholder').indexOf('按任务名记') >= 0);
    pc.value = '';                                  // 空着
    q('[data-act="go"]').click();
    await sleep(160);
    var snap = JSON.parse(localStorage.getItem('focusPlan.timer.v1') || 'null');
    ok('A3 空内容也能开始计时（无必填拦截）', !!snap && !!snap.t);
    ok('A4 空内容按任务名记 planContent==任务名', snap && snap.t && snap.t.planContent === aText);
    // 干净收尾：结束计时
    try { App.tasks.stopTimer(); } catch (e) {}
    await sleep(160);
    var stopOk = q('#modal-root .modal [data-act="yes-done"]');
    if (stopOk) stopOk.click();
    await sleep(160);
    try { localStorage.removeItem('focusPlan.timer.v1'); } catch (e) {}

    /* ---------- B. 复习行删除（🗑 qrev-del） ---------- */
    var revText = '【v141测】复习·近代史第3章';
    var rt = { id: App.store.uid(), text: revText, mode: 'review', points: 1 };
    S().getDay(T).tasks.required.push(rt);
    S().save();
    App.app.switchView('queue');
    await sleep(280);
    var delBtn = q('[data-act="qrev-del"][data-id="' + rt.id + '"]');
    ok('B1 复习行有 🗑 删除按钮', !!delBtn);
    delBtn.click();
    await sleep(160);
    var cfm = q('#modal-root .modal [data-act="ok"]');
    ok('B2 删除确认弹窗出现', !!cfm);
    cfm.click();
    await sleep(200);
    ok('B3 点确认后今天这条被收走', !S().getDay(T).tasks.required.some(function (x) { return x.id === rt.id; }));
    ok('B4 收走后复习行不见了', !q('[data-act="qrev-del"][data-id="' + rt.id + '"]'));

    /* ---------- C. 同名冲突 moveTaskDayModal 照样从今天收走 ---------- */
    var NK = tomorrowKey();
    var dayN = S().getDay(NK);
    if (!dayN.tasks.required) dayN.tasks.required = [];
    dayN.tasks.required.push({ id: App.store.uid(), text: revText, mode: 'review', points: 1 }); // 制造"搬不过去"
    var rt2 = { id: App.store.uid(), text: revText, mode: 'review', points: 1 };                 // 今天要改天的那条
    S().getDay(T).tasks.required.push(rt2);
    S().save();
    App.app.switchView('queue');
    await sleep(280);
    var dateBtn = q('[data-act="qrev-date"][data-id="' + rt2.id + '"]');
    ok('C1 复习行有 📅 改天再做按钮', !!dateBtn);
    dateBtn.click();
    await sleep(160);
    var mvd = q('#mvd-date');
    ok('C2 改天再做弹窗+日期框在', !!mvd);
    mvd.value = NK;
    q('[data-act="mvd-ok"]').click();
    await sleep(260);
    ok('C3 同名冲突下今天这条照样被收走（不再甩不掉）',
      !S().getDay(T).tasks.required.some(function (x) { return x.id === rt2.id; }));
    var nCount = S().getDay(NK).tasks.required.filter(function (x) { return x.text === revText; }).length;
    ok('C4 明天同名条未重复（仍 1 条）', nCount === 1);

    /* ---------- I. 页面自查：尺寸表 0 不符 ---------- */
    try {
      var res = await window.__checkBuild(true);
      var realBad = (res || []).filter(function (x) { return x.bad; });
      ok('I1 __checkBuild 0 不符 (bad=' + realBad.length + ')', realBad.length === 0);
    } catch (e) { ok('I1 __checkBuild 调不动: ' + e.message, false); }

    ok('Z 无报错 (' + window.__errs.length + ' 条)', window.__errs.length === 0);
    if (window.__errs.length) out.push('ERRS: ' + window.__errs.join(' | '));
  } catch (e) {
    out.push('EXC ' + (e && e.message));
    out.push(e && e.stack ? String(e.stack).slice(0, 800) : '');
  }
  done = true; flush();
})();
