/* 极简静态服务器：局域网分享用
 * 运行：node server.js  (默认 8080 端口)
 * 同 WiFi 下的设备访问 http://<本机IP>:8080 即可使用
 */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const PORT = process.env.PORT || 8080;
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json'
};

const server = http.createServer(function (req, res) {
  let urlPath = decodeURIComponent(req.url.split('?')[0]);
  if (urlPath === '/') urlPath = '/index.html';
  const filePath = path.join(ROOT, urlPath);
  if (!filePath.startsWith(ROOT)) { res.writeHead(403); res.end('Forbidden'); return; }
  fs.readFile(filePath, function (err, buf) {
    if (err) { res.writeHead(404); res.end('Not Found'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream' });
    res.end(buf);
  });
});

server.listen(PORT, '0.0.0.0', function () {
  const os = require('os');
  const nets = os.networkInterfaces();
  const ips = [];
  Object.keys(nets).forEach(function (name) {
    (nets[name] || []).forEach(function (n) {
      if (n.family === 'IPv4' && !n.internal) ips.push(n.address);
    });
  });
  console.log('专注计划 已启动！');
  console.log('本机访问:  http://localhost:' + PORT);
  ips.forEach(function (ip) { console.log('局域网分享: http://' + ip + ':' + PORT); });
});