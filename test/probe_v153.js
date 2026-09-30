/* 🧪 v153 探针：复习行翻倍 + 改天把任务吞掉，两个 bug 都要在真页面上验
   坑位提醒：① 只由 cdp-run 注入（页面里不要再引一份）② 结尾必须是「完成」③ 别在收尾后 setTimeout */
(function () {
  var out = [];
  var log = function (s) { out.push(s); };
  var ok = function (name, cond, extra) { log((cond ? '✅ ' : '❌ ') + name + (extra ? ' —— ' + extra : '')); };

  function waitApp(n, cb) {
    if (window.App && App.store && App.memcards && App.queue && App.tasks && App.store.data && App.store.data()) return cb();
    if (n <= 0) { log('❌ App 没起来'); window.__probeResult = out.join('\n') + '\n完成'; return; }
    setTimeout(function () { waitApp(n - 1, cb); }, 300);
  }

  waitApp(40, function () {
    try {
      var S = App.store;
      var d = S.data();
      var today = S.todayKey();
      var tomorrow = S.tomorrowKey();

      // ── 种子：两套卡，今天各两条（一条用户排的 + 一条结算/顺延搬来的，名字都带 🃏 复习 ·）
      d.memcards = [
        { id: 'c1', name: '化学平衡', taskId: null, dayKey: today, cards: [{ id: 'k1', front: 'Q1', back: 'A1' }] },
        { id: 'c2', name: '速率常数', taskId: null, dayKey: today, cards: [{ id: 'k2', front: 'Q2', back: 'A2' }] }
      ];
      var mk = function (id, txt, colId, opt) {
        var t = { id: id, text: txt, mode: 'review', points: 2, mcRef: { colId: colId, n: 1 } };
        if (opt && opt.rolled) t.rolled = true;
        if (opt && opt.slipped) t.mcRef.slippedFrom = '2026-09-27';
        if (opt && opt.done) t.done = true;
        return t;
      };
      var day = S.getDay(today);
      day.tasks.required = [
        mk('a1', '\u{1F0CF} 复习 · 化学平衡', 'c1'),                    // 用户亲手排的
        mk('a2', '\u{1F0CF} 复习 · 化学平衡', 'c1', { rolled: true }),  // 结算搬来的（重复）
        mk('a3', '\u{1F0CF} 复习 · 化学平衡', 'c1', { slipped: 1 }),    // 顺延来的（重复）
        mk('b1', '\u{1F0CF} 复习 · 速率常数', 'c2'),
        mk('b2', '\u{1F0CF} 复习 · 速率常数', 'c2', { slipped: 1 }),
        mk('z9', '做一套化学卷', null)                                   // 普通任务，绝不能被碰
      ];
      S.save();

      var before = S.getDay(today).tasks.required.length;

      // ── T1：去重 —— 每套卡只留一条，且留"用户亲手排的"
      var n1 = App.memcards.dedupeReviewDupes();
      var arr = S.getDay(today).tasks.required;
      var c1s = arr.filter(function (t) { return t.mcRef && t.mcRef.colId === 'c1'; });
      var c2s = arr.filter(function (t) { return t.mcRef && t.mcRef.colId === 'c2'; });
      ok('T1 去重条数', n1 === 3, '清掉 ' + n1 + ' 条（应 3）');
      ok('T1 化学平衡只剩 1 条', c1s.length === 1, '剩 ' + c1s.length + ' 条');
      ok('T1 留下的是用户亲手排的', c1s.length === 1 && c1s[0].id === 'a1', c1s.length ? '留下 ' + c1s[0].id : '');
      ok('T1 速率常数只剩 1 条', c2s.length === 1 && c2s[0].id === 'b1', c2s.length ? '留下 ' + c2s[0].id : '');
      ok('T1 普通任务没被碰', arr.filter(function (t) { return t.id === 'z9'; }).length === 1);

      // ── T2：改天 → 目标日已有同名，任务绝不能消失
      S.getDay(tomorrow).tasks.required = [mk('m1', '\u{1F0CF} 复习 · 速通', 'c2')];
      var todayArr = S.getDay(today).tasks.required;
      todayArr.push(mk('t2', '\u{1F0CF} 复习 · 速通', 'c2'));
      S.save();
      var totalBefore = 0;
      Object.keys(S.data().days).forEach(function (k) {
        ['required', 'ideal', 'extra'].forEach(function (c) {
          (S.data().days[k].tasks[c] || []).forEach(function (t) {
            if (/速通/.test(String(t.text || ''))) totalBefore++;
          });
        });
      });
      try { App.tasks.moveTaskDayDo('required', today, 't2', tomorrow); } catch (e) { log('⚠️ moveTaskDayDo 抛错：' + e.message); }
      var totalAfter = 0, onTarget = 0;
      Object.keys(S.data().days).forEach(function (k) {
        ['required', 'ideal', 'extra'].forEach(function (c) {
          (S.data().days[k].tasks[c] || []).forEach(function (t) {
            if (/速通/.test(String(t.text || ''))) { totalAfter++; if (k === tomorrow) onTarget++; }
          });
        });
      });
      ok('T2 任务没被吞（前后都在）', totalAfter >= 1 && onTarget >= 1,
        '改天前 ' + totalBefore + ' 条 → 改天后 ' + totalAfter + ' 条（目标日 ' + onTarget + '）');

      // ── T3：收走顺延来的（只动带 ↷ 的）
      S.getDay(today).tasks.required = [
        mk('u1', '\u{1F0CF} 复习 · 我自己排的', 'c1'),
        mk('u2', '\u{1F0CF} 复习 · 顺延来的A', 'c1', { slipped: 1 }),
        mk('u3', '\u{1F0CF} 复习 · 结算搬来的B', 'c2', { rolled: true }),
        mk('u4', '\u{1F0CF} 复习 · 自己做完了', 'c2', { done: 1 })
      ];
      S.save();
      var n3 = App.memcards.dropRolledReviews();
      var a3 = S.getDay(today).tasks.required;
      ok('T3 收走 2 条顺延', n3 === 2, '收走 ' + n3 + ' 条');
      ok('T3 亲手排的还在', a3.filter(function (t) { return t.id === 'u1'; }).length === 1);
      ok('T3 做完的不动', a3.filter(function (t) { return t.id === 'u4'; }).length === 1);

      // ── T4：队列页渲染时自动去重（卡片页不开也得兜住）
      S.getDay(today).tasks.required = [
        mk('q1', '\u{1F0CF} 复习 · 卡片页没开', 'c1'),
        mk('q2', '\u{1F0CF} 复习 · 卡片页没开', 'c1', { rolled: true })
      ];
      S.save();
      try { App.queue.render(); } catch (e) { log('⚠️ queue.render 抛错：' + e.message); }
      var a4 = S.getDay(today).tasks.required;
      ok('T4 队列渲染自动去重', a4.filter(function (t) { return t.mcRef && t.mcRef.colId === 'c1'; }).length === 1,
        '剩 ' + a4.filter(function (t) { return t.mcRef && t.mcRef.colId === 'c1'; }).length + ' 条');

      log('（种子初始 ' + before + ' 条 → 现在 ' + a4.length + ' 条）');
    } catch (e) {
      log('❌ 探针异常：' + (e && e.message) + '\n' + (e && e.stack || '').split('\n').slice(0, 3).join(' | '));
    }
    window.__probeResult = out.join('\n') + '\n完成';
  });
})();
