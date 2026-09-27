// v137 探针：🎯 基础任务计时计入小时代可视化（悬浮窗计入行 + 基础任务卡提示）
(function () {
  var out = [], errs = [];
  window.addEventListener('error', function (e) { errs.push(String(e.message)); });
  window.addEventListener('unhandledrejection', function (e) { errs.push('rej:' + e.reason); });
  function ok(name, c, x) { out.push((c ? 'PASS' : 'FAIL') + ' | ' + name + (x !== undefined ? ' | ' + x : '')); }
  function eq(name, a, b) { ok(name, a === b, 'got=' + a + ' want=' + b); }

  var tries = 0;
  function run() {
    tries++;
    if (!(window.App && App.queue && App.tasks)) { if (tries > 100) finish(); else setTimeout(run, 100); return; }
    try {
      var tk = App.store.todayKey();
      // 清场
      var D = App.store.data();
      D.daily = (D.daily || []).filter(function (d) { return d.id !== 'D137'; });
      var day0 = App.store.getDay(tk);
      day0.tasks.required = (day0.tasks.required || []).filter(function (t) { return !t.fromDaily; });

      // 小时代进行中（10 分钟前开始，30 分钟长，必须目标 15）
      day0.activeHourPlan = { id: 'HP137', startAt: new Date(Date.now() - 10 * 60000).toISOString(),
        duration: 30, reward: 10, taskKey: '', taskId: '', taskText: '',
        targets: { required: 15, ideal: 5, extra: 5 } };
      // 基础任务
      D.daily.push({ id: 'D137', text: '化学复习', points: 2, pinnedDay: tk, done: null });
      App.store.save();

      // ---- 队列页：基础任务卡有小时代提示 ----
      App.app.switchView('queue');
      var qv = document.getElementById('queue-view');
      ok('K1a 小时代提示出现在基础任务卡', qv.innerHTML.indexOf('会计入这一段') >= 0);
      ok('K1b 提示里写明计入「必须」', qv.innerHTML.indexOf('「必须」') >= 0);

      // ---- 点 ▶ → 开始计时（确认 go）→ 悬浮窗出现计入行 ----
      var btn = qv.querySelector('[data-act="d-start"][data-id="D137"]');
      ok('K2 基础任务有 ▶', !!btn);
      btn.click();
      var m = document.querySelector('#modal-root .modal');
      ok('K3 计时开始弹窗', !!m && !!m.querySelector('[data-act="go"]'));
      m.querySelector('#plan-content').value = '化学复习一轮';   // startTimer 必填「要做什么」
      m.querySelector('[data-act="go"]').click();
      ok('K7 副本进了必须栏（fromDaily）', App.store.getDay(tk).tasks.required.some(function (t) { return t.fromDaily === 'D137'; }));

      // 悬浮窗要等下一个 tick（1 秒）才刷新 —— 等一下再断言
      setTimeout(function () {
        try {
          var hp = document.getElementById('tf-hp');
          ok('K4 悬浮窗计入行可见', !!hp && !hp.classList.contains('hidden'));
          ok('K5 写明「计入小时代」', hp && hp.innerHTML.indexOf('计入小时代') >= 0);
          ok('K6 计入「必须」且带目标', hp && hp.innerHTML.indexOf('必须') >= 0 && hp.innerHTML.indexOf('/15') >= 0);
          App.app.switchView('tasks');
          var hc = document.querySelector('.hour-card.active');
          ok('K8 小时代卡在进行中状态', !!hc);
        } catch (e) { ok('K-THREW', false, String((e && e.stack) || e)); }
        finish();
      }, 1700);
      return;
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
