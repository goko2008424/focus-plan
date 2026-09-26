// deep-scan 标准种子页构建（动态日期）→ _ds_t.html；用法: node test/build_ds.js
// 种子要求（deep-scan SEED 自检）：queue=2，今天必须栏 T1/T2/T3 且无 T4，T1 带小任务+任务组
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

const d = JSON.parse(fs.readFileSync(path.join(__dirname, '_base123.json'), 'utf8'));
const MS = (s) => Date.parse(s);

function mkDay() {
  return { tasks: { required: [], ideal: [], extra: [] }, sessions: [], timeline: [], rewards: [],
    hourPlans: [], activeHourPlan: null, rests: [], activeRest: null, plannedHourPlans: [],
    sports: [], lectures: [], activeLecture: null, ended: true };
}
const now = new Date();
const key = (dt) => dt.getFullYear() + '-' + String(dt.getMonth() + 1).padStart(2, '0') + '-' + String(dt.getDate()).padStart(2, '0');
const today = key(now);

d.days = {};
d.days[today] = mkDay();
const T = d.days[today];

T.tasks.required.push({
  id: 'T1', text: '化学 · 平衡常数', done: false, mode: 'new', points: 10,
  subs: [
    { id: 'TS1', text: '例题 5-1', minutes: 12, points: 0, done: null },
    { id: 'TS2', text: '例题 5-2', minutes: 8, points: 0, done: null }
  ],
  groups: [
    { id: 'TG1', name: '第 1 组', subs: [
      { id: 'TGS1', text: '1.2.1.6', minutes: 11, points: 0, done: null },
      { id: 'TGS2', text: '函数分段', minutes: 2, points: 0, done: null }
    ] }
  ]
});
T.tasks.required.push({
  id: 'T2', text: '数学 · 导数错题', done: false, mode: 'rev', points: 10,
  sp: { planned: [
    { n: 1, gap: 30, due: MS(today + 'T09:00:00'), done: true, at: MS(today + 'T09:30:00'), need: 1, hits: [MS(today + 'T09:30:00')], result: 'ok' },
    { n: 2, gap: 1440, due: MS(today + 'T20:00:00'), done: null, at: null, need: 1, hits: [] }
  ], dl: '', at: MS(today + 'T08:00:00'), bonus: false, cfg: null }
});
T.tasks.required.push({ id: 'T3', text: '英语 · 完形填空', done: false, points: 10 });
T.tasks.extra.push({ id: 'E1', text: '整理错题本', done: false });
T.sessions.push({ id: 'S1', taskId: 'T1', taskText: '化学 · 平衡常数', planMinutes: 25, actualMinutes: 25,
  startAt: today + 'T09:00:00', endAt: today + 'T09:25:00', pausedMs: 0, done: true });
T.timeline.push({ id: 'TL1', start: 540, end: 565, minutes: 25, content: '学习', category: 'study', countAsStudy: true, auto: false });

d.queue = [
  { id: 'Q1', text: '数学卷子 1', minutes: 30, done: false, added: Date.now() },
  { id: 'Q2', text: '物理实验报告', minutes: 20, done: false, added: Date.now() }
];
d.queueDone = [];
d.checkins = [{ id: 'ck1', text: '喝水', points: 1, target: 3, note: '', createdAt: Date.now(), days: {} }];
d.ledger = [];
d.trash = [];

const seedJson = JSON.stringify(d);
let html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const inject = '<script>window.__DS_SEED = ' + seedJson + ';\n' +
  'try{ localStorage.setItem("focusPlanData.v1", JSON.stringify(window.__DS_SEED)); localStorage.setItem("__seeded","1"); }catch(e){ document.title = "SEED-FAIL"; }</script>';
html = html.replace('</head>', inject + '\n</head>');
if (!html.includes('__DS_SEED')) throw new Error('inject failed');
fs.writeFileSync(path.join(ROOT, '_ds_t.html'), html, 'utf8');
console.log('built _ds_t.html for', today, 'seed bytes =', seedJson.length);
