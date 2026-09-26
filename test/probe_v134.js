// v134 探针：🖼 复习卡片带图（正面图直接显示 / 背面图随答案揭示 / 看图作答兜底）
(function () {
  var out = [], errs = [];
  window.addEventListener('error', function (e) { errs.push(String(e.message)); });
  window.addEventListener('unhandledrejection', function (e) { errs.push('rej:' + e.reason); });
  function ok(name, c, x) { out.push((c ? 'PASS' : 'FAIL') + ' | ' + name + (x !== undefined ? ' | ' + x : '')); }
  function eq(name, a, b) { ok(name, a === b, 'got=' + a + ' want=' + b); }

  var RED = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

  var tries = 0;
  function run() {
    tries++;
    if (!(window.App && App.tasks && App.memcards && App.memcards.imgsHTML)) { if (tries > 100) finish(); else setTimeout(run, 100); return; }
    try {
      var MON = (function(){ var t=new Date(); t.setHours(0,0,0,0); t.setDate(t.getDate()-((t.getDay()+6)%7));
        return t.getFullYear()+'-'+String(t.getMonth()+1).padStart(2,'0')+'-'+String(t.getDate()).padStart(2,'0'); })();
      ok('F0 种子自检', !!(App.store.data().days[MON] && App.store.data().days[MON].tasks.required.length), 'mon=' + MON);

      // 图片池 + 合集 + 任务
      App.memcards.phPut('ppx1', RED);
      var col = { id: 'COLX', name: '复习图测试', subject: '', dayKey: MON, cards: [
        { id: 'CDX1', front: '测试题面：醋酸钠水解', back: '测试答案：水解显碱性', frontImgs: ['ppx1'], backImgs: ['ppx1'] },
        { id: 'CDX2', front: '', back: '', frontImgs: ['ppx1'], backImgs: ['ppx1'] }
      ]};
      App.store.data().memcards = App.store.data().memcards || [];
      App.store.data().memcards.push(col);
      var tk = App.store.todayKey();
      var task = { id: 'PT20', text: '复习图测试任务', mode: 'new', done: false,
        mcRef: { colId: 'COLX', cardIds: null, n: 2 },
        sp: { planned: [{ n: 1, gap: 30, due: Date.now() - 60000, done: null, at: null, need: 1, hits: [] }] } };
      App.store.getDay(tk).tasks.required.push(task);
      App.store.save();

      // 打开复习
      App.tasks.srOpenReview(task, task.sp.planned[0]);
      var m = document.querySelector('#modal-root .modal');
      ok('F1 复习弹窗开了', !!m && m.innerHTML.indexOf('第 1/1 轮') >= 0);

      var qImg = m.querySelector('.rev-kp-q img.mc-img');
      ok('F2 正面图直接显示', !!qImg && qImg.src.indexOf('iVBOR') >= 0);
      eq('F3 两张卡都有正面图', m.querySelectorAll('.rev-kp-q img.mc-img').length, 2);

      var aDiv = m.querySelector('.rev-kp-a[data-ans="0"]');
      ok('F4 背面图在答案里（模糊态）', !!aDiv && aDiv.innerHTML.indexOf('iVBOR') >= 0 && aDiv.classList.contains('hidden-a'));
      ok('F5 看图作答兜底', m.innerHTML.indexOf('看图作答') >= 0 && m.innerHTML.indexOf('看图核对') >= 0);

      // 看答案 → 揭示（模糊移除，图还在）
      m.querySelector('[data-reveal="0"]').click();
      var a2 = m.querySelector('.rev-kp-a[data-ans="0"]');
      ok('F6 揭示后图还在、模糊移除', !!a2 && a2.innerHTML.indexOf('iVBOR') >= 0 && !a2.classList.contains('hidden-a'));

      // 点图放大不报错
      try { qImg.click(); ok('F7 点图放大不报错', !!document.querySelector('.mc-zoomov')); } catch (e) { ok('F7 点图放大', false, String(e.message)); }
      var ov = document.querySelector('.mc-zoomov');
      if (ov) ov.click();

      // 纯文字卡不受影响（回归：无图的卡没有空 img）
      App.ui.closeModal();
      var task2 = { id: 'PT21', text: '纯文字复习', mode: 'new', done: false,
        kps: [{ q: '问题一', a: '答案一' }],
        sp: { planned: [{ n: 1, gap: 30, due: Date.now() - 60000, done: null, at: null, need: 1, hits: [] }] } };
      App.store.getDay(tk).tasks.required.push(task2);
      App.store.save();
      App.tasks.srOpenReview(task2, task2.sp.planned[0]);
      m = document.querySelector('#modal-root .modal');
      eq('F8 纯文字卡没有 img', m.querySelectorAll('.rev-kp img').length, 0);
      ok('F9 纯文字卡内容在', m.innerHTML.indexOf('问题一') >= 0);
      App.ui.closeModal();

      // 清理
      var arr = App.store.data().days[tk].tasks.required;
      [task, task2].forEach(function (x) { var i = arr.indexOf(x); if (i >= 0) arr.splice(i, 1); });
      var mc = App.store.data().memcards;
      mc.splice(mc.indexOf(col), 1);
      App.memcards.phDel('ppx1');
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
