// v136 探针：♻ 自动修复顺延丢身份的复习副本（同文字找原任务补回 mode/mcRef/kps/sp）
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
      var y = new Date(); y.setDate(y.getDate() - 2);
      var yk = App.store.dateKey(y);

      // 清场
      ['required', 'ideal', 'extra'].forEach(function (k) {
        var dd = App.store.data().days[tk];
        if (dd) dd.tasks[k] = (dd.tasks[k] || []).filter(function (t) { return String(t.text).indexOf('v136') < 0; });
      });
      App.store.data().memcards = (App.store.data().memcards || []).filter(function (c) { return c.name !== 'v136修复卡'; });

      // 原任务（两天前，带完整身份 + 一条错过轮次）
      var col = { id: 'COLW', name: 'v136修复卡', dayKey: yk, cards: [
        { id: 'CDW1', front: '题面W', back: '答案W', frontImgs: [], backImgs: [] }]};
      App.store.data().memcards.push(col);
      App.store.data().days[yk] = App.store.data().days[yk] || { tasks: { required: [], ideal: [], extra: [] },
        sessions: [], timeline: [], rewards: [], hourPlans: [], activeHourPlan: null, rests: [], activeRest: null,
        plannedHourPlans: [], sports: [], lectures: [], activeLecture: null, ended: false };
      var due1 = Date.now() - 86400000;
      var src = { id: 'PW8', text: '复习 · v136修复探针', mode: 'review', done: false,
        mcRef: { colId: 'COLW', cardIds: null, n: 1 },
        kps: [{ id: 'KW1', q: 'QW', a: 'AW' }],
        sp: { planned: [
          { n: 1, gap: 30, due: due1, done: false, at: null, need: 1, hits: [] }
        ], dl: '', at: Date.now(), bonus: false, cfg: null } };
      App.store.data().days[yk].tasks.required.push(src);

      // 今天的「坏副本」（v135 之前顺延出来的样子：只有名字）
      var broken = { id: 'PB8', text: '复习 · v136修复探针', rolled: true, done: false };
      App.store.getDay(tk).tasks.required.push(broken);
      // 一个健康的副本（不该被动）
      var healthy = { id: 'PH8', text: '复习 · v136健康', rolled: true, mode: 'review', done: false,
        mcRef: { colId: 'COLW', cardIds: null, n: 1 } };
      App.store.getDay(tk).tasks.required.push(healthy);
      App.store.save();

      // 修复
      var n = App.tasks.repairRolledReviews();
      eq('H1 修复了 1 条', n, 1);

      ok('H2 副本拿到 mode', broken.mode === 'review');
      ok('H3 副本拿到 mcRef', !!(broken.mcRef && broken.mcRef.colId === 'COLW'));
      ok('H4 副本拿到 kps', !!(broken.kps && broken.kps.length === 1));
      eq('H5 错过的轮次搬来并重置为待复习', broken.sp && broken.sp.planned.length === 1 && broken.sp.planned[0].done === null, true);
      eq('H6 轮次 due 保持原时间', broken.sp.planned[0].due, due1);
      eq('H7 原任务错过的轮次留作历史（done=false）', src.sp.planned.length === 1 && src.sp.planned[0].done === false, true);
      ok('H8 健康副本没被动', healthy.mode === 'review' && !healthy.kps && !healthy.sp);
      ok('H9 原任务自己的身份没被动', src.mode === 'review' && src.mcRef.colId === 'COLW');

      // 待复习列表里有它
      var pend = App.tasks.srPendingList().filter(function (x) { return x.t.id === 'PB8'; });
      eq('H10 待复习列表恰 1 条', pend.length, 1);

      // 再跑一遍：不重复修、不重复搬
      var n2 = App.tasks.repairRolledReviews();
      eq('H11 再跑不重复修', n2, 0);
      eq('H12 轮次仍是 1 条', broken.sp.planned.length, 1);

      // 行上渲染
      var html = App.tasks.taskRowHTML('required', broken);
      ok('H13 行上有 🔁 复习与圆点', html.indexOf('rev-dots') >= 0);

      // 清理
      App.store.data().days[tk].tasks.required = App.store.data().days[tk].tasks.required.filter(function (t) { return String(t.text).indexOf('v136') < 0; });
      var mc = App.store.data().memcards;
      var ci = mc.indexOf(col); if (ci >= 0) mc.splice(ci, 1);
      delete App.store.data().days[yk];
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
