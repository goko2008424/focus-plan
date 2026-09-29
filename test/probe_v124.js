// v124 探针（日期自适版）：复盘看板数据口径 —— 期望值按「哪些种子日 ≤ 今天」动态推导
// 种子（test/build_t124.js 动态生成）：K0=化学45@21:00+时间轴30 / K1=数学60@14:00 / K2=物理30@22:30 / K3=化学25@9:00+英语15@23:00+时间轴20
//   打卡 K0,K1,K3 · 账本 K1(+10) K2(-30) K3(+5) · 未来日 = 今天+4（永远不被统计）
//   周一刚过（今天=周一/周二）时，K2/K3 落在未来 → 应用**正确地**不统计，期望值随之变小。
(function () {
  var out = [], errs = [];
  window.addEventListener('error', function (e) { errs.push(String(e.message)); });
  window.addEventListener('unhandledrejection', function (e) { errs.push('rej:' + e.reason); });
  function ok(name, c, x) { out.push((c ? 'PASS' : 'FAIL') + ' | ' + name + (x !== undefined ? ' | ' + x : '')); }
  function eq(name, a, b) { ok(name, a === b, 'got=' + a + ' want=' + b); }

  var tries = 0;
    function MONOF(){ var t=new Date(); t.setHours(0,0,0,0); t.setDate(t.getDate()-((t.getDay()+6)%7));
      return t.getFullYear()+'-'+String(t.getMonth()+1).padStart(2,'0')+'-'+String(t.getDate()).padStart(2,'0'); }
    function K(i){ var d=new Date(MONOF()+'T00:00:00'); d.setDate(d.getDate()+i); return App.store.dateKey(d); }

  window.__p124_started = true;
  window.addEventListener('error', function (e) { try { window.__probeResult = 'TOP-ERR: ' + e.message + ' 完成'; } catch (x) {} });
  function run() {
    tries++;
    out.push('tick ' + tries);
    if (tries % 10 === 0) { try { window.__probeResult = 'polling ' + tries + ' 完成'; } catch (x) {} }
    var ready = window.App && App.store && App.store.data && App.store.data().days && App.store.data().days[MONOF()];
    if (!ready) { if (tries > 100) { finish(); } else { setTimeout(run, 100); } return; }

    var seedOk = false;
    try {
      App.store.data().days[MONOF()].tasks.required.forEach(function (t) { if (t.id === 'R1') seedOk = true; });
    } catch (e) { seedOk = false; }
    if (!seedOk) { out.push('FAIL | 种子自检 | R1 不在本周周一，可能跑在了错误页面/端口'); finish(); return; }

    try {
    var TK = App.store.todayKey();
    var inW = {}; [0,1,2,3].forEach(function (i) { if (K(i) <= TK) inW[i] = true; });

    // ---- 期望值（种子常量 × 「该日已过」门控）----
    var expStudy = (inW[0] ? 30 : 0) + (inW[3] ? 20 : 0);
    var expFocus = (inW[0] ? 45 : 0) + (inW[1] ? 60 : 0) + (inW[2] ? 30 : 0) + (inW[3] ? 40 : 0);
    var expReqDone = (inW[0] ? 1 : 0) + (inW[1] ? 1 : 0) + (inW[3] ? 1 : 0);
    var expReqTotal = expReqDone + (inW[1] ? 1 : 0);
    var expRev = (inW[1] ? 1 : 0) + (inW[3] ? 1 : 0);
    var expCk = [0, 1, 3].filter(function (i) { return inW[i]; }).length;
    var expEarn = (inW[1] ? 10 : 0) + (inW[3] ? 5 : 0);
    var expSpent = (inW[2] ? 30 : 0);
    var expChem = (inW[0] ? 45 : 0) + (inW[3] ? 25 : 0);
    var expMath = (inW[1] ? 60 : 0);
    var expPhy = (inW[2] ? 30 : 0);
    var expEng = (inW[3] ? 15 : 0);
    var expSubTotal = expChem + expMath + expPhy + expEng;
    var expSubN = [expChem, expMath, expPhy, expEng].filter(function (x) { return x > 0; }).length;
    var expHrs = (inW[0] ? 1 : 0) + (inW[1] ? 1 : 0) + (inW[2] ? 1 : 0) + (inW[3] ? 2 : 0);
    var expH09 = inW[3] ? 1 : 0, expH21 = inW[0] ? 1 : 0, expH23 = inW[3] ? 1 : 0;

    out.push('STEP1 ready');
    var all = App.stats.weekStatsAll();
    out.push('STEP2 weekStatsAll done');
    var cur = all.cur, prev = all.prev;

    eq('A1 本周学习时长 ' + expStudy, cur.study, expStudy);
    eq('A2 本周计时专注 ' + expFocus, cur.focus, expFocus);
    eq('A3a 必须 ' + expReqDone + '/' + expReqTotal, cur.req.join(','), expReqDone + ',' + expReqTotal);
    eq('A3b 理想 ' + (inW[1] ? '1/1' : '0/0'), cur.ideal.join(','), (inW[1] ? '1,1' : '0,0'));
    eq('A3c 拓展 ' + (inW[2] ? '1/1' : '0/0'), cur.extra.join(','), (inW[2] ? '1,1' : '0,0'));
    eq('A4a 复习轮次 ' + expRev + '（去重）', cur.rev.done, expRev);
    eq('A4b 写出来了 ' + (inW[3] ? 1 : 0), cur.rev.ok, inW[3] ? 1 : 0);
    eq('A4c 没写出来 ' + (inW[1] ? 1 : 0), cur.rev.no, inW[1] ? 1 : 0);
    eq('A4d 按时 ' + (inW[3] ? 1 : 0), cur.rev.onTime, inW[3] ? 1 : 0);
    eq('A5 打卡 ' + expCk + ' 天', cur.ckDays, expCk);
    eq('A6a 得 ' + expEarn, cur.earned, expEarn);
    eq('A6b 花扣 ' + expSpent, cur.spent, expSpent);
    function weekMondayLike(x){ var y=new Date(x); y.setHours(0,0,0,0); y.setDate(y.getDate()-((y.getDay()+6)%7)); return y; }
    var expDays = (function(){ var t=new Date(); t.setHours(0,0,0,0); var m=weekMondayLike(t); return Math.round((t-m)/86400000)+1; })();
    eq('A7 daysPassed 动态', cur.daysPassed, expDays);
    eq('A8 上周学习 60', prev.study, 60);
    eq('A8b 上周得 10', prev.earned, 10);
    var subs = {}; all.subjects.list.forEach(function (x) { subs[x.name] = x.min; });
    var topName = expMath > expChem ? '数学' : '化学';
    var topMin = Math.max(expMath, expChem);
    eq('A9a 第一名 ' + topName, all.subjects.list[0] && all.subjects.list[0].name, topName);
    eq('A9b 第一名 ' + topMin + ' 分', all.subjects.list[0] && all.subjects.list[0].min, topMin);
    eq('A9c 类别数 ' + expSubN, all.subjects.list.length, expSubN);
    eq('A9d 总分钟 ' + expSubTotal, all.subjects.total, expSubTotal);
    eq('A9e 化学 ' + expChem, subs['化学'] || 0, expChem);
    eq('A9f 数学 ' + expMath, subs['数学'] || 0, expMath);
    eq('A10a 计时次数 ' + expHrs, all.hours.total, expHrs);
    eq('A10b 9 点 ' + expH09, all.hours.counts[9], expH09);
    eq('A10c 21 点 ' + expH21, all.hours.counts[21], expH21);
    eq('A10d 23 点 ' + expH23, all.hours.counts[23], expH23);
    eq('A11a 化学 · 前缀', App.stats.subjectOf('化学 · 平衡常数'), '化学');
    eq('A11b 头部含英语', App.stats.subjectOf('背英语单词'), '英语');
    eq('A11c 数学卷子', App.stats.subjectOf('数学卷子1'), '数学');
    eq('A11d 无学科 → null', App.stats.subjectOf('整理错题本'), null);
    eq('A11e 物理：力学', App.stats.subjectOf('物理：力学'), '物理');
    try {
      App.app.switchView('stats');
      var box = document.getElementById('review-board');
      ok('A12a 复盘卡容器存在', !!box);
      eq('A12b 六格', box.querySelectorAll('.rv-tile').length, 6);
      ok('A12c 学科条有内容', box.innerHTML.indexOf('rv-bar-row') >= 0);
      ok('A12d 时段提示', box.innerHTML.indexOf('最常开始') >= 0);
      ok('A12e 导出按钮在', !!document.getElementById('rv-png') && !!document.getElementById('rv-copy'));
      if (inW[3]) ok('A12f 复习格带结果', box.innerHTML.indexOf('写出来了 1') >= 0);
    } catch (e) { ok('A12 DOM', false, String(e.message)); }
    out.push('STEP3 before PNG');
    try { App.stats.weekCardPNG(); ok('A13a 长图函数跑通', true); }
    catch (e) { ok('A13a 长图函数跑通', false, String(e.message)); }
    try {
      var txt = App.stats.weekCardText();
      ok('A13b 文字版含标题', txt.indexOf('本周复盘') >= 0);
      if (expSubTotal) ok('A13c 文字版含学科', txt.indexOf('学科分布') >= 0);
    } catch (e) { ok('A13b 文字版', false, String(e.message)); }
    out.push('STEP4 before switch');
    try {
      App.app.switchView('tasks'); App.app.switchView('stats');
      ok('A14 来回切页不崩', true);
    } catch (e) { ok('A14 来回切页', false, String(e.message)); }
    out.push('STEP5 end');
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
