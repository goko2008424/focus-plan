var out = []; var done = false;
function flush(){ window.__probeResult = out.join('\n'); }
async function run() {
  try {
    await new Promise(function(r){ setTimeout(r, 600); });
    var d = JSON.parse(localStorage.getItem('focusPlanData.v1'));
    var all = App.memcards.allPhotos();
    (d.memcards||[]).forEach(function(col){
      if (!(col.cards||[]).length) return;
      var need = 0, have = 0;
      (col.cards||[]).forEach(function(c){
        var fi = c.frontImgs||[], bi = c.backImgs||[];
        fi.concat(bi).forEach(function(x){ need++; if (all[x]) have++; });
      });
      if (need) out.push(col.name + ' | 排期日:' + (col.dayKey||'?') + ' | 卡' + (col.cards||[]).length + ' | 图' + need + ' | 图库已有' + have);
    });
  } catch (e) { out.push('ERR ' + (e && e.message)); }
  done = true; flush();
}
run();
