/* v140 探针：复习时随手改（✍️ 补充 + ✏️ 改问题 + ✏️ 改答案） */
window.__errs = window.__errs || [];
if (!window.__errsHook) {
  window.__errsHook = 1;
  addEventListener('error', function (e) { __errs.push('ERR ' + (e.message || e)); });
  addEventListener('unhandledrejection', function (e) { __errs.push('REJ ' + ((e.reason && e.reason.message) || e.reason)); });
}
var out = [], done = false;
function flush() { window.__probeResult = out.join('\n') + '\n=== ' + (done ? '完成' : '进行中'); }
function ok(name, cond) { out.push((cond ? 'OK  ' : 'FAIL') + ' ' + name); flush(); }
function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
function q(sel) { try { return (App.ui && App.ui.query) ? App.ui.query(sel) : document.querySelector(sel); } catch (e) { return document.querySelector(sel); } }

(async function () {
  try {
    /* 0. 造数据：一个合集 + 一张卡 */
    var col = App.memcards.ensureCollection({ name: 'v140测试合集' });
    col.cards.push({ id: App.store.uid(), front: '水解平衡常数只和什么有关?', back: '只和温度有关', at: Date.now() });
    App.store.save();
    var c0 = col;
    ok('A0 种子就位 cards=1', c0 && c0.cards.length === 1);

    /* 1. 打开合集 → 进复习 */
    App.memcards.openCol(col.id);
    await sleep(200);
    var btnRev = q('[data-act="mc-review"]');
    ok('B1 复习按钮在', !!btnRev);
    btnRev.click(); await sleep(100);
    var suppBtn = q('[data-act="mc-supp"]');
    ok('B2 ✍️补充按钮在复习操作行', !!suppBtn);
    ok('B3 没补充时按钮不带计数', suppBtn && suppBtn.textContent.indexOf('·') < 0);
    ok('B4 ✏️改问题按钮在', !!q('[data-act="mc-edit-front"]'));
    ok('B5 ✏️改答案按钮在', !!q('[data-act="mc-edit-back"]'));

    /* 2. 进补充视图 → 写一条 → 保存 */
    suppBtn.click(); await sleep(100);
    var ta = q('#mc-supp-new');
    ok('C1 补充视图+输入框在', !!ta);
    ok('C2 补充视图里显示这张卡', !!q('.mc-supp-face') && q('.mc-supp-face').textContent.indexOf('水解平衡常数') >= 0);
    ta.value = '易错：浓度变了 K 不变，Q 才变';
    q('[data-act="mc-supp-save"]').click(); await sleep(100);
    var c1 = col.cards[0];
    ok('C3 补充落库 supps=1', c1.supps && c1.supps.length === 1 && c1.supps[0].text.indexOf('Q 才变') >= 0 && !!c1.supps[0].at);
    ok('C4 存完回到复习并翻到答案面', !!q('.mc-flipbox') && q('.mc-flipbox').className.indexOf('flipped') >= 0);
    ok('C5 答案面显示补充内容', q('.mc-flip-back').textContent.indexOf('Q 才变') >= 0);
    ok('C6 答案面显示日期(今天)', q('.mc-flip-back').textContent.indexOf('今天') >= 0);
    ok('C7 按钮带计数 ·1', q('[data-act="mc-supp"]').textContent.indexOf('·1') >= 0);

    /* 3. 翻回正面：补充不剧透 */
    q('[data-act="mc-flip"]').click(); await sleep(80);
    ok('D1 正面看不到补充', q('.mc-flip-front').textContent.indexOf('Q 才变') < 0);

    /* 4. 列表视图展开反面也能看到 */
    q('[data-act="mc-backbox"]').click(); await sleep(80);
    var tg = q('[data-act="mc-toggle"]');
    ok('E0 回到列表', !!tg);
    tg.click(); await sleep(80);
    var backBox = q('.mc-back');
    ok('E1 列表反面预览显示补充', !!backBox && backBox.textContent.indexOf('Q 才变') >= 0);

    /* 5. 删掉那条补充后重补 */
    q('[data-act="mc-review"]').click(); await sleep(80);
    q('[data-act="mc-supp"]').click(); await sleep(80);
    var del = q('[data-act="mc-supp-del"]');
    ok('F1 已有补充列出+删除按钮', !!del);
    del.click(); await sleep(80);
    var c2 = col.cards[0];
    ok('F2 删后 supps 清空', !c2.supps || c2.supps.length === 0);
    q('#mc-supp-new').value = '再补一条';
    q('[data-act="mc-supp-save"]').click(); await sleep(80);
    var c3 = col.cards[0];
    ok('F4 删后能再补', c3.supps && c3.supps.length === 1 && c3.supps[0].text === '再补一条');

    /* 6. 空保存：不落库、直接回复习 */
    q('[data-act="mc-supp"]').click(); await sleep(80);
    q('[data-act="mc-supp-save"]').click(); await sleep(80);
    var c4 = col.cards[0];
    ok('G1 空保存不落库', c4.supps && c4.supps.length === 1);
    ok('G2 空保存回到复习视图', !!q('.mc-flipbox'));

    /* 7. 取消按钮 */
    q('[data-act="mc-supp"]').click(); await sleep(80);
    q('[data-act="mc-supp-cancel"]').click(); await sleep(80);
    ok('H1 取消回到复习且不落库', !!q('.mc-flipbox') && col.cards[0].supps.length === 1);

    /* 8. ✏️ 改问题 */
    q('[data-act="mc-edit-front"]').click(); await sleep(80);
    var ef = q('#mc-edit-ta');
    ok('J1 改问题视图+输入框在', !!ef);
    ok('J2 输入框预填了原问题', ef && ef.value.indexOf('水解平衡常数') >= 0);
    ef.value = '水解常数 K 只受什么影响？';
    q('[data-act="mc-edit-save"]').click(); await sleep(80);
    var c5 = col.cards[0];
    ok('J3 问题已改 front', c5.front === '水解常数 K 只受什么影响？');
    ok('J4 改完回到复习且停在正面', !!q('.mc-flipbox') && q('.mc-flipbox').className.indexOf('flipped') < 0);

    /* 9. ✏️ 改答案 */
    q('[data-act="mc-edit-back"]').click(); await sleep(80);
    var eb = q('#mc-edit-ta');
    ok('K1 改答案视图+输入框在', !!eb);
    ok('K2 输入框预填了原答案', eb && eb.value.indexOf('只和温度有关') >= 0);
    eb.value = '只和温度有关；浓度压强变了 K 不变';
    q('[data-act="mc-edit-save"]').click(); await sleep(80);
    var c6 = col.cards[0];
    ok('K3 答案已改 back', c6.back === '只和温度有关；浓度压强变了 K 不变');
    ok('K4 改完翻到答案面看到新答案', !!q('.mc-flip-back') && q('.mc-flip-back').textContent.indexOf('浓度压强变了') >= 0 && q('.mc-flipbox').className.indexOf('flipped') >= 0);

    /* 10. 取消不改 */
    q('[data-act="mc-edit-front"]').click(); await sleep(80);
    q('#mc-edit-ta').value = '被取消的改动';
    q('[data-act="mc-edit-cancel"]').click(); await sleep(80);
    var c7 = col.cards[0];
    ok('L1 取消不改 front', c7.front === '水解常数 K 只受什么影响？');

    /* 11. 页面自查：尺寸表 0 不符（__checkBuild 返回全部结果，真正的不符在每条 .bad 里） */
    try {
      var res = await window.__checkBuild(true);
      var realBad = (res || []).filter(function (x) { return x.bad; });
      ok('I1 __checkBuild 0 不符 (bad=' + realBad.length + ')', realBad.length === 0);
    } catch (e) { ok('I1 __checkBuild 调不动: ' + e.message, false); }

    ok('Z 无报错 (' + window.__errs.length + ' 条)', window.__errs.length === 0);
    if (window.__errs.length) out.push('ERRS: ' + window.__errs.join(' | '));
  } catch (e) {
    out.push('EXC ' + (e && e.message));
    out.push(e && e.stack ? String(e.stack).slice(0, 600) : '');
  }
  done = true; flush();
})();
