/* ============================================================
 * badges.js — 🏅 成就徽章墙（v131）
 *
 * 为什么要有它：积分管的是"每一次"，徽章管的是"一路上"。
 * 连击、专注总时长、复习、错题、考试……每个里程碑一枚徽章，
 * 解锁时间永久记录；差一步的会显示进度条，勾着你回来。
 *
 * 数据（懒初始化）：
 *   data.badges = { 徽章id: '解锁时间ISO' }   —— 只记解锁过的
 *
 * 原则：
 *   · 统计全部来自本地账本（全量扫 days/ledger/checkins/memcards/mistakes/exams）
 *   · 解锁条件只会在达标时写入，绝不撤销（后来数据变了也不收回徽章）
 *   · 72 小时内解锁的带 NEW 光效
 * ============================================================ */
(function () {
  'use strict';

  const App = (window.App = window.App || {});
  const S = function () { return App.store; };

  /** 全量统计快照（每次渲染算一遍，量级：几百天，无压力） */
  function stats() {
    const d = S().data();
    const tk = S().todayKey();
    const st = {
      focusMin: 0, bestDayMin: 0, taskDone: 0,
      earlyN: 0, nightN: 0,
      revDone: 0, revOk: 0,
      earned: 0, cards: 0,
      ckDays: 0, curStreak: 0, maxStreak: 0,
      mistMastered: 0, examN: 0
    };
    const seen = {};
    const countRounds = function (plan, text) {
      (plan || []).forEach(function (r) {
        if (r.done !== true || !r.at) return;
        const kk = r.at + '|' + (r.n || 0) + '|' + (text || '');
        if (seen[kk]) return;
        seen[kk] = true;
        st.revDone++;
        if (r.result === 'ok') st.revOk++;
      });
    };
    const cked = {};
    Object.keys(d.days || {}).forEach(function (k) {
      if (k > tk) return;
      const day = d.days[k];
      (day.sessions || []).forEach(function (s) {
        st.focusMin += s.actualMinutes || 0;
        if (s.startAt) {
          const h = new Date(s.startAt).getHours();
          if (h < 8) st.earlyN++;
          if (h < 5) st.nightN++;
        }
      });
      let dayStudy = 0;
      (day.timeline || []).forEach(function (r) {
        if (r.category === 'study' && r.countAsStudy !== false) dayStudy += r.minutes || 0;
        else if (r.category === 'extend') dayStudy += r.minutes || 0;
      });
      if (dayStudy > st.bestDayMin) st.bestDayMin = dayStudy;
      ['required', 'ideal', 'extra'].forEach(function (lk) {
        (day.tasks[lk] || []).forEach(function (t) {
          if (t.done) st.taskDone++;
          countRounds(t.sp && t.sp.planned, t.text);
        });
      });
      (d.checkins || []).forEach(function (ci) { if (ci.days && ci.days[k]) cked[k] = true; });
    });
    ['queue', 'queueDone'].forEach(function (arr) {
      (d[arr] || []).forEach(function (q) { countRounds(q.sp && q.sp.planned, q.text); });
    });
    (d.ledger || []).forEach(function (e) { if ((e.points || 0) > 0) st.earned += e.points; });
    (d.memcards || []).forEach(function (c) { st.cards += (c.cards || []).length; });
    (d.mistakes || []).forEach(function (m) { if (m.status === 'mastered') st.mistMastered++; });
    st.examN = (d.exams || []).length;
    // 打卡连击
    st.ckDays = Object.keys(cked).length;
    let run = 0;
    for (let i = 0; i < 4000; i++) {
      const x = new Date(); x.setDate(x.getDate() - i);
      const k = S().dateKey(x);
      if (cked[k]) {
        run++;
        if (run > st.maxStreak) st.maxStreak = run;
        if (i === 0) st.curStreak = -1;              // 今天打了，下面接上
        else if (st.curStreak === -1) st.curStreak = run;
      } else {
        if (i === 0) st.curStreak = 0;               // 今天还没打
        else if (i === 1) st.curStreak = run;        // 今天没打但从昨天接着算
        run = 0;
      }
      if (i > 400 && !cked[k]) break;
    }
    if (st.curStreak === -1) st.curStreak = run;
    return st;
  }

  const DEFS = [
    { id: 'rev1',      icon: '🌱', name: '迈出第一步', desc: '完成第 1 轮复习',            unit: '轮', target: 1,    prog: s => [s.revDone] },
    { id: 'exam3',     icon: '📈', name: '开卷',       desc: '记下 3 次考试成绩',          unit: '次', target: 3,    prog: s => [s.examN] },
    { id: 'mist1',     icon: '📕', name: '错题初猎',   desc: '巩固 1 道错题',              unit: '道', target: 1,    prog: s => [s.mistMastered], mist: true },
    { id: 'streak3',   icon: '🔥', name: '连击起步',   desc: '连续打卡 3 天',              unit: '天', target: 3,    prog: s => [s.maxStreak] },
    { id: 'streak7',   icon: '🔥', name: '一周不断',   desc: '连续打卡 7 天',              unit: '天', target: 7,    prog: s => [s.maxStreak] },
    { id: 'streak30',  icon: '🌙', name: '月满一轮',   desc: '连续打卡 30 天',             unit: '天', target: 30,   prog: s => [s.maxStreak] },
    { id: 'streak100', icon: '💯', name: '百日筑基',   desc: '连续打卡 100 天',            unit: '天', target: 100,  prog: s => [s.maxStreak] },
    { id: 'focus10',   icon: '⏱', name: '专注入门',   desc: '累计计时专注 10 小时',       unit: '分钟', target: 600,  prog: s => [s.focusMin], fmt: m => Math.round(m / 60 * 10) / 10 + '小时' },
    { id: 'focus100',  icon: '⏱', name: '百时之功',   desc: '累计计时专注 100 小时',      unit: '分钟', target: 6000, prog: s => [s.focusMin], fmt: m => Math.round(m / 60 * 10) / 10 + '小时' },
    { id: 'day5h',     icon: '⛰', name: '巅峰一日',   desc: '单日学习满 5 小时',          unit: '分钟', target: 300,  prog: s => [s.bestDayMin], fmt: m => Math.round(m / 60 * 10) / 10 + '小时' },
    { id: 'rev50',     icon: '🌱', name: '温故五十',   desc: '完成 50 轮复习',             unit: '轮', target: 50,   prog: s => [s.revDone] },
    { id: 'revOk30',   icon: '🎯', name: '写出来三十', desc: '30 次复习「写出来了」',      unit: '次', target: 30,   prog: s => [s.revOk] },
    { id: 'mist20',    icon: '📕', name: '错题猎手',   desc: '巩固 20 道错题',             unit: '道', target: 20,   prog: s => [s.mistMastered], mist: true },
    { id: 'earned1k',  icon: '💰', name: '千分俱乐部', desc: '累计挣到 1000 积分',         unit: '分', target: 1000, prog: s => [s.earned] },
    { id: 'cards100',  icon: '🃏', name: '百卡大军',   desc: '做出 100 张设问卡',          unit: '张', target: 100,  prog: s => [s.cards] },
    { id: 'early7',    icon: '🌅', name: '早起鸟',     desc: '8 点前开始计时 7 次',        unit: '次', target: 7,    prog: s => [s.earlyN] },
    { id: 'night10',   icon: '🦉', name: '夜猫子认证', desc: '0 点后还在计时 10 次（不奖励，就是给你看个数据）', unit: '次', target: 10, prog: s => [s.nightN] }
  ];

  function BD() {
    const d = S().data();
    if (!d.badges || typeof d.badges !== 'object') d.badges = {};
    return d.badges;
  }

  /** 错题本入口收起了吗（v132：收起时成就墙也藏过错题两枚，免得永远 0/N） */
  function mistakesOn() {
    const btn = document.querySelector('.nav-btn[data-view="mistakes"]');
    return !btn || btn.style.display !== 'none';
  }

  /** 渲染成就卡（挂在历史页） */
  function render() {
    if (typeof App.app !== 'undefined' && App.app.currentView() !== 'stats') return;
    const box = document.getElementById('badges-card');
    if (!box) return;
    const st = stats();
    const owned = BD();
    const DEFS_ON = DEFS.filter(function (d) { return !d.mist || mistakesOn(); });

    let newly = 0;
    DEFS_ON.forEach(function (def) {
      const cur = def.prog(st)[0] || 0;
      if (cur >= def.target && !owned[def.id]) {
        owned[def.id] = new Date().toISOString();
        newly++;
      }
    });
    if (newly) S().save();

    const unlockedN = DEFS_ON.filter(function (def) { return owned[def.id]; }).length;
    // 「下一枚」= 第一个没解锁的
    let next = null;
    for (let i = 0; i < DEFS_ON.length; i++) {
      if (!owned[DEFS_ON[i].id]) { next = DEFS_ON[i]; break; }
    }
    const now = Date.now();
    const tiles = DEFS_ON.map(function (def) {
      const at = owned[def.id];
      const cur = def.prog(st)[0] || 0;
      const isNew = at && (now - new Date(at).getTime() < 72 * 3600 * 1000);
      if (at) {
        const dt = new Date(at);
        return '<div class="bg-tile on' + (isNew ? ' new' : '') + '" title="' + S().esc(def.desc) + '">' +
          '<span class="bg-ico">' + def.icon + '</span><span class="bg-name">' + S().esc(def.name) + '</span>' +
          '<span class="bg-date">' + (dt.getMonth() + 1) + '/' + dt.getDate() + ' 解锁</span>' +
          (isNew ? '<span class="bg-newtag">NEW</span>' : '') + '</div>';
      }
      const pct = Math.min(100, Math.round(cur / def.target * 100));
      const curTxt = def.fmt ? def.fmt(cur) : cur;
      return '<div class="bg-tile off" title="' + S().esc(def.desc) + '">' +
        '<span class="bg-ico">🔒</span><span class="bg-name">' + S().esc(def.name) + '</span>' +
        '<span class="bg-bar"><i style="width:' + pct + '%"></i></span>' +
        '<span class="bg-date">' + curTxt + '/' + def.target + (def.unit === '分钟' ? '' : ' ' + def.unit) + '</span></div>';
    }).join('');

    box.innerHTML =
      '<p class="hint" style="margin-top:0">已解锁 <b>' + unlockedN + '/' + DEFS.length + '</b>' +
      (next ? (' · 下一枚 <b>' + next.icon + ' ' + S().esc(next.name) + '</b>（' + S().esc(next.desc) + '）') : ' · 全部集齐了，离谱') +
      (newly ? ' · 🎉 这次新解锁 ' + newly + ' 枚' : '') + '</p>' +
      '<div class="bg-grid">' + tiles + '</div>';
  }

  App.badges = { render: render, stats: stats, DEFS: DEFS };
})();
