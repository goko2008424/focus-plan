// v129 探针：📕 错题本（数据/筛选/重做/转卡/录入守卫/回收站恢复）
(function () {
  var out = [], errs = [];
  window.addEventListener('error', function (e) { errs.push(String(e.message)); });
  window.addEventListener('unhandledrejection', function (e) { errs.push('rej:' + e.reason); });
  function ok(name, c, x) { out.push((c ? 'PASS' : 'FAIL') + ' | ' + name + (x !== undefined ? ' | ' + x : '')); }
  function eq(name, a, b) { ok(name, a === b, 'got=' + a + ' want=' + b); }

  var tries = 0;
  function run() {
    tries++;
    if (!(window.App && App.mistakes)) { if (tries > 100) finish(); else setTimeout(run, 100); return; }
    try {
      var MON = (function(){ var t=new Date(); t.setHours(0,0,0,0); t.setDate(t.getDate()-((t.getDay()+6)%7));
        return t.getFullYear()+'-'+String(t.getMonth()+1).padStart(2,'0')+'-'+String(t.getDate()).padStart(2,'0'); })();
      ok('M0 种子自检', !!(App.store.data().days[MON] && App.store.data().days[MON].tasks.required.length), 'mon=' + MON);

      var M = App.mistakes;
      eq('M1 种子 3 道', M.D().length, 3);

      // 渲染 + 统计行
      App.app.switchView('mistakes');
      var box = document.getElementById('mistakes-view');
      ok('M2a 页面渲染了', !!box && box.innerHTML.indexOf('错题本') >= 0);
      ok('M2b 统计：待重做 1 · 已巩固 1', box.innerHTML.indexOf('待重做 1') >= 0 && box.innerHTML.indexOf('已巩固 1') >= 0);
      eq('M2c 列表 3 行', box.querySelectorAll('.mk-row').length, 3);

      // 重做：✗ 保持 todo / ✅ 变 mastered
      var mk1 = M.D().filter(function (m) { return m.id === 'MK1'; })[0];
      eq('M3a MK1 初始 todo · 1 次 ✗', mk1.status === 'todo' && mk1.redos.length === 1 && mk1.redos[0].result === 'no', true);
      var okBtn = box.querySelector('.mk-row[data-mkid="MK1"] [data-mkact="ok"]');
      okBtn.click();
      eq('M3b ✅ 后 mastered · 2 次', (function () { var m = M.D().filter(function (x) { return x.id === 'MK1'; })[0]; return m.status === 'mastered' && m.redos.length === 2 && m.redos[1].result === 'ok'; })(), true);
      var noBtn = box.querySelector('.mk-row[data-mkid="MK1"] [data-mkact="no"]');
      noBtn.click();
      eq('M3c mastered 后 ✗ 打回 todo', (function () { var m = M.D().filter(function (x) { return x.id === 'MK1'; })[0]; return m.status === 'todo' && m.redos.length === 3; })(), true);

      // 筛选
      var chemChip = null;
      box.querySelectorAll('[data-msub]').forEach(function (c) { if (c.dataset.msub === '化学') chemChip = c; });
      chemChip.click();
      eq('M4a 学科筛选 化学 1 行', box.querySelectorAll('.mk-row').length, 1);
      box.querySelector('[data-msub=""]').click();
      box.querySelectorAll('[data-mst]').forEach(function (c) { if (c.dataset.mst === 'mastered') c.click(); });
      eq('M4b 状态筛选 mastered 1 行', box.querySelectorAll('.mk-row').length, 1);
      box.querySelector('[data-mst=""]').click();

      // 转设问卡
      M.toCard('MK1');
      M.render();   // UI 按钮路径自带 render；直接调函数要补一次
      var col = App.store.data().memcards.filter(function (c) { return c.name === '📕 错题 · 化学'; })[0];
      ok('M5a 合集建了', !!col);
      eq('M5b 卡里 1 张且正面带题干', col.cards.length === 1 && col.cards[0].front.indexOf('平衡常数计算') >= 0, true);
      ok('M5c 卡带知识点', col.cards[0].front.indexOf('知识点：平衡常数') >= 0);
      ok('M5d 行上标记已转卡', box.innerHTML.indexOf('已转卡') >= 0);
      M.toCard('MK2'); M.render(); // 数学的另一张 → 不同合集
      var colM = App.store.data().memcards.filter(function (c) { return c.name === '📕 错题 · 数学'; })[0];
      ok('M5e 数学合集独立', !!colM && colM.cards.length === 1);

      // 录入弹窗 + 守卫
      M.addModal();
      var m = document.querySelector('#modal-root .modal');
      ok('M6a 弹窗开了', !!m && !!m.querySelector('#mk-desc'));
      m.querySelector('[data-act="ok"]').click();
      eq('M6b 空题被拒', M.D().length, 3);
      m.querySelector('#mk-sub').value = '英语';
      m.querySelector('#mk-desc').value = '完形填空一篇，错 3 个';
      var tm = new Date(); tm.setDate(tm.getDate() + 1);
      var tmk = tm.getFullYear() + '-' + String(tm.getMonth()+1).padStart(2,'0') + '-' + String(tm.getDate()).padStart(2,'0');
      m.querySelector('#mk-date').value = tmk;
      m.querySelector('[data-act="ok"]').click();
      eq('M6c 未来日期被拒', M.D().length, 3);
      m.querySelector('#mk-date').value = App.store.todayKey();
      m.querySelector('[data-act="ok"]').click();
      eq('M6d 收下了（4 道）', M.D().length, 4);
      var mk4 = M.D().filter(function (x) { return x.subject === '英语'; })[0];
      eq('M6e 新题默认 todo', mk4.status === 'todo' && mk4.redos.length === 0, true);

      // 编辑：改状态为 dropped
      M.editModal('MK4' === 'MK4' ? mk4.id : mk4.id);
      m = document.querySelector('#modal-root .modal');
      m.querySelector('#mk-status').value = 'dropped';
      m.querySelector('[data-act="ok"]').click();
      eq('M7 编辑改状态', (M.D().filter(function (x) { return x.id === mk4.id; })[0] || {}).status, 'dropped');

      // 删除 → 回收站 → 恢复（走 UI）
      var nBefore = M.D().length;
      var delBtn = box.querySelector('.mk-row[data-mkid="MK3"] [data-mkact="del"]');
      delBtn.click();
      m = document.querySelector('#modal-root .modal');
      ok('M8a 删除有确认', !!m);
      m.querySelector('[data-act="ok"]').click();
      eq('M8b 删了（3 道）', M.D().length, nBefore - 1);
      ok('M8c 进了回收站', App.store.data().trash.some(function (t) { return t.kind === 'mistake'; }));
      App.app.switchView('tasks');
      var trashBtn = document.querySelector('#task-columns [data-act="trash"]');
      trashBtn.click();
      m = document.querySelector('#modal-root .modal');
      ok('M8d 回收站里能看到 📕 错题', m.innerHTML.indexOf('📕 错题') >= 0);
      var rBtn = m.querySelector('[data-trash-id]');
      rBtn.click();
      eq('M8e 恢复后回到错题本', M.D().length, nBefore);
      App.ui.closeModal();
      App.app.switchView('mistakes');
      ok('M8f MK3 回来了', !!document.querySelector('.mk-row[data-mkid="MK3"]'));
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
