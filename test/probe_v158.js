/* 🧪 v158 探针：排到某天却没显示的两个洞
   ① 用户自己排的两遍（无系统标记）→ 去重不误删
   ② rolled + clean → 去重留 clean
   ③ 同名自动改「（第2份）」照样排得进去
   ④ 排期链能显示排过的日子 */
(function () {
  var out = [];
  var log = function (s) { out.push(s); };
  var ok = function (n, c, x) { log((c ? '✅ ' : '❌ ') + n + (x ? ' —— ' + x : '')); };
  function waitApp(n, cb) {
    if (window.App && App.store && App.memcards && App.store.data && App.store.data()) return cb();
    if (n <= 0) { log('❌ App 没起来'); window.__probeResult = out.join('\n') + '\n完成'; return; }
    setTimeout(function () { waitApp(n - 1, cb); }, 300);
  }
  waitApp(40, function () {
    try {
      var S = App.store, M = App.memcards;
      var today = S.todayKey();
      var tm = S.tomorrowKey();
      S.data().memcards = [{ id: 'c1', name: '实验装置连接设计', dayKey: today, cards: [{ id: 'k1', front: 'Q', back: 'A' }] }];
      var mk = function (id, txt, opt) {
        var t = { id: id, text: txt, mode: 'review', points: 2, mcRef: { colId: 'c1', n: 1 } };
        if (opt && opt.rolled) t.rolled = true;
        if (opt && opt.sp) t.sp = { planned: [{ n: 1, gap: 60, due: Date.now() + 3600000, done: null, at: null, need: 1, hits: [] }], at: Date.now() };
        if (opt && opt.slip) t.mcRef.slippedFrom = '2026-09-29';
        return t;
      };
      S.getDay(tm).tasks.required = [];   // 清明天（防上一轮残留）
      // ① 两条都是用户排的 → 保留
      S.getDay(today).tasks.required = [mk('u1', '\u{1F0CF} 复习 · 实验装置连接设计', { sp: 1 }), mk('u2', '\u{1F0CF} 复习 · 实验装置连接设计')];
      S.save();
      var n1 = M.dedupeReviewDupes();
      var arr1 = S.getDay(today).tasks.required;
      ok('① 用户排的两遍不误删', n1 === 0 && arr1.length === 2, '清 ' + n1 + ' 条，剩 ' + arr1.length);

      // ② rolled + clean → 留 clean
      arr1.push(mk('u3', '\u{1F0CF} 复习 · 实验装置连接设计', { rolled: 1 }));
      S.save();
      var n2 = M.dedupeReviewDupes();
      var ids = S.getDay(today).tasks.required.map(function (t) { return t.id; });
      ok('② 系统副本参与合并（留干净的）', n2 === 1 && ids.indexOf('u1') >= 0 && ids.indexOf('u3') < 0, '清 ' + n2 + ' 条，剩 ' + ids.join(','));

      // ③ 同名自动改（第2份）
      var nm2 = M.schedCopyName(today, '\u{1F0CF} 复习 · 量气管原理');
      ok('③ 无同名 → 原名', nm2.indexOf('第2份') < 0, nm2);
      var nm3 = M.schedCopyName(today, '\u{1F0CF} 复习 · 实验装置连接设计');
      ok('③ 有同名 → 第2份', nm3.indexOf('第2份') >= 0, nm3);
      var okN = App.calendar.copyTaskToDay({ text: nm3 }, 'required', tm, '', false, 'required');
      ok('③ 改名后照样排得进去', okN === true && S.getDay(tm).tasks.required.some(function (t) { return t.text === nm3; }));

      // ④ 排期链显示排过的日子
      var chain = M.schedBadgeHTML('c1');
      ok('④ 排期链非空（排过的看得见）', !!chain && chain.length > 20, '长度 ' + (chain || '').length);
      log('（链内容 ' + String(chain).replace(/<[^>]+>/g, ' ').slice(0, 60) + '…）');
    } catch (e) {
      log('❌ 探针异常：' + (e && e.message) + '\n' + String(e && e.stack || '').split('\n').slice(0, 3).join(' | '));
    }
    window.__probeResult = out.join('\n') + '\n完成';
  });
})();
