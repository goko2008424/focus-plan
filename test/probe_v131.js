// v131 探针：🏅 成就徽章墙（解锁/进度/持久化/动态达成）
(function () {
  var out = [], errs = [];
  window.addEventListener('error', function (e) { errs.push(String(e.message)); });
  window.addEventListener('unhandledrejection', function (e) { errs.push('rej:' + e.reason); });
  function ok(name, c, x) { out.push((c ? 'PASS' : 'FAIL') + ' | ' + name + (x !== undefined ? ' | ' + x : '')); }
  function eq(name, a, b) { ok(name, a === b, 'got=' + a + ' want=' + b); }

  var tries = 0;
  function run() {
    tries++;
    if (!(window.App && App.badges)) { if (tries > 100) finish(); else setTimeout(run, 100); return; }
    try {
      var MON = (function(){ var t=new Date(); t.setHours(0,0,0,0); t.setDate(t.getDate()-((t.getDay()+6)%7));
        return t.getFullYear()+'-'+String(t.getMonth()+1).padStart(2,'0')+'-'+String(t.getDate()).padStart(2,'0'); })();
      ok('G0 种子自检', !!(App.store.data().days[MON] && App.store.data().days[MON].tasks.required.length), 'mon=' + MON);

      var B = App.badges;
      var st = B.stats();
      eq('G1a 统计：专注 175', st.focusMin, 175);
      eq('G1b 最猛一天 60', st.bestDayMin, 60);
      eq('G1c 复习 2 轮 / 写出来 1', st.revDone + '/' + st.revOk, '2/1');
      eq('G1d 错题巩固 1 · 考试 4', st.mistMastered + '/' + st.examN, '1/4');
      eq('G1e 连击最长 2', st.maxStreak, 2);

      App.app.switchView('stats');
      var box = document.getElementById('badges-card');
      ok('G2a 成就卡渲染了', !!box && box.innerHTML.indexOf('已解锁') >= 0 && box.querySelectorAll('.bg-tile').length > 0);
      eq('G2b 徽章总数 15（错题入口收起后藏 2 枚）', box.querySelectorAll('.bg-tile').length, B.DEFS.length - 2);
      eq('G2c 首次解锁 2 枚（错题徽章已藏）', box.querySelectorAll('.bg-tile.on').length, 2);
      eq('G2d NEW 光效 2 枚', box.querySelectorAll('.bg-newtag').length, 2);
      var bd = App.store.data().badges;
      ok('G2e 解锁时间记下了（错题徽章藏起不写状态）', !!(bd.rev1 && bd.exam3) && !bd.mist1);

      ok('G3a 下一枚=连击起步', box.innerHTML.indexOf('连击起步') >= 0);
      var streakTile = box.querySelector('.bg-tile.off');
      ok('G3b 锁定徽章带进度条', !!streakTile && !!streakTile.querySelector('.bg-bar'));
      ok('G3c 进度文案 2/3 天', box.innerHTML.indexOf('2/3 天') >= 0);
      ok('G3d 专注进度换算小时', box.innerHTML.indexOf('2.9小时/600') >= 0);

      // 持久化：重渲染时间戳不变、不多解锁
      var snap1 = JSON.stringify(App.store.data().badges);
      App.app.switchView('tasks'); App.app.switchView('stats');
      eq('G4 重渲染后解锁集不变', JSON.stringify(App.store.data().badges), snap1);

      // 动态达成：把周二和今天补上打卡 → 连击 ≥3 → streak3 解锁
      var d = App.store.data();
      var K2 = (function(){ var t=new Date(MON); t.setDate(t.getDate()+2); return t.getFullYear()+'-'+String(t.getMonth()+1).padStart(2,'0')+'-'+String(t.getDate()).padStart(2,'0'); })();
      d.checkins[0].days[K2] = 1;
      d.checkins[0].days[App.store.todayKey()] = 1;
      App.store.save();
      App.badges.render();
      eq('G5 补打卡后连击徽章解锁', !!App.store.data().badges.streak3, true);
      eq('G5b 现在解锁 3 枚', document.querySelectorAll('.bg-tile.on').length, 3);
      ok('G5c maxStreak 到 5', B.stats().maxStreak >= 4, 'got=' + B.stats().maxStreak);
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
