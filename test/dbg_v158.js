/* 调试 v158 ③④：copyTaskToDay 返回什么 / sp 在不在 / schedBadgeHTML 为何空 */
(function () {
  var out = [];
  function waitApp(n, cb) {
    if (window.App && App.store && App.memcards && App.store.data && App.store.data()) return cb();
    if (n <= 0) { out.push('App 没起来'); window.__probeResult = out.join(' | ') + '\n完成'; return; }
    setTimeout(function () { waitApp(n - 1, cb); }, 300);
  }
  waitApp(30, function () {
    var S = App.store, M = App.memcards;
    var today = S.todayKey(), tm = S.tomorrowKey();
    out.push('today=' + today + ' tm=' + tm);
    var c1 = (S.data().memcards || []).filter(function (c) { return c.id === 'c1'; })[0];
    out.push('c1 存在=' + !!c1);
    var u1 = (S.getDay(today).tasks.required || []).filter(function (t) { return t.id === 'u1'; })[0];
    out.push('u1 存在=' + !!u1 + ' sp=' + JSON.stringify(u1 && u1.sp ? '有' : '无'));
    var tmDay = S.getDay(tm);
    out.push('明天 required 条数=' + (tmDay.tasks.required || []).length);
    var okN = App.calendar.copyTaskToDay({ text: '🃏 复习 · 调试副本' }, 'required', tm, '', false, 'required');
    out.push('copyTaskToDay 返回=' + okN);
    out.push('明天此刻条数=' + (S.getDay(tm).tasks.required || []).length);
    var chain = M.schedBadgeHTML('c1');
    out.push('链长度=' + (chain || '').length + ' 内容=' + String(chain).replace(/<[^>]+>/g, ' ').slice(0, 80));
    window.__probeResult = out.join(' | ') + '\n完成';
  });
})();
