/* v147 探针 v2 */
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
var Y = '2026-09-28', T = '2026-09-29';
function q(sel) { return document.querySelector(sel); }
function earnOn(day, type, minPts) {
  return (App.store.data().ledger || []).filter(function (x) {
    return x.date === day && x.type === type && (minPts == null || x.points >= minPts);
  });
}
function reqOf(dayK, id) {
  return ((App.store.peekDay ? App.store.peekDay(dayK) : App.store.data().days[dayK]).tasks.required || [])
    .filter(function (t) { return t.id === id; })[0] || null;
}
function todayReq(txt) {
  return ((App.store.peekDay(T) || App.store.data().days[T]).tasks.required || [])
    .filter(function (t) { return t.text === txt && t.done !== true; });
}

async function run() {
  await sleep(1200);
  try {
    // ① 翻卡记 lastFlipDay
    try { App.memcards.openCol('colY', {}); } catch (e) {}
    await sleep(300);
    var btnRev = q('[data-act="mc-review"]');
    if (btnRev) {
      btnRev.click(); await sleep(250);
      var flip = q('[data-act="mc-flip"]');
      if (flip) { flip.click(); await sleep(200); }
      var colY = App.store.data().memcards.filter(function (c) { return c.id === 'colY'; })[0];
      ok('①1 翻卡后 colY.lastFlipDay=今天', colY && colY.lastFlipDay === T, colY ? colY.lastFlipDay : 'none');
      var back = q('[data-act="mc-backbox"]'); if (back) back.click();
    }
    var r = App.memcards.mcSweepOverdue();
    await sleep(200);
    ok('②1 sweep 报告 fixed>=3（revA/revB/revD 都补勾）', r.fixed >= 3, JSON.stringify(r));

    // ③ 三条昨天的复习全补勾 + 补发分（revA 3 / revB 2 / revD 4）
    ok('③1 revA 补勾', !!(reqOf(Y, 'revA') || {}).done);
    ok('③2 revB 也补勾（今天翻了这套卡，欠的轮次全部认账）', !!(reqOf(Y, 'revB') || {}).done);
    ok('③3 revD 补勾', !!(reqOf(Y, 'revD') || {}).done);
    var pts = earnOn(Y, 'earn-required').map(function (x) { return x.points; }).sort(function (a, b) { return a - b; });
    ok('③4 补发分 [2,3,4] 记在昨天', JSON.stringify(pts) === '[2,3,4]', JSON.stringify(pts));

    // ④ 今天：正轮保留、成对清 1、rolled 副本没被二次搬运
    ok('④1 「离子颜色」成对清成 1 条', todayReq('复习 · 离子颜色').length === 1);
    ok('④2 rolled 副本没被二次搬运', todayReq('复习 · 流速平衡').length === 1);
    ok('④3 「化学平衡」今天只有正轮 1 条', todayReq('复习 · 化学平衡').length === 1);

    // ⑤ 结算路径：不再滚「翻过卡」的任务
    try { App.tasks.settleDayCore(App.store.getDay(Y), Y, { rollAll: true }); } catch (e) { ok('⑤0 settle', false, e.message); }
    ok('⑤1 结算后 revA 保持已勾', !!(reqOf(Y, 'revA') || {}).done);
    ok('⑤2 结算没再往今天滚「化学平衡」副本', todayReq('复习 · 化学平衡').length === 1);

    // ⑥ 每日必做积分：勾→发、取消→退（每次点击都重新查节点！render 会重建 DOM）
    App.app.switchView('queue');
    await sleep(400);
    var ck = q('#queue-view [data-act="d-toggle"][data-id="dy1"]');
    ok('⑥1 积分框在（dy1 默认 2）', !!q('#queue-view input[data-dpts="dy1"]') && q('#queue-view input[data-dpts="dy1"]').value === '2');
    ck.click(); await sleep(300);
    ok('⑥2 勾上发 2 分', earnOn(T, 'earn-daily', 2).length >= 1);
    ck = q('#queue-view [data-act="d-toggle"][data-id="dy1"]');   // 🔁 重新查！
    ck.click(); await sleep(300);
    ok('⑥3 取消勾把分退掉', earnOn(T, 'earn-daily', 2).length === 0, earnOn(T, 'earn-daily').length + ' 笔');
    var ck2 = q('#queue-view [data-act="d-toggle"][data-id="dy2"]');
    ck2.click(); await sleep(300);
    ok('⑥4 自设 5 分照发', earnOn(T, 'earn-daily', 5).length >= 1);

    ok('⑦ 零报错', __errs.length === 0, __errs.join(' ; ').slice(0, 200));
  } catch (e) { ok('异常中断', false, (e && e.message) || e); }
  done = true; flush();
}
run();
