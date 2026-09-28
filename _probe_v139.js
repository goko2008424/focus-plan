window.__errs = window.__errs || [];
if (!window.__errsHook) {
  window.__errsHook = 1;
  addEventListener('error', e => __errs.push('ERR ' + (e.message || e)));
  addEventListener('unhandledrejection', e => __errs.push('REJ ' + e.reason));
}
var out = [];
var done = false;
function ok(name, cond, extra) { out.push((cond ? '✅ ' : '❌ ') + name + (extra ? (' · ' + extra) : '')); }
function flush() { window.__probeResult = out.join('\n') + '\n=== ' + (done ? '完成' : '进行中'); }
try {
  var store = window.App.store;
  var days = store.data.days;
  var t1 = null, t2 = null;
  Object.keys(days).forEach(function (k) {
    (days[k].tasks && days[k].tasks.required || []).forEach(function (t) {
      if (t.text === '测试·带小题(部分完成)') t1 = { day: k, t: t };
      if (t.text === '测试·排了复习') t2 = { day: k, t: t };
    });
  });
  ok('种子 T1(带小题)注入', !!t1, t1 ? ('subs=' + t1.t.subs.length) : 'null');
  ok('种子 T2(排复习)注入', !!t2, t2 ? ('sp=' + (t2.t.sp ? t2.t.sp.planned.length : 'no')) : 'null');
  var future = '2026-09-29';

  if (t1) {
    var d1 = window.App.calendar.copyTaskToDay(
      { text: t1.t.text, subs: t1.t.subs, points: t1.t.points, mode: t1.t.mode,
        groups: t1.t.groups || [], mcRef: t1.t.mcRef, kps: t1.t.kps },
      'required', future, null, true, 'required');
    ok('① copyTaskToDay 返回 true', d1 === true);
    var fday = window.App.store.getDay(future);
    var nt = (fday.tasks.required || []).filter(function (x) { return x.text === t1.t.text; })[0];
    ok('① 目标天出现同名任务', !!nt);
    if (nt) {
      ok('① 只带没做完的小题(1个)', nt.subs.length === 1, 'subs=' + nt.subs.length);
      ok('① 带过去的是未做那道', nt.subs[0].done === null && nt.subs[0].text === '未做小题',
        nt.subs[0] && nt.subs[0].text);
    }
  }

  if (t2) {
    window.App.tasks.moveTaskDayModal('required', t2.day, t2.t.id);
    var dt = document.getElementById('mvd-date');
    ok('② 改天再做弹窗已开', !!dt);
    if (dt) {
      dt.value = future;
      var okBtn = document.querySelector('[data-act="mvd-ok"]');
      ok('② 找到 mvd-ok', !!okBtn);
      if (okBtn) okBtn.click();
      var dayAfter = window.App.store.getDay(t2.day);
      var stillHere = (dayAfter.tasks.required || []).some(function (x) { return x.id === t2.t.id; });
      ok('② 今天那条已删掉', !stillHere);
      var fday2 = window.App.store.getDay(future);
      var moved = (fday2.tasks.required || []).filter(function (x) { return x.text === '测试·排了复习'; })[0];
      ok('② 目标天出现搬过去任务', !!moved);
      if (moved && moved.sp) {
        var lo = new Date(future + 'T00:00:00').getTime();
        var hi = new Date('2026-09-30T00:00:00').getTime();
        var allFuture = moved.sp.planned.every(function (r) { return r.due >= lo && r.due < hi; });
        ok('② 复习轮次 due 落到目标天', allFuture,
          moved.sp.planned.map(function (r) { return new Date(r.due).toISOString().slice(0, 16); }).join(','));
        ok('② 第1轮 done 保持 null', moved.sp.planned[0].done === null);
        ok('② 第2轮 done 由 false 重置为 null', moved.sp.planned[1].done === null);
      }
    }
  }
  ok('运行期无报错', window.__errs.length === 0, window.__errs.join(' | '));
} catch (e) {
  out.push('❌ 异常: ' + e.message + ' @ ' + ((e.stack || '').split('\n')[1] || ''));
}
done = true;
flush();
