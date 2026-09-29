/* v148 探针：图片缺失的显示与备份池保护 */
window.__errs = window.__errs || [];
if (!window.__errsHook) {
  window.__errsHook = 1;
  addEventListener('error', function (e) { __errs.push('ERR ' + (e.message || e)); });
  addEventListener('unhandledrejection', function (e) { __errs.push('REJ ' + e.reason); });
}
var out = []; var done = false;
function flush() { window.__probeResult = out.join('\n') + '\n=== ' + (done ? '完成' : '进行中'); }
function ok(name, cond, extra) { out.push((cond ? 'PASS ' : 'FAIL ') + name + (extra !== undefined ? ' | ' + extra : '')); flush(); }
function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
function q(sel) { return document.querySelector(sel); }
/* 1x1 PNG */
var PNG1 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

async function run() {
  await sleep(1200);
  try {
    // ① 卡片页：图库空 + 卡引用图 → 警示横幅出现
    App.app.switchView('cards');
    await sleep(500);
    var warn = q('#cards-view .mc-closewarn');
    ok('①1 图库空的红色警示出现', !!warn && warn.textContent.indexOf('图片库') >= 0, warn ? warn.textContent.slice(0, 40) : 'none');

    // ② 打开 colX（卡 backImgs=['pPH1'] 但图库空）：反面显示「反面是图片」而不是「反面还没写」
    try { App.memcards.openCol('colX', {}); } catch (e) {}
    await sleep(400);
    var frontEl = q('.mc-front[data-act="mc-toggle"]');   // 点卡展开反面
    if (frontEl) { frontEl.click(); await sleep(300); }
    var back = q('.mc-back');
    ok('②1 反面提示是「反面是图片」', !!back && back.textContent.indexOf('反面是图片') >= 0,
      back ? back.textContent.slice(0, 40) : 'none');

    // ③ syncPool 合并语义：先备份一次建池（此时 cache 空 → 池空），再 phPut 3 张 → 再备份 → 池应含 3 张
    var st = App.store;
    var rec1 = await App.backup.snap('manual');
    await sleep(200);
    // 模拟「页面刚打开时 cache 里只有 3 张新图」
    App.memcards.phPut('px1', PNG1);
    App.memcards.phPut('px2', PNG1);
    App.memcards.phPut('px3', PNG1);
    // 再塞一张「旧池里的图」模拟旧池存在：直接通过恢复接口写
    App.memcards.restorePhotos({ pOLD_A: PNG1, pOLD_B: PNG1 });
    var rec2 = await App.backup.snap('manual');
    await sleep(300);
    var photos = App.backup.photos();
    ok('③1 池子合并后包含旧图+新图（>=5 张）', photos.n >= 5, 'n=' + photos.n);
    ok('③2 旧图 pOLD_A 在池里', !!photos.map.pOLD_A);
    ok('③3 新图 px1 在池里', !!photos.map.px1);

    // ④ 备份的 ph.n 与池一致（UI 显示的「图 N 张」将是真实张数）
    ok('④1 备份记录 ph.n=池子张数', rec2 && rec2.ph && rec2.ph.n === photos.n,
      rec2 ? ('ph.n=' + rec2.ph.n + ' pool=' + photos.n) : 'no rec');

    ok('⑤ 零报错', __errs.length === 0, __errs.join(' ; ').slice(0, 200));
  } catch (e) { ok('异常中断', false, (e && e.message) || e); }
  done = true; flush();
}
run();
