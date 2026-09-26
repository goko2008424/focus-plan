// v130 探针：🏆 年度学习报告（yearAgg 口径 + PNG 跑通 + 按钮在）
(function () {
  var out = [], errs = [];
  window.addEventListener('error', function (e) { errs.push(String(e.message)); });
  window.addEventListener('unhandledrejection', function (e) { errs.push('rej:' + e.reason); });
  function ok(name, c, x) { out.push((c ? 'PASS' : 'FAIL') + ' | ' + name + (x !== undefined ? ' | ' + x : '')); }
  function eq(name, a, b) { ok(name, a === b, 'got=' + a + ' want=' + b); }

  var tries = 0;
  function run() {
    tries++;
    if (!(window.App && App.stats && App.stats.yearAgg)) { if (tries > 100) finish(); else setTimeout(run, 100); return; }
    try {
      var MON = (function(){ var t=new Date(); t.setHours(0,0,0,0); t.setDate(t.getDate()-((t.getDay()+6)%7));
        return t.getFullYear()+'-'+String(t.getMonth()+1).padStart(2,'0')+'-'+String(t.getDate()).padStart(2,'0'); })();
      ok('Y0 种子自检', !!(App.store.data().days[MON] && App.store.data().days[MON].tasks.required.length), 'mon=' + MON);

      var a = App.stats.yearAgg();
      eq('Y1 计时专注 175（未来 500 不算）', a.focus, 175);
      eq('Y2 学习+拓展 110', a.study + a.extend, 110);
      ok('Y3 任务完成 6（种子 6 个 done）· 总数>=7（未完成的随 rollover 复制 +1，真实行为）', a.taskDone === 6 && a.taskTotal >= 7, 'got=' + a.taskDone + '/' + a.taskTotal);
      eq('Y4 复习 2 轮', a.revDone, 2);
      eq('Y4b 写出来 1 · 没写出来 1', a.revOk + '/' + a.revNo, '1/1');
      eq('Y5 打卡 3 天', a.ckDays, 3);
      ok('Y6 花扣 30 · 得分>=15（自动结算会给过去的日子补发奖励，是真实行为）', a.spent === 30 && a.earned >= 15, 'got=' + a.earned + '/' + a.spent);
      var mSum = 0; Object.keys(a.months).forEach(function (k) { mSum += a.months[k]; });
      eq('Y7 逐月合计 110', mSum, 110);
      eq('Y8a 学科总时长 175', a.subjects.total, 175);
      eq('Y8b 第一名 化学', a.subjects.list[0] && a.subjects.list[0].name, '化学');
      eq('Y9 错题 3 收 1 巩固 · 考试 4 次', a.mistTotal + '/' + a.mistMastered + '/' + a.examN, '3/1/4');
      ok('Y10 最猛的一天存在（60 分）', a.bestDay && a.bestMin === 60, 'best=' + a.bestDay);

      App.app.switchView('stats');
      ok('Y11 年度报告按钮在', !!document.getElementById('rv-year'));
      try { App.stats.yearReportPNG(); ok('Y12 长图跑通', true); }
      catch (e) { ok('Y12 长图跑通', false, String(e.message)); }
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
