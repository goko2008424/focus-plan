var out = []; var done = false;
function flush(){ window.__probeResult = 'CARDSTEXT:' + JSON.stringify(out); }
async function run() {
  try {
    await new Promise(function(r){ setTimeout(r, 600); });
    var d = JSON.parse(localStorage.getItem('focusPlanData.v1'));
    (d.memcards||[]).forEach(function(col){
      if (!(col.cards||[]).length) return;
      var need = 0, have = 0;
      var cards = [];
      (col.cards||[]).forEach(function(c, i){
        var fi = c.frontImgs||[], bi = c.backImgs||[];
        need += fi.length + bi.length;
        var inLib = fi.concat(bi).filter(function(x){ return App.memcards.allPhotos()[x]; }).length;
        have += inLib;
        if (fi.length || bi.length) cards.push({ i: i+1, front: (c.front||'').slice(0, 30), need: fi.length + bi.length, have: inLib });
      });
      if (need) out.push({ name: col.name, dayKey: col.dayKey || '', need: need, have: have, cards: cards });
    });
  } catch (e) { out.push({ name: 'ERR', msg: e && e.message }); }
  done = true; flush();
}
run();
