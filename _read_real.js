var out = []; var done = false;
function flush(){ window.__probeResult = out.join('\n'); }
async function run() {
  try {
    await new Promise(function(r){ setTimeout(r, 800); });
    var raw = localStorage.getItem('focusPlanData.v1');
    out.push('hasData=' + !!raw + ' len=' + (raw ? raw.length : 0));
    if (raw) {
      var d = JSON.parse(raw);
      var totalCards = 0, totalImgs = 0, refs = [];
      (d.memcards||[]).forEach(function(col){
        var imgs = 0;
        (col.cards||[]).forEach(function(c){
          totalCards++;
          var fi = c.frontImgs||[], bi = c.backImgs||[];
          imgs += fi.length + bi.length;
          fi.forEach(function(x){ refs.push(x); });
          bi.forEach(function(x){ refs.push(x); });
        });
        totalImgs += imgs;
        out.push(col.name + ': ' + (col.cards||[]).length + ' 卡 / ' + imgs + ' 图引用');
      });
      out.push('--- 总计: ' + totalCards + ' 卡, ' + totalImgs + ' 图引用, 去重 ' + (function(a){var u={},r=[];a.forEach(function(x){if(!u[x]){u[x]=1;r.push(x);}});return r;})(refs).length + ' 个唯一id');
      out.push('REFS:' + JSON.stringify(refs));
      // 图库状态
      var stats = (App.memcards && App.memcards.photoStats) ? App.memcards.photoStats() : null;
      out.push('图库(克隆环境): ' + (stats ? stats.n + ' 张' : '未知'));
    }
  } catch (e) { out.push('ERR ' + (e && e.message)); }
  done = true; flush();
}
run();
