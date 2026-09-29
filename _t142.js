/* v142 探针 v2：顺延链 + 绿标（对齐种子 v2；日期全动态算） */
window.__errs = window.__errs || [];
addEventListener('error', function (e) { window.__errs.push('ERR ' + (e.message || e)); });
addEventListener('unhandledrejection', function (e) { window.__errs.push('REJ ' + (e.reason)); });

var out = [], done = false;
function flush() { window.__probeResult = out.join('\n') + '\n=== ' + (done ? '完成' : '进行中'); }
function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
var NP = 0;
function ok(name, cond, extra) {
  NP++;
  out.push((cond ? 'PASS ' : 'FAIL ') + NP + ' ' + name + (cond ? '' : '  ← ' + (extra === undefined ? '' : extra)));
  flush();
}
function S() { return App.store; }
function q(sel) { return document.querySelector(sel); }
function dayReq(k) { var d = S().data().days[k]; return ((d && d.tasks && d.tasks.required) || []); }
function rowOf(colId) { return document.querySelector('#cards-view .mc-rowline[data-id="' + colId + '"] .mc-schedline'); }
function kd(off) { var d = new Date(S().todayKey() + 'T12:00:00'); d.setDate(d.getDate() + off); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
function fm(k) { var p = k.split('-'); return (+p[1]) + '/' + (+p[2]); }

(async function () {
  flush();
  await sleep(600);

  var T = S().todayKey();
  var M4 = kd(-4), M3 = kd(-3), M2 = kd(-2), P1 = kd(1);
  out.push('today=' + T + ' M4=' + M4 + ' M3=' + M3 + ' M2=' + M2 + ' P1=' + P1); flush();

  /* ⓪ 种子自检 */
  var raw = localStorage.getItem('focusPlanData.v1') || '';
  ok('⓪ 种子在（colX/tA 都在）', raw.indexOf('colX') > 0 && raw.indexOf('"tA"') > 0, raw.length);

  /* ① 漏掉的旧轮次（9/24 类那天，无副本）→ 搬到今天 */
  var todayIds = dayReq(T).map(function (t) { return t.id; });
  ok('①1 tA 已顺延到今天', todayIds.indexOf('tA') >= 0, todayIds.join(','));
  var tA = dayReq(T).filter(function (t) { return t.id === 'tA'; })[0] || {};
  ok('①2 tA.slippedFrom=' + M4, !!(tA.mcRef && tA.mcRef.slippedFrom === M4), JSON.stringify(tA.mcRef || null));
  ok('①3 老日子 ' + M4 + ' 已空', dayReq(M4).length === 0, dayReq(M4).length);

  /* ② 结算已顺延的（9/25 类那天 + 未来 rolled 副本）→ 留原地标 superseded */
  var tS = dayReq(M3)[0] || {};
  ok('②1 colY 的旧条没被搬走', dayReq(M3).length === 1, dayReq(M3).length);
  ok('②2 它标了 superseded', !!(tS.mcRef && tS.mcRef.superseded === true), JSON.stringify(tS.mcRef || null));
  ok('②3 未来副本 tR 没被动', (dayReq(P1).filter(function (t) { return t.id === 'tR'; })[0] || {}).rolled === true, '');

  /* ③ 卡片页排期链 */
  App.app.switchView('cards');
  await sleep(400);
  var rx = rowOf('colX'), ry = rowOf('colY'), rz = rowOf('colZ');
  ok('③1 三个合集都有排期链', !!rx && !!ry && !!rz);
  var tx = rx ? rx.textContent : '';
  ok('③2 colX 顺延史 ' + fm(M4) + ' ↷', tx.indexOf(fm(M4) + ' ↷') >= 0, tx);
  ok('③3 colX「今天」该补', /今天/.test(tx), tx);
  ok('③4 colX 未来 ' + fm(P1), tx.indexOf(fm(P1)) >= 0, tx);
  ok('③5 没有「⚠」旧样式', tx.indexOf('⚠') < 0, tx);
  ok('③6 标签「复习 2 次」', tx.indexOf('复习 2 次') >= 0, tx);
  ok('③7 尾注「做完 → 下一次 ' + fm(P1) + '」', tx.indexOf('下一次 ' + fm(P1)) >= 0, tx);
  ok('③8 today 类 chip', !!rx.querySelector('.mc-chip.today'), '');
  ok('③9 slip 类 chip', !!rx.querySelector('.mc-chip.slip'), '');
  ok('③10 next 类 chip', !!rx.querySelector('.mc-chip.next'), '');
  var ty = ry ? ry.textContent : '';
  ok('③11 colY：顺延史+未来，无「今天」', ty.indexOf('↷') >= 0 && ty.indexOf(fm(P1)) >= 0 && !/今天/.test(ty), ty);
  var tz = rz ? rz.textContent : '';
  ok('③12 colZ：✓ 绿标 + 都做完啦', !!rz.querySelector('.mc-chip.done') && tz.indexOf('都做完啦') >= 0 && tz.indexOf(fm(M2)) >= 0, tz);

  /* ④ 幂等：再渲染不多搬 */
  App.memcards.renderPage();
  await sleep(250);
  var ids2 = dayReq(T).map(function (t) { return t.id; });
  ok('④ 今天还是只有 tA（无重复）', ids2.filter(function (x) { return x === 'tA'; }).length === 1, ids2.join(','));

  /* ⑤ 做掉 tA → ✓ 绿标落在今天 */
  await App.tasks.toggleTask('required', 'tA');
  await sleep(400);
  for (var m = 0; m < 3; m++) { var b = q('#modal-root [data-act="ok"]'); if (!b) break; b.click(); await sleep(250); }
  var tA2 = dayReq(T).filter(function (t) { return t.id === 'tA'; })[0] || {};
  ok('⑤1 tA done=true', tA2.done === true, JSON.stringify(tA2.done));
  App.app.switchView('cards');
  await sleep(400);
  var rx2 = rowOf('colX');
  var dc = rx2 ? rx2.querySelector('.mc-chip.done') : null;
  ok('⑤2 绿 ✓ chip 标今天 ' + fm(T), !!dc && dc.textContent.indexOf(fm(T)) >= 0, dc ? dc.textContent : '无');
  ok('⑤3 「今天」该补没了（只剩顺延史+绿✓+未来）', rx2 && !rx2.querySelector('.mc-chip.today'), rx2 ? rx2.textContent : '');
  ok('⑤4 尾注变「下一次 ' + fm(P1) + '」', rx2 && rx2.textContent.indexOf('下一次 ' + fm(P1)) >= 0, rx2 ? rx2.textContent : '');

  /* ⑥ 未来那天的 ✕ → 取消那天的安排 */
  var xb = rx2.querySelector('.mc-chip.next .mc-chip-x');
  ok('⑥1 找到未来的 ✕', !!xb);
  if (xb) { xb.click(); await sleep(350); }
  ok('⑥2 未来那天 tC 收走', dayReq(P1).filter(function (t) { return t.id === 'tC'; }).length === 0, '');
  var rx3 = rowOf('colX');
  ok('⑥3 colX 变「都做完啦 ✓」', rx3 && rx3.textContent.indexOf('都做完啦') >= 0, rx3 ? rx3.textContent : '');

  /* ⑦ 页面自查 + 零报错 */
  var cb = await window.__checkBuild(true);
  var realBad = (cb || []).filter(function (x) { return x.bad; });
  ok('⑦1 __checkBuild 0 bad', realBad.length === 0, JSON.stringify(realBad));
  ok('⑦2 全程零报错', window.__errs.length === 0, window.__errs.join(' | '));

  done = true; flush();
})().catch(function (e) { out.push('FATAL ' + (e && e.stack || e)); done = true; flush(); });
