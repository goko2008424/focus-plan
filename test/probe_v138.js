// v138 探针：复习任务↔基础任务卡绑死（身份全丢的副本也进「今天的复习」+ 🃏 按合集名匹配回来）
(function () {
  var out = [], errs = [];
  window.addEventListener('error', function (e) { errs.push(String(e.message)); });
  window.addEventListener('unhandledrejection', function (e) { errs.push('rej:' + e.reason); });
  function ok(name, c, x) { out.push((c ? 'PASS' : 'FAIL') + ' | ' + name + (x !== undefined ? ' | ' + x : '')); }
  function eq(name, a, b) { ok(name, a === b, 'got=' + a + ' want=' + b); }

  var tries = 0;
  function run() {
    tries++;
    if (!(window.App && App.tasks && App.tasks.repairRolledReviews)) { if (tries > 100) finish(); else setTimeout(run, 100); return; }
    try {
      var tk = App.store.todayKey();
      // 清场
      App.store.data().days[tk].tasks.required = (App.store.data().days[tk].tasks.required || [])
        .filter(function (t) { return String(t.text).indexOf('v138') < 0; });
      App.store.data().memcards = (App.store.data().memcards || []).filter(function (c) { return c.name !== '某课v138'; });

      // 合集名叫「某课v138」（注意：坏副本已经找不到 mcRef，只能按名字匹配）
      var col = { id: 'COL138', name: '某课v138', dayKey: tk, cards: [
        { id: 'CD1', front: '题1', back: '答1', frontImgs: [], backImgs: [] },
        { id: 'CD2', front: '题2', back: '答2', frontImgs: [], backImgs: [] }]};
      App.store.data().memcards.push(col);
      // 坏副本：只有名字，什么身份都没有（原任务也找不到了的最坏情况）
      var broken = { id: 'P138', text: '复习 · 某课v138', rolled: true, done: false };
      App.store.getDay(tk).tasks.required.push(broken);
      App.store.save();

      // ---- 修复：找不到原任务 → 至少补 🔁 标记 ----
      var n = App.tasks.repairRolledReviews();
      ok('I1 兜底修复跑过', n >= 1, 'n=' + n);
      eq('I2 补上 mode=review', broken.mode, 'review');

      // ---- countForTask 按合集名匹配回 2 张 ----
      eq('I3 🃏 数量按名字匹配回 2（cardsForTask 完整解析）', App.memcards.cardsForTask(broken).length, 2);

      // ---- 基础任务卡的「今天的复习」区块包含它 ----
      App.app.switchView('queue');
      var qv = document.getElementById('queue-view');
      var sec = qv.querySelector('.q-revsec');
      ok('I4 区块存在', !!sec);
      ok('I5 坏副本进了「今天的复习」', sec.innerHTML.indexOf('v138') >= 0);
      ok('I6 🃏 数量徽标显示 2', sec.innerHTML.indexOf('🃏 2') >= 0);

      // ---- 点 🃏 能打开合集（openForTask 名字匹配兜底）----
      var btn = sec.querySelector('[data-act="qrev-cards"][data-id="P138"]');
      ok('I7 🃏 按钮在', !!btn);
      btn.click();
      var noCard = document.getElementById('toast-root').textContent.indexOf('没挂着卡片合集') >= 0;
      ok('I8 点 🃏 打开了合集（没有报「没挂」）', !noCard);
      if (App.ui.closeModal) App.ui.closeModal();

      // 清理
      App.store.data().days[tk].tasks.required = App.store.data().days[tk].tasks.required
        .filter(function (t) { return String(t.text).indexOf('v138') < 0; });
      var mc = App.store.data().memcards;
      var ci = mc.indexOf(col); if (ci >= 0) mc.splice(ci, 1);
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
