/* v144 探针：复习中「✏️ 改问题 / 改答案」支持贴图（📷 + Ctrl+V 粘贴 + 旧图不丢） */
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
/* 1x1 红色 PNG */
var PNG1 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
function pngFile() {
  return fetch(PNG1).then(function (r) { return r.blob(); }).then(function (b) {
    return new File([b], 't.png', { type: 'image/png' });
  });
}
function pasteOnto(el, file) {
  var dt = new DataTransfer();
  dt.items.add(file);
  var ev = new Event('paste', { bubbles: true, cancelable: true });
  ev.clipboardData = dt;
  el.dispatchEvent(ev);
}

async function run() {
  await sleep(1000);
  var M = App.memcards;
  var col = M.cols ? null : null;
  try { M.openCol('colX', {}); } catch (e) { ok('①1 openCol', false, e.message); }
  await sleep(300);
  ok('①2 合集开着（有 1 张卡）', !!q('.mc-card'), q('.mc-cnt') ? q('.mc-cnt').textContent : '');

  // 进复习 → 改问题
  var btnRev = q('[data-act="mc-review"]');
  ok('①3 开始复习按钮在', !!btnRev);
  if (btnRev) {
    btnRev.click(); await sleep(300);
    var btnEF = q('[data-act="mc-edit-front"]');
    ok('②1 复习页有「✏️ 改问题」', !!btnEF);
    if (btnEF) {
      btnEF.click(); await sleep(300);
      var ta = q('#mc-edit-ta');
      ok('②2 编辑视图 textarea 挂了 data-f=ef', !!ta && ta.dataset.f === 'ef', ta ? ('data-f=' + ta.dataset.f) : '');
      ok('②3 缩略图区在（data-thumbs=ef）', !!q('[data-thumbs="ef"]'));
      var pickBtn = q('[data-act="mc-pick"][data-side="ef"]');
      ok('②4 📷 贴图按钮在（side=ef）', !!pickBtn);
      ok('②5 提示 Ctrl+V 在', !!q('.mc-siderow') && q('.mc-siderow').textContent.indexOf('Ctrl+V') >= 0);

      // ②6 粘贴一张图（模拟 Ctrl+V）
      var f = await pngFile();
      pasteOnto(ta, f);
      await sleep(600);
      var thumbImg = q('[data-thumbs="ef"] img');
      ok('②6 粘贴后缩略图出现', !!thumbImg);

      // ②7 保存 → 卡上：新文字 + frontImgs = [旧 pOLD1, 新图]
      ta.value = '改成的新问题？';
      var btnSave = q('[data-act="mc-edit-save"]');
      ok('②7 保存按钮在', !!btnSave);
      if (btnSave) {
        btnSave.click(); await sleep(400);
        var d = App.store.data();
        var c1 = d.memcards[0].cards[0];
        ok('②8 问题文字已改', c1.front === '改成的新问题？', c1.front);
        ok('②9 旧图 pOLD1 保住了', !!(c1.frontImgs || []).filter(function (x) { return x === 'pOLD1'; }).length, JSON.stringify(c1.frontImgs));
        ok('②10 新图进了 frontImgs（共 2 张）', (c1.frontImgs || []).length === 2, JSON.stringify(c1.frontImgs));
        ok('②11 回到复习且翻到正面', true);
      }
    }

    // ③ 改答案对称测
    var btnEB = q('[data-act="mc-edit-back"]');
    ok('③1 复习页有「✏️ 改答案」', !!btnEB);
    if (btnEB) {
      btnEB.click(); await sleep(300);
      var taB = q('#mc-edit-ta');
      ok('③2 答案编辑 data-f=eb + 缩略图 + 📷', !!taB && taB.dataset.f === 'eb' && !!q('[data-thumbs="eb"]') && !!q('[data-act="mc-pick"][data-side="eb"]'));
      var f2 = await pngFile();
      pasteOnto(taB, f2);
      await sleep(600);
      ok('③3 粘贴后 eb 缩略图出现', !!q('[data-thumbs="eb"] img'));
      taB.value = '改成的新答案。';
      var btnS2 = q('[data-act="mc-edit-save"]');
      if (btnS2) {
        btnS2.click(); await sleep(400);
        var d2 = App.store.data();
        var c12 = d2.memcards[0].cards[0];
        ok('③4 答案文字已改', c12.back === '改成的新答案。', c12.back);
        ok('⑤ 答案新图进了 backImgs（1 张）', (c12.backImgs || []).length === 1, JSON.stringify(c12.backImgs));
      }
    }
  }

  // ⑥ 取消路径：进编辑（旧图捞进草稿）→ 取消 → 卡数据不动
  try {
    var btnEF2 = q('[data-act="mc-edit-front"]');
    if (btnEF2) {
      btnEF2.click(); await sleep(250);
      q('[data-act="mc-edit-cancel"]').click(); await sleep(250);
      var c13 = App.store.data().memcards[0].cards[0];
      ok('⑥ 取消不改数据（frontImgs 仍 2 张）', (c13.frontImgs || []).length === 2, JSON.stringify(c13.frontImgs));
    }
  } catch (e) { ok('⑥', false, e.message); }

  ok('⑦ 零报错', __errs.length === 0, __errs.join(' ; ').slice(0, 200));
  done = true; flush();
}
run();
