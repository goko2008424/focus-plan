/* v143 排查：「今天的复习」行上的 → 和 📅 到底走不走 */
window.__errs = window.__errs || [];
if (!window.__errsHook) {
  window.__errsHook = 1;
  addEventListener('error', function (e) { __errs.push('ERR ' + (e.message || e)); });
  addEventListener('unhandledrejection', function (e) { __errs.push('REJ ' + e.reason); });
}
var out = [];
var done = false;
function flush() { window.__probeResult = out.join('\n') + '\n=== ' + (done ? '完成' : '进行中'); }
function ok(name, cond, extra) { out.push((cond ? 'PASS ' : 'FAIL ') + name + (extra !== undefined ? ' | ' + extra : '')); flush(); }
function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
function q(sel) { return document.querySelector(sel); }
function revRow(id) { return q('#queue-view .q-rev-row[data-id="' + id + '"]'); }

function seedCheck() {
  try {
    var ls = localStorage.getItem('focusPlanData.v1') || '';
    ok('种子0 种子在且含 rvA', ls.indexOf('rvA') >= 0 && ls.length > 2000, 'len=' + ls.length);
  } catch (e) { ok('种子0', false, e.message); }
}
function todayKey() { return App.store.S ? App.store.S().todayKey() : (App.tasks ? '' : ''); }

async function run() {
  await sleep(1200);
  seedCheck();
  var S = function(){ return { getDay: App.store.getDay, todayKey: App.store.todayKey }; };
  // 切到队列页
  try { App.app.switchView('queue'); } catch (e) { ok('切队列页', false, e.message); }
  await sleep(300);

  ok('①1 今天的复习区有 rvA 行', !!revRow('rvA'));
  ok('①2 今天的复习区有 rvB 行', !!revRow('rvB'));
  var sec = q('.q-revsec-h');
  ok('①3 区块标题在', !!sec && sec.textContent.indexOf('今天的复习') >= 0, sec ? sec.textContent.slice(0, 30) : '');

  // ② → 按钮（v143：一键挪到明天 —— 真转移）
  var btnOpen = q('[data-act="qrev-open"][data-id="rvA"]');
  ok('②1 → 按钮存在', !!btnOpen);
  if (btnOpen) {
    btnOpen.click();
    await sleep(400);
    var goneA = (S().getDay(S().todayKey()).tasks.required || []).filter(function (t) { return t.id === 'rvA'; }).length;
    ok('②2 → 之后 rvA 从今天必须栏消失（真转移）', goneA === 0, 'count=' + goneA);
    var t2 = new Date(S().todayKey() + 'T12:00:00'); t2.setDate(t2.getDate() + 1);
    var tomK = t2.getFullYear() + '-' + ('0' + (t2.getMonth() + 1)).slice(-2) + '-' + ('0' + t2.getDate()).slice(-2);
    var ntA = (S().getDay(tomK).tasks.required || []).filter(function (x) { return x.id === 'rvA' || x.text.indexOf('化学平衡') >= 0; })[0];
    ok('②3 明天出现了 rvA（mcRef 跟着走）', !!ntA && !!ntA.mcRef && ntA.mcRef.colId === 'colX');
    ok('②4 复习区 rvA 行消失', !revRow('rvA'));
    ok('②5 rvB 还在（没被误伤）', !!revRow('rvB'));
  }

  // ③ 📅 按钮（qrev-date → moveTaskDayModal）：对 rvB，整条搬到明天
  var btnDate = q('[data-act="qrev-date"][data-id="rvB"]');
  ok('③1 📅 按钮存在', !!btnDate);
  if (btnDate) {
    btnDate.click();
    await sleep(300);
    var modal = q('#modal-root .modal');
    ok('③2 改天弹窗开了', !!modal, modal ? (modal.textContent || '').slice(0, 40) : 'no modal');
    var dt = modal ? modal.querySelector('#mvd-date') : null;
    ok('③3 日期输入在，默认明天', !!dt && !!dt.value, 'value=' + (dt ? dt.value : ''));
    if (dt) {
      var t = new Date(S().todayKey() + 'T12:00:00'); t.setDate(t.getDate() + 1);
      var tom = t.getFullYear() + '-' + ('0' + (t.getMonth() + 1)).slice(-2) + '-' + ('0' + t.getDate()).slice(-2);
      dt.value = tom; if (dt.onchange) dt.onchange();
      var okBtn = modal.querySelector('[data-act="mvd-ok"]');
      ok('③4 「就改到这天」按钮在', !!okBtn);
      if (okBtn) {
        okBtn.click();
        await sleep(400);
        var gone = (S().getDay(S().todayKey()).tasks.required || []).filter(function (x) { return x.id === 'rvB'; }).length;
        ok('③5 今天必须栏里 rvB 已删掉', gone === 0, 'count=' + gone);
        var nt = (S().getDay(tom).tasks.required || []).filter(function (x) { return x.text.indexOf('正逆反应') >= 0; })[0];
        ok('③6 明天出现了 rvB（mcRef 跟着走）', !!nt && !!nt.mcRef && nt.mcRef.colId === 'colY');
        ok('③7 队列页复习区 rvB 行消失', !revRow('rvB'));
        ok('③8 复习区空了（两条都走干净）', !q('.q-rev-row'));
      }
    }
  }

  // ④ 全局零报错
  ok('④1 零报错', __errs.length === 0, __errs.join(' ; ').slice(0, 200));

  done = true; flush();
}
run();
