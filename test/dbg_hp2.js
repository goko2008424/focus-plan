(function () {
  var out = [], errs = [];
  window.addEventListener('error', function (e) { errs.push(e.message + ' @' + (e.lineno||'')); });
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
    App.app.switchView('queue');
    var btn = document.querySelector('#queue-view [data-act="d-start"][data-id="D137"]');
    btn.click();
    var m = document.querySelector('#modal-root .modal');
    out.push('modal: ' + (m ? (m.querySelector('h2')||{}).textContent || 'no-h2' : 'none'));
    if (m && m.querySelector('[data-act="go"]')) m.querySelector('[data-act="go"]').click();
    out.push('modal after go: ' + !!document.querySelector('#modal-root .modal'));
    setTimeout(function () {
      try {
        try { App.tasks.onTick(); } catch (e) { out.push('onTick threw: ' + (e && e.message)); }
        var hp = document.getElementById('tf-hp');
        out.push('tf-hp: ' + (hp ? hp.outerHTML.slice(0, 200) : 'none'));
        var f = document.getElementById('timer-float');
        out.push('float hidden=' + (f ? f.classList.contains('hidden') : 'none'));
        // 计时器状态：从悬浮窗数字反推
        var used = document.getElementById('tf-used');
        out.push('tf-used=' + (used ? used.textContent : 'none'));
      } catch (e) { out.push('ERR2 ' + (e && e.stack || e)); }
      out.push('errs=' + errs.join(';;'));
      window.__probeResult = out.join('\n') + ' 完成';
    }, 1700);
  } catch (e) { out.push('ERR ' + (e && e.stack || e)); window.__probeResult = out.join('\n') + ' 完成'; }
})();
