(function () {
  var out = [], errs = [];
  window.addEventListener('error', function (e) { errs.push(e.message); });
  var RED = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  try {
    App.memcards.phPut('ppy2', RED);
    var col = { id: 'COLZ', name: '调试图卡B', dayKey: (function(){ var t=new Date(); t.setHours(0,0,0,0); return t.getFullYear()+'-'+String(t.getMonth()+1).padStart(2,'0')+'-'+String(t.getDate()).padStart(2,'0'); })(), cards: [
      { id: 'CDZ1', front: '题面', back: '答案', frontImgs: ['ppy2'], backImgs: ['ppy2'] }]};
    App.store.data().memcards = App.store.data().memcards || [];
    App.store.data().memcards.push(col);
    var tk = App.store.todayKey();
    var task = { id: 'PDZ1', text: '调试复习图B', mode: 'new', done: false,
      mcRef: { colId: 'COLZ', cardIds: null, n: 1 },
      sp: { planned: [{ n: 1, gap: 30, due: Date.now() - 60000, done: null, at: null, need: 1, hits: [] }] } };
    App.store.getDay(tk).tasks.required.push(task);
    App.store.save();
    App.tasks.srOpenReview(task, task.sp.planned[0]);
    var m = document.querySelector('#modal-root .modal');
    var img = m.querySelector('.rev-kp-q img.mc-img');
    // ★ 先点「看答案」（复现 probe 的顺序）
    m.querySelector('[data-reveal="0"]').click();
    out.push('after reveal: img in doc=' + document.body.contains(img) + ' onclick=' + typeof img.onclick);
    var zi = App.memcards.zoomImg;
    App.memcards.zoomImg = function (id) {
      out.push('zoomImg called: id=' + id + ' phGet=' + (App.memcards.phGet(id) ? 'yes' : 'no'));
      var r = zi.call(App.memcards, id);
      out.push('zoomImg returned, ov=' + !!document.querySelector('.mc-zoomov'));
      return r;
    };
    var orig2 = img.onclick;
    img.onclick = function () { try { orig2.call(this); out.push('orig2 ok'); } catch (e) { out.push('orig2 threw: ' + (e && e.message)); } };
    img.click();
    out.push('after reveal+click, ov=' + !!document.querySelector('.mc-zoomov'));
    // 不做 reveal 再点一次
    img.click();
    out.push('click again, ov=' + !!document.querySelector('.mc-zoomov'));
    var ov = document.querySelector('.mc-zoomov'); if (ov) ov.click();
    // 清理
    var arr = App.store.data().days[tk].tasks.required;
    var i = arr.indexOf(task); if (i >= 0) arr.splice(i, 1);
    var mc = App.store.data().memcards; var j = mc.indexOf(col); if (j >= 0) mc.splice(j, 1);
    App.memcards.phDel('ppy2');
    App.store.save();
    out.push('errs=' + errs.join(';;'));
  } catch (e) { out.push('ERR ' + (e && e.stack || e)); }
  window.__probeResult = out.join('\n') + ' 完成';
})();
