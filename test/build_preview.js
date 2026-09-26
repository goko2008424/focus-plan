// 打包单文件预览版：把 v131 的样式+全部脚本+演示种子打进一个 HTML
// 用法: 先 node test/build_t124.js（拿最新种子），再 node test/build_preview.js
// 产出: D:/dsh任务插件/focus-plan-预览-v131.html（双击即开，file:// 存储与线上隔离）
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const OUT = 'D:/dsh任务插件/focus-plan-预览-v132.html';

let html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

// ---- 1) 内联样式表 ----
const css = fs.readFileSync(path.join(ROOT, 'css', 'style.css'), 'utf8');
html = html.replace(/<link rel="stylesheet" href="css\/style.css\?v=\d+" \/>/,
  '<style>\n/* css/style.css 内联 */\n' + css + '\n</style>');

// ---- 2) 内联全部脚本 ----
const scriptRe = /<script src="js\/([\w.]+)\?v=\d+"><\/script>/g;
let m, count = 0;
while ((m = scriptRe.exec(html)) !== null) {
  const name = m[1];
  const js = fs.readFileSync(path.join(ROOT, 'js', name), 'utf8');
  if (js.includes('</script')) throw new Error(name + ' 含 </script，不能内联');
  html = html.replace(m[0], '<script>\n/* js/' + name + ' 内联 */\n' + js + '\n</script>');
  count++;
}
console.log('inlined scripts:', count);

// ---- 3) 去掉 build-check（file:// 下 fetch 不了，会弹假红条）----
const bcStart = html.indexOf('<script id="build-check">');
if (bcStart >= 0) {
  const bcEnd = html.indexOf('</script>', bcStart) + '</script>'.length;
  html = html.slice(0, bcStart) + '<!-- build-check 已在预览版中省略 -->' + html.slice(bcEnd);
}

// ---- 4) 藏掉错题本入口（用户：有类似的东西了；代码保留，入口不显示）----
html = html.replace('<button class="nav-btn" data-view="mistakes" title="错题本：拍照收错题，隔阵子重做，写出来了才算结">📕 错题</button>',
  '<button class="nav-btn" data-view="mistakes" style="display:none" title="错题本（预览版隐藏）">📕 错题</button>');
html = html.replace('<button class="nav-btn mn-sbtn" data-view="mistakes">📕 错题</button>',
  '<button class="nav-btn mn-sbtn" data-view="mistakes" style="display:none">📕 错题</button>');

// ---- 5) 注入演示种子（从 _v124_t.html 里提取，日期是动态生成的）----
const t124 = fs.readFileSync(path.join(ROOT, '_v124_t.html'), 'utf8');
const seedM = t124.match(/window\.__V124_SEED = (\{[\s\S]*?\});\n/);
if (!seedM) throw new Error('seed not found in _v124_t.html');
const seed = seedM[1];
if (seed.includes('</script')) throw new Error('seed unsafe');
html = html.replace('</head>',
  '<script>window.__V124_SEED = ' + seed + ';\n' +
  'try{ localStorage.setItem("focusPlanData.v1", JSON.stringify(window.__V124_SEED)); localStorage.setItem("__seeded","1"); }catch(e){ document.title = "SEED-FAIL"; }</script>\n</head>');

// ---- 6) 标题标注预览 ----
html = html.replace('<title>', '<title>【预览·演示数据】');

// ---- 7) 校验没有外链残留 ----
const leftovers = html.match(/src="js\/[^"]+"/g) || [];
if (leftovers.length) throw new Error('还有外链脚本: ' + leftovers.join(','));
if (html.includes('css/style.css?v=')) throw new Error('样式表没内联干净');

fs.writeFileSync(OUT, html, 'utf8');
console.log('written', OUT, (fs.statSync(OUT).size / 1024 / 1024).toFixed(2) + ' MB');
