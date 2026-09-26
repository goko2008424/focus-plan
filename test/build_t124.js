// v124 复盘看板 测试页构建（含 v125/v126/v128 复用所需的一切种子）
// 用法: 在 focus-plan 目录下 node test/build_t124.js  → 生成根目录 _v124_t.html
// 🔴 种子日期全部动态生成（周一 = 本真实周的周一），周滚动后断言依然成立：
//    本周: mon+0 化学45@21:00+时间轴30 / mon+1 数学60@14:00 / mon+2 物理30@22:30 / mon+3 化学25@9:00+英语15@23:00+时间轴20
//    上周: mon-6 历史60    未来: mon+8（绝不能被统计）
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

const d = JSON.parse(fs.readFileSync(path.join(__dirname, '_base123.json'), 'utf8'));
const MS = (s) => Date.parse(s); // 本地时区

const TODAY = new Date(); TODAY.setHours(0, 0, 0, 0);
const MON = new Date(TODAY); MON.setDate(MON.getDate() - ((MON.getDay() + 6) % 7));
const key = (dt) => dt.getFullYear() + '-' + String(dt.getMonth() + 1).padStart(2, '0') + '-' + String(dt.getDate()).padStart(2, '0');
const at = (offset, hm) => { const x = new Date(MON); x.setDate(x.getDate() + offset); return key(x) + 'T' + hm; };
const K = {}; // 偏移 → 日期key
for (let i = -7; i <= 10; i++) { const x = new Date(MON); x.setDate(x.getDate() + i); K[i] = key(x); }

function mkDay() {
  return { tasks: { required: [], ideal: [], extra: [] }, sessions: [], timeline: [], rewards: [],
    hourPlans: [], activeHourPlan: null, rests: [], activeRest: null, plannedHourPlans: [],
    sports: [], lectures: [], activeLecture: null, ended: true };
}
const day = (k) => (d.days[k] = mkDay());

// ---- 本周 mon+0 ----
const dA = day(K[0]);
dA.tasks.required.push({ id: 'R1', text: '化学 · 平衡常数', done: true, points: 10 });
dA.sessions.push({ id: 'S1', taskId: 'R1', taskText: '化学 · 平衡常数', planMinutes: 45, actualMinutes: 45,
  startAt: at(0, '21:00:00'), endAt: at(0, '21:45:00'), pausedMs: 0, done: true });
dA.timeline.push({ id: 'TL1', start: 1260, end: 1290, minutes: 30, content: '学习', category: 'study', countAsStudy: true, auto: false });

// ---- mon+1 ----
const dB = day(K[1]);
dB.tasks.required.push({ id: 'R2a', text: '数学 · 导数错题', done: true, points: 10 });
dB.tasks.required.push({ id: 'R2b', text: '整理房间', done: false, points: 5 });
dB.tasks.ideal.push({ id: 'I1', text: '英语 · 完形填空', done: true, points: 10,
  sp: { planned: [{ n: 1, gap: 1440, due: MS(at(0, '20:00:00')), done: true, at: MS(at(1, '21:00:00')),
    need: 1, hits: [MS(at(1, '21:00:00'))], result: 'no', resultAt: MS(at(1, '21:00:00')) }], dl: '', at: MS(at(0, '08:00:00')), bonus: false, cfg: null } });
dB.sessions.push({ id: 'S2', taskId: 'R2a', taskText: '数学 · 导数错题', planMinutes: 60, actualMinutes: 60,
  startAt: at(1, '14:00:00'), endAt: at(1, '15:00:00'), pausedMs: 0, done: true });

// ---- mon+2 ----
const dC = day(K[2]);
dC.tasks.extra.push({ id: 'E1', text: '整理错题本', done: true, points: 5 });
dC.sessions.push({ id: 'S3', taskId: 'E1', taskText: '物理 · 力学实验', planMinutes: 30, actualMinutes: 30,
  startAt: at(2, '22:30:00'), endAt: at(2, '23:00:00'), pausedMs: 0, done: true });

// ---- mon+3（今天或最近几天）----
const dD = day(K[3]);
const R4 = { id: 'R4', text: '生物 · 遗传规律', done: true, points: 10,
  sp: { planned: [{ n: 1, gap: 30, due: MS(at(3, '09:00:00')), done: true, at: MS(at(3, '10:00:00')),
    need: 1, hits: [MS(at(3, '10:00:00'))], result: 'ok', resultAt: MS(at(3, '10:00:00')) }], dl: '', at: MS(at(3, '08:00:00')), bonus: false, cfg: null } };
dD.tasks.required.push(R4);
dD.sessions.push({ id: 'S4', taskId: 'R4', taskText: '化学 · 平衡常数', planMinutes: 25, actualMinutes: 25,
  startAt: at(3, '09:00:00'), endAt: at(3, '09:25:00'), pausedMs: 0, done: true });
dD.sessions.push({ id: 'S5', taskId: 'S5x', taskText: '背英语单词 30 分', planMinutes: 15, actualMinutes: 15,
  startAt: at(3, '23:00:00'), endAt: at(3, '23:15:00'), pausedMs: 0, done: true });
