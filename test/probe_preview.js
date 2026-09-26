// 预览版验证：file:// 单文件能跑、数据渲染、错题本入口隐藏
(function () {
  var out = [], errs = [];
  window.addEventListener('error', function (e) { errs.push(String(e.message)); });
  window.addEventListener('unhandledrejection', function (e) { errs.push('rej:' + e.reason); });
  function ok(name, c, x) { out.push((c ? 'PASS' : 'FAIL') + ' | ' + name + (x !== undefined ? ' | ' + x : '')); }
  function eq(name, a, b) { ok(name, a === b, 'got=' + a + ' want=' + b); }

  var tries = 0;
  function run() {
    tries++;
    if (!(window.App && App.store && App.app)) { if (tries > 100) finish(); else setTimeout(run, 100); return; }
    try {
      ok('P1 file:// 打开成功', location.protocol === 'file:', location.protocol);
      ok('P2 演示种子生效', !!App.store.data().days[App.store.todayKey()] || Object.keys(App.store.data().days).length > 3,
        'days=' + Object.keys(App.store.data().days).length);
      ok('P3 标题带预览标记', document.title.indexOf('预览') >= 0, document.title);

      App.app.switchView('stats');
      ok('P4 复盘看板渲染', !!document.getElementById('review-board') && document.getElementById('review-board').innerHTML.indexOf('rv-grid') >= 0);
      ok('P5 成绩卡渲染', !!document.getElementById('exams-card') && document.getElementById('exams-card').innerHTML.indexOf('exam-chart') >= 0);
      ok('P6 成就卡渲染', !!document.getElementById('badges-card') && document.getElementById('badges-card').querySelectorAll('.bg-tile').length > 0);

      var mn = document.querySelector('[data-view="mistakes"]');
      ok('P7 错题本入口已隐藏', mn && getComputedStyle(mn).display === 'none');
      var navMistakes = Array.prototype.slice.call(document.querySelectorAll('.nav-btn')).filter(function (b) {
        return b.dataset.view === 'mistakes' && getComputedStyle(b).display !== 'none';
      });
      eq('P8 没有可见的错题入口', navMistakes.length, 0);

      // 一圈页面切换不崩
      var views = ['tasks', 'queue', 'cards', 'checkin', 'calendar', 'sport', 'timeline', 'stats', 'settings', 'tasks'];
      var boom = null;
      views.forEach(function (v) { try { App.app.switchView(v); } catch (e) { boom = v + ':' + e.message; } });
      ok('P9 十页切换零报错', !boom, boom || 'ok');
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
