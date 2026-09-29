(function () {
  var out = [];
  try {
    var x = new XMLHttpRequest();
    x.open('GET', 'test/probe_v124.js', false); x.send();
    out.push('fetch status=' + x.status + ' len=' + x.responseText.length);
    try { new Function(x.responseText)(); out.push('eval ok'); }
    catch (e) { out.push('eval threw: ' + (e && e.message)); }
    out.push('started marker=' + window.__p124_started);
    out.push('result now=' + String(window.__probeResult || '').slice(0, 120));
  } catch (e) { out.push('ERR ' + (e && e.stack || e)); }
  window.__probeResult = out.join('\n') + ' 完成';
})();
