// site-audit 种子页构建（动态日期）→ _sa_t.html；用法: node test/build_sa.js
// 种子：队列 3 条、每日 1 条、今天 2 条任务（T1 带小任务）、时间轴 1 条
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

const d = JSON.parse(fs.readFileSync(path.join(__dirname, '_base123.json'), 'utf8'));
const now = new Date();
const key = (dt) => dt.getFullYear() + '-' + String(dt.getMonth() + 1).padStart(2, '0') + '-' + String(dt.getDate()).padStart(2, '0');
const today = key(now);

function mk() {
  return { tasks: { required: [], ideal: [], extra: [] }, sessions: [], timeline: [], rewards: [],
    hourPlans: [], activeHourPlan: null, rests: [], activeRest: null, plannedHourPlans: [],
    sports: [], lectures: [], activeLecture: null, ended: false };
}
d.days = {};
d.days[today] = mk();
d.days[today].tasks.required.push(
  { id: 'T1', text: '化学 · 平衡常数', done: false, mode: 'new', points: 10,
    subs: [
      { id: 'TS1', text: '例题 5-1', minutes: 12, points: 0, done: null },
      { id: 'TS2', text: '例题 5-2', minutes: 8, points: 0, done: null }
    ] },
  { id: 'T2', text: '数学 · 导数错题', done: false, mode: 'rev', points: 10 }
);
d.days[today].timeline.push({ id: 'TL1', start: 540, end: 565, minutes: 25, content: '学习', category: 'study', countAsStudy: true, auto: false });
d.queue = [
  { id: 'Q1', text: '数学卷子 1', minutes: 30, done: false, added: 1 },
  { id: 'Q2', text: '物理实验报告', minutes: 20, done: false, added: 2 },
  { id: 'Q3', text: '背英语单词', minutes: 15, done: false, added: 3 }
];
d.daily = [{ id: 'D1', text: '喝水 8 杯', points: 2, pinnedDay: today, done: null }];
d.queueDone = [];
d.checkins = [];
d.ledger = [];
d.trash = [];

const seed = JSON.stringify(d);
let html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const inject = '<script>window.__SA_SEED=' + seed + ';try{localStorage.setItem("focusPlanData.v1",JSON.stringify(window.__SA_SEED));localStorage.setItem("__seeded","1");}catch(e){document.title="SEED-FAIL";}</script>';
html = html.replace('</head>', inject + '\n</head>');
if (!html.includes('__SA_SEED')) throw new Error('inject failed');
fs.writeFileSync(path.join(ROOT, '_sa_t.html'), html, 'utf8');
console.log('built _sa_t.html for', today);
