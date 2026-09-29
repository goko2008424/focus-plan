(function () {
  var out = [];
  try {
    out.push('MONOF check: ' + (function MONOF(){ var t=new Date(); t.setHours(0,0,0,0); t.setDate(t.getDate()-((t.getDay()+6)%7));
      return t.getFullYear()+'-'+String(t.getMonth()+1).padStart(2,'0')+'-'+String(t.getDate()).padStart(2,'0'); })());
    out.push('weekStatsAll ok: ' + !!App.stats.weekStatsAll());
    var all = App.stats.weekStatsAll();
    out.push('study=' + all.cur.study);
  } catch (e) { out.push('ERR ' + (e && e.stack || e)); }
  window.__probeResult = out.join('\n') + ' 完成';
})();
