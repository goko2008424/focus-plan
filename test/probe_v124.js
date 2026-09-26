// v124 复盘看板 探针 —— 配 cdp-run.js / cdp_run_m.js 使用
// 用法: node "<skill>/cdp-run.js" http://127.0.0.1:<port>/_v124_t.html <cdpPort> test/probe_v124.js
(function () {
  var out = [], errs = [];
  window.addEventListener('error', function (e) { errs.push(String(e.message)); });
  window.addEventListener('unhandledrejection', function (e) { errs.push('rej:' + e.reason); });
  function ok(name, c, x) { out.push((c ? 'PASS' : 'FAIL') + ' | ' + name + (x !== undefined ? ' | ' + x : '')); }
  function eq(name, a, b) { ok(name, a === b, 'got=' + a + ' want=' + b); }

  var tries = 0;
  function run() {
    tries++;
    var MON = (function(){ var t=new Date(); t.setHours(0,0,0,0); t.setDate(t.getDate()-((t.getDay()+6)%7));
      return t.getFullYear()+'-'+String(t.getMonth()+1).padStart(2,'0')+'-'+String(t.getDate()).padStart(2,'0'); })();
    var ready = window.App && App.store && App.store.data && App.store.data().days && App.store.data().days[MON];
    if (!ready) { if (tries > 100) { finish(); } else { setTimeout(run, 100); } return; }

    var seedOk = false;
    try {
      App.store.data().days[MON].tasks.required.forEach(function (t) { if (t.id === 'R1') seedOk = true; });
    } catch (e) { seedOk = false; }
    if (!seedOk) { out.push('FAIL | 种子自检 | R1 不在本周周一 ' + MON + '，可能跑在了错误页面/端口'); finish(); return; }

    try {
    var all = App.stats.weekStatsAll();
    var cur = all.cur, prev = all.prev;

    eq('A1 本周学习时长 50', cur.study, 50);
    eq('A2 本周计时专注 175', cur.focus, 175);
    eq('A3a 必须 3/4', cur.req.join(','), '3,4');
    eq('A3b 理想 1/1', cur.ideal.join(','), '1,1');
    eq('A3c 拓展 1/1', cur.extra.join(','), '1,1');
    eq('A4a 复习轮次 2（去重）', cur.rev.done, 2);
    eq('A4b 写出来了 1', cur.rev.ok, 1);
    eq('A4c 没写出来 1', cur.rev.no, 1);
    eq('A4d 按时 1', cur.rev.onTime, 1);
    eq('A5 打卡 3 天', cur.ckDays, 3);
    eq('A6a 得 15', cur.earned, 15);
    eq('A6b 花扣 30', cur.spent, 30);
    function weekMondayLike(x){ var y=new Date(x); y.setHours(0,0,0,0); y.setDate(y.getDate()-((y.getDay()+6)%7)); return y; }
    var expDays = (function(){ var t=new Date(); t.setHours(0,0,0,0); var m=weekMondayLike(t); return Math.round((t-m)/86400000)+1; })();
    eq('A7 daysPassed 动态', cur.daysPassed, expDays);
    eq('A8 上周学习 60', prev.study, 60);
    eq('A8b 上周得 10', prev.earned, 10);
    eq('A9a 第一名 化学', all.subjects.list[0] && all.subjects.list[0].name, '化学');
    eq('A9b 化学 70 分', all.subjects.list[0] && all.subjects.list[0].min, 70);
    eq('A9c 类别数 4', all.subjects.list.length, 4);
    eq('A9d 总分钟 175', all.subjects.total, 175);
    eq('A10a 计时次数 5', all.hours.total, 5);
    eq('A10b 9 点 1 次', all.hours.counts[9], 1);
    eq('A10c 21 点 1 次', all.hours.counts[21], 1);
    eq('A10d 23 点 1 次', all.hours.counts[23], 1);
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
      ok('A12c 学科条有 化学', box.innerHTML.indexOf('化学') >= 0);
      ok('A12d 时段提示', box.innerHTML.indexOf('最常开始') >= 0);
      ok('A12e 导出按钮在', !!document.getElementById('rv-png') && !!document.getElementById('rv-copy'));
      ok('A12f 复习格带结果', box.innerHTML.indexOf('写出来了 1') >= 0);
    } catch (e) { ok('A12 DOM', false, String(e.message)); }
    try { App.stats.weekCardPNG(); ok('A13a 长图函数跑通', true); }
    catch (e) { ok('A13a 长图函数跑通', false, String(e.message)); }
    try {
      var txt = App.stats.weekCardText();
      ok('A13b 文字版含标题', txt.indexOf('本周复盘') >= 0);
      ok('A13c 文字版含学科', txt.indexOf('学科分布') >= 0);
    } catch (e) { ok('A13b 文字版', false, String(e.message)); }
    try {
      App.app.switchView('tasks'); App.app.switchView('stats');
      ok('A14 来回切页不崩', true);
    } catch (e) { ok('A14 来回切页', false, String(e.message)); }
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
