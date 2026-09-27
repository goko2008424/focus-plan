(function () {
  var out = [], errs = [];
  window.addEventListener('error', function (e) { errs.push(e.message); });
  try {
    var tk = App.store.todayKey();
    var D = App.store.data();
    D.daily = (D.daily || []).filter(function (d) { return d.id !== 'D137'; });
    var day0 = App.store.getDay(tk);
    day0.tasks.required = (day0.tasks.required || []).filter(function (t) { return !t.fromDaily; });
    day0.activeHourPlan = { id: 'HP137', startAt: new Date(Date.now() - 10 * 60000).toISOString(),
      duration: 30, reward: 10, taskKey: '', taskId: '', taskText: '',
      targets: { required: 15, ideal: 5, extra: 5 } };
    D.daily.push({ id: 'D137', text: '化学复习', points: 2, pinnedDay: tk, done: null });
    App.store.save();
    // 直接调用，抓真实异常
    try { App.tasks.renderFloatHp(); out.push('renderFloatHp ok, tf-hp=' + document.getElementById('tf-hp').outerHTML.slice(0, 160)); }
    catch (e) { out.push('renderFloatHp threw: ' + (e && e.stack || e)); }
  } catch (e) { out.push('ERR ' + (e && e.stack || e)); }
  out.push('errs=' + errs.join(';;'));
  window.__probeResult = out.join('\n') + ' 完成';
})();
