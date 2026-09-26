// v125 手机端探针：底部导航 + 更多抽屉（窄/宽视口都能跑，按 matchMedia 分支断言）
(function () {
  var out = [], errs = [];
  window.addEventListener('error', function (e) { errs.push(String(e.message)); });
  window.addEventListener('unhandledrejection', function (e) { errs.push('rej:' + e.reason); });
  function ok(name, c, x) { out.push((c ? 'PASS' : 'FAIL') + ' | ' + name + (x !== undefined ? ' | ' + x : '')); }
  function eq(name, a, b) { ok(name, a === b, 'got=' + a + ' want=' + b); }

  var tries = 0;
  function run() {
    tries++;
    if (!(window.App && App.app && App.app.switchView)) { if (tries > 100) finish(); else setTimeout(run, 100); return; }
    try {
      var MON = (function(){ var t=new Date(); t.setHours(0,0,0,0); t.setDate(t.getDate()-((t.getDay()+6)%7));
        return t.getFullYear()+'-'+String(t.getMonth()+1).padStart(2,'0')+'-'+String(t.getDate()).padStart(2,'0'); })();
      ok('B0 种子自检', !!(App.store.data().days[MON] && App.store.data().days[MON].tasks.required.length), 'mon=' + MON);

      var narrow = window.matchMedia('(max-width: 700px)').matches;
      var mn = document.getElementById('mobile-nav');
      var mainNav = document.getElementById('main-nav');
      eq('B1a 视口分支', narrow ? 'narrow' : 'wide', narrow ? 'narrow' : 'wide');
      eq('B1b mobile-nav 存在', !!mn, true);
      eq('B1c窄屏 mobile-nav 显示 flex', getComputedStyle(mn).display, narrow ? 'flex' : 'none');
      eq('B1d窄屏 顶导航隐藏', getComputedStyle(mainNav).display, narrow ? 'none' : 'flex');
      eq('B1e 底栏 6 个按钮', mn.querySelectorAll('.mn-btn').length, 6);

      App.app.switchView('checkin');
      var ckBtn = mn.querySelector('[data-view="checkin"]');
      ok('B2 底栏 active 跟随', ckBtn.classList.contains('active'));

      document.getElementById('mn-more').click();
      var sheet = document.getElementById('mn-sheet');
      ok('B3a 抽屉打开', !sheet.classList.contains('hidden'));
      var cardBtn = sheet.querySelector('[data-view="cards"]');
      cardBtn.click();
      eq('B3b 抽屉点卡片 → 切到 cards', App.app.currentView(), 'cards');
      ok('B3c 切页自动收抽屉', sheet.classList.contains('hidden'));

      document.getElementById('mn-more').click();
      var aboutBtn = sheet.querySelector('[data-mact="about"]');
      aboutBtn.click();
      var modal = document.querySelector('#modal-root .modal');
      ok('B4a 指南弹窗开了', !!modal);
      ok('B4b 点功能按钮也收抽屉', sheet.classList.contains('hidden'));
      if (App.ui.closeModal) App.ui.closeModal();

      document.getElementById('mn-more').click();
      sheet.querySelector('[data-mact="ms"]').click();
      var modal2 = document.querySelector('#modal-root .modal');
      ok('B5 截止日期弹窗开了', !!modal2);
      if (App.ui.closeModal) App.ui.closeModal();

      document.getElementById('mn-more').click();
      sheet.dispatchEvent(new Event('click', { bubbles: true }));
      ok('B6 遮罩点击收抽屉', sheet.classList.contains('hidden'));

      var pb = parseFloat(getComputedStyle(document.body).paddingBottom);
      ok('B7 body 给底栏留了空间', pb >= 70, 'padding-bottom=' + pb);

      document.getElementById('mn-more').click();
      document.getElementById('mn-close').click();
      ok('B8 ✕ 收起', sheet.classList.contains('hidden'));

      App.app.switchView('tasks');
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
