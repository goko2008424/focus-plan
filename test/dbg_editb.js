(function () {
  var out = [], errs = [];
  window.addEventListener('error', function (e) { errs.push(e.message + ' @' + (e.lineno || '')); });
  try {
    // 种子：一个合集两张卡
    App.store.data().memcards = (App.store.data().memcards || []).filter(function (c) { return c.name !== 'editb调试'; });
    App.memcards.phPut('ppok', 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==');
    var col = { id: 'COLE', name: 'editb调试', dayKey: App.store.todayKey(), cards: [
      { id: 'CDE1', front: '问题E1', back: '答案E1 提到一张图', frontImgs: [], backImgs: ['ppok', 'pp丢失的图id'] },
      { id: 'CDE2', front: '问题E2', back: '答案E2', frontImgs: [], backImgs: [] }]};
    App.store.data().memcards.push(col);
    App.store.save();

    App.memcards.openCol('COLE', {});
    var root = document.getElementById('modal-root') || document.body;
    out.push('modal has 翻面按钮: ' + (root.innerHTML.indexOf('翻面') >= 0));
    // 进复习态：点 🔄 翻面（或 mc-flip）
    var revBtn = root.querySelector('[data-act="mc-review"]');
    out.push('开始复习按钮: ' + !!revBtn);
    if (revBtn) revBtn.click();
    var flipBtn = root.querySelector('[data-act="mc-flip"]');
    if (flipBtn) flipBtn.click();
    out.push('flipped 显示看正面: ' + (root.innerHTML.indexOf('看正面') >= 0));
    // 点 改答案
    var eb = root.querySelector('[data-act="mc-edit-back"]');
    out.push('改答案按钮: ' + !!eb);
    if (eb) eb.click();
    var ta = root.querySelector('#mc-edit-ta');
    out.push('编辑框出现: ' + !!ta + ' 内容=' + (ta ? ta.value.slice(0, 10) : '-'));
    out.push('errs=' + errs.join(';;'));
    // 清理
    if (App.ui.closeModal) App.ui.closeModal();
    App.store.data().memcards = App.store.data().memcards.filter(function (c) { return c.name !== 'editb调试'; });
    App.store.save();
  } catch (e) { out.push('ERR ' + (e && e.stack || e)); }
  window.__probeResult = out.join('\n') + ' 完成';
})();