dD.timeline.push({ id: 'TL2', start: 480, end: 500, minutes: 20, content: '学习', category: 'study', countAsStudy: true, auto: false });

// 去重用例：同一轮（同 at|n|text）也放在 queueDone 载体上 → 只能算一次
d.queueDone = [{ id: 'QD1', text: '生物 · 遗传规律', minutes: 25, done: true,
  sp: { planned: [{ n: 1, gap: 30, due: MS(at(3, '09:00:00')), done: true, at: MS(at(3, '10:00:00')),
    need: 1, hits: [MS(at(3, '10:00:00'))], result: 'ok', resultAt: MS(at(3, '10:00:00')) }] } }];

// ---- 未来日期（绝不能被统计进去）----
const dFut = day(K[8]);
dFut.timeline.push({ id: 'TLF', start: 600, end: 1200, minutes: 600, content: '学习', category: 'study', countAsStudy: true, auto: false });
dFut.sessions.push({ id: 'SF', taskText: '化学 · 未来不该出现', actualMinutes: 500, startAt: at(8, '10:00:00'), endAt: at(8, '18:20:00') });

// ---- 上周 ----
const dPrev = day(K[-6]);
dPrev.tasks.required.push({ id: 'LR1', text: '历史 · 甲午战争', done: true, points: 10 });
dPrev.timeline.push({ id: 'TLL', start: 1200, end: 1260, minutes: 60, content: '学习', category: 'study', countAsStudy: true, auto: false });

// ---- 打卡 / 账本 / 考试成绩（v128）----
d.checkins = [{ id: 'ck1', text: '喝水', points: 1, target: 3, note: '', createdAt: MS(at(-20, '08:00:00')),
  days: (function () { const o = {}; o[K[0]] = 2; o[K[1]] = 1; o[K[3]] = 3; return o; })() }];
d.ledger = [
  { id: 'L1', type: 'earn-ideal', points: 10, date: K[1], note: '', at: MS(at(1, '20:00:00')) },
  { id: 'L2', type: 'redeem', points: -30, date: K[2], note: '兑换：一包零食', at: MS(at(2, '21:00:00')) },
  { id: 'L3', type: 'earn-sub', points: 5, date: K[3], note: '', at: MS(at(3, '12:00:00')) },
  { id: 'L4', type: 'earn-ideal', points: 10, date: K[-6], note: '', at: MS(at(-6, '20:00:00')) }
];
d.exams = [
  { id: 'EX1', date: '2026-09-05', subject: '化学', score: 72, full: 100, type: '月考', note: '' },
  { id: 'EX2', date: '2026-09-12', subject: '数学', score: 95, full: 120, type: '周测', note: '' },
  { id: 'EX3', date: '2026-09-19', subject: '化学', score: 81, full: 100, type: '月考', note: '平衡常数进步了' },
  { id: 'EX4', date: '2026-09-24', subject: '化学', score: 88, full: 100, type: '周测', note: '' }
];
// ---- 错题本（v129）----
d.mistakes = [
  { id: 'MK1', date: K[1], subject: '化学', source: '一轮复习卷 P3-16',
    desc: '平衡常数计算：恒温恒容下充入 2mol N2、6mol H2，平衡时 NH3 为 1.2mol，求 K。', kp: '平衡常数',
    note: '三段式列错了起始量 —— 用浓度还是物质的量要先看清容器条件。', status: 'todo',
    redos: [{ at: MS(at(2, '20:00:00')), result: 'no' }], photoIds: [], at: MS(at(1, '18:00:00')) },
  { id: 'MK2', date: K[0], subject: '数学', source: '周测 T12',
    desc: '导数含参讨论：f(x)=x^2-a·ln x 单调性。', kp: '导数分类讨论',
    note: '漏了 a<=0 的情形。', status: 'mastered',
    redos: [{ at: MS(at(2, '21:00:00')), result: 'ok' }], photoIds: [], at: MS(at(0, '19:00:00')) },
  { id: 'MK3', date: K[2], subject: '物理', source: '课本例题',
    desc: '受力分析：斜面上叠加体块的临界条件。', kp: '', note: '', status: 'dropped',
    redos: [], photoIds: [], at: MS(at(2, '12:00:00')) }
];
d.queue = [];

// ---- 生成测试页 ----
const seedJson = JSON.stringify(d);
if (seedJson.includes('</script')) throw new Error('seed contains </script');
let html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const inject = '<script>window.__V124_SEED = ' + seedJson + ';\n' +
  'try{ localStorage.setItem("focusPlanData.v1", JSON.stringify(window.__V124_SEED)); localStorage.setItem("__seeded","1"); }catch(e){ document.title = "SEED-FAIL"; }</script>';
html = html.replace('</head>', inject + '\n</head>');
if (!html.includes('__V124_SEED')) throw new Error('inject failed');
fs.writeFileSync(path.join(ROOT, '_v124_t.html'), html, 'utf8');
console.log('built _v124_t.html; week monday =', K[0], '; seed bytes =', seedJson.length);
