/* 🧪 v157 探针：欠的复习不再自动塞进今天。
   ① sweep 不搬  ② 欠的列得出来  ③ 汇总条出现  ④ 搬进来才算数  ⑤ 不做了=superseded  ⑥ 结算不滚 mcRef  ⑦ 翻过卡=补勾 */
(function () {
  var out = [];
  var log = function (s) { out.push(s); };
  var ok = function (n, c, x) { log((c ? '✅ ' : '❌ ') + n + (x ? ' —— ' + x : '')); };
  function waitApp(n, cb) {
    if (window.App && App.store && App.memcards && App.tasks && App.store.data && App.store.data()) return cb();
    if (n <= 0) { log('❌ App 没起来'); window.__probeResult = out.join('\n') + '\n完成'; return; }
    setTimeout(function () { waitApp(n - 1, cb); }, 300);
  }
  waitApp(40, function () {
    try {
      var S = App.store, M = App.memcards, T = App.tasks;
      var today = S.todayKey();
      var y = new Date(); y.setDate(y.getDate() - 1);
      var yKey = S.dateKey(y);
      // 种子：两套卡 + 昨天两条没做的复习（c2 那套昨天翻过）
      S.data().memcards = [
        { id: 'c1', name: '平衡图像', dayKey: yKey, cards: [{ id: 'k1', front: 'Q1', back: 'A1' }] },
        { id: 'c2', name: '速率常数', dayKey: yKey, cards: [{ id: 'k2', front: 'Q2', back: 'A2' }], lastFlipDay: yKey }
      ];
      S.data().days[yKey] = S.getDay(yKey);
      S.data().days[yKey].ended = false;
      S.data().days[yKey].tasks.required = [
        { id: 'o1', text: '🃏 复习 · 平衡图像', mode: 'review', mcRef: { colId: 'c1', n: 1 } },
        { id: 'o2', text: '🃏 复习 · 速率常数', mode: 'review', mcRef: { colId: 'c2', n: 1 } }
      ];
      S.getDay(today).tasks.required = [];
      S.save();

      // ⑦+sweep：跑一遍 —— o2（翻过）补勾；o1 不搬、留在昨天
      var r1 = M.mcSweepOverdue();
      var yArr = S.getDay(yKey).tasks.required;
      var o1 = yArr.filter(function (t) { return t.id === 'o1'; })[0];
      var o2 = yArr.filter(function (t) { return t.id === 'o2'; })[0];
      ok('⑦ 翻过卡的补勾补分', o2 && o2.done === true && r1.fixed >= 1);
      ok('① 没做的不再搬进今天', !!o1 && o1.done !== true && o1.mcRef.superseded !== true &&
         S.getDay(today).tasks.required.filter(function (t) { return t.id === 'o1'; }).length === 0);

      // ② 欠的列得出来（只剩 o1，o2 已补勾）
      var od = M.overdueReviews();
      ok('② 欠的列得出来', od.length === 1 && od[0].t.id === 'o1', '欠 ' + od.length + ' 条');

      // ③ 汇总条出现
      try { if (App.queue && App.queue.render) App.queue.render(); } catch (e) {}
      ok('③ 队列页有汇总条', document.body.innerHTML.indexOf('之前欠的复习还有') >= 0);
      ok('③ 今天清单还是空的', S.getDay(today).tasks.required.filter(function (t) { return t.mcRef; }).length === 0);

      // ④ 搬进来才算数
      var n1 = M.moveOverdueIntoToday();
      var moved = S.getDay(today).tasks.required.filter(function (t) { return t.id === 'o1'; })[0];
      ok('④ 搬进来才算数', n1 === 1 && !!moved && moved.mcRef.slippedFrom === yKey);
      ok('④ 搬完欠账清零', M.overdueReviews().length === 0);

      // ⑤ 再种一条欠的 → 不做了 = superseded
      yArr.push({ id: 'o3', text: '🃏 复习 · 平衡图像2', mode: 'review', mcRef: { colId: 'c1', n: 1 } });
      S.save();
      var n2 = M.dropOverdueReviews();
      var o3 = yArr.filter(function (t) { return t.id === 'o3'; })[0];
      ok('⑤ 不做了 = 标记取消', n2 >= 1 && o3 && o3.mcRef.superseded === true);

      // ⑥ 结算不滚 mcRef：昨天再放一条没做的 → 结算昨天 → 今天不出现
      var t6 = { id: 'o4', text: '🃏 复习 · 结算测试', mode: 'review', mcRef: { colId: 'c1', n: 1 } };
      yArr.push(t6);
      var yday = S.getDay(yKey);
      yday.ended = false;
      S.save();
      try { T.settleDayCore(yday, yKey, { rollAll: true }); } catch (e) { log('⚠️ settle 异常：' + e.message); }
      ok('⑥ 结算不把复习滚进今天', S.getDay(today).tasks.required.filter(function (t) { return t.id === 'o4'; }).length === 0);
      log('（欠账现存 ' + M.overdueReviews().length + ' 条待用户处理）');
    } catch (e) {
      log('❌ 探针异常：' + (e && e.message) + '\n' + String(e && e.stack || '').split('\n').slice(0, 3).join(' | '));
    }
    window.__probeResult = out.join('\n') + '\n完成';
  });
})();
