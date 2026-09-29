// v152 探针：🌱 复习记录大改（原定→实际句式 / 轮次去重计数 / 待复习提醒去重）
(function () {
  var out = [], errs = [];
  window.addEventListener('error', function (e) { errs.push(String(e.message)); });
  window.addEventListener('unhandledrejection', function (e) { errs.push('rej:' + e.reason); });
  function ok(name, c, x) { out.push((c ? 'PASS' : 'FAIL') + ' | ' + name + (x !== undefined ? ' | ' + x : '')); }
  function eq(name, a, b) { ok(name, a === b, 'got=' + a + ' want=' + b); }

  var tries = 0;
  function run() {
    tries++;
    if (!(window.App && App.tasks && App.memcards)) { if (tries > 100) finish(); else setTimeout(run, 100); return; }
    try {
      var tk = App.store.todayKey();
      // 清场
      App.store.data().days[tk].tasks.required = (App.store.data().days[tk].tasks.required || [])
        .filter(function (t) { return String(t.text).indexOf('v152') < 0; });
      App.store.data().memcards = (App.store.data().memcards || []).filter(function (c) { return c.name !== 'v152卡'; });

      // ---- 1) revDotsHTML：原定≠实际 → 两个日期；原定=实际 → 一个 ----
      var t1 = { id: 'T152a', text: 'v152 复习A', mode: 'review', done: false,
        sp: { planned: [
          { n: 1, gap: 30, due: Date.now() - 2 * 86400000, done: true, at: Date.now() - 1 * 86400000,
            need: 1, hits: [Date.now() - 1 * 86400000], result: 'no' },
          { n: 2, gap: 1440, due: Date.now() + 5 * 86400000, done: null, at: null, need: 1, hits: [] }
        ], dl: '', at: Date.now(), bonus: false, cfg: null } };
      App.store.getDay(tk).tasks.required.push(t1);
      App.store.save();
      var html = App.tasks.taskRowHTML('required', t1);
      ok('S1 出现「原定」', html.indexOf('原定') >= 0);
      ok('S2 原定≠实际 → 「→ 实际」', html.indexOf('→ 实际') >= 0);
      ok('S3 下一次：原定', html.indexOf('下一次：原定') >= 0);
      ok('S4 旧文案已死（没有「已复习 N 次」）', html.indexOf('已复习') < 0);
      ok('S5 没写出来标注', html.indexOf('没写出来') >= 0);

      // 原定=实际 → 只有一个日期
      var t2 = { id: 'T152b', text: 'v152 复习B', mode: 'review', done: false,
        sp: { planned: [{ n: 1, gap: 30, due: Date.now() - 86400000, done: true, at: Date.now() - 86400000,
          need: 1, hits: [Date.now() - 86400000], result: 'ok' }], dl: '', at: Date.now(), bonus: false, cfg: null } };
      App.store.getDay(tk).tasks.required.push(t2);
      App.store.save();
      var html2 = App.tasks.taskRowHTML('required', t2);
      var seg = html2.split('第1次')[1] || '';
      ok('S6 原定=实际 → 只有一个日期（没有 → 实际）', seg.indexOf('→ 实际') < 0 && seg.indexOf('✓') >= 0);

      // ---- 2) schedBadgeHTML：两个载体重复的同轮次 → 只算一次 ----
      App.store.data().memcards.push({ id: 'COL152', name: 'v152卡', dayKey: tk, cards: [
        { id: 'CD1', front: '题', back: '答', frontImgs: [], backImgs: [] }]});
      var dueY = Date.now() - 86400000, dueF = Date.now() + 6 * 86400000;
      // 两个不同任务（原任务+顺延副本）挂着同一套卡，轮次重复
      var ra = { id: 'R152a', text: 'v152 复习C', mode: 'review', done: false,
        mcRef: { colId: 'COL152', cardIds: null, n: 1 },
        sp: { planned: [
          { n: 1, gap: 30, due: dueY, done: true, at: dueY + 3600000, need: 1, hits: [dueY + 3600000], result: 'ok' },
          { n: 2, gap: 1440, due: dueF, done: null, at: null, need: 1, hits: [] }], dl: '', at: Date.now(), bonus: false, cfg: null } };
      var rb = { id: 'R152b', text: 'v152 复习C', mode: 'review', done: false, rolled: true,
        mcRef: { colId: 'COL152', cardIds: null, n: 1 },
        sp: { planned: [
          { n: 2, gap: 1440, due: dueF, done: null, at: null, need: 1, hits: [] }], dl: '', at: Date.now(), bonus: false, cfg: null } };
      App.store.getDay(tk).tasks.required.push(ra, rb);
      App.store.save();
      var badge = App.memcards.schedBadgeHTML('COL152');
      ok('S7 出现「复习 1 次」（重复轮次去重）', badge.indexOf('复习 1 次') >= 0, badge.slice(0, 80));
      ok('S8 出现「下一次：原定」', badge.indexOf('下一次：原定') >= 0);
      ok('S9 不再出现「都做完啦」', badge.indexOf('都做完啦') < 0);

      // ---- 3) srPendingList：同任务同原定日 → 只提醒一次 ----
      var pend = App.tasks.srPendingList().filter(function (x) { return x.t.text === 'v152 复习C'; });
      eq('S10 待复习提醒恰 1 条（两个载体去重）', pend.length, 1);

      // 清理
      App.store.data().days[tk].tasks.required = App.store.data().days[tk].tasks.required
        .filter(function (t) { return String(t.text).indexOf('v152') < 0; });
      App.store.data().memcards = App.store.data().memcards.filter(function (c) { return c.name !== 'v152卡'; });
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
