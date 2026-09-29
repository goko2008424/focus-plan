(function () {
  var out = [];
  var now = new Date();
  out.push('now=' + now.toString());
  out.push('todayKey=' + App.store.todayKey());
  var w = App.stats.weekStatsAll();
  out.push('cur.keys=' + w.cur.keys.join(','));
  out.push('daysPassed=' + w.cur.daysPassed);
  out.push('study=' + w.cur.study + ' focus=' + w.cur.focus);
  out.push('seed days 有哪些: ' + Object.keys(App.store.data().days).filter(function(k){return k>='2026-09-20'&&k<='2026-09-28';}).join(','));
  window.__probeResult = out.join('\n') + ' 完成';
})();
