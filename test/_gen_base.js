// 生成 test/_base123.json（store.js 默认数据快照）—— 所有种子页的基底
// 用法: node test/_gen_base.js
global.window = global;
const mem = {};
global.localStorage = { getItem: k => (k in mem ? mem[k] : null),
                        setItem: (k, v) => { mem[k] = String(v); },
                        removeItem: k => { delete mem[k]; } };
const fs = require('fs');
const path = require('path');
eval(fs.readFileSync(path.join(__dirname, '..', 'js', 'store.js'), 'utf8'));
window.App.store.load();
setTimeout(() => fs.writeFileSync(path.join(__dirname, '_base123.json'), mem['focusPlanData.v1'] || ''), 400);
console.log('base written (400ms later)');
