/* v149 探针：复习行积分框（改 t.points → 翻卡补勾按新分发） */
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
function q(sel) { return document.querySelector(sel); }
var T = '2026-09-29';

async function run() {
  await sleep(1200);
  try {
    App.app.switchView('queue');
    await sleep(400);
    // ① 复习行有积分框（种子：今天 revC 复习·化学平衡 points=3）
    var inp = q('#queue-view input[data-rpts="revC"]');
    ok('①1 复习行积分框在', !!inp, inp ? ('value=' + inp.value) : 'none');
    ok('①2 显示当前分 3', !!inp && inp.value === '3', inp ? inp.value : '');

    // ② 行内改成 9 → 任务本体 points=9
    inp.value = '9';
    inp.dispatchEvent(new Event('change', { bubbles: true }));
    await sleep(250);
    var tc = ((App.store.getDay(T)).tasks.required || []).filter(function (x) { return x.id === 'revC'; })[0];
    ok('②1 任务本体 points=9', !!tc && tc.points === 9, tc ? ('points=' + tc.points) : 'gone');

    // ③ 翻卡做完（模拟：翻一下 colX 的卡 → lastFlipDay=今天 → sweep 补勾按 9 分发）
    try { App.memcards.openCol('colX', {}); } catch (e) {}
    await sleep(300);
    var btnRev = q('[data-act="mc-review"]');
    if (btnRev) {
      btnRev.click(); await sleep(250);
      var flip = q('[data-act="mc-flip"]');
      if (flip) { flip.click(); await sleep(200); }
      var back = q('[data-act="mc-backbox"]'); if (back) back.click(); await sleep(200);
    }
    App.memcards.mcSweepOverdue();
    await sleep(300);
    var led = App.store.data().ledger || [];
    var hit = led.filter(function (x) { return x.type === 'earn-required' && x.points === 9 && x.taskId === 'revC'; });
    ok('③1 翻卡做完按 9 分补发（记给 revC）', hit.length >= 1, hit.length ? ('+' + hit[0].points) : 'no ledger');
    ok('③2 revC 已勾', !!(tc = ((App.store.getDay(T)).tasks.required || []).filter(function (x) { return x.id === 'revC'; })[0]) && tc.done === true);

    ok('④ 零报错', __errs.length === 0, __errs.join(' ; ').slice(0, 200));
  } catch (e) { ok('异常中断', false, (e && e.message) || e); }
  done = true; flush();
}
run();
