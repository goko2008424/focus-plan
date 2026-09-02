/* ============================================================
 * store.js — 数据模型 · 存储（localStorage + IndexedDB 双备份）
 *            · 积分/休闲账本 · 导入导出 · 日期与时间工具
 * ============================================================ */
(function () {
  'use strict';

  const App = (window.App = window.App || {});
  const KEY = 'focusPlanData.v1';
  const DB_NAME = 'focus-plan';
  const DB_STORE = 'backup';
  const DB_KEY = 'data';

  /* ---------- 基础工具 ---------- */
  function pad(n) { return String(n).padStart(2, '0'); }
  function uid() { return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function dateKey(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function todayKey() { return dateKey(new Date()); }
  function tomorrowKey() { const d = new Date(); d.setDate(d.getDate() + 1); return dateKey(d); }
  function keyToDate(k) { const p = String(k).split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function nowIso() { return new Date().toISOString(); }
  /** 'HH:MM' → 当日分钟数 */
  function minOfDay(hhmm) {
    const p = String(hhmm).split(':').map(Number);
    return (p[0] || 0) * 60 + (p[1] || 0);
  }
  /** 分钟数(0-1439) → 'HH:MM' */
  function hhmmOf(min) {
    min = ((Math.round(min) % 1440) + 1440) % 1440;
    return pad(Math.floor(min / 60)) + ':' + pad(min % 60);
  }
  /** 分钟数 → 'X小时Y分钟' / 'Y分钟' / 'X.X小时' */
  function fmtDur(min) {
    min = Math.round(min || 0);
    if (min < 60) return min + '分钟';
    const h = Math.floor(min / 60);
    const m = min % 60;
    return m ? h + '小时' + m + '分钟' : h + '小时';
  }
  function fmtClock(ms) {
    const s = Math.max(0, Math.floor(ms / 1000));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const ss = s % 60;
    return (h > 0 ? h + ':' + pad(m) : pad(m)) + ':' + pad(ss);
  }
  function fmtDateCN(k) {
    const d = keyToDate(k);
    const w = ['日', '一', '二', '三', '四', '五', '六'][d.getDay()];
    return d.getFullYear() + '年' + (d.getMonth() + 1) + '月' + d.getDate() + '日 周' + w;
  }

  /* ---------- 默认数据 ---------- */
  function defaultSettings() {
    return {
      taskStart: '08:00', taskEnd: '22:00',
      extStart: '22:00', extEnd: '23:00',
      baseRewardTime: 30,   // 保底奖励：休闲分钟
      baseRewardPoints: 10, // 保底奖励：积分
      idealPoints: 10,      // 每条理想任务积分
      extPoints: 5,         // 每条拓展任务积分
      perfectRewardTime: 30,  // 100% 额外奖励：休闲分钟
      perfectRewardPoints: 20, // 100% 额外奖励：积分
      extAppendable: true,  // 拓展任务可追加
      rollover: true,       // 未完成顺延
      redeemTable: [
        { points: 10, item: '一包零食' },
        { points: 30, item: '玩一小时游戏' },
        { points: 50, item: '买一个小物件' },
        { points: 100, item: '买一个游戏' }
      ]
    };
  }
  function freshDay() {
    return {
      tasks: { required: [], ideal: [], extra: [] },
      sessions: [],   // 计时会话 [{id, taskId, taskText, planContent, planMinutes, actualMinutes, startAt, endAt, pausedMs}]
      timeline: [],   // 时间轴记录 [{id, start, end, minutes, content, category, taskId, auto, countAsStudy}]
      rewards: [],    // 当日触发奖励 [{kind:'base'|'perfect', choice:'time'|'points', value, at}]
      ended: false
    };
  }
  function defaultData() {
    return {
      version: 1,
      createdAt: nowIso(),
      settings: defaultSettings(),
      days: {},
      ledger: [] // 账本事件 [{id, date, type, points, leisure, note, at}]
    };
  }

  /* ---------- 存储层 ---------- */
  let data = null;

  function idbOpen() {
    return new Promise(function (resolve, reject) {
      if (!('indexedDB' in window)) { reject(new Error('no indexedDB')); return; }
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = function () { req.result.createObjectStore(DB_STORE); };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
  }
  function idbPut(obj) {
    return idbOpen().then(function (db) {
      return new Promise(function (resolve, reject) {
        const tx = db.transaction(DB_STORE, 'readwrite');
        tx.objectStore(DB_STORE).put(obj, DB_KEY);
        tx.oncomplete = resolve;
        tx.onerror = function () { reject(tx.error); };
      });
    }).catch(function () { /* 镜像失败不致命 */ });
  }
  function idbGet() {
    return idbOpen().then(function (db) {
      return new Promise(function (resolve, reject) {
        const tx = db.transaction(DB_STORE, 'readonly');
        const rq = tx.objectStore(DB_STORE).get(DB_KEY);
        rq.onsuccess = function () { resolve(rq.result); };
        rq.onerror = function () { reject(rq.error); };
      });
    }).catch(function () { return null; });
  }

  function load() {
    let fromLocal = false;
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const d = JSON.parse(raw);
        if (d && d.version === 1) { data = d; fromLocal = true; }
      }
    } catch (e) { /* 损坏则尝试 IndexedDB */ }
    if (fromLocal) {
      ensureDay(todayKey());
      return;
    }
    // localStorage 缺失/损坏 → 尝试 IndexedDB 镜像
    idbGet().then(function (d) {
      if (d && d.version === 1) {
        data = d;
        ensureDay(todayKey());
        save();
      } else {
        data = defaultData();
        ensureDay(todayKey());
        save();
      }
      if (typeof App.app !== 'undefined') App.app.refreshAll();
      else App.tasks && App.tasks.renderAll && App.tasks.renderAll();
    });
    if (!data) { data = defaultData(); ensureDay(todayKey()); }
  }

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) { /* 配额等 */ }
    idbPut(JSON.parse(JSON.stringify(data)));
  }

  /* ---------- 数据访问 ---------- */
  function getDay(key) {
    if (!data.days[key]) { data.days[key] = freshDay(); }
    return data.days[key];
  }
  function ensureDay(key) { getDay(key); }
  function delDay(key) { delete data.days[key]; save(); }

  /* ---------- 账本 ---------- */
  function addLedger(date, type, opts) {
    opts = opts || {};
    data.ledger.push({
      id: uid(),
      date: date,
      type: type,          // earn-ideal / earn-extra / reward-base / reward-perfect / redeem / adjust
      points: opts.points || 0,
      leisure: opts.leisure || 0, // 休闲时间变动（分钟）
      note: opts.note || '',
      at: nowIso()
    });
    save();
  }
  function pointsTotal() {
    return data.ledger.reduce(function (s, e) { return s + (e.points || 0); }, 0);
  }
  function leisureTotal() {
    return data.ledger.reduce(function (s, e) { return s + (e.leisure || 0); }, 0);
  }
  /** 撤销最近一条账本事件（用于"重新选择"） */
  function undoLastLedger(id) {
    const idx = data.ledger.findIndex(function (e) { return e.id === id; });
    if (idx >= 0) { data.ledger.splice(idx, 1); save(); return true; }
    return false;
  }

  /* ---------- 顺延 ---------- */
  function rolloverTasks(fromKey, toKey) {
    const src = getDay(fromKey), dst = getDay(toKey);
    const add = function (listKey, text, points) {
      if (!text) return;
      const list = dst.tasks[listKey];
      if (!list.some(function (t) { return t.text === text; })) {
        const t = { id: uid(), text: text };
        if (points != null) t.points = points; // 保留单独定价
        list.push(t);
      }
    };
    src.tasks.required.filter(function (t) { return !t.done; }).forEach(function (t) { add('required', t.text, t.points); });
    src.tasks.ideal.filter(function (t) { return !t.done; }).forEach(function (t) { add('ideal', t.text, t.points); });
    src.tasks.extra.filter(function (t) { return !t.done; }).forEach(function (t) { add('extra', t.text, t.points); });
    save();
  }

  /* ---------- 导出 / 导入 ---------- */
  function download(name, content) {
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 1000);
  }
  function csvCell(v) { return '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"'; }
  function exportJSON() {
    download('focus-plan-backup-' + todayKey() + '.json', JSON.stringify(data, null, 2));
  }
  function exportCSV() {
    const rows = [['日期', '开始', '结束', '时长(分钟)', '内容', '分类', '计入学习', '来源', '关联任务']];
    Object.keys(data.days).sort().forEach(function (k) {
      data.days[k].timeline.forEach(function (r) {
        rows.push([k, hhmmOf(r.start), hhmmOf(r.end), r.minutes, r.content, r.category, r.countAsStudy ? '是' : '否', r.auto ? '自动' : '手动', r.taskText || '']);
      });
    });
    download('focus-plan-timeline-' + todayKey() + '.csv', '\ufeff' + rows.map(function (r) { return r.map(csvCell).join(','); }).join('\r\n'));
    const rows2 = [['日期', '类型', '积分变动', '休闲变动(分钟)', '说明']];
    data.ledger.forEach(function (e) {
      rows2.push([e.date, e.type, e.points || 0, e.leisure || 0, e.note || '']);
    });
    download('focus-plan-ledger-' + todayKey() + '.csv', '\ufeff' + rows2.map(function (r) { return r.map(csvCell).join(','); }).join('\r\n'));
  }
  function importJSON(text) {
    try {
      const d = JSON.parse(text);
      if (!d || !d.version) return false;
      const merged = defaultData();
      merged.settings = Object.assign(defaultSettings(), d.settings || {});
      merged.days = d.days || {};
      merged.ledger = d.ledger || [];
      merged.createdAt = d.createdAt || nowIso();
      data = merged;
      ensureDay(todayKey());
      save();
      return true;
    } catch (e) { return false; }
  }
  function reset() {
    data = defaultData();
    ensureDay(todayKey());
    save();
  }

  App.store = {
    load: load, save: save,
    getDay: getDay, ensureDay: ensureDay, delDay: delDay,
    addLedger: addLedger, undoLastLedger: undoLastLedger,
    pointsTotal: pointsTotal, leisureTotal: leisureTotal,
    rolloverTasks: rolloverTasks,
    exportJSON: exportJSON, exportCSV: exportCSV, importJSON: importJSON,
    reset: reset,
    uid: uid, esc: esc, pad2: pad,
    dateKey: dateKey, todayKey: todayKey, tomorrowKey: tomorrowKey,
    keyToDate: keyToDate, minOfDay: minOfDay, hhmmOf: hhmmOf,
    fmtDur: fmtDur, fmtClock: fmtClock, fmtDateCN: fmtDateCN,
    settings: function () { return data.settings; },
    data: function () { return data; },
    ledger: function () { return data.ledger; }
  };
})();