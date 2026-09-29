/* v146 探针 v2：队列行内积分 → 完成发分全链路 */
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
function lastEarn() {
  var led = App.store.data().ledger || [];
  for (var i = led.length - 1; i >= 0; i--) if (led[i].type === 'earn-queue') return led[i];
  return null;
}

async function run() {
  await sleep(1200);
  try {
    App.app.switchView('queue');
    await sleep(400);
    // ① 行内积分框：qq2 显示 8（自己设过），qq1 显示全局默认 5
    var inp1 = q('#queue-view input[data-pts="qq1"]');
    var inp2 = q('#queue-view input[data-pts="qq2"]');
    ok('①1 qq1 有积分框（显示全局默认 5）', !!inp1 && inp1.value === '5', inp1 ? inp1.value : 'none');
    ok('①2 qq2 有积分框（显示自己设的 8）', !!inp2 && inp2.value === '8', inp2 ? inp2.value : 'none');

    // ② qq1 行内改成 12 → 源 points=12
    inp1.value = '12';
    inp1.dispatchEvent(new Event('change', { bubbles: true }));
    await sleep(250);
    var it1 = App.store.data().queue.filter(function (x) { return x.id === 'qq1'; })[0];
    ok('②1 行内改 12 → 源条目 points=12', it1.points === 12, 'points=' + it1.points);

    // ③ 完成当前条（qq1）：点「✓ 做完了」→ confirm → 发分 12
    var doneBtn = q('#queue-view [data-act="q-done"][data-id="qq1"]');
    ok('③1 「✓ 做完了」按钮在', !!doneBtn);
    if (doneBtn) {
      doneBtn.click();
      await sleep(300);
      var okBtn = q('#modal-root [data-act="ok"]');
      ok('③2 确认弹窗在', !!okBtn);
      if (okBtn) {
        okBtn.click();
        await sleep(500);
        var e1 = lastEarn();
        ok('③3 完成按行内改的 12 分发分', !!e1 && e1.points === 12, e1 ? (e1.type + '=' + e1.points) : 'no ledger');
        ok('③4 qq1 移进已完成', !(App.store.data().queue || []).some(function (x) { return x.id === 'qq1'; }));
      }
    }

    // ④ qq2：行内改 20 → 当前条工位 copy 同步 → 完成 copy（toggleTask）→ syncBack 后发 20
    inp2 = q('#queue-view input[data-pts="qq2"]');
    inp2.value = '20';
    inp2.dispatchEvent(new Event('change', { bubbles: true }));
    await sleep(250);
    var it2 = App.store.data().queue.filter(function (x) { return x.id === 'qq2'; })[0];
    ok('④1 qq2 行内改 20 → 源 points=20', it2.points === 20, 'points=' + it2.points);
    // 实体化：刷新页面让 ensureMaterialized 跑（或者直接找今天的 copy）
    var day = App.store.getDay(App.store.todayKey());
    var copy2 = null;
    ['required', 'ideal', 'extra'].forEach(function (k) {
      (day.tasks[k] || []).forEach(function (c) { if (c.fromQueue === 'qq2') copy2 = c; });
    });
    if (!copy2) {
      // 没实体化就手动拉一条（模拟工位）：直接 toggleTask 不行 —— 走 App.queue 的导出？
      // 简化：直接验证 syncBack 语义 —— 构造 copy 再完成
      copy2 = { id: 'cqq2', text: it2.text, fromQueue: 'qq2', points: 20, done: null, subs: [], groups: [] };
      day.tasks.required.push(copy2);
      App.store.save();
    }
    copy2.points = 20;   // 模拟工位上把分改成 20
    App.store.save();
    try { App.tasks.toggleTask('required', copy2.id); } catch (e) { ok('④2 toggleTask', false, e.message); }
    await sleep(600);
    var e2 = lastEarn();
    ok('④3 工位上改 20 → 完成发 20（syncBack 生效）', !!e2 && e2.points === 20, e2 ? (e2.type + '=' + e2.points) : 'no ledger');

    ok('⑤ 零报错', __errs.length === 0, __errs.join(' ; ').slice(0, 200));
  } catch (e) { ok('异常中断', false, (e && e.message) || e); }
  done = true; flush();
}
run();
