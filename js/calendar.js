/* calendar.js — 📅 日历：任意日期的任务规划 + 间隔重做 + 年度热力图
   - 往前：查看历史某天的任务，可把没做的/想重做的移到未来某天
   - 往后：提前规划未来任意一天的任务（和"明天的任务"同一套存储）
   - 🔁 间隔重做：完成任务时安排"过 N 天再做一次"，可写标准；手误了随时在日历上改
   - 热力图：过去 365 天每天的有效学习分钟数（番茄 Todo / GitHub 风格） */
(function () {
  'use strict';
  const App = (window.App = window.App || {});
  const S = () => App.store;

  const COLS = [
    { k: 'required', n: '✅ 必须', style: 'col-req' },
    { k: 'ideal', n: '⭐ 理想', style: 'col-ideal' },
    { k: 'extra', n: '🌱 拓展', style: 'col-ext' }
  ];
  const HEAT_COLORS = ['#232b3d', '#1e40af', '#2563eb', '#0ea5e9', '#22a06b'];
  const WD = ['一', '二', '三', '四', '五', '六', '日'];

  let calMonth = null;   // 当前月（Date，1号）
  let selKey = null;     // 选中的日期 key

  function keyOf(d) { return S().dateKey(d); }
  function todayK() { return S().todayKey(); }
  function tomorrowK() { return S().tomorrowKey(); }
  function addDays(key, n) {
    const d = S().keyToDate(key);
    d.setDate(d.getDate() + n);
    return keyOf(d);
  }
  function readDay(key) { return S().data().days[key] || null; } // 只读，不创建
  function studyMinutes(day) {
    if (!day || !day.timeline) return 0;
    return day.timeline.reduce(function (s, r) {
      return s + (r.countAsStudy !== false && r.category === 'study' ? (r.minutes || 0) : 0);
    }, 0);
  }
  function plannedCount(day) {
    if (!day || !day.tasks) return 0;
    return day.tasks.required.length + day.tasks.ideal.length + day.tasks.extra.length;
  }
  function esc(s) { return S().esc(s); }
  /** 目标日期的说法：今天/明天说人话，其他日子用「9月17日」 */
  function dayLabel(k) {
    if (k === todayK()) return '今天';
    if (k === tomorrowK()) return '明天';
    return S().shortDateCN(k);
  }

  /* ---------- 🔁 间隔重做弹窗 ----------
     mode 'copy'：完成任务时安排一次重做（原任务保留）
     mode 'move'：日历里改期（默认把原任务移走，可勾选复制） */
  const COL_LIST = [['required', '✅ 必须'], ['ideal', '⭐ 理想'], ['extra', '🌱 拓展']];
  /** 目标分类栏的 <option>（选中当前栏） */
  function colOptions(curKey) {
    return COL_LIST.map(function (c) {
      return '<option value="' + c[0] + '"' + (c[0] === curKey ? ' selected' : '') + '>' + c[1] + '</option>';
    }).join('');
  }

  function repeatModal(task, colKey, fromKey, mode) {
    const fromLabel = fromKey === todayK() ? '今天' : (fromKey === tomorrowK() ? '明天' : S().shortDateCN(fromKey));
    let pickKey = addDays(todayK(), 3);
    let moveIt = false; // 默认只复制——绝不悄悄删原任务
    const hasKids = (task.subs || []).length || (task.groups || []).length;
    let withKids = true;      // 默认照旧：整条任务连题目一起带走
    let targetCol = colKey;   // 目标分类栏，默认不变
    const modal = App.ui.openModal('🔁 重做安排 · ' + esc(task.text).slice(0, 20),
      '<p style="font-size:12.5px;color:var(--muted);margin-bottom:8px">整条任务在 ' + fromLabel +
      '。' + (hasKids ? '默认把下面的小任务/任务组<b>一起带过去</b>（不想带就取消下面的勾）。' : '') +
      '只想安排其中<b>某一道题</b>？关掉这个弹窗，点那一题右边的 🔁。</p>' +
      '<div class="field"><label>目标日期</label><input type="date" id="rep-date" value="' + pickKey + '" style="width:180px" /></div>' +
      '<div class="field"><label>放到哪个分类栏（拓展没做完的可以挪成必须的）</label><select id="rep-col" style="width:180px">' +
      colOptions(colKey) + '</select></div>' +
      '<div class="field"><label>标准：要做到什么程度（选填，如：全对 / 8分钟内解出）</label>' +
      '<input type="text" id="rep-standard" style="width:100%" value="' + esc(task.standard || '') + '" placeholder="写清楚标准，重做时才知道够不够格" /></div>' +
      (hasKids
        ? '<label style="display:flex;gap:8px;align-items:center;font-size:13.5px;cursor:pointer;margin-top:4px">' +
          '<input type="checkbox" id="rep-kids"' + (withKids ? ' checked' : '') + ' style="width:16px;height:16px" /> ' +
          '把小任务 / 任务组<b>一起带过去</b>（不勾 = 只安排这条任务本身）</label>'
        : '') +
      '<label style="display:flex;gap:8px;align-items:center;font-size:13.5px;cursor:pointer;margin-top:4px">' +
      '<input type="checkbox" id="rep-move"' + (moveIt ? ' checked' : '') + ' style="width:16px;height:16px" /> ' +
      '同时从 ' + fromLabel + ' <b>移走</b>原任务（不勾 = 复制一份，原任务原地保留）</label>',
      '<button class="btn btn-primary" data-act="ok">✔ 安排到 ' + dayLabel(pickKey) + '</button>' +
      '<button class="btn" data-act="cancel">取消</button>');
    const dateEl = modal.querySelector('#rep-date');
    const okBtn = modal.querySelector('[data-act="ok"]');
    dateEl.onchange = function () {
      pickKey = dateEl.value || pickKey;
      okBtn.textContent = '✔ 安排到 ' + dayLabel(pickKey);
    };
    const moveEl = modal.querySelector('#rep-move');
    if (moveEl) moveEl.onchange = function () { moveIt = moveEl.checked; };
    const colEl2 = modal.querySelector('#rep-col');
    if (colEl2) colEl2.onchange = function () { targetCol = colEl2.value || colKey; };
    const kidsEl = modal.querySelector('#rep-kids');
    if (kidsEl) kidsEl.onchange = function () { withKids = kidsEl.checked; };
    App.ui.bindActions({
      ok: function () {
        const std = (modal.querySelector('#rep-standard').value || '').trim();
        if (dateEl.value) pickKey = dateEl.value;
        if (pickKey < todayK()) { App.ui.toast('目标日期在过去啦，往后面挑一天'); return; }
        const n = copyTaskToDay(task, colKey, pickKey, std, withKids, targetCol);
        if (!n) { App.ui.toast('目标日期已有同名任务，未重复安排（原任务原地保留）'); return; }
        if (moveIt && !(pickKey === fromKey && targetCol === colKey)) removeTask(fromKey, colKey, task.id);
        S().save();
        App.ui.closeModal();
        render();
        App.ui.toast('🔁 已' + (moveIt ? '移动' : '复制') + '到 ' + dayLabel(pickKey) +
          '：' + task.text.slice(0, 14) + (hasKids && withKids ? '（小任务/任务组一起带了）' : '') + (std ? '（标准：' + std + '）' : ''));
      },
      cancel: App.ui.closeModal
    });
  }

  function copyTaskToDay(task, colKey, targetKey, standard, withKids, targetCol) {
    const keepKids = withKids !== false;
    const toCol = targetCol || colKey;          // 目标分类栏（默认跟原栏一样）
    const tday = S().getDay(targetKey);
    if (!tday.tasks[toCol]) tday.tasks[toCol] = [];
    if (tday.tasks[toCol].some(function (t) { return t.text === task.text; })) return false;
    const freshSubs = (keepKids ? (task.subs || []) : []).map(function (s) {
      return { id: S().uid(), text: s.text, minutes: s.minutes, points: s.points || 0, done: null };
    });
    const freshGroups = (keepKids ? (task.groups || []) : []).map(function (g) {
      return { id: S().uid(), name: g.name, subs: (g.subs || []).map(function (s) {
        return { id: S().uid(), text: s.text, minutes: s.minutes, points: s.points || 0, done: null };
      }) };
    });
    const nt = { id: S().uid(), text: task.text, done: false };
    if (task.points != null) nt.points = task.points;
    if (standard) nt.standard = standard;
    if (freshSubs.length) nt.subs = freshSubs;
    if (freshGroups.length) nt.groups = freshGroups;
    tday.tasks[toCol].push(nt);
    S().save();
    return true;
  }

  function removeTask(dayKey, colKey, taskId) {
    const list = S().getDay(dayKey).tasks[colKey];
    const idx = list.findIndex(function (t) { return t.id === taskId; });
    if (idx >= 0) list.splice(idx, 1);
  }

  /* ---------- 🔁 单题重做安排（粒度到「一道题」） ----------
     转移时带着它所属的任务组，落到目标日期的同一条任务里（没有就新建），
     所以到了那天还是「数学复习 → 函数第一章 → 这道题」的结构 */
  function repeatSubModal(task, colKey, groupId, sub, fromKey) {
    if (!task || !sub) return;
    const g = groupId ? (task.groups || []).find(function (x) { return x.id === groupId; }) : null;
    const gname = g ? (g.name || '任务组') : '';
    const fromLabel = fromKey === todayK() ? '今天' : (fromKey === tomorrowK() ? '明天' : S().shortDateCN(fromKey));
    let pickKey = addDays(todayK(), 3);
    let moveIt = false;                 // 默认复制，绝不悄悄删原题
    let targetCol = colKey;             // 目标分类栏，默认不变
    const modal = App.ui.openModal('🔁 这题重做 · ' + esc(sub.text).slice(0, 18),
      '<p style="font-size:12.5px;color:var(--muted);margin-bottom:8px">只安排 <b>这一道题</b>：' +
      '<b>' + esc(task.text) + '</b>' + (gname ? ' → <b>' + esc(gname) + '</b>' : '（单独小任务）') +
      '，现在在 ' + fromLabel + '。目标那天会自动落到同一条任务下面——没有这条任务就新建，<b>组信息一起带过去</b>。</p>' +
      '<div class="field"><label>目标日期</label><input type="date" id="reps-date" value="' + pickKey + '" style="width:180px" /></div>' +
      '<div class="field"><label>放到哪个分类栏</label><select id="reps-col" style="width:180px">' + colOptions(colKey) + '</select></div>' +
      '<div class="field"><label>挂到哪条任务下面（改个名字 = 换个主任务；目标那天没有就自动新建）</label>' +
      '<input type="text" id="reps-task" style="width:100%" value="' + esc(task.text) + '" placeholder="如：化学复习" /></div>' +
      '<div class="field"><label>标准：要做到什么程度（选填，如：全对 / 8分钟内解出）</label>' +
      '<input type="text" id="reps-standard" style="width:100%" value="' + esc(sub.standard || '') + '" placeholder="写清楚标准，重做时才知道够不够格" /></div>' +
      '<label style="display:flex;gap:8px;align-items:center;font-size:13.5px;cursor:pointer;margin-top:4px">' +
      '<input type="checkbox" id="reps-move"' + (moveIt ? ' checked' : '') + ' style="width:16px;height:16px" /> ' +
      '同时从 ' + fromLabel + ' <b>移走</b>这道题（不勾 = 复制一份，原题原地保留）</label>',
      '<button class="btn btn-primary" data-act="ok">✔ 安排到 ' + dayLabel(pickKey) + '</button>' +
      '<button class="btn" data-act="cancel">取消</button>');
    const dateEl = modal.querySelector('#reps-date');
    const okBtn = modal.querySelector('[data-act="ok"]');
    dateEl.onchange = function () {
      pickKey = dateEl.value || pickKey;
      okBtn.textContent = '✔ 安排到 ' + dayLabel(pickKey);
    };
    const moveEl = modal.querySelector('#reps-move');
    if (moveEl) moveEl.onchange = function () { moveIt = moveEl.checked; };
    const colEl3 = modal.querySelector('#reps-col');
    if (colEl3) colEl3.onchange = function () { targetCol = colEl3.value || colKey; };
    App.ui.bindActions({
      ok: function () {
        const std = (modal.querySelector('#reps-standard').value || '').trim();
        const tName = (modal.querySelector('#reps-task').value || '').trim();
        if (dateEl.value) pickKey = dateEl.value;
        if (pickKey < todayK()) { App.ui.toast('目标日期在过去啦，往后面挑一天'); return; }
        const done = copySubToDay(task, colKey, groupId, sub, pickKey, std, gname, targetCol, tName);
        if (!done) { App.ui.toast('目标那天已经有这道题了，没重复安排'); return; }
        if (moveIt && !(pickKey === fromKey && targetCol === colKey)) removeSubFrom(fromKey, colKey, task.id, groupId, sub.id);
        S().save();
        App.ui.closeModal();
        if (App.tasks && App.tasks.renderAll) App.tasks.renderAll();
        render();
        App.ui.toast('🔁 这题已' + (moveIt ? '移到' : '复制到') + ' ' + dayLabel(pickKey) + '：' +
          (((tName || task.text) !== task.text) ? ('换到「' + (tName || task.text) + '」下 · ') : '') +
          (gname ? gname + ' · ' : '') + sub.text.slice(0, 12) + (std ? '（标准：' + std + '）' : ''), 3200);
      },
      cancel: App.ui.closeModal
    });
  }

  /** 把一道题（带组归属）放进目标日期的同一条任务里；目标日没有这条任务就新建一条 */
  function copySubToDay(task, colKey, groupId, sub, targetKey, standard, gname, targetCol, targetTaskName) {
    const toCol = targetCol || colKey;      // 目标分类栏（默认跟原栏一样）
    const tname = ((targetTaskName || '').trim()) || task.text;   // 挂到哪条主任务下面（可改名）
    const tday = S().getDay(targetKey);
    if (!tday.tasks[toCol]) tday.tasks[toCol] = [];
    let nt = tday.tasks[toCol].find(function (t) { return t.text === tname; });
    if (!nt) {
      nt = { id: S().uid(), text: tname, done: false };
      if (tname === task.text && task.points != null) nt.points = task.points;
      tday.tasks[toCol].push(nt);
    }
    const fresh = { id: S().uid(), text: sub.text, minutes: sub.minutes, points: sub.points || 0, done: null };
    if (standard) fresh.standard = standard;
    if (groupId) {
      nt.groups = nt.groups || [];
      let g = nt.groups.find(function (x) { return (x.name || '') === (gname || ''); });
      if (!g) { g = { id: S().uid(), name: gname || '任务组', subs: [] }; nt.groups.push(g); }
      g.subs = g.subs || [];
      if (g.subs.some(function (x) { return x.text === sub.text; })) return false;
      g.subs.push(fresh);
    } else {
      nt.subs = nt.subs || [];
      if (nt.subs.some(function (x) { return x.text === sub.text; })) return false;
      nt.subs.push(fresh);
    }
    S().save();
    return true;
  }

  /** 从某天某条任务里摘掉一道题（配合「同时移走」） */
  function removeSubFrom(dayKey, colKey, taskId, groupId, subId) {
    const task = (S().getDay(dayKey).tasks[colKey] || []).find(function (t) { return t.id === taskId; });
    if (!task) return;
    if (groupId) {
      const g = (task.groups || []).find(function (x) { return x.id === groupId; });
      if (!g) return;
      const i = (g.subs || []).findIndex(function (x) { return x.id === subId; });
      if (i >= 0) g.subs.splice(i, 1);
    } else {
      const i = (task.subs || []).findIndex(function (x) { return x.id === subId; });
      if (i >= 0) task.subs.splice(i, 1);
    }
  }

  /** 在一条任务里按 id 找某道题（组里 / 组外都找） */
  function findSubById(task, groupId, subId) {
    if (!task) return null;
    if (groupId) {
      const g = (task.groups || []).find(function (x) { return x.id === groupId; });
      return g ? (g.subs || []).find(function (x) { return x.id === subId; }) : null;
    }
    return (task.subs || []).find(function (x) { return x.id === subId; });
  }

  /* ---------- 年度热力图 ---------- */
  function heatmapHTML(selKeyArg) {
    let totalMin = 0;
    // 整一年：末尾对齐到本周周日（周一为一周之首），往前铺 53 周
    const end = new Date();
    const shift = (end.getDay() + 6) % 7; // 周一=0
    const lastCell = new Date(end);
    lastCell.setDate(end.getDate() + (6 - shift));
    const start = new Date(lastCell);
    start.setDate(lastCell.getDate() - 7 * 53 - 1); // 整 53 周 ≈ 一年

    const CELL_W = 15;      // 12px 格子 + 3px 间距 —— 月份标签按这个宽度定位才不会错位
    let months = '';
    let colIdx = 0, lastMonth = -1, lastLabelCol = -99;
    const cur2 = new Date(start);
    while (cur2 <= lastCell) {
      if (cur2.getMonth() !== lastMonth) {
        lastMonth = cur2.getMonth();
        // 两个标签至少隔 3 列，免得挤在一起看不清
        if (colIdx - lastLabelCol >= 3) {
          months += '<span class="hm-month" style="left:' + (colIdx * CELL_W) + 'px">' + (lastMonth + 1) + '月</span>';
          lastLabelCol = colIdx;
        }
      }
      colIdx++;
      cur2.setDate(cur2.getDate() + 7);
    }

    const cur = new Date(start);
    let weekCells = [];
    const weeks = [];
    while (cur <= lastCell) {
      const k = keyOf(cur);
      const isFuture = k > todayK();
      const day = isFuture ? null : readDay(k);
      const min = studyMinutes(day);
      if (!isFuture) totalMin += min;
      const lvl = isFuture ? -1 : (min <= 0 ? 0 : min < 30 ? 1 : min < 60 ? 2 : min < 120 ? 3 : 4);
      // 颜色交给 CSS（.hm-lv0 ~ .hm-lv4）：浅色主题一套、深色主题一套 ——
      // 以前写死深色（#232b3d），在浅色页面上会糊成一片黑格子，特别乱
      const lvlCls = lvl < 0 ? 'hm-future' : ('hm-lv' + lvl);
      weekCells.push('<span class="hm-cell ' + lvlCls + (k === selKeyArg ? ' sel' : '') + '" data-k="' + k +
        '" title="' + k + (isFuture ? '（未来）' : ' · 学习 ' + min + ' 分钟') + '"></span>');
      if (weekCells.length === 7) {
        weeks.push('<div class="hm-week">' + weekCells.join('') + '</div>');
        weekCells = [];
      }
      cur.setDate(cur.getDate() + 1);
    }
    if (weekCells.length) weeks.push('<div class="hm-week">' + weekCells.join('') + '</div>');

    const WD_ROWS = ['一', '', '三', '', '五', '', '日'];
    return '<div class="hm-wrap">' +
      '<div class="hm-top">' +
        '<div class="hm-sum">过去一年有效学习 <b>' + S().fmtDur(totalMin) + '</b></div>' +
        '<div class="hm-legend"><span>少</span>' +
          [0, 1, 2, 3, 4].map(function (l) { return '<i class="hm-lv' + l + '"></i>'; }).join('') +
          '<span>多</span></div>' +
      '</div>' +
      '<div class="hm-body">' +
        '<div class="hm-wd">' + WD_ROWS.map(function (w) { return '<span>' + w + '</span>'; }).join('') + '</div>' +
        '<div class="hm-scroll">' +
          '<div class="hm-months">' + months + '</div>' +
          '<div class="hm-grid">' + weeks.join('') + '</div>' +
        '</div>' +
      '</div>' +
      '<p class="hm-hint">第一行是周一 · 点格子跳到那天 · 颜色越深 = 那天学得越久</p>' +
      '</div>';
  }

  /* ---------- 月历 ---------- */
  function monthHTML() {
    const first = new Date(calMonth.getFullYear(), calMonth.getMonth(), 1);
    const lead = (first.getDay() + 6) % 7; // 周一首
    const daysInMonth = new Date(calMonth.getFullYear(), calMonth.getMonth() + 1, 0).getDate();
    let html = '<div class="cal-head row">' +
      '<button class="btn btn-small" id="cal-prev">‹</button>' +
      '<b style="font-size:16px;min-width:120px;text-align:center">' + calMonth.getFullYear() + ' 年 ' + (calMonth.getMonth() + 1) + ' 月</b>' +
      '<button class="btn btn-small" id="cal-next">›</button>' +
      '<button class="btn btn-small" id="cal-today" style="margin-left:8px">回到今天</button></div>';
    html += '<div class="cal-grid" style="display:grid;grid-template-columns:repeat(7,1fr);gap:5px">';
    html += WD.map(function (w) { return '<div class="cal-wd" style="text-align:center;font-size:11.5px;color:var(--muted)">' + w + '</div>'; }).join('');
    for (let i = 0; i < lead; i++) html += '<div class="cal-day empty"></div>';
    for (let d = 1; d <= daysInMonth; d++) {
      const dt = new Date(calMonth.getFullYear(), calMonth.getMonth(), d);
      const k = keyOf(dt);
      const isToday = k === todayK();
      const isFuture = k > todayK();
      const day = readDay(k);
      const min = studyMinutes(day);
      const pc = plannedCount(day);
      const doneCnt = day && day.tasks ? ['required', 'ideal', 'extra'].reduce(function (s, c) {
        return s + day.tasks[c].filter(function (t) { return t.done; }).length;
      }, 0) : 0;
      let badge = '';
      if (isFuture && pc) badge = '<span class="cal-badge plan" style="display:block;font-size:10px;margin-top:3px;border-radius:6px;padding:1px 5px;width:fit-content;background:rgba(59,130,246,.18);color:#7dd3fc">' + pc + ' 项已排</span>';
      else if (!isFuture && min) badge = '<span class="cal-badge done" style="display:block;font-size:10px;margin-top:3px;border-radius:6px;padding:1px 5px;width:fit-content;background:rgba(34,160,107,.16);color:#35d09a">' + Math.round(min) + '分</span>';
      else if (!isFuture && doneCnt) badge = '<span class="cal-badge done" style="display:block;font-size:10px;margin-top:3px;border-radius:6px;padding:1px 5px;width:fit-content;background:rgba(34,160,107,.16);color:#35d09a">✓' + doneCnt + '</span>';
      html += '<div class="cal-day' + (isToday ? ' today' : '') + (k === selKey ? ' sel' : '') +
        '" data-k="' + k + '" style="min-height:62px;border:1px solid var(--line);border-radius:9px;padding:5px 6px;cursor:pointer;background:rgba(255,255,255,.03)' +
        (isToday || k === selKey ? ';border-color:var(--primary)' : '') +
        (k === selKey ? ';background:rgba(59,130,246,.14)' : '') +
        '"><b>' + d + '</b>' + badge + '</div>';
    }
    html += '</div>';
    return html;
  }

  /* ---------- 当天时间构成饼图（番茄 ToDo 式：分类占比 + 图例） ---------- */
  function pieHTML(key) {
    const day = readDay(key);
    if (!day || !day.timeline || !day.timeline.length) return '';
    const byCat = {};
    let total = 0;
    day.timeline.forEach(function (r) {
      const m = r.minutes || 0;
      if (m <= 0 || r.hourPlanId) return; // 小时代视图条是可视化覆盖层，不计入
      const c = r.category || 'other';
      byCat[c] = (byCat[c] || 0) + m;
      total += m;
    });
    if (total < 1) {
      return '<div style="border:1px dashed var(--line);border-radius:12px;padding:14px;margin:10px 0;text-align:center">' +
        '<p style="font-size:13px;color:var(--muted)">🕰 这天还没有时间记录</p>' +
        '<p class="hint">去任务页开始计时、或到时间轴补上休息/吃饭，饼图就会在这里出现。</p></div>';
    }
    // 📋 v88：按任务名合计 —— 某一项任务今天一共做了多久（番茄 ToDo 式清单）
    const byTask = {};
    day.timeline.forEach(function (r) {
      const m = r.minutes || 0;
      if (m <= 0 || r.hourPlanId) return;
      const name = String(r.taskText || '').trim();
      if (!name) return;
      byTask[name] = (byTask[name] || 0) + m;
    });
    const taskNames = Object.keys(byTask).sort(function (a, b) { return byTask[b] - byTask[a]; });
    let taskBreakHTML = '';
    if (taskNames.length) {
      taskBreakHTML = '<div style="margin-top:10px;border-top:1px dashed var(--line);padding-top:8px">' +
        '<div style="font-size:12.5px;color:var(--muted);margin-bottom:4px">📋 单项用时（按任务合计，休息/吃饭不算）</div>' +
        taskNames.map(function (n) {
          return '<div class="row" style="justify-content:space-between;align-items:baseline;font-size:13px;padding:2px 4px">' +
            '<span style="min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + S().esc(n) + '</span>' +
            '<b style="flex:none;margin-left:10px">' + S().fmtDur(Math.round(byTask[n])) + '</b></div>';
        }).join('') + '</div>';
    }
    const CATS = App.ui.CATS;
    const segs = Object.keys(byCat).map(function (c) { return { c: c, m: byCat[c] }; })
      .sort(function (a, b) { return b.m - a.m; });
    const cx = 105, cy = 105, R = 92, r0 = 56;
    let a0 = -Math.PI / 2, paths = '';
    segs.forEach(function (s) {
      const frac = s.m / total;
      const col = (CATS[s.c] || CATS.other).color;
      if (frac >= 0.999) {
        paths += '<circle cx="' + cx + '" cy="' + cy + '" r="' + ((R + r0) / 2) + '" fill="none" stroke="' + col + '" stroke-width="' + (R - r0) + '" opacity=".92"/>';
        return;
      }
      const a1 = a0 + frac * 2 * Math.PI;
      const large = (a1 - a0) > Math.PI ? 1 : 0;
      const p = function (ang, r) { return (cx + r * Math.cos(ang)).toFixed(2) + ' ' + (cy + r * Math.sin(ang)).toFixed(2); };
      paths += '<path d="M ' + p(a0, R) + ' A ' + R + ' ' + R + ' 0 ' + large + ' 1 ' + p(a1, R) +
        ' L ' + p(a1, r0) + ' A ' + r0 + ' ' + r0 + ' 0 ' + large + ' 0 ' + p(a0, r0) + ' Z" fill="' + col + '" opacity=".92"/>';
      a0 = a1;
    });
    const legend = segs.map(function (s) {
      const cat = CATS[s.c] || CATS.other;
      const pct = Math.round(s.m / total * 1000) / 10;
      return '<div class="pie-lg">' +
        '<span class="pie-dot" style="background:' + cat.color + '"></span>' +
        '<span class="pie-name">' + cat.label + '</span>' +
        '<span class="pie-min">' + S().fmtDur(Math.round(s.m)) + '</span>' +
        '<span class="pie-pct">' + pct + '%</span></div>';
    }).join('');
    return '<div style="border:1px solid var(--line);border-radius:12px;padding:12px 14px;margin:10px 0">' +
      '<div class="row" style="flex-wrap:wrap;gap:16px;align-items:center">' +
      '<svg width="210" height="210" viewBox="0 0 210 210">' + paths +
      '<text x="' + cx + '" y="' + (cy - 4) + '" text-anchor="middle" font-size="12" fill="var(--muted)">总计</text>' +
      '<text x="' + cx + '" y="' + (cy + 16) + '" text-anchor="middle" font-size="15" font-weight="700" fill="var(--ink)">' + S().fmtDur(Math.round(total)) + '</text></svg>' +
      '<div style="flex:1;min-width:220px">' + legend + '</div></div>' +
      taskBreakHTML +
      '<p class="hint" style="margin:6px 0 0">按时间轴分类统计（学习/拓展/辅助/生活/其他）；休息和记录也会算进去。上面是<b>每个任务各花了多久</b>。</p></div>';
  }

  /* 任务的小任务/任务组上下文（只读展示，让人知道这条任务是哪部分） */
  function taskContextHTML(task, colKey) {
    let h = '';
    const repBtn = function (groupId, subId) {
      return '<button class="task-timer-btn" data-act="rep-sub" data-col="' + (colKey || '') + '" data-id="' + task.id +
        '" data-g="' + (groupId || '') + '" data-sub="' + subId + '" title="只把这题安排到另一天重做（带着它的任务组）">🔁</button>';
    };
    (task.groups || []).forEach(function (g) {
      const subs = g.subs || [];
      const done = subs.filter(function (s) { return s.done === true; }).length;
      h += '<div class="t-ctx grp">🧩 ' + esc(g.name || '任务组') + (subs.length ? '（' + done + '/' + subs.length + '）' : '') + '</div>';
      subs.forEach(function (s) {
        h += '<div class="t-ctx sub"><span>· ' + esc(s.text) + (s.done === true ? ' ✓' : (s.done === false ? ' ✗' : '')) +
          '</span>' + repBtn(g.id, s.id) + '</div>';
      });
    });
    (task.subs || []).forEach(function (s) {
      h += '<div class="t-ctx sub"><span>· ' + esc(s.text) + '（限' + s.minutes + '分）' + (s.done === true ? ' ✓' : (s.done === false ? ' ✗' : '')) +
        '</span>' + repBtn('', s.id) + '</div>';
    });
    return h;
  }

  /* ---------- 选中日的任务面板 ---------- */
  function dayPanelHTML(key) {
    const day = S().getDay(key);
    const isToday = key === todayK();
    const isPast = key < todayK();
    const dt = S().keyToDate(key);
    const wd = '周' + WD[(dt.getDay() + 6) % 7];
    let html = '<div class="card"><div class="row" style="justify-content:space-between;flex-wrap:wrap">' +
      '<h3 style="margin:0">🗓 ' + (dt.getMonth() + 1) + '月' + dt.getDate() + '日 ' + wd +
      (isToday ? ' · 今天' : (isPast ? ' · 过去' : ' · 未来')) + '</h3>' +
      (isPast ? '<span class="tag" style="color:var(--muted)">这天有效学习 ' + S().fmtDur(studyMinutes(day)) + '</span>' : '') +
      '</div>' +
      // v63：点进未来的一天时说清楚 —— 这里加的任务算"提前安排"，不会跑进"按日记录/复盘"里
      (!isToday && !isPast
        ? '<p class="hint" style="background:#fff8e6;border-left:3px solid #e0a02c;padding:6px 10px;border-radius:6px;margin:8px 0 0">' +
          '⚠️ 这是<b>还没到</b>的一天——在这里加的任务属于<b>提前安排</b>，' +
          '日历里随时能看到，但不会出现在「历史 → 按日记录」里（那页只记已经过完的日子）。</p>'
        : '');
    if (isPast) {
      const undone = [];
      COLS.forEach(function (c) {
        (day.tasks[c.k] || []).forEach(function (t) { if (!t.done) undone.push({ col: c.k, task: t }); });
      });
      if (undone.length) {
        html += '<p class="hint">这天有 <b>' + undone.length + '</b> 条任务没完成——点任务旁的 🔁 把它安排到后面的日子重做。</p>';
      }
    }
    if (key <= todayK()) html += pieHTML(key);
    html += '<div class="cal-cols" style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px">';
    COLS.forEach(function (c) {
      // 📌 v99：基础任务点 ▶ 生成的副本跟今天别的任务一样（带标签），日历里也看得见
      const list = (day.tasks[c.k] || []);
      // 这一栏里有没有「和 t 同名的另一条」（有才给它配 🔗）
      const dupOf = function (t) {
        const mine = String(t.text || '').replace(/\s+/g, '');
        return !!mine && list.some(function (x) { return x.id !== t.id && String(x.text || '').replace(/\s+/g, '') === mine; });
      };
      html += '<div class="cal-col" style="border:1px solid var(--line);border-radius:10px;padding:9px 10px"><div class="cal-col-head" style="font-size:13px;font-weight:700;margin-bottom:6px">' + c.n + ' <span class="tag">' + list.length + '</span></div>';
      list.forEach(function (t) {
        html += '<div class="cal-task' + (t.done ? ' done' : '') + '" style="border-bottom:1px dashed var(--line);padding:6px 2px">' +
          '<span class="t-text" style="font-size:13.5px;word-break:break-all">' + esc(t.text) + (t.done ? ' ✓' : '') +
            ((App.tasks && App.tasks.carryTagHTML) ? App.tasks.carryTagHTML(t) : '') +
            ((App.tasks && App.tasks.lecTagHTML) ? App.tasks.lecTagHTML(t) : '') + '</span>' +
          (t.standard ? '<div class="t-std" style="font-size:11.5px;color:#f59e0b;margin-top:2px">📌 标准：' + esc(t.standard) + '</div>' : '') +
          taskContextHTML(t, c.k) +
          '<div class="t-btns">' +
          '<button class="task-timer-btn" data-act="tick" data-col="' + c.k + '" data-id="' + t.id + '" title="切换完成状态（实际做完了在这里补勾划掉）">☑</button>' +
          '<button class="task-timer-btn" data-act="rep" data-col="' + c.k + '" data-id="' + t.id + '" title="重做安排 / 改期">🔁</button>' +
          (t.fromQueue ? '' : '<button class="task-timer-btn" data-act="q-enqueue" data-col="' + c.k + '" data-id="' + t.id + '" title="把这条整任务排进队列末尾（按顺序做）">📥</button>') +
          '<button class="task-timer-btn" data-act="cal-mc" data-k="' + key + '" data-col="' + c.k + '" data-id="' + t.id + '" title="给这条补写设问卡（课已经上完了也能补）">🃏</button>' +
          '<button class="task-timer-btn" data-act="cal-daily" data-col="' + c.k + '" data-id="' + t.id + '" title="把这条加进「每日必做」（每天打勾的小事）">📌</button>' +
          (dupOf(t) ? '<button class="task-timer-btn task-merge-btn" data-act="dup-merge" data-col="' + c.k + '" data-id="' + t.id + '" title="这一栏有两条同名的「' + esc(t.text) + '」，点这里合并成一条">🔗</button>' : '') +
          '<button class="task-timer-btn" data-act="edit" data-col="' + c.k + '" data-id="' + t.id + '" title="编辑">✎</button>' +
          '<button class="task-timer-btn" data-act="del" data-col="' + c.k + '" data-id="' + t.id + '" title="删除">🗑</button>' +
          '</div></div>';
      });
      html += '<button class="btn btn-small" data-add="' + c.k + '">＋ 添加任务</button></div>';
    });
    html += '</div>';
    if (isPast) html += '<p class="hint">补一句：过去的任务也能 🔁 改期——忘了安排、手误安排，都可以在这里救回来。</p>';
    return html + '</div>';
  }

  /* ---------- 渲染 ---------- */
  function render() {
    const wrap = document.getElementById('calendar-view');
    if (!wrap) return;
    if (!calMonth) calMonth = new Date();
    if (!selKey) selKey = todayK();
    // 近 30 天每日学习分钟（番茄 ToDo 式柱状图）
    const bars = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const k = keyOf(d);
      bars.push({ label: (d.getMonth() + 1) + '/' + d.getDate(), study: Math.round(studyMinutes(readDay(k))), extend: 0, fun: 0 });
    }
    wrap.innerHTML =
      '<div class="card"><h3>📅 日历 · 任务与学习热力</h3>' + heatmapHTML(selKey) + '</div>' +
      '<div class="card"><h3>📊 每日学习时长（近 30 天）</h3><div id="cal-bars"></div>' +
      '<p class="hint">一根柱子 = 一天的有效学习分钟数</p></div>' +
      '<div class="card">' + monthHTML() + '</div>' +
      dayPanelHTML(selKey);
    App.ui.barChart(document.getElementById('cal-bars'), bars);
    bind();
  }

  function bind() {
    const wrap = document.getElementById('calendar-view');
    wrap.querySelectorAll('.hm-cell[data-k]').forEach(function (c) {
      c.onclick = function () {
        const k = c.dataset.k;
        // v63：未来的格子没有内容可看。以前会把 selKey 夹回今天、却把月历甩到未来那个月
        // → 用户以为在看 9 月、其实网格已经是 10 月，顺手就把任务加到了 10 月某天。
        if (k > todayK()) {
          App.ui.toast('这天还没到 —— 想提前安排任务，用下面的月历挑那一天');
          return;
        }
        selKey = k;
        const d = S().keyToDate(k);
        calMonth = new Date(d.getFullYear(), d.getMonth(), 1);
        render();
      };
    });
    const pv = wrap.querySelector('#cal-prev');
    if (pv) pv.onclick = function () { calMonth = new Date(calMonth.getFullYear(), calMonth.getMonth() - 1, 1); render(); };
    const nx = wrap.querySelector('#cal-next');
    if (nx) nx.onclick = function () { calMonth = new Date(calMonth.getFullYear(), calMonth.getMonth() + 1, 1); render(); };
    const td = wrap.querySelector('#cal-today');
    if (td) td.onclick = function () { calMonth = new Date(); selKey = todayK(); render(); };
    wrap.querySelectorAll('.cal-day[data-k]').forEach(function (c) {
      c.onclick = function () { selKey = c.dataset.k; render(); };
    });
    wrap.querySelectorAll('[data-add]').forEach(function (b) {
      b.onclick = function () { App.tasks.addTaskModal(b.dataset.add, selKey, false); };
    });
    wrap.querySelectorAll('.cal-task [data-act]').forEach(function (b) {
      b.onclick = function () {
        const col = b.dataset.col, id = b.dataset.id;
        const day = S().getDay(selKey);
        const task = day.tasks[col].find(function (t) { return t.id === id; });
        if (!task) return;
        if (b.dataset.act === 'rep') repeatModal(task, col, selKey, selKey < todayK() ? 'move' : 'move');
        else if (b.dataset.act === 'rep-sub') {
          const gid = b.dataset.g || null;
          const sub = findSubById(task, gid, b.dataset.sub);
          if (sub) repeatSubModal(task, col, gid, sub, selKey);
        }
        else if (b.dataset.act === 'tick') {
          task.done = !task.done;
          if (task.done) task.summary = { done: true, text: '（手动补勾）', at: new Date().toISOString() };
          S().save();
          render();
        }
        else if (b.dataset.act === 'q-enqueue') {
          // 📋 v82：整条任务（含小任务/任务组）排进队尾，进度重置
          if (App.queue && App.queue.enqueueTask && App.queue.enqueueTask(task)) {
            App.ui.toast('📥 已排进队列末尾 —— 到队列页能调顺序');
            render();
          }
        }
        else if (b.dataset.act === 'cal-mc') {
          // 🃏 v99：日历里翻到过去某天，给那天的任务补写设问卡（卡落在那天）
          if (App.memcards && App.memcards.openForTask) {
            App.memcards.openForTask({ id: id, text: (task && task.text) || '设问卡' }, { dayKey: b.dataset.k });
          }
        }
        else if (b.dataset.act === 'cal-daily') {
          // 📌 v87：日历里的任务一键加进「每日必做」（同名不重复加）
          if (App.queue && App.queue.addDaily) {
            const already = (S().data().daily || []).some(function (x) { return x.text === task.text; });
            if (already) { App.ui.toast('「每日必做」里已经有这条了'); return; }
            App.queue.addDaily(task.text);
            App.ui.toast('📌 已加进「每日必做」：' + task.text.slice(0, 14));
          }
        }
        else if (b.dataset.act === 'dup-merge') App.tasks.dupMergeModal(selKey, col, id);
        else if (b.dataset.act === 'edit') App.tasks.editTaskModal(col, id, selKey, false);
        else if (b.dataset.act === 'del') {
          App.ui.confirm('删除「' + task.text.slice(0, 16) + '」？', '删除', function () {
            removeTask(selKey, col, id);
            S().save();
            render();
          });
        }
      };
    });
  }

  function init() { render(); }

  App.calendar = {
    init: init, render: render,
    copyTaskToDay: copyTaskToDay,
    repeatModal: repeatModal,
    repeatSubModal: repeatSubModal,
    copySubToDay: copySubToDay,
    findSubById: findSubById
  };
})();
