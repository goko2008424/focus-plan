// v133 探针：🌱 复习排期「听完课自己定」——完课不再静默排，弹窗时间留空由用户挑
(function () {
  var out = [], errs = [];
  window.addEventListener('error', function (e) { errs.push(String(e.message)); });
  window.addEventListener('unhandledrejection', function (e) { errs.push('rej:' + e.reason); });
  function ok(name, c, x) { out.push((c ? 'PASS' : 'FAIL') + ' | ' + name + (x !== undefined ? ' | ' + x : '')); }
  function eq(name, a, b) { ok(name, a === b, 'got=' + a + ' want=' + b); }

  var tries = 0;
  function run() {
    tries++;
    if (!(window.App && App.tasks && App.tasks.srAfterTaskDone)) { if (tries > 100) finish(); else setTimeout(run, 100); return; }
    try {
      var MON = (function(){ var t=new Date(); t.setHours(0,0,0,0); t.setDate(t.getDate()-((t.getDay()+6)%7));
        return t.getFullYear()+'-'+String(t.getMonth()+1).padStart(2,'0')+'-'+String(t.getDate()).padStart(2,'0'); })();
      ok('D0 种子自检', !!(App.store.data().days[MON] && App.store.data().days[MON].tasks.required.length), 'mon=' + MON);
      var tk = App.store.todayKey();
      var T = App.tasks;

      // ---- 建两条全新知识任务 ----
      var day = App.store.getDay(tk);
      var t1 = { id: 'PT9', text: '化学 · 新知识探针 A', mode: 'new', done: false };
      var t2 = { id: 'PT10', text: '化学 · 新知识探针 B', mode: 'new', done: false };
      day.tasks.required.push(t1, t2);
      App.store.save();

      // ---- 完课：不再静默排 ----
      T.srAfterTaskDone(t1, 'required', tk);
      ok('D1 完课后没有静默排期', !t1.sp);
      T.srRunPending();
      var m = document.querySelector('#modal-root .modal');
      ok('D2 先弹知识点窗', !!m && m.innerHTML.indexOf('主动回忆') >= 0);
      var skip = m.querySelector('[data-act="kp-skip"]');
      skip.click();
      m = document.querySelector('#modal-root .modal');
      ok('D3 接着弹「定下一次复习」', !!m && !!m.querySelector('#srp-at'));
      eq('D4 时间留空（系统不预填）', m.querySelector('#srp-at').value, '');
      ok('D5 取消键=听完课再来定', m.querySelector('[data-act="cancel"]').textContent.indexOf('听完课') >= 0);
      ok('D6 预览提示先挑时间', m.querySelector('#srp-when').innerHTML.indexOf('先挑一个时间') >= 0);

      // ---- 快捷键 + 提交 ----
      m.querySelector('[data-act="srp-chip0"]').click();
      ok('D7 快捷键填上了', m.querySelector('#srp-at').value !== '');
      m.querySelector('[data-act="ok"]').click();
      eq('D8 排上了 1 轮', t1.sp && t1.sp.planned.length, 1);
      var due = t1.sp.planned[0].due;
      ok('D8b 时间≈30分钟后', Math.abs(due - (Date.now() + 30 * 60000)) < 3 * 60000, 'due=' + new Date(due).toLocaleString());

      // ---- 空提交被拦 + 听完课再来定 ----
      T.srAfterTaskDone(t2, 'required', tk);
      T.srRunPending();
      m = document.querySelector('#modal-root .modal');
      skip = m.querySelector('[data-act="kp-skip"]');
      skip.click();
      m = document.querySelector('#modal-root .modal');
      m.querySelector('[data-act="ok"]').click();
      ok('D9 空提交不排、弹窗留着', !t2.sp && !!document.querySelector('#modal-root .modal #srp-at'));
      m.querySelector('[data-act="cancel"]').click();
      ok('D10 听完课再来定：关闭且没排', !document.querySelector('#modal-root .modal #srp-at') && !t2.sp);

      // ---- 手动 🌱 也是空的 ----
      T.srPlanModal(t2, 'required');
      m = document.querySelector('#modal-root .modal');
      eq('D11 手动弹窗时间也是留空', m.querySelector('#srp-at').value, '');
      m.querySelector('[data-act="cancel"]').click();

      // 清理探针任务，不污染其他探针
      var arr = App.store.data().days[tk].tasks.required;
      [t1, t2].forEach(function (x) { var i = arr.indexOf(x); if (i >= 0) arr.splice(i, 1); });
      App.store.save();
    } catch (e) { ok('PROBE-THREW', false, String((e && e.stack) || e)); }
    finish();
  }
  function finish() {
    var fails = out.filter(function (l) { return l.indexOf('FAIL') === 0; }).length;
    if (errs.length) out.push('JS-ERRORS: ' + errs.join(' ;; '));
    out.unshift((fails === 0 && errs.length === 0 ? 'ALL OK' : 'HAS FAIL') + ': ' + out.length + ' 条, 失败 ' + fails);
    window.__probeResult = out.join('\n') + ' 完成';
  }
  run();
})();
