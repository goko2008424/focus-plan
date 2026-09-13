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

  /* ---------- 🔁 间隔重做弹窗 ----------
     mode 'copy'：完成任务时安排一次重做（原任务保留）
     mode 'move'：日历里改期（默认把原任务移走，可勾选复制） */
  function repeatModal(task, colKey, fromKey, mode) {
    const fromLabel = fromKey === todayK() ? '今天' : S().fmtDateCN(S().keyToDate(fromKey)).slice(5, 12);
    let pickKey = addDays(todayK(), 3);
    let moveIt = (mode === 'move');
    const modal = App.ui.openModal('🔁 重做安排 · ' + esc(task.text).slice(0, 20),
      '<p style="font-size:12.5px;color:var(--muted);margin-bottom:8px">原任务在 ' + fromLabel +
      (mode === 'copy' ? '（完成后安排一次重做，原任务保留）' : '（可移动或复制到目标日期）') + '</p>' +
      '<div class="field"><label>目标日期</label><input type="date" id="rep-date" value="' + pickKey + '" style="width:180px" /></div>' +
      '<div class="field"><label>标准：要做到什么程度（选填，如：全对 / 8分钟内解出）</label>' +
      '<input type="text" id="rep-standard" style="width:100%" value="' + esc(task.standard || '') + '" placeholder="写清楚标准，重做时才知道够不够格" /></div>' +
      (mode === 'move'
        ? '<label style="display:flex;gap:8px;align-items:center;font-size:13.5px;cursor:pointer;margin-top:4px">' +
          '<input type="checkbox" id="rep-move" checked style="width:16px;height:16px" /> 移走（从 ' + fromLabel + ' 删除原任务）</label>'
        : ''),
      '<button class="btn btn-primary" data-act="ok">✔ 安排到 ' + S().fmtDateCN(S().keyToDate(pickKey)).slice(5, 12) + '</button>' +
      '<button class="btn" data-act="cancel">取消</button>');
    const dateEl = modal.querySelector('#rep-date');
    const okBtn = modal.querySelector('[data-act="ok"]');
    dateEl.onchange = function () {
      pickKey = dateEl.value || pickKey;
      okBtn.textContent = '✔ 安排到 ' + S().fmtDateCN(S().keyToDate(pickKey)).slice(5, 12);
    };
    const moveEl = modal.querySelector('#rep-move');
    if (moveEl) moveEl.onchange = function () { moveIt = moveEl.checked; };
    App.ui.bindActions({
      ok: function () {
        const std = (modal.querySelector('#rep-standard').value || '').trim();
        if (dateEl.value) pickKey = dateEl.value;
        if (pickKey < todayK()) { App.ui.toast('目标日期在过去啦，往后面挑一天'); return; }
        const n = copyTaskToDay(task, colKey, pickKey, std);
        if (!n) { App.ui.toast('目标日期已有同名任务，不用重复安排'); return; }
        if (moveIt && pickKey !== fromKey) removeTask(fromKey, colKey, task.id);
        S().save();
        App.ui.closeModal();
        render();
        App.ui.toast('🔁 已安排：' + S().fmtDateCN(S().keyToDate(pickKey)).slice(5, 12) + ' 重做「' + task.text.slice(0, 14) + '」' + (std ? '（标准：' + std + '）' : ''));
      },
      cancel: App.ui.closeModal
    });
  }

  function copyTaskToDay(task, colKey, targetKey, standard) {
    const tday = S().getDay(targetKey);
    if (tday.tasks[colKey].some(function (t) { return t.text === task.text; })) return false;
    const freshSubs = (task.subs || []).map(function (s) {
      return { id: S().uid(), text: s.text, minutes: s.minutes, points: s.points || 0, done: null };
    });
    const freshGroups = (task.groups || []).map(function (g) {
      return { id: S().uid(), name: g.name, subs: (g.subs || []).map(function (s) {
        return { id: S().uid(), text: s.text, minutes: s.minutes, points: s.points || 0, done: null };
      }) };
    });
    const nt = { id: S().uid(), text: task.text, done: false };
    if (task.points != null) nt.points = task.points;
    if (standard) nt.standard = standard;
    if (freshSubs.length) nt.subs = freshSubs;
    if (freshGroups.length) nt.groups = freshGroups;
    tday.tasks[colKey].push(nt);
    S().save();
    return true;
  }

  function removeTask(dayKey, colKey, taskId) {
    const list = S().getDay(dayKey).tasks[colKey];
    const idx = list.findIndex(function (t) { return t.id === taskId; });
    if (idx >= 0) list.splice(idx, 1);
  }

  /* ---------- 年度热力图 ---------- */
  function heatmapHTML(selKeyArg) {
    const cells = [];
    let totalMin = 0;
    // 末尾对齐到本周周日（周一为一周之首），往前铺 53 周
    const end = new Date();
    const shift = (end.getDay() + 6) % 7; // 周一=0
    const lastCell = new Date(end);
    lastCell.setDate(end.getDate() + (6 - shift));
    const start = new Date(lastCell);
    start.setDate(lastCell.getDate() - 7 * 18 - 1); // 约 19 周，够一年观感又不至于太小
    // GitHub 式：列=周，行=周一..周日
    let html = '<div class="hm-wrap"><div class="hm-grid">';
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
      const sel = k === selKeyArg;
      weekCells.push('<div class="hm-cell' + (sel ? ' sel' : '') + '" data-k="' + k + '" style="background:' +
        (lvl < 0 ? 'transparent' : HEAT_COLORS[lvl]) + '" title="' + k + (isFuture ? '（未来）' : ' · 学习 ' + min + ' 分钟') + '"></div>');
      if (weekCells.length === 7) {
        weeks.push('<div class="hm-week">' + weekCells.join('') + '</div>');
        weekCells = [];
      }
      cur.setDate(cur.getDate() + 1);
    }
    if (weekCells.length) weeks.push('<div class="hm-week">' + weekCells.join('') + '</div>');
    html += weeks.join('') + '</div>' +
      '<div class="hm-meta">过去一年有效学习 <b>' + S().fmtDur(totalMin) + '</b> · 颜色越深学得越久 · 点格子跳到那天</div></div>';
    return html;
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
    html += '<div class="cal-grid">';
    html += WD.map(function (w) { return '<div class="cal-wd">' + w + '</div>'; }).join('');
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
      if (isFuture && pc) badge = '<span class="cal-badge plan">' + pc + ' 项已排</span>';
      else if (!isFuture && min) badge = '<span class="cal-badge done">' + Math.round(min) + '分</span>';
      else if (!isFuture && doneCnt) badge = '<span class="cal-badge done">✓' + doneCnt + '</span>';
      html += '<div class="cal-day' + (isToday ? ' today' : '') + (k === selKey ? ' sel' : '') +
        '" data-k="' + k + '"><b>' + d + '</b>' + badge + '</div>';
    }
    html += '</div>';
    return html;
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
      '</div>';
    if (isPast) {
      const undone = [];
      COLS.forEach(function (c) {
        (day.tasks[c.k] || []).forEach(function (t) { if (!t.done) undone.push({ col: c.k, task: t }); });
      });
      if (undone.length) {
        html += '<p class="hint">这天有 <b>' + undone.length + '</b> 条任务没完成——点任务旁的 🔁 把它安排到后面的日子重做。</p>';
      }
    }
    html += '<div class="cal-cols">';
    COLS.forEach(function (c) {
      const list = day.tasks[c.k] || [];
      html += '<div class="cal-col"><div class="cal-col-head">' + c.n + ' <span class="tag">' + list.length + '</span></div>';
      list.forEach(function (t) {
        html += '<div class="cal-task' + (t.done ? ' done' : '') + '">' +
          '<span class="t-text">' + esc(t.text) + (t.done ? ' ✓' : '') + '</span>' +
          (t.standard ? '<div class="t-std">📌 标准：' + esc(t.standard) + '</div>' : '') +
          '<div class="t-btns">' +
          '<button class="task-timer-btn" data-act="rep" data-col="' + c.k + '" data-id="' + t.id + '" title="重做安排 / 改期">🔁</button>' +
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
    wrap.innerHTML =
      '<div class="card"><h3>📅 日历 · 任务与学习热力</h3>' + heatmapHTML(selKey) + '</div>' +
      '<div class="card">' + monthHTML() + '</div>' +
      dayPanelHTML(selKey);
    bind();
  }

  function bind() {
    const wrap = document.getElementById('calendar-view');
    wrap.querySelectorAll('.hm-cell[data-k]').forEach(function (c) {
      c.onclick = function () {
        const k = c.dataset.k;
        selKey = k > todayK() ? todayK() : k;
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
    repeatModal: repeatModal
  };
})();
