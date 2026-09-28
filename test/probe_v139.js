// v139 探针：顺延只带没做完的 + copyTaskToDay 只带没做完 + 今天的复习行 📅 重新定日期
(function () {
  var out = [], errs = [];
  window.addEventListener('error', function (e) { errs.push(String(e.message)); });
  window.addEventListener('unhandledrejection', function (e) { errs.push('rej:' + e.reason); });
  function ok(name, c, x) { out.push((c ? 'PASS' : 'FAIL') + ' | ' + name + (x !== undefined ? ' | ' + x : '')); }
  function eq(name, a, b) { ok(name, a === b, 'got=' + a + ' want=' + b); }

  var tries = 0;
  function run() {
    tries++;
    if (!(window.App && App.tasks && App.tasks.settleDayCore && App.calendar)) { if (tries > 100) finish(); else setTimeout(run, 100); return; }
    try {
      var tk = App.store.todayKey();
      var y = new Date(); y.setDate(y.getDate() - 1);
      var yk = App.store.dateKey(y);
      var fut = new Date(); fut.setDate(fut.getDate() + 3);
      var fk = App.store.dateKey(fut);

      // 清场
      App.store.data().days[yk] = { tasks: { required: [], ideal: [], extra: [] }, sessions: [], timeline: [], rewards: [], hourPlans: [], activeHourPlan: null, rests: [], activeRest: null, plannedHourPlans: [], sports: [], lectures: [], activeLecture: null, ended: false };
      App.store.data().days[tk].tasks.required = (App.store.data().days[tk].tasks.required || []).filter(function (t) { return String(t.text).indexOf('v139') < 0; });
      App.store.data().days[fk] = App.store.data().days[fk] || { tasks: { required: [], ideal: [], extra: [] }, sessions: [], timeline: [], rewards: [], hourPlans: [], activeHourPlan: null, rests: [], activeRest: null, plannedHourPlans: [], sports: [], lectures: [], activeLecture: null, ended: false };
      App.store.data().days[fk].tasks.required = [];
      App.store.data().memcards = (App.store.data().memcards || []).filter(function (c) { return c.name !== 'v139卡'; });
      App.store.save();

      // ---- 1) rollover 只带没做完的小题 ----
      var partial = { id: 'P1', text: 'v139 部分组', done: false, subs: [
        { id: 'S1', text: '已完成1', done: true },
        { id: 'S2', text: '没做1', done: null },
        { id: 'S3', text: '没做2', done: null }] };
      var allDone = { id: 'P2', text: 'v139 全做组', done: false, subs: [
        { id: 'S4', text: '已完成', done: true }] };
      App.store.data().days[yk].tasks.required.push(partial, allDone);
      App.store.save();
      App.tasks.settleDayCore(App.store.getDay(yk), yk, { rollAll: true });
      var copies = App.store.getDay(tk).tasks.required.filter(function (t) { return String(t.text).indexOf('v139') >= 0; });
      ok('R1 部分组顺延了', copies.some(function (c) { return c.text === 'v139 部分组'; }));
      var pc = copies.filter(function (c) { return c.text === 'v139 部分组'; })[0];
      eq('R2 只带没做完的 2 个小题', pc.subs ? pc.subs.length : -1, 2);
      ok('R3 不带已完成的', pc.subs.every(function (s) { return s.text !== '已完成1'; }));
      ok('R4 全做组不顺延', !copies.some(function (c) { return c.text === 'v139 全做组'; }));

      // ---- 2) copyTaskToDay 只带没做完 ----
      App.store.data().days[fk].tasks.required = [];
      var okM = App.calendar.copyTaskToDay(
        { text: 'v139 复制组', subs: [
          { id: 'X1', text: '做完', done: true },
          { id: 'X2', text: '没做', done: null } ] },
        'required', fk, '', true, 'required');
      ok('C1 复制成功', okM);
      var cp = App.store.getDay(fk).tasks.required.filter(function (t) { return t.text === 'v139 复制组'; })[0];
      eq('C2 只带没做完的 1 个', cp.subs ? cp.subs.length : -1, 1);
      ok('C3 不带已完成的', cp.subs.every(function (s) { return s.text !== '做完'; }));

      // 全做完 → 保留全部（整体重做）
      App.store.data().days[fk].tasks.required = [];
      App.calendar.copyTaskToDay({ text: 'v139 全做重做', subs: [{ id: 'Y1', text: '做完A', done: true }] }, 'required', fk, '', true, 'required');
      var cp2 = App.store.getDay(fk).tasks.required.filter(function (t) { return t.text === 'v139 全做重做'; })[0];
      eq('C4 全做完时保留全部（重做）', cp2.subs ? cp2.subs.length : -1, 1);

      // ---- 3) 今天的复习行 📅 重新定日期 ----
      App.store.data().memcards.push({ id: 'COL139', name: 'v139卡', dayKey: tk, cards: [
        { id: 'CD1', front: '题', back: '答', frontImgs: [], backImgs: [] }]});
      var review = { id: 'RV1', text: 'v139 复习', mode: 'review', done: false,
        mcRef: { colId: 'COL139', cardIds: null, n: 1 },
        sp: { planned: [{ n: 1, gap: 30, due: Date.now() - 60000, done: null, at: null, need: 1, hits: [] }], dl: '', at: Date.now(), bonus: false, cfg: null } };
      App.store.getDay(tk).tasks.required.push(review);
      App.store.save();
      App.app.switchView('queue');
      var qv = document.getElementById('queue-view');
      var btn = qv.querySelector('[data-act="qrev-date"][data-id="RV1"]');
      ok('D1 📅 按钮在', !!btn);
      btn.click();
      // 📅 实际复用 tasks.js 的 moveTaskDayModal（#mvd-date 输入框 + mvd-ok 确认）
      var mvd = document.getElementById('mvd-date');
      ok('D2 改日期弹窗开了', !!mvd);
      if (mvd) {
        mvd.value = fk;
        var okBtn = document.querySelector('[data-act="mvd-ok"]');
        ok('D2b 找到 mvd-ok', !!okBtn);
        if (okBtn) okBtn.click();
      }
      ok('D3 今天没了', !App.store.getDay(tk).tasks.required.some(function (t) { return t.id === 'RV1'; }));
      var nt = App.store.getDay(fk).tasks.required.filter(function (t) { return t.text === 'v139 复习'; })[0];
      ok('D4 搬到了目标日', !!nt);
      ok('D5 身份跟着走', nt.mode === 'review' && nt.mcRef && nt.mcRef.colId === 'COL139');
      ok('D6 复习计划跟着走', !!(nt.sp && nt.sp.planned && nt.sp.planned.length === 1));

      // 清理
      App.store.data().days[tk].tasks.required = App.store.data().days[tk].tasks.required.filter(function (t) { return String(t.text).indexOf('v139') < 0; });
      delete App.store.data().days[yk];
      App.store.data().days[fk] && (App.store.data().days[fk].tasks.required = []);
      App.store.data().memcards = App.store.data().memcards.filter(function (c) { return c.name !== 'v139卡'; });
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
