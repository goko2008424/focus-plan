var out = []; var done = false;
function flush(){ window.__probeResult = out.join('\n'); }
async function run() {
  try {
    await new Promise(function(r){ setTimeout(r, 800); });
    // 自己从 localStorage 抽引用（克隆环境里有他的真实数据）
    var d = JSON.parse(localStorage.getItem('focusPlanData.v1'));
    var refs = [];
    (d.memcards||[]).forEach(function(col){ (col.cards||[]).forEach(function(c){
      (c.frontImgs||[]).forEach(function(x){ refs.push(x); });
      (c.backImgs||[]).forEach(function(x){ refs.push(x); });
    });});
    var uniq = []; var u = {};
    refs.forEach(function(x){ if(!u[x]){u[x]=1;uniq.push(x);} });
    var all = App.memcards.allPhotos();
    var have = {};
    Object.keys(all).forEach(function(k){ have[k] = 1; });
    var missing = uniq.filter(function(x){ return !have[x]; });
    out.push('图库实际张数: ' + Object.keys(all).length);
    out.push('卡引用: ' + uniq.length + ' | 图库覆盖: ' + (uniq.length - missing.length) + ' | 缺: ' + missing.length);
    var pre = {};
    missing.forEach(function(x){ var p = x.slice(0,4); pre[p] = (pre[p]||0)+1; });
    out.push('缺id前缀分布: ' + JSON.stringify(pre));
    out.push('MISSING:' + JSON.stringify(missing));
  } catch (e) { out.push('ERR ' + (e && e.message)); }
  done = true; flush();
}
run();
