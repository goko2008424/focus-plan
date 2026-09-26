// 带视口模拟的 cdp-run 变体 —— 手机端断言用
// 用法: node test/cdp_run_m.js <url> <cdpPort> <jsFile> [width] [height]
const http = require('http');
const fs = require('fs');

const [url, portArg, jsFile, wArg, hArg] = process.argv.slice(2);
const PORT = +(portArg || 9333);
const W = +(wArg || 390), H = +(hArg || 844);

function req(method, path) {
  return new Promise((res, rej) => {
    const r = http.request({ host: '127.0.0.1', port: PORT, path, method }, resp => {
      let d = '';
      resp.on('data', c => d += c);
      resp.on('end', () => res(d));
    });
    r.on('error', rej);
    r.end();
  });
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  let raw = await req('PUT', '/json/new?' + encodeURIComponent(url));
  let info;
  try { info = JSON.parse(raw); } catch (e) {
    info = JSON.parse(await req('GET', '/json/new?' + encodeURIComponent(url)));
  }
  const ws = new WebSocket(info.webSocketDebuggerUrl);
  let id = 0;
  const pending = new Map();
  ws.addEventListener('message', ev => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  });
  await new Promise(r => ws.addEventListener('open', r));
  const send = (method, params) => new Promise(res => {
    const i = ++id;
    pending.set(i, res);
    ws.send(JSON.stringify({ id: i, method, params: params || {} }));
  });
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 2, mobile: true });

  for (let i = 0; i < 60; i++) {
    const r = await send('Runtime.evaluate', { expression: '!!(window.App && App.tasks)', returnByValue: true });
    if (r.result && r.result.result && r.result.result.value) break;
    await sleep(400);
  }
  if (jsFile) {
    await send('Runtime.evaluate', { expression: fs.readFileSync(jsFile, 'utf8'), awaitPromise: false });
  }
  const t0 = Date.now();
  let val = '';
  while (Date.now() - t0 < 45000) {
    const r = await send('Runtime.evaluate', { expression: 'window.__probeResult || ""', returnByValue: true });
    val = (r && r.result && r.result.result && r.result.result.value) || '';
    if (val && /完成$/.test(val)) break;
    await sleep(500);
  }
  console.log(val || '(TIMEOUT 没拿到结果)');
  try { ws.close(); } catch (e) { }
  try { await req('GET', '/json/close/' + info.id); } catch (e) { }
  process.exit(0);
})();
