var out = []; var done = false;
function flush(){ window.__probeResult = 'done=' + done + '\n' + out.join('\n'); }
async function run() {
  try {
    await new Promise(function(r){ setTimeout(r, 600); });
    var d = JSON.parse(localStorage.getItem('focusPlanData.v1'));
    var cols = [];
    (d.memcards||[]).forEach(function(col){
      if (!(col.cards||[]).length) return;
      var cards = (col.cards||[]).map(function(c){
        return { front: (c.front||'').slice(0,60), refs: [].concat(c.frontImgs||[], c.backImgs||[]) };
      }).filter(function(c){ return c.refs.length > 0; });
      if (cards.length) cols.push({ name: col.name, dayKey: col.dayKey||'', cards: cards });
    });
    out.push('CARDS:' + JSON.stringify(cols));
  } catch (e) { out.push('ERR ' + (e && e.message)); }
  done = true; flush();
}
run();
