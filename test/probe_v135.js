// v135 探针：复习任务跨天不丢身份（rollover 带mode/mcRef/kps/sp + 错过轮次重置 + copyTaskToDay 带身份）
(function () {
  var out = [], errs = [];
  window.addEventListener('error', function (e) { errs.push(String(e.message)); });
  window.addEventListener('unhandledrejection', function (e) { errs.push('rej:' + e.reason); });
  function ok(name, c, x) { out.push((c ? 'PASS' : 'FAIL') + ' | ' + name + (x !== undefined ? ' | ' + x : '')); }
  function eq(name, a, b) { ok(name, a === b, 'got=' + a + ' want=' + b); }

  var tries = 0;
  function run() {
    tries++;
    if (!(window.App && App.tasks && App.tasks.settleDayCore)) { if (tries > 100) finish(); else setTimeout(run, 100); return; }
    try {
      var tk = App.store.todayKey();
      var y = new Date(); y.setDate(y.getDate() - 1);
      var yk = App.store.dateKey(y);

      // ---- 先清场（同 profile 里前几次运行的残留会被自动结算再滚一次，污染计数）----
      delete App.store.data().days[yk];
      var fk0 = (function(){ var f=new Date(); f.setDate(f.getDate()+3); return App.store.dateKey(f); })();
      ['required','ideal','extra'].forEach(function (k) {
        [tk, fk0].forEach(function (dk) {
          var dd = App.store.data().days[dk];
          if (dd) dd.tasks[k] = (dd.tasks[k] || []).filter(function (t) { return String(t.text).indexOf('v135') < 0; });
        });
      });
      App.store.data().memcards = (App.store.data().memcards || []).filter(function (c) { return c.name !== 'v135探针卡'; });
      App.store.save();

      // ---- 造昨天的复习任务（结算后的状态：r1 错过 done=false；r2 未来 done=null）----
      var col = { id: 'COLV', name: 'v135探针卡', dayKey: yk, cards: [
        { id: 'CDV1', front: '题面V', back: '答案V', frontImgs: [], backImgs: [] }]};
      App.store.data().memcards = App.store.data().memcards || [];
      App.store.data().memcards.push(col);
      var due1 = Date.now() - 26 * 3600000;
      var due2 = Date.now() + 2 * 86400000;
      var task = { id: 'PV9', text: '复习 · v135探针', mode: 'review', done: false,
        mcRef: { colId: 'COLV', cardIds: null, n: 1 },
        kps: [{ id: 'KV1', q: '问题V', a: '答案V' }],
        sp: { planned: [
          { n: 1, gap: 30, due: due1, done: false, at: null, need: 1, hits: [] },
          { n: 2, gap: 1440, due: due2, done: null, at: null, need: 1, hits: [] }
        ], dl: '', at: Date.now(), bonus: false, cfg: null } };
      App.store.data().days[yk] = App.store.data().days[yk] || { tasks: { required: [], ideal: [], extra: [] },
        sessions: [], timeline: [], rewards: [], hourPlans: [], activeHourPlan: null, rests: [],
        activeRest: null, plannedHourPlans: [], sports: [], lectures: [], activeLecture: null, ended: false };
      App.store.data().days[yk].tasks.required.push(task);
      App.store.save();

      // ---- 结算昨天（rollAll 全部顺延）----
      App.tasks.settleDayCore(App.store.getDay(yk), yk, { rollAll: true });

      // ---- 今天必须栏里应有带身份的副本 ----
      var copies = App.store.getDay(tk).tasks.required.filter(function (t) { return t.text === '复习 · v135探针'; });
      ok('G1 顺延副本到了今天', copies.length >= 1, 'n=' + copies.length);
      var cp = copies[copies.length - 1];
      eq('G2 副本 mode=review', cp.mode, 'review');
      ok('G3 mcRef 跟着搬', cp.mcRef && cp.mcRef.colId === 'COLV');
      ok('G4 kps 跟着搬', !!(cp.kps && cp.kps.length === 1));
      eq('G5 副本轮次数 = 2（错过+未来）', cp.sp && cp.sp.planned.length, 2);
      eq('G6 错过的轮次重置为待复习', cp.sp.planned[0].done, null);
      eq('G6b 错过轮次的 due 保持原时间（显示已过期）', cp.sp.planned[0].due, due1);
      eq('G7 未来轮次原样', cp.sp.planned[1].due, due2);
      eq('G8 原任务历史不动（r1 仍 done=false）', task.sp.planned[0].done, false);

      // ---- 待复习列表里有它（只算一次）----
      var pend = App.tasks.srPendingList().filter(function (x) { return x.t.text === '复习 · v135探针'; });
      eq('G9 待复习列表恰 2 条（错过的+未来的，只挂在副本上）', pend.length, 2);

      // ---- 行上渲染出复习标记 ----
      var html = App.tasks.taskRowHTML('required', cp);
      ok('G10 行上渲染 🔁 复习标签', html.indexOf('复习') >= 0 && html.indexOf('rev-dots') >= 0);

      // ---- copyTaskToDay 带身份 ----
      var fut = new Date(); fut.setDate(fut.getDate() + 3);
      var fk = App.store.dateKey(fut);
      var src = { id: 'PVS', text: '复习 · v135转移', mode: 'review', done: false,
        mcRef: { colId: 'COLV', cardIds: null, n: 1 },
        kps: [{ id: 'KV2', q: 'Q', a: 'A' }] };
      App.calendar.copyTaskToDay(src, 'required', fk, null, false, 'required');
      var ft = App.store.getDay(fk).tasks.required.filter(function (t) { return t.text === '复习 · v135转移'; })[0];
      ok('G11 转移副本带 mode+mcRef+kps', !!ft && ft.mode === 'review' && ft.mcRef && ft.mcRef.colId === 'COLV' && ft.kps && ft.kps.length === 1);
      ok('G12 sp 不搬（留在原任务上）', !ft.sp);

      // ---- 清理 ----
      delete App.store.data().days[yk];
      var arr = App.store.getDay(tk).tasks.required;
      [cp].concat(copies).forEach(function (x) { var i = arr.indexOf(x); if (i >= 0 && i >= 0) { } });
      App.store.data().days[tk].tasks.required = arr.filter(function (t) { return t.text.indexOf('v135') < 0; });
      App.store.data().days[fk] && (App.store.data().days[fk].tasks.required = App.store.data().days[fk].tasks.required.filter(function (t) { return t.text.indexOf('v135') < 0; }));
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
