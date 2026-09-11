/* ============================================================
 * tasks.js — 任务模块：三栏任务（必须/理想/拓展）
 *            正向计时器 · 奖惩弹窗 · 结束今天 · 明天预填
 * ============================================================ */
(function () {
  'use strict';

  const App = (window.App = window.App || {});
  const S = () => App.store;

  const COLS = [
    { key: 'required', name: '✅ 必须完成任务', desc: '无论如何都要完成的核心任务', style: 'req' },
    { key: 'ideal', name: '⭐ 理想任务（选做）', desc: '状态好、时间够时额外做，完成得积分', style: 'ideal' },
    { key: 'extra', name: '🌱 长期拓展任务', desc: '兴趣/技能类，每天推进一点，完成得积分', style: 'extra' }
  ];
  const COL_NAMES = { required: '必须', ideal: '理想', extra: '拓展' };

  let timer = null;     // 正向计时器（任务）
  let cdTimer = null;   // 倒计时器（小任务限时）
  let tickId = null;
  let activeTab = 'today';
  let srProgressGroupKey = null; // 已完成"进度休息"提醒的组/任务键（避免每 5 分钟小题都提醒）

  // 小任务开始时随机播一句至理名言
  const QUOTES = [
    '短时专注一块块垒，长时专注一座楼。',
    '别想一整章，只想眼前的这一题。',
    '保持思考连贯，别让暂停打断心流。',
    '限时不是催，是让心不再漂移。',
    '先做最难那一步，后面自然顺。',
    '这一分钟稳住，下一分钟才稳。'
  ];

  /* ---------- 计时器 ---------- */
  function isRunning() { return !!timer && !timer.paused; }

  function elapsedMs() {
    if (!timer) return 0;
    const now = timer.paused && timer.pauseAt ? timer.pauseAt : Date.now(); // 暂停时冻结计时
    let ms = now - timer.startedAt - timer.pausedMs;
    return ms;
  }

  function startTick() {
    if (tickId) return;
    tickId = setInterval(function () { App.tasks.onTick(); }, 1000);
  }
  function stopTick() {
    if (tickId) { clearInterval(tickId); tickId = null; }
  }

  function cdElapsedMs() {
    if (!cdTimer) return 0;
    const now = cdTimer.paused && cdTimer.pauseAt ? cdTimer.pauseAt : Date.now(); // 暂停时冻结倒计时
    let ms = now - cdTimer.startedAt - cdTimer.pausedMs;
    return ms;
  }
  function cdRemainingMs() {
    if (!cdTimer) return 0;
    return Math.max(0, cdTimer.minutes * 60000 - cdElapsedMs());
  }

  function onTick() {
    if (!timer && !cdTimer) return;
    const f = document.getElementById('timer-float');
    if (!f || f.classList.contains('hidden')) return;
    // 正向计时区
    if (timer) {
      const usedMs = elapsedMs();
      const planMs = timer.planMinutes * 60000;
      document.getElementById('tf-used').textContent = S().fmtClock(usedMs);
      const pct = planMs > 0 ? Math.min(100, (usedMs / planMs) * 100) : 0;
      const prog = document.getElementById('tf-progress');
      prog.style.width = pct + '%';
      prog.style.background = pct >= 100
        ? 'linear-gradient(90deg,#e2545d,#f59e0b)'
        : 'linear-gradient(90deg,#3b82f6,#22a06b)';
    }
    // 子任务倒计时区（到点继续计时、不自动弹窗，显示超时）
    if (cdTimer) {
      // 任务内小休（强化休息系统）：倒计时展示 + 到点自动恢复原题
      if (cdTimer.microRest) {
        const secs = Math.max(0, Math.ceil((cdTimer.microEndAt - Date.now()) / 1000));
        const leftEl2 = document.getElementById('tf-cd-left');
        if (leftEl2) leftEl2.textContent = S().fmtClock(secs * 1000).replace(/^00:/, '');
        const overEl = document.getElementById('tf-cd-over');
        if (overEl) overEl.textContent = '☕ 小休中…';
        if (secs <= 0) { resumeCdAfterRest(); App.ui.toast('☕ 小休结束，接着把这题做完吧'); }
        return;
      }
      const elapsed = cdElapsedMs();
      const total = cdTimer.minutes * 60000;
      const over = elapsed - total;
      const leftEl = document.getElementById('tf-cd-left');
      if (leftEl) {
        if (over > 0) {
          leftEl.textContent = '+' + S().fmtClock(over).replace(/^00:/, '');
          leftEl.style.color = 'var(--req)';
          document.getElementById('tf-cd-over').textContent = '已超时';
        } else {
          leftEl.textContent = S().fmtClock(total - elapsed);
          leftEl.style.color = '';
          document.getElementById('tf-cd-over').textContent = '';
        }
      }
      // 系统自动休息提醒已全部砍掉：什么时候休息完全由用户自己决定（点悬浮窗「☕ 小休」）
      const pct = total > 0 ? Math.max(0, Math.min(100, (Math.max(0, total - elapsed) / total) * 100)) : 0;
      const prog2 = document.getElementById('tf-cd-progress');
      prog2.style.width = pct + '%';
      prog2.style.background = pct <= 20
        ? 'linear-gradient(90deg,#e2545d,#f59e0b)'
        : 'linear-gradient(90deg,#3b82f6,#22a06b)';
      // 不再自动弹窗：到点继续统计，由用户点「⏹ 结束」手动弹确认
    }
  }

  /* ---------- 悬浮窗：显示 / 隐藏 / 拖动 / 位置记忆 ---------- */
  function applyFloatPos() {
    const f = document.getElementById('timer-float');
    if (!f) return;
    const pos = localStorage.getItem('focusPlan.floatPos');
    if (pos) {
      const p = pos.split(',');
      f.style.left = p[0] + 'px';
      f.style.top = p[1] + 'px';
      f.style.right = 'auto';
      f.style.bottom = 'auto';
    } else {
      f.style.left = 'auto'; f.style.top = 'auto';
      f.style.right = ''; f.style.bottom = '';
    }
  }

  function initFloatDrag() {
    const f = document.getElementById('timer-float');
    const head = document.getElementById('tf-head');
    if (!f || !head) return;
    let dragging = false, dx = 0, dy = 0;
    function down(e) {
      if (e.target.closest('button, input, a')) return;
      dragging = true;
      const r = f.getBoundingClientRect();
      const cx = e.touches ? e.touches[0].clientX : e.clientX;
      const cy = e.touches ? e.touches[0].clientY : e.clientY;
      dx = cx - r.left; dy = cy - r.top;
      if (e.touches && e.cancelable) e.preventDefault();
    }
    function move(e) {
      if (!dragging) return;
      const r = f.getBoundingClientRect();
      const cx = e.touches ? e.touches[0].clientX : e.clientX;
      const cy = e.touches ? e.touches[0].clientY : e.clientY;
      let x = cx - dx, y = cy - dy;
      x = Math.max(0, Math.min(window.innerWidth - r.width, x));
      y = Math.max(0, Math.min(window.innerHeight - r.height, y));
      f.style.left = x + 'px'; f.style.top = y + 'px';
      f.style.right = 'auto'; f.style.bottom = 'auto';
      if (e.touches && e.cancelable) e.preventDefault();
    }
    function up() {
      if (!dragging) return;
      dragging = false;
      if (f.style.left) localStorage.setItem('focusPlan.floatPos', f.style.left + ',' + f.style.top);
    }
    head.addEventListener('mousedown', down);
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
    head.addEventListener('touchstart', down, { passive: false });
    document.addEventListener('touchmove', move, { passive: false });
    document.addEventListener('touchend', up);
  }

  function showTimerBar() {
    const f = document.getElementById('timer-float');
    if (!f) return;
    f.classList.remove('hidden');
    applyFloatPos();
    const fwd = document.getElementById('tf-forward');
    const cd = document.getElementById('tf-cd');
    if (timer) {
      fwd.classList.remove('hidden');
      document.getElementById('tf-content').textContent = timer.planContent;
      document.getElementById('tf-plan').textContent = S().fmtDur(timer.planMinutes);
      document.getElementById('tf-used').textContent = S().fmtClock(elapsedMs());
      document.getElementById('timer-pause').textContent = timer.paused ? '▶ 继续' : '⏸ 暂停';
    } else {
      fwd.classList.add('hidden');
    }
    if (cdTimer) {
      cd.classList.remove('hidden');
      document.getElementById('tf-cd-text').textContent = cdTimer.text;
      document.getElementById('tf-cd-target').textContent = S().fmtDur(cdTimer.minutes);
      document.getElementById('cd-pause').textContent = cdTimer.microRest ? '🔚 结束小休' : (cdTimer.paused ? '▶ 继续' : '⏸ 暂停');
      // 来自逐题拆解的倒计时 → 显示「🧭 回拆解」按钮，方便回到拆解互动界面
      const spEl = document.getElementById('cd-split');
      if (spEl) spEl.style.display = cdTimer.fromSplit ? '' : 'none';
    } else {
      cd.classList.add('hidden');
    }
    onTick();
  }
  function hideTimerBar() {
    const f = document.getElementById('timer-float');
    if (f && !timer && !cdTimer) f.classList.add('hidden');
  }
  function stopTickIfIdle() {
    if (!timer && !cdTimer) {
      stopTick();
      hideTimerBar();
    }
  }

  /* ---------- 开始计时（弹窗填写计划） ---------- */
  function startTimer(taskKey, taskId) {
    if (timer) { App.ui.toast('已有任务在计时中，请先结束或暂停它'); return; }
    const day = S().getDay(S().todayKey());
    const task = day.tasks[taskKey].find(function (t) { return t.id === taskId; });
    if (!task || task.done) return;

    const modal = App.ui.openModal('⏱ 开始计时', '' +
      '<p style="font-size:12.5px;color:#8a919c;margin-bottom:12px">请填写本次计划信息（两项均必填）</p>' +
      '<div class="field">' +
      '  <label>预计完成内容</label>' +
      '  <input type="text" id="plan-content" placeholder="" />' +
      '</div>' +
      '<div class="field">' +
      '  <label>预计用时</label>' +
      '  <div class="field-row">' +
      '    <div class="field"><input type="number" id="plan-h" min="0" max="12" value="0" /><label>小时</label></div>' +
      '    <div class="field"><input type="number" id="plan-m" min="0" max="59" value="40" /><label>分钟</label></div>' +
      '  </div>' +
      '</div>' +
      '<p class="hint" id="plan-error"></p>',
      '<button class="btn btn-primary" data-act="go" id="plan-go">开始计时</button>' +
      '<button class="btn" data-act="cancel">取消</button>');

    const contentInput = modal.querySelector('#plan-content');
    const hInput = modal.querySelector('#plan-h');
    const mInput = modal.querySelector('#plan-m');
    const errEl = modal.querySelector('#plan-error');

    function validate() {
      const content = contentInput.value.trim();
      const mins = (+hInput.value || 0) * 60 + (+mInput.value || 0);
      if (!content) { errEl.textContent = '请填写预计完成内容'; return false; }
      if (mins <= 0) { errEl.textContent = '请填写预计用时（大于0）'; return false; }
      return true;
    }
    App.ui.bindActions({
      go: function () {
        if (!validate()) return;
        timer = {
          taskKey: taskKey, taskId: taskId, taskText: task.text,
          planContent: contentInput.value.trim(),
          planMinutes: (+hInput.value || 0) * 60 + (+mInput.value || 0),
          startedAt: Date.now(), pausedMs: 0, paused: false
        };
        App.ui.closeModal();
        showTimerBar();
        startTick();
        renderToday();
      },
      cancel: App.ui.closeModal
    });
  }

  /* ---------- 暂停 / 继续 ---------- */
  function togglePause() {
    if (!timer) return;
    if (!timer.paused) {
      timer.paused = true;
      timer.pauseAt = Date.now();
    } else {
      timer.pausedMs += Date.now() - timer.pauseAt;
      timer.pauseAt = undefined;
      timer.paused = false;
    }
    showTimerBar();
    renderToday();
  }

  /* ---------- 完成计时（对比确认弹窗 + 总结） ---------- */
  function stopTimer() {
    if (!timer) return;
    const usedMs = elapsedMs();
    const actualMin = Math.max(1, Math.ceil(usedMs / 60000));
    const planMin = timer.planMinutes;
    let doneFlag = true;
    let noteVal = '';

    const body = function () {
      return '' +
        '<div class="field"><label>预计完成内容</label><p style="font-size:14px">' + S().esc(timer.planContent) + '</p></div>' +
        '<div class="field"><label>预计用时</label><p style="font-size:14px">' + S().fmtDur(planMin) + '</p></div>' +
        '<div class="field"><label>实际用时</label><p style="font-size:14px">' + S().fmtDur(actualMin) +
        (actualMin < planMin ? ' <span style="color:#22a06b">（比预计快，好样的！）</span>' :
          actualMin > planMin * 1.3 ? ' <span style="color:#e2545d">（超出预计较多）</span>' : '') + '</p></div>' +
        '<div class="field"><label>这次做完了吗？（提前结束也算，如实选）</label>' +
        '<div class="btn-row">' +
        '<button class="btn btn-small' + (doneFlag ? ' btn-primary' : '') + '" data-act="yes-done">✅ 做完了</button>' +
        '<button class="btn btn-small' + (doneFlag ? '' : ' btn-primary') + '" data-act="not-done">⛔ 没做完</button>' +
        '</div></div>' +
        '<div class="field"><label>总结 / 心得 / 注意事项（可选，写给自己）</label>' +
        '<textarea id="stop-note" style="width:100%;min-height:64px;border:1px solid #e5e8ec;border-radius:8px;padding:8px 10px;font-size:13.5px;resize:vertical">' +
        S().esc(noteVal) + '</textarea>' +
        '</div>';
    };

    function reopen() {
      const modal = App.ui.openModal('✅ 任务完成确认', body(),
        '<button class="btn btn-primary" data-act="done">确认结束并保存</button>' +
        '<button class="btn" data-act="cont">继续计时</button>' +
        '<button class="btn" data-act="cancel">取消（不保存）</button>');
      App.ui.bindActions({
        'yes-done': function () {
          const n1 = modal.querySelector('#stop-note');
          if (n1 && n1.value.trim()) noteVal = n1.value.trim();
          doneFlag = true; App.ui.closeModal(); reopen();
        },
        'not-done': function () {
          const n2 = modal.querySelector('#stop-note');
          if (n2 && n2.value.trim()) noteVal = n2.value.trim();
          doneFlag = false; App.ui.closeModal(); reopen();
        },
        done: function () {
          const noteEl = modal.querySelector('#stop-note');
          saveSession(actualMin, doneFlag, noteEl ? noteEl.value.trim() : '');
          App.ui.closeModal();
        },
        cont: App.ui.closeModal, // 继续计时：仅关闭确认弹窗
        cancel: function () { App.ui.closeModal(); }
      });
    }
    reopen();
  }

  function saveSession(actualMin, doneFlag, noteText) {
    // 会话按「开始计时」的日期归账（跨天也归开始那天）
    const stDate = new Date(timer.startedAt);
    const dayKey = S().dateKey(stDate);
    const day = S().getDay(dayKey);
    const actSec = Math.round((Date.now() - timer.startedAt - (timer.pausedMs || 0)) / 1000);
    const session = {
      id: S().uid(),
      taskId: timer.taskId,
      taskText: timer.taskText,
      planContent: timer.planContent,
      planMinutes: timer.planMinutes,
      actualMinutes: actualMin,
      actualSeconds: actSec,
      startAt: stDate.toISOString(),
      endAt: new Date().toISOString(),
      pausedMs: timer.pausedMs || 0,
      done: doneFlag !== false,
      note: noteText || ''
    };
    day.sessions.push(session);
    // 自动生成时间轴记录（开始/结束 = 计时的现实时间）
    let startMin = stDate.getHours() * 60 + stDate.getMinutes();
    const endDate = new Date();
    let endMin = endDate.getHours() * 60 + endDate.getMinutes();
    if (endMin < startMin) endMin = 1439; // 跨午夜截断到开始日 24:00 前
    const span = endMin - startMin;
    const mins = Math.min(actualMin, span > 0 ? span : actualMin);
    day.timeline.push({
      id: S().uid(),
      start: startMin, end: endMin,
      minutes: mins,
      content: timer.planContent,
      category: 'study',
      countAsStudy: true,
      auto: true,
      taskId: timer.taskId,
      taskText: timer.taskText,
      note: noteText || ''
    });
    S().save();
    timer = null;
    stopTick();
    hideTimerBar();
    App.ui.toast('已保存：时间轴已自动生成记录（' + S().hhmmOf(startMin) + '–' + S().hhmmOf(endMin) + '），记得打勾 ☑');
    App.tasks.renderAll();
  }

  /* ---------- 子任务（小任务限时倒计时） ---------- */
  function subBlockHTML(task) {
    const subs = task.subs || [];
    if (!subs.length) {
      return '<div class="sub-block"><button class="sub-add" data-act="sub-add" data-task="' + task.id + '">＋ 添加小任务（限时做题，如第3题 5分钟）</button></div>';
    }
    return '<div class="sub-block">' +
      subs.map(function (s) {
        const running = cdTimer && cdTimer.subId === s.id;
        const cls = s.done === true ? ' done' : (s.done === false ? ' fail' : (running ? ' running' : ''));
        const stateTxt = s.done === true ? ' ✓完成' : (s.done === false ? ' ✗未完成' : '');
        return '<div class="sub-item' + cls + '" data-sub="' + s.id + '">' +
          '<span class="sub-text">' + S().esc(s.text) + '</span>' +
          '<span class="sub-meta">限' + s.minutes + '分钟' + (s.points > 0 ? ' · +' + s.points + '分' : '') + stateTxt + '</span>' +
          (running
            ? '<span class="sub-meta running-txt">' + (cdTimer.microRest ? '☕ 小休中…' : (cdTimer.paused ? '⏸ 已暂停' : '⏳ 倒计时中…')) + '</span>'
            : '<button class="btn btn-small sub-start" data-act="cd-start" data-task="' + task.id + '" data-sub="' + s.id + '">▶ 开始</button>') +
          '<button class="task-timer-btn' + (s.summary ? ' noted' : '') + '" data-act="sub-note" data-task="' + task.id + '" data-sub="' + s.id + '" title="写评语 / 补充">' + (s.summary ? '✍️' : '🖋') + '</button>' +
          '<button class="task-timer-btn" data-act="sub-split" data-task="' + task.id + '" data-sub="' + s.id + '" title="🧭 逐题拆解（语音/文字引导）">🧭</button>' +
          '<button class="task-timer-btn" data-act="sub-edit" data-task="' + task.id + '" data-sub="' + s.id + '" title="编辑">✎</button>' +
          '<button class="task-timer-btn" data-act="sub-del" data-task="' + task.id + '" data-sub="' + s.id + '" title="删除">🗑</button>' +
          (s.summary && s.summary.text ? '<span class="sub-meta noted-tag">✍️ 已写评语</span>' : '') +
          (s.splitlog && s.splitlog.length ? '<span class="sub-meta noted-tag">🧭 已拆解</span>' : '') +
          '</div>';
      }).join('') +
      '<button class="sub-add" data-act="sub-add" data-task="' + task.id + '">＋ 添加小任务</button>' +
      '</div>';
  }

  function addSubModal(taskKey, taskId, editId, dayKey, groupId) {
    const day = S().getDay(dayKey || S().todayKey());
    const task = day.tasks[taskKey].find(function (t) { return t.id === taskId; });
    if (!task) return;
    const group = groupId ? (task.groups || []).find(function (g) { return g.id === groupId; }) : null;
    const subList = group ? (group.subs || []) : (task.subs || []);
    const existing = editId ? subList.find(function (s) { return s.id === editId; }) : null;
    const inGroup = !!group;
    const modal = App.ui.openModal(existing ? '✎ 编辑小任务' : (inGroup ? '🧩 给「' + S().esc(group.name) + '」加小题' : '🧩 添加小任务'), '' +
      (existing ? '' : '<p style="font-size:12.5px;color:#8a919c;margin-bottom:10px">给每个小题设一个限时，到点提醒你完成没，更容易进入心流</p>') +
      '<div class="field"><label>小任务内容（如：第3题）</label><input type="text" id="sub-text" value="' + (existing ? S().esc(existing.text) : '') + '" placeholder="" /></div>' +
      '<div class="field-row">' +
      '<div class="field"><label>限时（分钟）</label><input type="number" id="sub-min" min="1" value="' + (existing ? existing.minutes : 5) + '" /></div>' +
      '<div class="field"><label>完成积分</label><input type="number" id="sub-pts" min="0" value="' + (existing ? (existing.points || 0) : (S().settings().subDefaultPoints || 10)) + '" /></div>' +
      '</div>',
      '<button class="btn btn-primary" data-act="ok">' + (existing ? '保存' : '添加') + '</button><button class="btn" data-act="cancel">取消</button>');
    App.ui.bindActions({
      ok: function () {
        const text = modal.querySelector('#sub-text').value.trim();
        const mins = Math.max(1, +modal.querySelector('#sub-min').value || 1);
        const pts = Math.max(0, +modal.querySelector('#sub-pts').value || 0);
        if (!text) { App.ui.toast('请填写小任务内容'); return; }
        if (existing) {
          existing.text = text; existing.minutes = mins; existing.points = pts;
        } else {
          if (group) { group.subs = group.subs || []; group.subs.push({ id: S().uid(), text: text, minutes: mins, points: pts, done: null }); }
          else { task.subs = task.subs || []; task.subs.push({ id: S().uid(), text: text, minutes: mins, points: pts, done: null }); }
        }
        S().save();
        App.ui.closeModal();
        App.tasks.renderAll();
      },
      cancel: App.ui.closeModal
    });
  }

  /* ---------- 回收站：误删可恢复（所有删除走「软删除」先进回收站） ---------- */
  function trashPush(entry) {
    const t = (S().data().trash = S().data().trash || []);
    entry.id = S().uid();
    entry.at = new Date().toISOString();
    t.push(entry);
  }

  function delSub(taskKey, taskId, subId, dayKey) {
    const day = S().getDay(dayKey || S().todayKey());
    const task = day.tasks[taskKey].find(function (t) { return t.id === taskId; });
    const subs = task ? (task.subs || []) : [];
    const sub = subs.find(function (s) { return s.id === subId; });
    if (!sub) return;
    App.ui.confirm('删除小任务「' + sub.text + '」？', '删除', function () {
      trashPush({ kind: 'sub', dayKey: dayKey || S().todayKey(), col: taskKey, taskId: taskId, payload: JSON.parse(JSON.stringify(sub)) });
      const idx = subs.findIndex(function (s) { return s.id === subId; });
      if (idx >= 0) subs.splice(idx, 1);
      if (cdTimer && cdTimer.subId === subId) {
        cdTimer = null;
        stopTickIfIdle();
        showTimerBar();
      }
      S().save();
      App.ui.toast('已删除 · 可到回收站恢复');
      App.tasks.renderAll();
    });
  }

  /* ---------- 题评语：随时补充 / 修改（每道小题） ---------- */
  function editSubSummary(taskKey, taskId, subId, dayKey, groupId) {
    const task = S().getDay(dayKey || S().todayKey()).tasks[taskKey].find(function (t) { return t.id === taskId; });
    const found = findSubInTask(task, subId);
    const sub = found && found.sub;
    if (!sub) return;
    const m = App.ui.openModal('✍️ 题评语 / 复盘', '' +
      '<p class="hint">写给这一题的评语（心得 / 错在哪 / 下次注意）。以后随时可以点回来补充修改，方便一天结束统一复盘。</p>' +
      '<div class="field"><label>' + S().esc(sub.text) + '</label>' +
      '<textarea id="note-text" style="width:100%;min-height:72px;border:1px solid #e5e8ec;border-radius:8px;padding:8px;font-size:13.5px;resize:vertical">' + S().esc(sub.summary || '') + '</textarea></div>',
      '<button class="btn btn-primary" data-act="ok">保存评语</button>' +
      '<button class="btn" data-act="clear">清空</button>' +
      '<button class="btn" data-act="cancel">取消</button>');
    App.ui.bindActions({
      ok: function () {
        const t = m.querySelector('#note-text').value.trim();
        sub.summary = t ? t : null;
        S().save(); App.ui.closeModal(); App.tasks.renderAll();
      },
      clear: function () {
        sub.summary = null;
        S().save(); App.ui.closeModal(); App.tasks.renderAll();
        App.ui.toast('已清空这题的评语');
      },
      cancel: App.ui.closeModal
    });
  }

  /* ---------- 任务组（SmartGoal）：把几个小题打包，整组做完奖励一段休息） ---------- */
  function findSubInTask(task, subId) {
    if (!task) return null;
    const direct = (task.subs || []).find(function (s) { return s.id === subId; });
    if (direct) return { sub: direct, group: null };
    let g = null;
    (task.groups || []).forEach(function (gr) {
      if ((gr.subs || []).some(function (s) { return s.id === subId; })) g = gr;
    });
    if (g) return { sub: g.subs.find(function (s) { return s.id === subId; }), group: g };
    return null;
  }

  function groupBlockHTML(task) {
    const groups = task.groups || [];
    const body = groups.map(function (g) {
      const subs = g.subs || [];
      const doneN = subs.filter(function (s) { return s.done === true; }).length;
      const prog = subs.length ? (doneN + '/' + subs.length) : '空组';
      const gPlanned = subs.reduce(function (a, s) { return a + (s.minutes || 0); }, 0);
      const gSess = ((S().getDay(S().todayKey()).sessions) || []).filter(function (se) { return se.taskId === task.id; });
      const gActual = gSess.reduce(function (a, se) { return subs.some(function (s) { return s.text === se.planContent; }) ? a + (se.actualMinutes || 0) : a; }, 0);
      // 连续工作 = 正在做本组当前小题的"未歇"时长（暂停/小休不计入）
      const gCont = (cdTimer && cdTimer.taskId === task.id && cdTimer.groupId === g.id) ? Math.max(0, (cdElapsedMs() || 0) / 60000) : 0;
      const allDone = subs.length > 0 && subs.every(function (s) { return s.done === true; });
      const items = subs.map(function (s) {
        const running = cdTimer && cdTimer.groupId === g.id && cdTimer.subId === s.id;
        const cls = s.done === true ? ' done' : (s.done === false ? ' fail' : (running ? ' running' : ''));
        const stateTxt = s.done === true ? ' ✓完成' : (s.done === false ? ' ✗未完成' : '');
        return '<div class="sub-item' + cls + '" data-sub="' + s.id + '">' +
          '<span class="sub-text">' + S().esc(s.text) + '</span>' +
          '<span class="sub-meta">限' + s.minutes + '分钟' + (s.points > 0 ? ' · +' + s.points + '分' : '') + stateTxt + '</span>' +
          (running
            ? '<span class="sub-meta running-txt">' + (cdTimer.microRest ? '☕ 小休中…' : (cdTimer.paused ? '⏸ 已暂停' : '⏳ 倒计时中…')) + '</span>'
            : '<button class="btn btn-small sub-start" data-act="g-cd-start" data-task="' + task.id + '" data-group="' + g.id + '" data-sub="' + s.id + '">▶ 开始</button>') +
          '<button class="task-timer-btn' + (s.summary ? ' noted' : '') + '" data-act="g-sub-note" data-task="' + task.id + '" data-group="' + g.id + '" data-sub="' + s.id + '" title="写评语 / 补充">' + (s.summary ? '✍️' : '🖋') + '</button>' +
          '<button class="task-timer-btn" data-act="g-sub-split" data-task="' + task.id + '" data-group="' + g.id + '" data-sub="' + s.id + '" title="🧭 逐题拆解（语音/文字引导）">🧭</button>' +
          '<button class="task-timer-btn" data-act="g-sub-edit" data-task="' + task.id + '" data-group="' + g.id + '" data-sub="' + s.id + '" title="编辑">✎</button>' +
          '<button class="task-timer-btn" data-act="g-sub-del" data-task="' + task.id + '" data-group="' + g.id + '" data-sub="' + s.id + '" title="删除">🗑</button>' +
          (s.summary && s.summary.text ? '<span class="sub-meta noted-tag">✍️ 已写评语</span>' : '') +
          (s.splitlog && s.splitlog.length ? '<span class="sub-meta noted-tag">🧭 已拆解</span>' : '') +
          '</div>';
      }).join('');
      const rewardTxt = allDone
        ? '<span class="group-reward done">✅ 全部做完</span>'
        : '<span class="group-reward">整组做完 · 再对答案收尾</span>';
      return '<div class="group-card" data-group="' + g.id + '">' +
        '<div class="group-head"><span class="group-name">🎯 ' + S().esc(g.name) + '</span>' +
        '<span class="group-time">本组 ' + subs.length + ' 题 · 预计 <b>' + S().fmtDur(gPlanned) + '</b> · 实际 <b>' + S().fmtDur(gActual) + '</b>' + (gCont > 0 ? ' · 连续 <b>' + S().fmtDur(gCont) + '</b>' : '') + '</span>' +
        '<span class="group-progress">' + prog + '</span>' +
        rewardTxt +
        '<button class="task-timer-btn" data-act="g-sub-add" data-task="' + task.id + '" data-group="' + g.id + '" title="加小题">＋</button>' +
        '<button class="task-timer-btn" data-act="g-edit" data-task="' + task.id + '" data-group="' + g.id + '" title="改组名/奖励">✎</button>' +
        '<button class="task-timer-btn" data-act="g-del" data-task="' + task.id + '" data-group="' + g.id + '" title="删组">🗑</button>' +
        '</div>' +
        '<div class="group-subs">' + items + '</div>' +
        '<div class="extra-append"><button class="btn btn-small" data-act="g-sub-add" data-task="' + task.id + '" data-group="' + g.id + '">＋ 给本组加小题</button></div>' +
        '</div>';
    }).join('');
    return '<div class="group-block">' + body +
      '<div class="extra-append"><button class="btn btn-small btn-primary" data-act="group-new" data-task="' + task.id + '">🎯 建一个任务组（打包小题，整组做完就收尾对答案）</button></div>' +
      '</div>';
  }

  function addGroupModal(taskKey, taskId, dayKey) {
    const task = S().getDay(dayKey || S().todayKey()).tasks[taskKey].find(function (t) { return t.id === taskId; });
    if (!task) return;
    const m = App.ui.openModal('🎯 新建任务组', '' +
      '<p style="font-size:12.5px;color:#8a919c;margin-bottom:10px">把几个关联的小题打包成一组，整组都做完就算完成，专治“大任务太沉、开不了头”</p>' +
      '<div class="field"><label>任务组名称</label><input type="text" id="g-name" placeholder="如：搞定第三章" /></div>',
      '<button class="btn btn-primary" data-act="ok">创建</button><button class="btn" data-act="cancel">取消</button>');
    App.ui.bindActions({
      ok: function () {
        const name = m.querySelector('#g-name').value.trim();
        if (!name) { App.ui.toast('请填写组名称'); return; }
        task.groups = task.groups || [];
        task.groups.push({ id: S().uid(), name: name, subs: [] });
        S().save(); App.ui.closeModal(); App.tasks.renderAll();
      },
      cancel: App.ui.closeModal
    });
  }

  function editGroupModal(taskKey, taskId, groupId, dayKey) {
    const task = S().getDay(dayKey || S().todayKey()).tasks[taskKey].find(function (t) { return t.id === taskId; });
    const g = task && (task.groups || []).find(function (x) { return x.id === groupId; });
    if (!g) return;
    const m = App.ui.openModal('✎ 任务组', '' +
      '<div class="field"><label>组名称</label><input type="text" id="g-name" value="' + S().esc(g.name) + '" /></div>',
      '<button class="btn btn-primary" data-act="ok">保存</button><button class="btn" data-act="cancel">取消</button>');
    App.ui.bindActions({
      ok: function () {
        g.name = m.querySelector('#g-name').value.trim() || g.name;
        delete g.rewardRest; delete g.awarded;
        S().save(); App.ui.closeModal(); App.tasks.renderAll();
      },
      cancel: App.ui.closeModal
    });
  }

  function delGroup(taskKey, taskId, groupId, dayKey) {
    const task = S().getDay(dayKey || S().todayKey()).tasks[taskKey].find(function (t) { return t.id === taskId; });
    const g = task && (task.groups || []).find(function (x) { return x.id === groupId; });
    if (!g) return;
    App.ui.confirm('删除任务组「' + g.name + '」及其所有小题？', '删除', function () {
      trashPush({ kind: 'group', dayKey: dayKey || S().todayKey(), col: taskKey, taskId: taskId, payload: JSON.parse(JSON.stringify(g)) });
      const idx = task.groups.findIndex(function (x) { return x.id === groupId; });
      task.groups.splice(idx, 1);
      if (cdTimer && cdTimer.groupId === groupId) { cdTimer = null; stopTickIfIdle(); showTimerBar(); }
      S().save(); App.ui.toast('已删除 · 可到回收站恢复'); App.tasks.renderAll();
    });
  }

  function delGroupSub(taskKey, taskId, groupId, subId, dayKey) {
    const task = S().getDay(dayKey || S().todayKey()).tasks[taskKey].find(function (t) { return t.id === taskId; });
    const g = task && (task.groups || []).find(function (x) { return x.id === groupId; });
    const subs = g ? (g.subs || []) : [];
    const sub = subs.find(function (s) { return s.id === subId; });
    if (!sub) return;
    App.ui.confirm('删除小题「' + sub.text + '」？', '删除', function () {
      trashPush({ kind: 'sub', dayKey: dayKey || S().todayKey(), col: taskKey, taskId: taskId, groupId: groupId, payload: JSON.parse(JSON.stringify(sub)) });
      const idx = subs.findIndex(function (s) { return s.id === subId; });
      subs.splice(idx, 1);
      if (cdTimer && cdTimer.groupId === groupId && cdTimer.subId === subId) { cdTimer = null; stopTickIfIdle(); showTimerBar(); }
      S().save(); App.ui.toast('已删除 · 可到回收站恢复'); App.tasks.renderAll();
    });
  }



  /* ---------- 强化休息系统：任务内高频短休 ---------- */
  function isStrongMode() { return S().settings().recordMode === 'strong'; }

  // 计算当前所在「整组/整任务」的累计进度（%），用于进度休息提醒——按整个任务组算，不是每道 5 分钟小题
  function groupProgress(cd) {
    const day = S().getDay(S().todayKey());
    const task = (day.tasks[cd.taskKey] || []).find(function (t) { return t.id === cd.taskId; });
    if (!task) return null;
    let planned = 0, used = 0, key = 't' + cd.taskId;
    if (cd.groupId) {
      const g = (task.groups || []).find(function (g2) { return g2.id === cd.groupId; });
      if (!g) return null;
      key = 'g' + cd.groupId;
      planned = (g.subs || []).reduce(function (a, s) { return a + (s.minutes || 0); }, 0);
      (day.sessions || []).forEach(function (se) {
        if (se.taskId === cd.taskId && g.subs.some(function (s) { return s.text === se.planContent; })) used += se.actualMinutes || 0;
      });
    } else {
      planned = (task.subs || []).reduce(function (a, s) { return a + (s.minutes || 0); }, 0);
      (day.sessions || []).forEach(function (se) {
        if (se.taskId === cd.taskId && task.subs.some(function (s) { return s.text === se.planContent; })) used += se.actualMinutes || 0;
      });
    }
    if (!planned) return null;
    used += Math.min(cd.minutes || 0, Math.max(0, (Date.now() - cd.startedAt - cd.pausedMs) / 60000)); // 加上正在做这题的时间
    return { pct: Math.min(100, (used / planned) * 100), key: key };
  }
  function startMicroRest() {
    if (!cdTimer) { App.ui.toast('先开始一个小题/任务的倒计时，才能小休'); return; }
    if (cdTimer.microRest) { App.ui.toast('正在小休中…'); return; }
    const secs = Math.max(60, (S().settings().srRestMin || 2) * 60);
    cdTimer.paused = true;                      // 原题倒计时暂停（休息不计入用时）
    cdTimer.pauseAt = cdTimer.pauseAt == null ? Date.now() : cdTimer.pauseAt;
    cdTimer.microRest = true;
    cdTimer.microEndAt = Date.now() + secs * 1000;
    cdTimer.srRested = true;                    // 已休息过 → 定时提醒不再触发
    cdTimer.srLastPromptAt = Date.now();        // 重置提醒冷却，避免刚休息完又连推
    showTimerBar();
    App.tasks.renderAll();
    App.ui.toast('☕ 小休 ' + (secs / 60) + ' 分钟，放空 / 闭眼…回来接着把这题做完');
  }
  function cancelMicroRest() {
    if (!cdTimer) return;
    cdTimer.microRest = false;
    cdTimer.microEndAt = 0;
    if (cdTimer.paused) {
      cdTimer.pausedMs += Date.now() - cdTimer.pauseAt;
      cdTimer.pauseAt = undefined;
      cdTimer.paused = false;
    }
    showTimerBar();
    App.tasks.renderAll();
    App.ui.toast('小休结束，接着把这题做完吧');
  }
  function resumeCdAfterRest() {
    if (!cdTimer) return;
    cdTimer.microRest = false;
    cdTimer.microEndAt = 0;
    if (cdTimer.paused) {
      cdTimer.pausedMs += Date.now() - cdTimer.pauseAt;
      cdTimer.pauseAt = undefined;
      cdTimer.paused = false;
    }
    showTimerBar();
    App.tasks.renderAll();
  }
  function srPrompt70(pct) {
    const s = S().settings();
    const m = App.ui.openModal('☕ 这一组已完成 ' + (pct == null ? Math.round(s.srRestAt || 70) : Math.round(pct)) + '%',
      '<p class="hint">整个任务组做到预计的 ' + (s.srRestAt || 70) + '% 了。提前、短时休息比累坏了再休更有效，放空一下回来接着做，状态不会断。</p>',
      '<button class="btn btn-primary" data-act="do">☕ 小休 ' + s.srRestMin + ' 分钟</button><button class="btn" data-act="later">我还不累，继续</button>');
    App.ui.bindActions({
      do: function () { App.ui.closeModal(); startMicroRest(); },
      later: App.ui.closeModal
    });
  }
  function srForceRest() {
    const s = S().settings();
    const runMin = Math.max(1, Math.round((Date.now() - cdTimer.startedAt - cdTimer.pausedMs) / 60000));
    const m = App.ui.openModal('💪 强制休息提醒',
      '<p class="hint">你已连续做 ' + runMin + ' 分钟没休息。高强度用脑不是休息，放空才是。先小休 ' + s.srRestMin + ' 分钟，再回来接着做，状态更稳。</p>',
      '<button class="btn btn-primary" data-act="do">☕ 好，小休 ' + s.srRestMin + ' 分钟</button><button class="btn" data-act="later">再坚持会儿</button>');
    App.ui.bindActions({
      do: function () { App.ui.closeModal(); startMicroRest(); },
      later: App.ui.closeModal
    });
  }

  function startCdTimer(taskKey, taskId, subId, groupId) {
    const day = S().getDay(S().todayKey());
    const task = day.tasks[taskKey] && day.tasks[taskKey].find(function (t) { return t.id === taskId; });
    const found = findSubInTask(task, subId);
    const sub = found && found.sub;
    if (!sub) return;
    if (task.done) { App.ui.toast('这个任务已完成，结束它或重新开始再计时'); return; }
    // 已有倒计时在跑：直接切换（旧的不受影响）
    cdTimer = {
      taskKey: taskKey, taskId: taskId, subId: subId, groupId: groupId || null,
      taskText: task.text, text: sub.text,
      minutes: Math.max(1, sub.minutes || 1), points: sub.points || 0,
      startedAt: Date.now(), pausedMs: 0, paused: false, finished: false,
      microRest: false, microEndAt: 0, srRested: false, srReminded70: false, srForced: false,
      srLastPromptAt: 0
    };
    startTick();
    showTimerBar();
    App.tasks.renderAll();
    App.ui.toast('⏳「' + sub.text + '」限时 ' + cdTimer.minutes + ' 分钟 · ' + QUOTES[Math.floor(Math.random() * QUOTES.length)]);
  }

  function toggleCdPause() {
    if (!cdTimer) return;
    if (cdTimer.microRest) { cancelMicroRest(); return; }
    if (!cdTimer.paused) {
      cdTimer.paused = true;
      cdTimer.pauseAt = Date.now();
    } else {
      cdTimer.pausedMs += Date.now() - cdTimer.pauseAt;
      cdTimer.pauseAt = undefined;
      cdTimer.paused = false;
    }
    showTimerBar();
    App.tasks.renderAll();
  }

  /* 手动结束 / 到点后结束 → 完成确认弹窗（用时对比 + 小总结） */
  function cdFinish() {
    if (!cdTimer) return;
    const cd = cdTimer;
    const elapsed = Date.now() - cd.startedAt - cd.pausedMs;
    const over = elapsed - cd.minutes * 60000;
    // 奖励三档（只奖提前/按时，不罚超时）：提前≤70%用时×2 · 按时×1.5 · 超时×1
    let earnTier = '超时完成';
    let factor = 1;
    if (over > 0) {
      earnTier = '超时完成';
      factor = 1;
    } else if (elapsed <= cd.minutes * 60000 * 0.7) {
      earnTier = '提前完成';
      factor = 2;
    } else {
      earnTier = '按时完成';
      factor = 1.5;
    }
    const earn = (cd.points || 0) > 0 ? Math.round((cd.points || 0) * factor) : 0;
    cd.earnPoints = earn;
    cd.earnTier = earnTier;
    cd.earnFactor = factor;
    const timeLine = '实际用时 ' + S().fmtClock(elapsed) + ' / 目标 ' + S().fmtDur(cd.minutes) +
      (over > 0 ? '  <span style="color:#e2545d">（超时 ' + S().fmtClock(over).replace(/^00:/, '') + '）</span>' : '  <span style="color:#22a06b">（在目标内）</span>');
    const noteEl = '<div class="field"><label>小总结（超时可写一句为什么超时）</label>' +
      '<textarea id="cd-note" style="width:100%;min-height:56px;border:1px solid #e5e8ec;border-radius:8px;padding:8px 10px;font-size:13px;resize:vertical"></textarea></div>';
    const modal = App.ui.openModal('⏰ 时间到！', '' +
      '<div class="field"><label>小任务</label><p style="font-size:14px;font-weight:700">' + S().esc(cd.text) + '</p></div>' +
      '<p style="font-size:12.5px;color:#8a919c;margin-bottom:8px">所属任务：' + S().esc(cd.taskText) + '</p>' +
      '<div class="field"><label>用时对比</label><p style="font-size:13px">' + timeLine + '</p></div>' +
      (cd.points > 0
        ? '<div class="field"><label>完成可得（按用时三档）</label><p style="font-weight:700;color:' + (cd.earnFactor === 2 ? '#22a06b' : cd.earnFactor === 1.5 ? '#f59e0b' : '#8a919c') + '">+' + earn + ' 分 ' + (cd.earnFactor > 1 ? '（' + cd.earnTier + '，×' + cd.earnFactor + ' 加成）' : '（' + cd.earnTier + '）') + '</p></div>'
        : '') +
      noteEl,
      '<button class="btn btn-primary" data-act="sub-done">✅ 完成了，领取积分</button>' +
      '<button class="btn" data-act="sub-fail">❌ 没完成</button>' +
      '<button class="btn" data-act="sub-retry">🔁 再来一轮</button>');
    App.ui.bindActions({
      'sub-done': function () { markSub(cd, true, modal.querySelector('#cd-note').value.trim()); App.ui.closeModal(); },
      'sub-fail': function () { markSub(cd, false, modal.querySelector('#cd-note').value.trim()); App.ui.closeModal(); },
      'sub-retry': function () {
        cdTimer.startedAt = Date.now();
        cdTimer.pausedMs = 0;
        cdTimer.paused = false;
        cdTimer.finished = false;
        cdTimer.microRest = false; cdTimer.microEndAt = 0;
        cdTimer.srRested = false; cdTimer.srReminded70 = false; cdTimer.srForced = false;
        cdTimer.srLastPromptAt = 0;
        cdTimer.earnPoints = undefined;
        App.ui.closeModal();
        showTimerBar();
      }
    });
  }

  function markSub(cd, doneFlag, summary) {
    const day = S().getDay(S().todayKey());
    const task = day.tasks[cd.taskKey] && day.tasks[cd.taskKey].find(function (t) { return t.id === cd.taskId; });
    const found = findSubInTask(task, cd.subId);
    const sub = found && found.sub;
    const group = found && found.group;
    // 本次实际用时（小任务时长也计入今日总时长 + 时间轴，学习性质）
    const stDate = new Date(cd.startedAt);
    const endDate = new Date();
    let sMin = stDate.getHours() * 60 + stDate.getMinutes();
    let eMin = endDate.getHours() * 60 + endDate.getMinutes();
    if (eMin < sMin) eMin = 1439;
    const span = Math.max(0, eMin - sMin);
    const elapsedMin = Math.max(1, Math.round((Date.now() - cd.startedAt - cd.pausedMs) / 60000));
    const mins = Math.max(1, Math.min(elapsedMin, span > 0 ? span : elapsedMin));
    if (sub) {
      sub.done = doneFlag;
      if (summary) sub.summary = summary;
      const pts = (cd.earnPoints != null ? cd.earnPoints : cd.points) || 0;
      if (doneFlag && pts > 0) {
        const tierMark = cd.earnFactor > 1 ? cd.earnTier + '，×' + cd.earnFactor : cd.earnTier;
        S().addLedger(S().todayKey(), 'earn-sub', { points: pts, note: '小任务：' + cd.text + '（' + task.text + '）·' + tierMark, taskId: cd.taskId });
        App.ui.floatAt(document.getElementById('stat-points'), '+' + pts + '分');
      }
    }
    // 时间轴记录
    day.timeline.push({
      id: S().uid(), start: sMin, end: eMin, minutes: mins,
      content: cd.text, category: 'study', countAsStudy: true,
      auto: true, sub: true, taskId: cd.taskId, taskText: cd.taskText,
      note: summary || ''
    });
    // 累计「今日任务实际用时」
    day.sessions.push({
      id: S().uid(), taskId: cd.taskId, taskText: cd.taskText,
      planContent: cd.text, planMinutes: cd.minutes,
      actualMinutes: mins,
      actualSeconds: Math.round((Date.now() - cd.startedAt - (cd.pausedMs || 0)) / 1000),
      sub: true, done: doneFlag, note: summary || '',
      startAt: stDate.toISOString(), endAt: endDate.toISOString(), pausedMs: cd.pausedMs || 0
    });
    cdTimer = null;
    stopTickIfIdle();
    showTimerBar();
    S().save();
    App.tasks.renderAll();
  }

  /* ---------- 任务总结（勾选完成时填写） ---------- */
  function summaryTaskModal(listKey, taskId, taskText, onDone) {
    let doneFlag = true;
    const body = function () {
      return '<div class="field"><label>任务</label><p style="font-size:14px;font-weight:700">' + S().esc(taskText) + '</p></div>' +
        '<div class="field"><label>这次做完了吗？</label><div class="btn-row">' +
        '<button class="btn btn-small' + (doneFlag ? ' btn-primary' : '') + '" data-act="sum-done">✅ 做完了</button>' +
        '<button class="btn btn-small' + (doneFlag ? '' : ' btn-primary') + '" data-act="sum-part">⛔ 没做完</button>' +
        '</div></div>' +
        '<div class="field"><label>总结 / 心得 / 注意事项</label>' +
        '<textarea id="sum-note" style="width:100%;min-height:56px;border:1px solid #e5e8ec;border-radius:8px;padding:8px;font-size:13px;resize:vertical"></textarea></div>';
    };
    function reopen() {
      const modal = App.ui.openModal('📝 写个任务总结', body(),
        '<button class="btn btn-primary" data-act="sum-save">保存总结</button>');
      const ta = modal.querySelector('#sum-note');
      App.ui.bindActions({
        'sum-done': function () { doneFlag = true; App.ui.closeModal(); reopen(); },
        'sum-part': function () { doneFlag = false; App.ui.closeModal(); reopen(); },
        'sum-save': function () {
          const day = S().getDay(S().todayKey());
          const task = day.tasks[listKey].find(function (t) { return t.id === taskId; });
          if (task) task.summary = { done: doneFlag, text: ta.value.trim(), at: new Date().toISOString() };
          S().save();
          App.ui.closeModal();
          App.tasks.renderAll();
          if (typeof onDone === 'function') onDone();
        }
      });
    }
    reopen();
  }

  /* ============================================================
   * 🧭 逐题拆解：语音/文字引导式步骤，复用小题倒计时与三档积分
   * （独立小工具，跟三种记录模式互不干扰；浏览器没语音则自动降级为手打）
   * ============================================================ */
  let splitLiveTimer = null; // 🧭 拆解弹窗内倒计时实时刷新
  function splitVoiceSupported() {
    return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
  }
  function splitListen(onFinalText, onState, onInterim) {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { if (onState) onState('unsupported'); return null; }
    const rec = new SR();
    rec.lang = 'zh-CN';
    rec.continuous = true;   // 持续识别：说一句话停顿后不自动结束，可连着录一整段
    rec.interimResults = true; // 实时出字，语音一边说一边上屏
    rec.maxAlternatives = 1;
    let final = '';
    rec.onresult = function (e) {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) final = (final ? final + ' ' : '') + r[0].transcript;
        else if (onInterim) onInterim(r[0].transcript); // 未说完的实时预览
      }
    };
    rec.onerror = function (e) { if (onState) onState('error:' + (e && e.error)); };
    rec.onend = function () { if (onFinalText) onFinalText(final); };
    rec.start();
    if (onState) onState('listening');
    return function () { try { rec.stop(); } catch (e) {} };
  }

  function openSplit(taskKey, taskId, subId, groupId) {
    if (S().settings().splitEnabled === false) { App.ui.toast('🧭 逐题拆解没开，去 设置 → 🧭 打开'); return; }
    // 同一题已在倒计时中（如从计时悬浮窗「🧭 回拆解」进来）→ 不重置计时，直接回到拆解界面
    const sameCd = cdTimer && cdTimer.taskId === taskId && cdTimer.subId === subId;
    if (!sameCd) startCdTimer(taskKey, taskId, subId, groupId); // 复用同一套倒计时 + 三档积分
    if (cdTimer) cdTimer.fromSplit = true; // 标记：这个倒计时来自逐题拆解，悬浮窗就显示「🧭 回拆解」
    const day = S().getDay(S().todayKey());
    const task = day.tasks[taskKey] && day.tasks[taskKey].find(function (t) { return t.id === taskId; });
    const found = findSubInTask(task, subId);
    const sub = found && found.sub;
    if (!sub) return;
    if (!sub.splitlog) sub.splitlog = [];
    if (splitLiveTimer) clearInterval(splitLiveTimer);

    let path = null;                    // 'A' 明确 / 'B' 不明确
    let stopRec = null;                 // 当前录音的停止函数
    const voice = splitVoiceSupported();
    const metaMain = '<p style="font-size:12.5px;color:#8a919c;margin-bottom:6px">正在拆解：<b>' + S().esc(sub.text) + '</b> · 限时 ' + sub.minutes + ' 分钟 · 完成按三档给分（提前×2 / 按时×1.5 / 超时×1）</p>';

    function logTxt(stepName, t) {
      if (t && t.trim()) { sub.splitlog.push({ step: stepName, text: t.trim(), at: new Date().toISOString() }); S().save(); }
    }
    // 单一委托：所有步骤的按钮都由这里按 id 分发（避免监听叠加）
    function renderStage(bodyHtml, handlers) {
      const body = document.querySelector('#split-body');
      if (body) body.innerHTML = metaMain + bodyHtml;
      window._splitHandlers = handlers;
      renderLive();
    }
    function recOn() {
      if (stopRec) { stopRec(); stopRec = null; return; }
      const ta = document.getElementById('split-txt');
      if (!ta) return;
      let done = ta.value ? ta.value.trim() : '';  // 已确认的文本（含之前手打的）
      let live = '';                               // 实时预览片段
      function paint() {
        const v = live.trim() ? (done && done.trim() ? done.trim() + '\n' : '') + live.trim() : done;
        ta.value = v;
      }
      stopRec = splitListen(function (finalTxt) {
        // 一句话说完 → 固化进 done，继续监听下一句（continuous）
        if (finalTxt && finalTxt.trim()) done = (done && done.trim() ? done.trim() + '\n' : '') + finalTxt.trim();
        live = '';
        paint();
        stopRec = null;
        const b = document.getElementById('split-rec');
        if (b) b.textContent = '🎙 开始录音';
      }, function (st) {
        if (st === 'unsupported' && ta) ta.placeholder = '浏览器不支持语音，改用手打';
      }, function (interim) {
        live = interim || '';
        paint();
      });
    }
    // —— 通用：可录音/输入的步骤 ——
    function stepRecord(stepName, label, desc, nextLabel, nextFn) {
      const recordArea = voice
        ? '<button class="btn btn-small" id="split-rec" style="margin-right:6px">' + (stopRec ? '⏹ 停止录音' : '🎙 开始录音') + '</button>' +
          '<button class="btn btn-small" id="split-clear">🧹 重来/清空</button>' +
          '<textarea id="split-txt" style="width:100%;min-height:60px;margin:8px 0;border:1px solid #e5e8ec;border-radius:8px;padding:8px;font-size:13px;resize:vertical" placeholder="语音会实时转成文字出现在这里，也可直接手打"></textarea>'
        : '<textarea id="split-txt" style="width:100%;min-height:60px;margin:8px 0;border:1px solid #e5e8ec;border-radius:8px;padding:8px;font-size:13px;resize:vertical" placeholder="你的浏览器不支持语音，改用手打（其它浏览器照常能用）"></textarea>';
      renderStage(
        '<h4 style="margin:6px 0 4px">' + label + '</h4><p class="hint">' + desc + '</p>' +
        recordArea +
        '<div><button class="btn btn-primary" id="split-next">' + nextLabel + '</button>' +
        '<button class="btn" id="split-close">结束拆解</button></div>',
        {
          'split-rec': function () { recOn(); document.getElementById('split-rec').textContent = stopRec ? '⏹ 停止录音' : '🎙 开始录音'; },
          'split-clear': function () { if (stopRec) { stopRec(); stopRec = null; } const t = document.getElementById('split-txt'); if (t) t.value = ''; },
          'split-next': function () { logTxt(stepName, document.getElementById('split-txt').value); nextFn(); },
          'split-close': closeSplit
        });
    }
    // —— 判定门 ——
    function stepGate() {
      renderStage(
        '<p class="hint">第一步你的思路已经记下来了。现在判断：这道题你搭得出完整框架吗？</p>' +
        '<div><button class="btn btn-primary" id="split-a">✅ 思路明确，自己写步骤</button>' +
        '<button class="btn" id="split-b">❌ 搭不出，先看答案</button>' +
        '<button class="btn" id="split-close">结束拆解</button></div>',
        {
          'split-a': function () { path = 'A'; stepRecord('自己写步骤', '② 自己写步骤', '把式子列出来（数字摆好），具体计算按需。写完点下一步。', '✅ 写好了，对答案', stepCheck); },
          'split-b': function () { path = 'B'; stepRead(); },
          'split-close': closeSplit
        });
    }
    function stepCheck() { stepRecord('对答案', '③ 对答案', '对着答案核对这题。看完点下一步结束整题。', '✅ 对完答案，结束整题', finishA); }
    function stepRead() {
      renderStage(
        '<h4 style="margin:6px 0 4px">② 看答案速览</h4><p class="hint">直接花一分钟看整题答案，读懂它的完整思路。</p>' +
        '<button class="btn btn-primary" id="split-next">✅ 看完答案，录音复述</button><button class="btn" id="split-close">结束拆解</button>',
        { 'split-next': function () { stepRecord('复述', '③ 复述答案', '用自己的话把答案思路复述一遍（可语音/手打），说到你能讲顺为止。', '✅ 复述完了，检验', stepRecall); }, 'split-close': closeSplit });
    }
    function stepRecall() { stepRecord('回忆检验', '④ 回忆串通', '在脑海里过一遍整题思路（可在本子上顺手写点演算），确保自己能讲通。', '✅ 串通了，结束整题', finishB); }
    function logFinal(tipMsg) {
      sub.splitlog.push({ step: '完成', text: tipMsg, at: new Date().toISOString() });
      S().save();
      renderStage(
        '<p style="color:#22a06b;font-weight:700">🎉 整题拆解完成！</p>' +
        '<p class="hint">你每一步的思考/复述已存进这题的「🧭 拆解记录」。现在点计时悬浮窗的「结束」，就会按三档给这题积分。</p>' +
        '<button class="btn btn-primary" id="split-done">好的，去领积分</button>',
        { 'split-done': closeSplit });
    }
    function finishA() { logFinal('已按「思路明确」路径完成整题拆解'); }
    function finishB() { logFinal('已按「看答案复述」路径完成整题拆解'); }
    function renderLive() {
      const el = document.querySelector('#split-cd');
      if (!el || !cdTimer) return;
      const ms = Math.max(0, cdElapsedMs());
      const over = ms - cdTimer.minutes * 60000;
      let line = '🕑 已用 <b>' + S().fmtClock(ms) + '</b> / 目标 <b>' + S().fmtDur(cdTimer.minutes) + '</b>';
      line += over > 0
        ? ' <span style="color:#e2545d">（超时）</span>'
        : ' <span style="color:#8a919c">（还剩 ' + S().fmtClock(Math.max(0, cdTimer.minutes * 60000 - ms)) + '）</span>';
      el.innerHTML = line;
    }
    function closeSplit() {
      if (stopRec) { try { stopRec(); } catch (e) {} stopRec = null; }
      if (splitLiveTimer) { clearInterval(splitLiveTimer); splitLiveTimer = null; }
      App.ui.closeModal();
      App.tasks.renderAll();
    }

    App.ui.openModal('🧭 逐题拆解',
      '<div id="split-stage">' +
        '<p id="split-cd" style="font-size:13px;font-weight:700;color:#2d3a4a;margin-bottom:6px"></p>' +
        '<div id="split-body"></div>' +
        '</div>',
      '<button class="btn" data-act="close">关闭</button>', { wide: true });
    const box = document.querySelector('#split-stage');
    box.addEventListener('click', function (e) {
      const t = e.target && e.target.closest && e.target.closest('[id]');
      const id = t && t.id;
      if (!id) return;
      const h = window._splitHandlers || {};
      if (h[id]) h[id]();
      else if (id === 'split-close') closeSplit();
    });
    App.ui.bindActions({ close: closeSplit });
    renderStageStep1();
    function renderStageStep1() {
      stepRecord('出声思考', '① 出声思考思路', '只看题目，一边想一边说你大概的思路，不用写不用算。说错/不满意可以重来。', '✅ 思路记下了', stepGate);
    }
    splitLiveTimer = setInterval(function () { renderLive(); }, 1000);
  }

  /* ---------- 打勾 / 取消打勾（含积分记账与奖励触发） ---------- */
  function toggleTask(listKey, taskId) {
    const dayKey = S().todayKey();
    const day = S().getDay(dayKey);
    const task = day.tasks[listKey].find(function (t) { return t.id === taskId; });
    if (!task) return;
    if (timer && timer.taskId === taskId) {
      App.ui.toast('这个任务正在计时中，先结束计时再打勾');
      return;
    }
    task.done = !task.done;
    const settings = S().settings();

    if (task.done) {
      // 完成 → 赚积分（仅理想/拓展，每条任务单独定价）
      if (listKey === 'ideal' || listKey === 'extra') {
        const p = taskPoints(task, listKey) || 0;
        if (p > 0) {
          S().addLedger(dayKey, listKey === 'ideal' ? 'earn-ideal' : 'earn-extra', { points: p, note: (listKey === 'ideal' ? '理想任务：' : '拓展任务：') + task.text, taskId: taskId });
          App.ui.floatAt(document.getElementById('stat-points'), '+' + p + '分');
        }
      }
    } else {
      // 取消完成 → 撤销对应积分
      const type = listKey === 'ideal' ? 'earn-ideal' : listKey === 'extra' ? 'earn-extra' : null;
      if (type) {
        const ledger = S().ledger();
        for (let i = ledger.length - 1; i >= 0; i--) {
          if (ledger[i].type === type && ledger[i].taskId === taskId) {
            S().undoLastLedger(ledger[i].id);
            break;
          }
        }
      }
    }
    S().save();
    App.tasks.renderAll();

    // 勾选完成：先填任务总结，确认后再触发奖励检查
    if (task.done) {
      summaryTaskModal(listKey, taskId, task.text, function () {
        const allDone = function (k) { return day.tasks[k].length > 0 && day.tasks[k].every(function (t) { return t.done; }); };
        if (allDone('required') && !day.rewards.some(function (r) { return r.kind === 'base'; })) {
          baseRewardModal();
        } else if (['required', 'ideal', 'extra'].every(allDone) && !day.rewards.some(function (r) { return r.kind === 'perfect'; })) {
          perfectRewardModal();
        }
      });
    }
  }

  /* ---------- 保底奖励弹窗（必须任务全部完成；只奖积分，数量自选） ---------- */
  function baseRewardModal() {
    const dayKey = S().todayKey();
    const day = S().getDay(dayKey);
    const settings = S().settings();
    let granted = null; // {ledgerId, points}

    const body = function () {
      return '' +
        '<p style="font-size:14px">必须完成的任务全部完成！</p>' +
        '<div class="field"><label>当前积分累计</label><p style="font-weight:700;color:#22a06b">' + S().pointsTotal() + ' 分</p></div>' +
        (granted
          ? '<div class="field"><label>已领取奖励</label><p>⭐ 积分 +' + granted.points + '分</p></div>'
          : '<div class="field"><label>本次奖励积分（可自定义）</label>' +
            '<input type="number" id="rw-pts" min="0" value="' + settings.baseRewardPoints + '" style="width:100%;padding:8px" />' +
            '<div class="btn-row" style="margin-top:8px">' +
            '<button class="btn btn-primary" data-act="rw-grant">🎁 确认领取</button>' +
            '</div></div>') +
        '<div class="field"><label>接下来你想</label>' +
        '<div class="btn-row">' +
        '<button class="btn btn-primary" data-act="next-ideal"' + (granted ? '' : ' disabled') + '>继续完成理想任务</button>' +
        '<button class="btn btn-primary" data-act="next-extra"' + (granted ? '' : ' disabled') + '>进入长期拓展任务</button>' +
        '<button class="btn" data-act="next-end"' + (granted ? '' : ' disabled') + '>直接结束今天</button>' +
        '</div></div>';
    };

    function reopen() {
      const m = App.ui.openModal('🎉 保底完成！', body(), '', { rechoose: true, lock: false });
      App.ui.bindActions({
        'rw-grant': function () {
          const pv = Math.max(0, +m.querySelector('#rw-pts').value || 0);
          if (pv <= 0) { App.ui.toast('填一个大于 0 的积分奖励'); return; }
          if (granted) { App.store.undoLastLedger(granted.ledgerId); }
          const idx = day.rewards.findIndex(function (r) { return r.kind === 'base'; });
          if (idx >= 0) day.rewards.splice(idx, 1);
          const lId = S().uid();
          S().data().ledger.push({ id: lId, date: dayKey, type: 'reward-base', points: pv, note: '保底奖励：积分+' + pv + '分', at: new Date().toISOString() });
          day.rewards.push({ kind: 'base', points: pv, at: new Date().toISOString() });
          S().save();
          granted = { ledgerId: lId, points: pv };
          App.ui.closeModal(); reopen();
          App.app.refreshStats();
        },
        'next-ideal': function () { App.ui.closeModal(); },
        'next-extra': function () { App.ui.closeModal(); },
        'next-end': function () { App.ui.closeModal(); App.tasks.endDay(); },
        rechoose: function () {
          if (granted) {
            App.store.undoLastLedger(granted.ledgerId);
            const idx = day.rewards.findIndex(function (r) { return r.kind === 'base'; });
            if (idx >= 0) day.rewards.splice(idx, 1);
            S().save();
            granted = null;
            App.app.refreshStats();
          }
          App.ui.closeModal(); reopen();
        }
      });
    }
    reopen();
  }

  /* ---------- 完美奖励弹窗（三类全部完成；只奖积分） ---------- */
  function perfectRewardModal() {
    const dayKey = S().todayKey();
    const day = S().getDay(dayKey);
    const settings = S().settings();
    let granted = null;

    const body = function () {
      return '' +
        '<p style="font-size:14px">必须 + 理想 + 拓展全部完成，完美的一天！</p>' +
        (granted
          ? '<div class="field"><label>已领取额外奖励</label><p>⭐ 积分 +' + granted.points + '分</p></div>'
          : '<div class="field"><label>额外奖励积分（可自定义）</label>' +
            '<input type="number" id="pf-pts" min="0" value="' + settings.perfectRewardPoints + '" style="width:100%;padding:8px" />' +
            '<div class="btn-row" style="margin-top:8px">' +
            '<button class="btn btn-primary" data-act="pf-grant">🎁 确认领取</button>' +
            '</div></div>');
    };

    function reopen() {
      const m = App.ui.openModal('🏆 完美！今日全部任务完成！', body(), '', { rechoose: true });
      App.ui.bindActions({
        'pf-grant': function () {
          const pv = Math.max(0, +m.querySelector('#pf-pts').value || 0);
          if (pv <= 0) { App.ui.toast('填一个大于 0 的积分奖励'); return; }
          if (granted) { App.store.undoLastLedger(granted.ledgerId); }
          const idx = day.rewards.findIndex(function (r) { return r.kind === 'perfect'; });
          if (idx >= 0) day.rewards.splice(idx, 1);
          const lId = S().uid();
          S().data().ledger.push({ id: lId, date: dayKey, type: 'reward-perfect', points: pv, note: '100%额外奖励：积分+' + pv + '分', at: new Date().toISOString() });
          day.rewards.push({ kind: 'perfect', points: pv, at: new Date().toISOString() });
          S().save();
          granted = { ledgerId: lId, points: pv };
          App.ui.closeModal(); reopen();
          App.app.refreshStats();
        },
        rechoose: function () {
          if (granted) {
            App.store.undoLastLedger(granted.ledgerId);
            const idx = day.rewards.findIndex(function (r) { return r.kind === 'perfect'; });
            if (idx >= 0) day.rewards.splice(idx, 1);
            S().save();
            granted = null;
            App.app.refreshStats();
          }
          App.ui.closeModal(); reopen();
        }
      });
    }
    reopen();
  }

  /* ---------- 结束今天 ---------- */
  function endDay() {
    // 若正在休息/杂事/娱乐，先提醒收回来
    if (typeof App.link !== 'undefined' && App.link.isPausing && App.link.isPausing()) {
      App.link.endDayGuard();
      return;
    }
    const dayKey = S().todayKey();
    const day = S().getDay(dayKey);
    const settings = S().settings();

    if (timer) { // 有计时进行：先提示
      App.ui.confirm('还有任务正在计时中，确定要结束今天吗？（计时将丢弃）', '结束今天', function () {
        timer = null; stopTick(); hideTimerBar();
        doEndDay();
      });
      return;
    }
    doEndDay();

    function doEndDay() {
      if (day.ended) {
        App.ui.toast('今天已经结束过了');
        return;
      }
      const reqD = day.tasks.required;
      const sessions = day.sessions;
      const focusMin = sessions.reduce(function (s, x) { return s + (x.actualMinutes || 0); }, 0);
      const restMin = Math.round(sessions.reduce(function (s, x) { return s + (x.pausedMs || 0); }, 0) / 60000);

      const undone = [];
      ['required', 'ideal', 'extra'].forEach(function (k) {
        day.tasks[k].filter(function (t) { return !t.done; }).forEach(function (t) { undone.push({ k: k, task: t }); });
      });

      let body = '' +
        '<div class="field"><label>今日完成</label><p>' +
        '必须 ' + day.tasks.required.filter(function (t) { return t.done; }).length + '/' + day.tasks.required.length +
        ' · 理想 ' + day.tasks.ideal.filter(function (t) { return t.done; }).length + '/' + day.tasks.ideal.length +
        ' · 拓展 ' + day.tasks.extra.filter(function (t) { return t.done; }).length + '/' + day.tasks.extra.length +
        '</p></div>' +
        '<div class="field"><label>今日专注</label><p>' + S().fmtDur(focusMin) + (restMin > 0 ? '（期间休息 ' + S().fmtDur(restMin) + '）' : '') + '</p></div>';

      if (settings.rollover && undone.length > 0) {
        body += '<div class="field"><label>未完成任务，勾选顺延到明天（无惩罚）</label>' +
          '<div style="max-height:180px;overflow-y:auto;border:1px solid #e5e8ec;border-radius:8px;padding:6px 10px">' +
          undone.map(function (u) {
            return '<label style="display:flex;gap:8px;align-items:center;padding:4px 0;font-size:13.5px;color:#374151">' +
              '<input type="checkbox" data-roll="' + u.task.id + '" checked /> <span>[' + COL_NAMES[u.k] + '] ' + S().esc(u.task.text) + '</span></label>';
          }).join('') + '</div></div>';
      } else if (undone.length === 0) {
        body += '<p style="color:#22a06b;font-weight:600">🎉 今天任务全部完成，提前收工吧！</p>';
      }

      // 结束时的复盘（可选，写给自己）
      body += '<div class="field"><label>📝 今日复盘（可选，结束前写几句）</label>' +
        '<textarea id="end-review" style="width:100%;min-height:64px;border:1px solid #e5e8ec;border-radius:8px;padding:8px 10px;font-size:13.5px;resize:vertical">' +
        S().esc((day.review && day.review.text) || '') + '</textarea></div>';

      const modal = App.ui.openModal('🏁 结束今天', body,
        '<button class="btn btn-primary" data-act="ok">确认结束</button><button class="btn" data-act="cancel">取消</button>');
      App.ui.bindActions({
        ok: function () {
          const revTa = modal.querySelector('#end-review');
          if (revTa) {
            const revText = revTa.value.trim();
            if (revText) day.review = { text: revText, at: new Date().toISOString() };
          }
          if (settings.rollover && undone.length > 0) {
            const ids = [];
            modal.querySelectorAll('[data-roll]:checked').forEach(function (c) { ids.push(c.dataset.roll); });
            ids.forEach(function (id) {
              const u = undone.find(function (x) { return x.task.id === id; });
              if (u) {
                const t = { id: S().uid(), text: u.task.text };
                if (u.task.points != null) t.points = u.task.points; // 保留单独定价
                S().getDay(S().tomorrowKey()).tasks[u.k].push(t);
              }
            });
            S().save();
          }
          day.ended = true;
          S().save();
          App.ui.closeModal();
          App.ui.toast('今天已结束，数据已保存。去明天填任务吧！');
          App.tasks.renderAll();
        },
        cancel: App.ui.closeModal
      });
    }
  }

  /* ---------- 渲染 ---------- */
  const DEFAULT_POINTS = { ideal: 10, extra: 5 };

  function taskPoints(task, listKey) {
    if (listKey !== 'ideal' && listKey !== 'extra') return null;
    const d = S().settings(); // 默认值兜底
    return task.points != null ? task.points
      : (listKey === 'ideal' ? (d.idealPoints == null ? DEFAULT_POINTS.ideal : d.idealPoints)
        : (d.extPoints == null ? DEFAULT_POINTS.extra : d.extPoints));
  }

  function taskRowHTML(listKey, task) {
    const locked = timer && timer.taskId !== task.id;
    const isThis = timer && timer.taskId === task.id;
    let btn;
    if (isThis) {
      btn = '<button class="task-timer-btn running" data-act="pause" title="暂停/继续">' + (timer.paused ? '▶ 继续' : '⏸ 暂停') + '</button>' +
        '<button class="task-timer-btn running" data-act="stop" title="完成计时">⏹ 完成</button>';
    } else {
      btn = '<button class="task-timer-btn' + (locked ? ' locked' : '') + '" data-act="start" title="' + (locked ? '已有任务在计时' : '开始计时') + '">▶ 开始计时</button>';
    }
    // 理想/拓展任务：每条单独定价积分（完成可得，任务后面直接改）
    const pts = taskPoints(task, listKey);
    const ptsInput = pts != null
      ? '<span class="task-pts-wrap" title="完成此任务可得积分（每条可单独定价）">' +
        '<input type="number" class="task-points" data-act="points" min="0" value="' + pts + '"' + (task.done || isThis ? ' disabled' : '') + ' />' +
        '<span class="pts-unit">分</span></span>'
      : '';
    // 直接小题（不在任务组里）的预计 / 实际统计；任务组各自的统计在组卡片里
    let statLine = '';
    if (task.subs && task.subs.length > 0) {
      const planned = task.subs.reduce(function (a, s) { return a + (s.minutes || 0); }, 0);
      const sess = ((S().getDay(S().todayKey()).sessions) || []).filter(function (se) { return se.taskId === task.id; });
      const actual = sess.reduce(function (a, se) { return task.subs.some(function (s) { return s.text === se.planContent; }) ? a + (se.actualMinutes || 0) : a; }, 0);
      const pct = planned > 0 ? Math.min(100, Math.round((actual / planned) * 100)) : 0;
      // 连续工作 = 正在做这道任务当前小题的"未歇"时长（暂停/小休不计入，小休后会重置）
      const cont = (cdTimer && cdTimer.taskId === task.id) ? Math.max(0, (cdElapsedMs() || 0) / 60000) : 0;
      statLine = '<div class="task-stat" title="预计=你设的总时长；实际=今天真花了多少；连续=上次休息后一直没歇的工作时长">' +
        '🕑 预计 <b>' + S().fmtDur(planned) + '</b> ｜ 实际 <b>' + S().fmtDur(actual) + '</b>' +
        (cont > 0 ? ' ｜ 连续 <b>' + S().fmtDur(cont) + '</b>' : '') +
        (planned ? ' ｜ 进度 <b style="color:' + (pct >= 100 ? 'var(--req)' : '#22a06b') + '">' + pct + '%</b>' : '') +
        '</div>';
    }
    return '<div class="task-row' + (task.done ? ' done' : '') + '" data-list="' + listKey + '" data-id="' + task.id + '">' +
      '<span class="task-check' + (task.done ? ' checked' : '') + '" data-act="check">✓</span>' +
      '<span class="task-text" data-act="edit">' + S().esc(task.text) + '</span>' +
      ptsInput +
      btn +
      '</div>' +
      statLine +
      subBlockHTML(task) +
      groupBlockHTML(task);
  }

  function renderToday() {
    const dayKey = S().todayKey();
    const day = S().getDay(dayKey);
    const box = document.getElementById('task-columns');
    // 日期显示
    document.getElementById('today-date').textContent = '📅 今天：' + S().fmtDateCN(dayKey);
    box.innerHTML = '<div class="day-toolbar">' +
      '<button class="btn btn-small" data-act="paste">📋 从往日粘贴任务</button>' +
      '<button class="btn btn-small" data-act="trash">🗑 回收站（误删恢复）</button>' +
      '<span class="day-toolbar-hint">粘贴往日任务 / 找回误删的任务</span></div>' +
      COLS.map(function (col) {
      const list = day.tasks[col.key];
      const doneN = list.filter(function (t) { return t.done; }).length;
      const rows = list.map(function (t) { return taskRowHTML(col.key, t); }).join('');
      // 每栏底部"＋ 添加任务"（当天临时加任务；拓展栏受"可追加"开关控制）
      let addBtn = '';
      if (col.key !== 'extra' || S().settings().extAppendable) {
        addBtn = '<div class="extra-append"><button class="btn btn-small" data-act="add">＋ 添加任务（临时）</button></div>';
      }
      return '<div class="task-col ' + col.style + '" data-col="' + col.key + '">' +
        '<div class="task-col-head"><h3>' + col.name + '</h3>' +
        '<span class="badge">' + doneN + '/' + list.length + '</span></div>' +
        '<div class="task-col-head"><span class="desc">' + col.desc + '</span></div>' +
        rows + addBtn +
        '</div>';
    }).join('');
    bindTodayEvents();
    renderReview(dayKey);
    renderHourPlan(dayKey);
  }

  /* ---------- 今日复盘（随时可写，结束今天时也能写） ---------- */
  function renderReview(dayKey) {
    const day = S().getDay(dayKey);
    const card = document.getElementById('review-card');
    if (!card) return;
    const text = (day.review && day.review.text) || '';
    card.innerHTML = '<h3>📝 今日复盘</h3>' +
      '<textarea id="review-text" style="width:100%;min-height:64px;border:1px solid #e5e8ec;border-radius:8px;padding:8px 10px;font-size:14px;resize:vertical">' +
      S().esc(text) + '</textarea>' +
      '<div class="btn-row" style="margin-top:8px;align-items:center">' +
      '<button class="btn btn-small btn-primary" data-act="review-save">保存复盘</button>' +
      (text ? '<span class="review-meta">已保存' + (day.review.at ? ' · ' + new Date(day.review.at).toLocaleString('zh-CN') : '') + '</span>' : '') +
      '</div>';
    const ta = card.querySelector('#review-text');
    if (ta && !text) ta.placeholder = '自由写下今天的感想与反思';
    card.onclick = function (e) {
      if (!e.target.closest('[data-act="review-save"]')) return;
      const txt = ta.value.trim();
      day.review = { text: txt, at: new Date().toISOString() };
      S().save();
      App.ui.toast('复盘已保存');
      renderReview(dayKey);
    };
  }

  /* ============================================================
   * ⏱ 小时计划：手动起止一段"小时"窗口，给 必须/理想/拓展 三类
   *   分别定目标学习分钟；用任务计时器正常执行，实际用时自动累计；
   *   结束结算看是否达到总目标，达标自填奖励积分（入账本）。
   * ============================================================ */
  const HOUR_COLS = [
    { k: 'required', n: '✅ 必须' },
    { k: 'ideal', n: '⭐ 理想' },
    { k: 'extra', n: '🌱 拓展' }
  ];
  // 任务 id → 所属栏（必须/理想/拓展）
  function hourPlanBucket(taskId) {
    const day = S().getDay(S().todayKey());
    for (let i = 0; i < HOUR_COLS.length; i++) {
      const c = HOUR_COLS[i];
      if ((day.tasks[c.k] || []).some(function (t) { return t.id === taskId; })) return c.k;
    }
    return null;
  }
  // 统计当前小时计划某类（或全部）已完成的实际分钟
  // 统计某类(或全部)实际分钟；upper 缺省=现在。到点结算时传"到点时刻"，超时补做不再计入
  function hourPlanActual(plan, colKey, upper) {
    if (!plan || !plan.startAt) return 0;
    const day = S().getDay(S().todayKey());
    const start = new Date(plan.startAt).getTime();
    const up = upper ? upper.getTime() : Date.now();
    let ms = 0;
    (day.sessions || []).forEach(function (s) {
      if (!s.startAt) return;
      const t = new Date(s.startAt).getTime();
      if (t < start || t > up) return; // 只计 [start, upper] 窗口内开始的任务
      if (colKey && hourPlanBucket(s.taskId) !== colKey) return;
      ms += (s.actualSeconds != null ? s.actualSeconds / 60 : (s.actualMinutes || 0)); // 秒级精确累加，不丢时间
    });
    return ms;
  }
  function hourPlanSummary(plan, upper) {
    const tg = (plan && plan.targets) || {};
    const req = tg.required || 0, ide = tg.ideal || 0, ext = tg.extra || 0;
    const ar = hourPlanActual(plan, 'required', upper), ai = hourPlanActual(plan, 'ideal', upper), ae = hourPlanActual(plan, 'extra', upper);
    return {
      targets: { required: req, ideal: ide, extra: ext },
      actual: { required: ar, ideal: ai, extra: ae },
      tTotal: req + ide + ext,
      aTotal: ar + ai + ae
    };
  }
  // 开始一个小时代：标起点 + 定这一段多长 + 在时长内分配三类
  function startHourPlanModal() {
    const day = S().getDay(S().todayKey());
    if (day.activeHourPlan) { App.ui.toast('已有一个小时计划在进行中，先「⏹ 结束」结算'); return; }
    if (day.activeRest) { App.ui.toast('正在休息中，先结束休息再开新的一段'); return; }
    const dflt = S().settings().hourPlanDefaultMin || 30;
    const now = new Date();
    const hhmm = S().pad2(now.getHours()) + ':' + S().pad2(now.getMinutes());
    const req0 = Math.round(dflt * 0.5), ide0 = Math.round(dflt * 0.3), ext0 = Math.max(1, dflt - req0 - ide0);
    let taskOpts = '<option value="">（不关联具体任务）</option>';
    ['required', 'ideal', 'extra'].forEach(function (lk) {
      (day.tasks[lk] || []).forEach(function (t) {
        taskOpts += '<option value="' + lk + ':' + t.id + '">[' + COL_NAMES[lk] + '] ' + S().esc(t.text) + '</option>';
      });
    });
    const modal = App.ui.openModal('⏱ 开始这个小时代',
      '<p style="font-size:12.5px;color:#8a919c;margin-bottom:10px">先标注这一段从几点开始、一共多长，再分配 必须/理想/拓展 各学多久。执行时用任务计时器正常计时，实际用时自动统计。</p>' +
      '<div class="field-row">' +
      '<div class="field"><label>开始时间（几点）</label><input type="time" id="hp-start" value="' + hhmm + '" /></div>' +
      '<div class="field"><label>这一段多长（分钟）</label><input type="number" id="hp-dur" min="1" value="' + dflt + '" /></div>' +
      '</div>' +
      '<div class="field"><label>✅ 必须任务（分钟）</label><input type="number" id="hp-req" min="0" value="' + req0 + '" /></div>' +
      '<div class="field"><label>⭐ 理想任务（分钟）</label><input type="number" id="hp-ide" min="0" value="' + ide0 + '" /></div>' +
      '<div class="field"><label>🌱 拓展任务（分钟）</label><input type="number" id="hp-ext" min="0" value="' + ext0 + '" /></div>' +
      '<div class="field"><label>🎁 这一段完成奖励积分（提前定好，达标就发）</label><input type="number" id="hp-pts" min="0" value="10" /></div>' +
      '<div class="field"><label>🔗 关联任务（本段主要做哪一项，可选）</label><select id="hp-task">' + taskOpts + '</select></div>' +
      '<p class="hint">三类合计建议约等于这一段时长（' + dflt + ' 分钟）；达标后这段的奖励积分自动入账。</p>',
      '<button class="btn btn-primary" data-act="ok">🎯 开始</button><button class="btn" data-act="cancel">取消</button>');
    const dEl = modal.querySelector('#hp-dur');
    if (dEl) dEl.onchange = function () {
      const d = Math.max(1, +dEl.value || dflt);
      modal.querySelector('#hp-req').value = Math.round(d * 0.5);
      modal.querySelector('#hp-ide').value = Math.round(d * 0.3);
      modal.querySelector('#hp-ext').value = Math.max(1, d - Math.round(d * 0.5) - Math.round(d * 0.3));
    };
    App.ui.bindActions({
      ok: function () {
        const req = Math.max(0, +modal.querySelector('#hp-req').value || 0);
        const ide = Math.max(0, +modal.querySelector('#hp-ide').value || 0);
        const ext = Math.max(0, +modal.querySelector('#hp-ext').value || 0);
        const dur = Math.max(1, +modal.querySelector('#hp-dur').value || dflt);
        if (!req && !ide && !ext) { App.ui.toast('至少给一类定个目标分钟'); return; }
        const pts = Math.max(0, +modal.querySelector('#hp-pts').value || 0);
        const tv = modal.querySelector('#hp-start').value || hhmm;
        const sd = new Date(); sd.setHours(+tv.split(':')[0] || 0, +tv.split(':')[1] || 0, 0, 0);
        const tvsel = modal.querySelector('#hp-task').value || '';
        let tKey = '', tId = '', tText = '';
        if (tvsel) {
          const idx = tvsel.indexOf(':');
          tKey = tvsel.slice(0, idx); tId = tvsel.slice(idx + 1);
          const ts = (day.tasks[tKey] || []).find(function (t) { return t.id === tId; });
          tText = ts ? ts.text : '';
        }
        day.activeHourPlan = { id: S().uid(), startAt: sd.toISOString(), duration: dur, reward: pts, taskKey: tKey, taskId: tId, taskText: tText, targets: { required: req, ideal: ide, extra: ext } };
        S().save();
        App.ui.closeModal();
        App.tasks.renderToday();
        App.ui.toast('🎯 已开始：从 ' + tv + ' 起 · ' + dur + ' 分钟（必' + req + '/理' + ide + '/拓' + ext + '），去执行！');
      },
      cancel: App.ui.closeModal
    });
  }
  // 结束结算：到点即封顶（窗口=[startAt, startAt+时长]），到点后补做不算；达标→自动发提前定的积分
  function endHourPlan() {
    const day = S().getDay(S().todayKey());
    const plan = day.activeHourPlan;
    if (!plan) { App.ui.toast('当前没有进行中的小时计划'); return; }
    const startMs = new Date(plan.startAt).getTime();
    const planEndMs = plan.duration ? startMs + plan.duration * 60000 : startMs + 30 * 60000;
    const endAtMs = Math.min(Date.now(), planEndMs); // 到点即封顶，超时补做不计
    const sum = hourPlanSummary(plan, new Date(endAtMs));
    const met = sum.tTotal > 0 && sum.aTotal >= sum.tTotal;
    plan.endAt = new Date(endAtMs).toISOString();
    plan.autoEnd = Date.now() >= planEndMs; // 是否到点自动结算
    plan.actual = sum.actual;
    plan.met = met;
    plan.usedMin = sum.aTotal;
    day.hourPlans = day.hourPlans || [];
    day.hourPlans.push(plan);
    day.activeHourPlan = null;
    S().save();
    App.tasks.renderToday();
    if (met) {
      // 达标先自查中途消耗，选完才真正入账
      hourDistractCheck(plan);
    }
    else {
      App.ui.toast(plan.autoEnd
        ? ('⏰ 到点了，这段没达标（做了 ' + sum.aTotal + '/' + sum.tTotal + ' 分，到点即封顶、超时补做不算）——积分清零，下段再冲 💪')
        : ('这小时没达标（做了 ' + sum.aTotal + '/' + sum.tTotal + ' 分）——下小时再冲一把 💪'));
    }
    // 无论达不达标：先写这一段复盘，再强制衔接下一步，同时把这段写进时间轴延续记录
    hourPlanTimelinePush(plan);
    hourReviewPrompt(plan);
  }
  // 每段小时代 → 在时间轴里单独记一条延续记录（视图条，不计入学习分钟避免重复）
  function hourPlanTimelinePush(plan) {
    const day = S().getDay(S().todayKey());
    const s = new Date(plan.startAt), e = new Date(plan.endAt);
    let sMin = s.getHours() * 60 + s.getMinutes();
    let eMin = e.getHours() * 60 + e.getMinutes();
    if (eMin < sMin) eMin = 1439;
    const total = Math.max(1, eMin - sMin);
    day.timeline = day.timeline || [];
    day.timeline.push({
      id: S().uid(), start: sMin, end: eMin, minutes: Math.min(total, Math.round(plan.usedMin || total)),
      content: '⏱ 小时代 ' + S().hhmmOf(sMin) + '→' + S().hhmmOf(eMin) + (plan.met ? ' · 达标' : ' · 未达标'),
      category: 'study', countAsStudy: false, auto: true, hourPlanId: plan.id,
      note: (plan.review && plan.review.text) || ''
    });
    S().save();
  }
  // 每段结算后的强制复盘：让用户写下这一段状态/感想，再强制衔接下一步
  function hourReviewPrompt(plan) {
    const m = App.ui.openModal('📝 这一段的复盘 · 感想', '' +
      '<p style="font-size:13px">写给自己：这一段做了什么、状态、想法。写完点保存，会强制衔接下一段（不让你闲下来）。</p>' +
      '<div class="field"><label>感想 / 复盘</label>' +
      '<textarea id="hrev-text" style="width:100%;min-height:84px;border:1px solid #e5e8ec;border-radius:8px;padding:8px;font-size:13.5px;resize:vertical"></textarea></div>',
      '<button class="btn btn-primary" data-act="ok">✔ 保存并下一步</button>' +
      '<button class="btn" data-act="skip">稍后再写</button>');
    App.ui.bindActions({
      ok: function () {
        const v = m.querySelector('#hrev-text').value.trim();
        if (v) { plan.review = { text: v, at: new Date().toISOString() }; S().save(); }
        App.ui.closeModal(); nextStepPrompt();
      },
      skip: function () { App.ui.closeModal(); nextStepPrompt(); }
    });
  }
  // 达标后的「中途消耗自查」：有消耗 → 按设置百分比扣掉这段奖励积分
  function hourDistractCheck(plan) {
    const dayKey = S().todayKey();
    const rw = plan.reward || 0;
    const cutPct = (S().settings().hourDistractCut == null ? 100 : S().settings().hourDistractCut);
    const modal = App.ui.openModal('🎁 这段达标！先自查两句',
      '<p style="font-size:13px">这段奖励积分预设 <b>' + rw + '</b> 分。答真实才入账。</p>' +
      '<p style="font-size:13px;margin-top:8px"><b>① 这一段有没有好好休息？</b></p>' +
      '<div class="btn-row">' +
      '<button class="btn btn-small" data-act="rgood">✅ 好好休息了</button>' +
      '<button class="btn btn-small" data-act="rbad">⚠️ 没好好休息（刷了手机/没真歇）</button>' +
      '</div>' +
      '<p style="font-size:13px;margin-top:8px"><b>② 中途偷偷看了几次手机 / 刷了几次屏？</b></p>' +
      '<div class="btn-row">' +
      '<button class="btn btn-small" data-act="n0">0 次</button>' +
      '<button class="btn btn-small" data-act="n1">1 次</button>' +
      '<button class="btn btn-small" data-act="n2">2 次</button>' +
      '<button class="btn btn-small" data-act="n3">3 次以上</button>' +
      '</div>' +
      '<p style="font-size:12px;color:#8a919c;margin-top:8px">每消耗 1 次扣 ' + cutPct + '%（累计上限扣光）。选好两项再点「如实提交」。</p>',
      '<button class="btn btn-primary" data-act="ok">☑ 如实提交</button>');
    let restGood = null, times = 0;
    modal.addEventListener('click', function (e) {
      const b = e.target.closest('[data-act]');
      if (!b || b.dataset.act === 'ok') return;
      const a = b.dataset.act;
      if (a === 'rgood') restGood = true;
      else if (a === 'rbad') restGood = false;
      else if (a.charAt(0) === 'n') times = +a.slice(1);
      modal.querySelectorAll('[data-act]').forEach(function (x) { x.classList.remove('btn-primary'); });
      b.classList.add('btn-primary');
    });
    function settle() {
      if (restGood === null) { App.ui.toast('先点一下「好好休息 / 没好好休息」'); return; }
      const n = (restGood ? 0 : 1) + times;
      const cut = Math.min(100, n * cutPct);
      const gain = n > 0 ? Math.round(rw * (100 - cut) / 100) : rw;
      plan.rewardPoints = gain;
      plan.distracted = n > 0;
      plan.disturbCount = n;
      plan.restGood = restGood;
      if (gain > 0) {
        App.store.addLedger(dayKey, 'hour-reward', { points: gain, note: '小时计划达标奖励：积分+' + gain + '分' + (n > 0 ? '（消耗' + n + '次，扣' + cut + '%）' : '（全程专注）') });
      }
      S().save();
      if (App.app && App.app.refreshStats) App.app.refreshStats();
      App.tasks.renderToday();
      App.ui.closeModal();
      if (n > 0) {
        App.ui.toast(gain > 0
          ? ('⚠️ 这段消耗了 ' + n + ' 次，扣 ' + cut + '%，实得 +' + gain + ' 分；下次管住自己 💪')
          : ('⚠️ 这段消耗了 ' + n + ' 次，积分被扣光（' + cut + '%）'));
      }
      else {
        App.ui.toast(rw > 0 ? ('🎉 全程专注，这段 +' + rw + ' 分已入账！') : '🎉 全程专注，这段达到目标了！');
      }
    }
    App.ui.bindActions({ ok: function () { settle(); } });
  }
  // 一段结束后的衔接选择窗：强制别闲下来 → 继续做任务 或 去休息
  function nextStepPrompt() {
    App.ui.openModal('✅ 这一段结束了，接下来？',
      '<p style="font-size:13px">别让空档落下去——马上定下一段，或主动去休息（好好休息也有积分）。</p>',
      '<button class="btn btn-primary" data-act="work">📚 继续做任务</button><button class="btn" data-act="rest">☕ 去休息</button>');
    App.ui.bindActions({
      work: function () { App.ui.closeModal(); startHourPlanModal(); },
      rest: function () { App.ui.closeModal(); startRestModal(); }
    });
  }
  // 定一段休息：类型 + 时长 + 提前填「好好休息」积分
  function startRestModal() {
    const day = S().getDay(S().todayKey());
    if (day.activeRest) { App.ui.toast('已经在休息中，先结束休息'); return; }
    const dflt = (S().settings().hourPlanDefaultMin || 30);
    const now = new Date();
    const hhmm = S().pad2(now.getHours()) + ':' + S().pad2(now.getMinutes());
    const modal = App.ui.openModal('☕ 定一段休息',
      '<p style="font-size:12.5px;color:#8a919c;margin-bottom:10px">选类型、定多久、以及「好好休息」给多少积分（提前定好）。休息到点自动结束，也能提前结束提前开下一段。</p>' +
      '<div class="field"><label>休息类型</label><select id="rs-type">' +
      '<option value="rest">☕ 单纯休息</option><option value="meal">🍚 吃饭</option><option value="sleep">😴 睡觉</option></select></div>' +
      '<div class="field"><label>休息多久（分钟，从 ' + hhmm + ' 起）</label><input type="number" id="rs-dur" min="1" value="' + dflt + '" /></div>' +
      '<div class="field"><label>🎁 好好休息可得积分（提前定）</label><input type="number" id="rs-pts" min="0" value="10" /></div>',
      '<button class="btn btn-primary" data-act="ok">☕ 开始休息</button><button class="btn" data-act="cancel">取消</button>');
    App.ui.bindActions({
      ok: function () {
        const type = modal.querySelector('#rs-type').value || 'rest';
        const dur = Math.max(1, +modal.querySelector('#rs-dur').value || dflt);
        const pts = Math.max(0, +modal.querySelector('#rs-pts').value || 0);
        const tn = type === 'meal' ? '🍚 吃饭' : (type === 'sleep' ? '😴 睡觉' : '☕ 休息');
        day.activeRest = { id: S().uid(), startAt: new Date().toISOString(), duration: dur, type: type, typeName: tn, reward: pts };
        S().save(); App.ui.closeModal(); App.tasks.renderToday();
        App.ui.toast('☕ ' + tn + ' 开始：' + dur + ' 分钟，好好休息 +' + pts + ' 分');
      },
      cancel: App.ui.closeModal
    });
  }
  // 结束休息：先自查消耗（同上扣%）→ 入账休息积分 → 强制开始下一段
  function endRest() {
    const day = S().getDay(S().todayKey());
    const r = day.activeRest;
    if (!r) { App.ui.toast('当前不在休息'); return; }
    const startMs = new Date(r.startAt).getTime();
    const rEndMs = startMs + (r.duration || 30) * 60000;
    r.endAt = new Date(Math.min(Date.now(), rEndMs)).toISOString();
    r.autoEnd = Date.now() >= rEndMs;
    const rw = r.reward || 0;
    const cutPct = (S().settings().hourDistractCut == null ? 100 : S().settings().hourDistractCut);
    const modal = App.ui.openModal('✅ 休息结束，先自查',
      '<p style="font-size:13px">这段' + r.typeName + '预设奖励 <b>' + rw + '</b> 分。<br>休息期间有没有去干消耗性的事（刷手机等）？</p>',
      '<button class="btn btn-primary" data-act="ok">✅ 没有，全额给我</button><button class="btn" style="background:#e2545d;border-color:#e2545d;color:#fff" data-act="cut">⚠️ 有，扣' + cutPct + '%</button>');
    function settle(distracted) {
      const gain = distracted ? Math.round(rw * (100 - cutPct) / 100) : rw;
      r.rewardPoints = gain; r.distracted = !!distracted;
      if (gain > 0) {
        App.store.addLedger(S().todayKey(), 'rest-reward', { points: gain, note: r.typeName + '好好休息奖励：积分+' + gain + '分' + (distracted ? '（休息中消耗，扣' + cutPct + '%）' : '') });
      }
      day.rests = day.rests || []; day.rests.push(r); day.activeRest = null;
      S().save();
      if (App.app && App.app.refreshStats) App.app.refreshStats();
      App.tasks.renderToday();
      App.ui.closeModal();
      App.ui.toast(distracted
        ? ('休息有消耗，扣了 ' + cutPct + '%；起来动一动，接着冲 💪')
        : (rw > 0 ? ('🎉 好好休息 +' + gain + ' 分，休息到位！') : '休息到位，这杯水也喝得值 😌'));
      startHourPlanModal(); // 休息完强制立刻开下一段，不留空档
    }
    App.ui.bindActions({ ok: function () { settle(false); }, cut: function () { settle(true); } });
  }
  // 常驻 tick：到点自动结算 + 实时刷新卡片倒计时
  function hourPlanAutoTick() {
    const day = S().getDay(S().todayKey());
    // 休息中：到点自动结束并衔接下一段
    const r = day.activeRest;
    if (r && r.duration) {
      const rEnd = new Date(r.startAt).getTime() + r.duration * 60000;
      if (Date.now() >= rEnd) { endRest(); return; }
      const cR = document.getElementById('hp-countdown');
      if (cR) {
        const left = Math.max(0, rEnd - Date.now());
        cR.textContent = '⏳ 休息到点还有 ' + Math.floor(left / 60000) + ' 分 ' + S().pad2(Math.floor((left % 60000) / 1000)) + ' 秒';
      }
      return;
    }
    const p = day.activeHourPlan;
    if (p && p.duration) {
      const endMs = new Date(p.startAt).getTime() + p.duration * 60000;
      if (Date.now() >= endMs) { endHourPlan(); return; }
    }
    const c = document.getElementById('hp-countdown');
    if (!c) return;
    const cur = day.activeHourPlan;
    if (cur && cur.duration) {
      const endMs = new Date(cur.startAt).getTime() + cur.duration * 60000;
      const left = Math.max(0, endMs - Date.now());
      c.textContent = '⏳ 到点还有 ' + Math.floor(left / 60000) + ' 分 ' + S().pad2(Math.floor((left % 60000) / 1000)) + ' 秒 · 到点未达标 → 这段积分清零（超时补做不算）';
    }
  }
  // 📌 预定明天的某一段：提前定好几点到几点、三大类指标、奖励积分
  function bookTomorrowModal() {
    const today = S().getDay(S().todayKey());
    if (today.activeHourPlan || today.activeRest) { App.ui.toast('先把当前这段/休息处理完再预定明天'); return; }
    const tom = S().getDay(S().tomorrowKey());
    const dflt = (S().settings().hourPlanDefaultMin || 30);
    const req0 = Math.round(dflt * 0.5), ide0 = Math.round(dflt * 0.3), ext0 = Math.max(1, dflt - req0 - ide0);
    const modal = App.ui.openModal('📌 预定明天的时段', '' +
      '<p class="hint">提前给明天定一段（几点开始、多久、三类指标、奖励）。明天 1 键就能「用预定的第一段开始」，当场按此刻跑这一段的指标。</p>' +
      '<div class="field-row">' +
      '<div class="field"><label>明天几点开始</label><input type="time" id="bp-start" value="08:00" /></div>' +
      '<div class="field"><label>这一段多长（分钟）</label><input type="number" id="bp-dur" min="1" value="' + dflt + '" /></div>' +
      '</div>' +
      '<div class="field"><label>✅ 必须（分钟）</label><input type="number" id="bp-req" min="0" value="' + req0 + '" /></div>' +
      '<div class="field"><label>⭐ 理想（分钟）</label><input type="number" id="bp-ide" min="0" value="' + ide0 + '" /></div>' +
      '<div class="field"><label>🌱 拓展（分钟）</label><input type="number" id="bp-ext" min="0" value="' + ext0 + '" /></div>' +
      '<div class="field"><label>🎁 这段奖励积分（提前定）</label><input type="number" id="bp-pts" min="0" value="10" /></div>',
      '<button class="btn btn-primary" data-act="ok">📌 预定</button><button class="btn" data-act="cancel">取消</button>');
    App.ui.bindActions({
      ok: function () {
        const req = Math.max(0, +modal.querySelector('#bp-req').value || 0);
        const ide = Math.max(0, +modal.querySelector('#bp-ide').value || 0);
        const ext = Math.max(0, +modal.querySelector('#bp-ext').value || 0);
        if (!req && !ide && !ext) { App.ui.toast('至少给一类定分钟'); return; }
        const dur = Math.max(1, +modal.querySelector('#bp-dur').value || dflt);
        const pts = Math.max(0, +modal.querySelector('#bp-pts').value || 0);
        const tv = modal.querySelector('#bp-start').value || '08:00';
        tom.plannedHourPlans = tom.plannedHourPlans || [];
        tom.plannedHourPlans.push({ start: tv, dur: dur, req: req, ide: ide, ext: ext, pts: pts });
        S().save(); App.ui.closeModal(); App.tasks.renderToday(); App.tasks.renderTomorrow();
        App.ui.toast('📌 明天 ' + tv + ' 已预定一段：' + dur + ' 分（必' + req + '/理' + ide + '/拓' + ext + '）· 奖励 +' + pts + ' 分');
      },
      cancel: App.ui.closeModal
    });
  }
  // ▶ 用明天预定的第一段开始（现在就跑这一段的指标）
  function startFromPlanned() {
    const day = S().getDay(S().todayKey());
    const tom = S().getDay(S().tomorrowKey());
    const planned = tom.plannedHourPlans || [];
    if (!planned.length) { App.ui.toast('明天没有预定任何段'); return; }
    const p = planned.shift();
    day.activeHourPlan = {
      id: S().uid(), startAt: new Date().toISOString(),
      duration: p.dur, reward: p.pts, fromPlanned: true,
      targets: { required: p.req || 0, ideal: p.ide || 0, extra: p.ext || 0 }
    };
    tom.plannedHourPlans = planned;
    S().save(); App.tasks.renderToday();
    App.ui.toast('▶ 用明天预定的段开跑：' + p.dur + ' 分（必' + p.req + '/理' + p.ide + '/拓' + p.ext + '）· 奖励 +' + p.pts + ' 分');
  }
  // 渲染小时计划卡片（今天页顶部 #hour-card）
  function renderHourPlan(dayKey) {
    const box = document.getElementById('hour-card');
    if (!box) return;
    const day = S().getDay(dayKey);
    const rest = day.activeRest || null;
    if (rest) {
      const rEnd = new Date(rest.startAt).getTime() + (rest.duration || 30) * 60000;
      const rStartTxt = S().hhmmOf(new Date(rest.startAt).getHours() * 60 + new Date(rest.startAt).getMinutes());
      const rEndTxt = S().hhmmOf(new Date(rEnd).getHours() * 60 + new Date(rEnd).getMinutes());
      box.innerHTML = '<div class="hour-card active">' +
        '<h3 style="margin:0">☕ 休息中</h3>' +
        '<div style="font-size:12.5px;color:#8a919c;margin:2px 0 4px">' + rest.typeName + ' · 从 <b>' + rStartTxt + '</b> 到 <b>' + rEndTxt + '</b>（' + (rest.duration || 30) + ' 分钟）· 好好休息可得 <b>' + (rest.reward || 0) + '</b> 分</div>' +
        '<div id="hp-countdown" style="font-size:12px;color:#8a919c;margin:2px 0 6px"></div>' +
        '<div class="hp-actions"><button class="btn btn-small btn-primary" id="hp-endrest">⏭ 提前结束休息</button></div></div>';
      const e2 = box.querySelector('#hp-endrest');
      if (e2) e2.onclick = function () { endRest(); };
      return;
    }
    const plan = day.activeHourPlan || null;
    if (!plan) {
      const tp = (S().getDay(S().tomorrowKey()).plannedHourPlans || []);
      const plannedNote = tp.length
        ? '<p style="margin:2px 0 0;font-size:12.5px;color:#22a06b">📌 明天已预定 ' + tp.length + ' 段 → 点「▶ 用预定的第一段开始」现在就跑</p>'
        : '<p style="margin:2px 0 0;font-size:12.5px;color:#8a919c">给每一段定个学习指标，别让没有目标的时间悄悄溜走。</p>';
      box.innerHTML = '<div class="hour-card idle">' +
        '<div style="flex:1"><h3 style="margin:0">⏱ 小时计划</h3>' + plannedNote + '</div>' +
        '<div>' +
        '<button class="btn btn-primary btn-small" id="hp-start">🎯 开始这小时代</button>' +
        (tp.length ? '<button class="btn btn-small btn-primary" id="hp-planned" style="margin-left:6px">▶ 用预定的第一段开始</button>' : '') +
        '<button class="btn btn-small" id="hp-book" style="margin-left:6px">📌 预定明天的段</button>' +
        '<button class="btn btn-small" id="hp-export" style="margin-left:6px">📤 导出复盘给AI</button>' +
        '<button class="btn btn-small" id="hp-export-hour" style="margin-left:6px">📕 今日小时代复盘</button>' +
        '</div></div>';
      const b = box.querySelector('#hp-start');
      if (b) b.onclick = startHourPlanModal;
      const bb = box.querySelector('#hp-book');
      if (bb) bb.onclick = bookTomorrowModal;
      const bp = box.querySelector('#hp-planned');
      if (bp) bp.onclick = startFromPlanned;
      const eb = box.querySelector('#hp-export');
      if (eb) eb.onclick = function () { App.stats.exportReview(); };
      const eh = box.querySelector('#hp-export-hour');
      if (eh) eh.onclick = function () { App.stats.exportHourReviewToday(); };
      return;
    }
    const sum = hourPlanSummary(plan);
    const pct = sum.tTotal > 0 ? Math.min(100, Math.round(sum.aTotal / sum.tTotal * 100)) : 0;
    const met = sum.tTotal > 0 && sum.aTotal >= sum.tTotal;
    const rows = HOUR_COLS.map(function (c) {
      const tg = sum.targets[c.k], ac = sum.actual[c.k];
      const pp = tg > 0 ? Math.min(100, Math.round(ac / tg * 100)) : 0;
      return '<div class="hp-row"><span class="hp-name">' + c.n + '</span>' +
        '<span class="hp-bar"><i style="width:' + pp + '%"></i></span>' +
        '<span class="hp-num">' + ac + '/' + tg + '分</span></div>';
    }).join('');
    var startMinTxt = '--';
    if (plan.startAt) { var d0 = new Date(plan.startAt); startMinTxt = S().hhmmOf(d0.getHours() * 60 + d0.getMinutes()); }
    var durTxt = plan.duration ? plan.duration + ' 分' : (sum.tTotal + ' 分（目标）');
    var endMinTxt = '--';
    if (plan.startAt && plan.duration) {
      var d1 = new Date(new Date(plan.startAt).getTime() + plan.duration * 60000);
      endMinTxt = S().hhmmOf(d1.getHours() * 60 + d1.getMinutes());
    }
    box.innerHTML = '<div class="hour-card active">' +
      '<h3 style="margin:0">⏱ 当前小时计划</h3>' +
      '<div style="font-size:12.5px;color:#8a919c;margin:2px 0 4px">从 <b>' + startMinTxt + '</b> 开始 · 到 <b>' + endMinTxt + '</b> 到点（' + durTxt + '）· 目标合计 <b>' + sum.tTotal + '</b> 分</div>' +
      (plan.taskText ? '<div style="font-size:12.5px;color:#8a919c;margin:2px 0 4px">🔗 关联：' + S().esc(plan.taskText) + '</div>' : '') +
      '<div id="hp-countdown" style="font-size:12px;color:#8a919c;margin:2px 0 4px"></div>' +
      '<div style="font-size:12.5px;color:#8a919c;margin:2px 0 6px">已执行 <b style="color:' + (met ? '#22a06b' : '#3b82f6') + '">' + sum.aTotal + '</b> 分 · ' + (met ? '🎉 已达标！' : '达成率 ' + pct + '%') + '</div>' +
      rows +
      '<div class="hp-actions"><button class="btn btn-small btn-primary" id="hp-end">⏹ 结束这小时代（结算）</button></div></div>';
    const e = box.querySelector('#hp-end');
    if (e) e.onclick = function () { endHourPlan(); };
  }

  function bindTodayEvents() {
    const box = document.getElementById('task-columns');
    // 单独定价：修改任务积分
    box.onchange = function (e) {
      const inp = e.target.closest('.task-points');
      if (!inp) return;
      const row = inp.closest('.task-row');
      if (!row) return;
      const day = S().getDay(S().todayKey());
      const task = day.tasks[row.dataset.list].find(function (t) { return t.id === row.dataset.id; });
      if (!task) return;
      task.points = Math.max(0, +inp.value || 0);
      S().save();
    };
    box.onclick = function (e) {
      const row = e.target.closest('.task-row');
      if (!row) {
        const actBtn = e.target.closest('[data-act]');
        if (!actBtn) return;
        const act2 = actBtn.dataset.act;
        if (act2 === 'paste') { pasteTasksModal(S().todayKey()); return; }
        if (act2 === 'trash') { trashModal(); return; }
        const colEl = actBtn.closest('.task-col');
        const listKey = colEl ? colEl.dataset.col : null;
        if (!listKey) { App.ui.toast('无法识别任务栏'); return; }
        if (act2 === 'add') { addTaskModal(listKey, S().todayKey(), false); return; }
        if (act2 === 'sub-add') { addSubModal(listKey, actBtn.dataset.task, null, S().todayKey()); return; }
        if (act2 === 'sub-edit') { addSubModal(listKey, actBtn.dataset.task, actBtn.dataset.sub, S().todayKey()); return; }
        if (act2 === 'sub-del') { delSub(listKey, actBtn.dataset.task, actBtn.dataset.sub, S().todayKey()); return; }
        if (act2 === 'cd-start') { startCdTimer(listKey, actBtn.dataset.task, actBtn.dataset.sub); return; }
        if (act2 === 'sub-note') { editSubSummary(listKey, actBtn.dataset.task, actBtn.dataset.sub, S().todayKey()); return; }
        if (act2 === 'g-sub-note') { editSubSummary(listKey, actBtn.dataset.task, actBtn.dataset.sub, S().todayKey(), actBtn.dataset.group); return; }
        if (act2 === 'group-new') { addGroupModal(listKey, actBtn.dataset.task, S().todayKey()); return; }
        if (act2 === 'g-sub-add') { addSubModal(listKey, actBtn.dataset.task, null, S().todayKey(), actBtn.dataset.group); return; }
        if (act2 === 'g-sub-edit') { addSubModal(listKey, actBtn.dataset.task, actBtn.dataset.sub, S().todayKey(), actBtn.dataset.group); return; }
        if (act2 === 'g-sub-del') { delGroupSub(listKey, actBtn.dataset.task, actBtn.dataset.group, actBtn.dataset.sub, S().todayKey()); return; }
        if (act2 === 'g-cd-start') { startCdTimer(listKey, actBtn.dataset.task, actBtn.dataset.sub, actBtn.dataset.group); return; }
        if (act2 === 'sub-split') { openSplit(listKey, actBtn.dataset.task, actBtn.dataset.sub, null); return; }
        if (act2 === 'g-sub-split') { openSplit(listKey, actBtn.dataset.task, actBtn.dataset.sub, actBtn.dataset.group); return; }

        if (act2 === 'g-edit') { editGroupModal(listKey, actBtn.dataset.task, actBtn.dataset.group, S().todayKey()); return; }
        if (act2 === 'g-del') { delGroup(listKey, actBtn.dataset.task, actBtn.dataset.group, S().todayKey()); return; }
        return;
      }
      const listKey = row.dataset.list, taskId = row.dataset.id;
      const act = e.target.closest('[data-act]') && e.target.closest('[data-act]').dataset.act;
      if (act === 'check') toggleTask(listKey, taskId);
      else if (act === 'edit') editTaskModal(listKey, taskId, S().todayKey(), false);
      else if (act === 'start') startTimer(listKey, taskId);
      else if (act === 'pause') togglePause();
      else if (act === 'stop') stopTimer();
    };
  }

  function renderTomorrow() {
    const dayKey = S().tomorrowKey();
    const day = S().getDay(dayKey);
    const box = document.getElementById('tomorrow-columns');
    document.getElementById('tomorrow-date').textContent = '📅 明天（提前填写）：' + S().fmtDateCN(dayKey);
    box.innerHTML = COLS.map(function (col) {
      const list = day.tasks[col.key];
      const rows = list.map(function (t) {
        const pts = taskPoints(t, col.key);
        const ptsInput = pts != null
          ? '<span class="task-pts-wrap" title="完成此任务可得积分（每条可单独定价）">' +
            '<input type="number" class="task-points" data-act="points" min="0" value="' + pts + '" />' +
            '<span class="pts-unit">分</span></span>'
          : '';
        return '<div class="task-row" data-list="' + col.key + '" data-id="' + t.id + '">' +
          '<span class="task-check" style="visibility:hidden">✓</span>' +
          '<span class="task-text" data-act="edit">' + S().esc(t.text) + '</span>' +
          ptsInput +
          '<button class="task-timer-btn" data-act="edit" title="编辑">✎</button>' +
          '<button class="task-timer-btn" data-act="del" title="删除">🗑</button>' +
          '</div>' +
          subBlockHTML(t) +
          groupBlockHTML(t);
      }).join('')
      return '<div class="task-col ' + col.style + '" data-col="' + col.key + '">' +
        '<div class="task-col-head"><h3>' + col.name + '</h3>' +
        '<span class="badge">' + list.length + ' 条</span></div>' +
        '<div class="task-col-head"><span class="desc">' + col.desc + '</span></div>' +
        rows +
        '<div class="extra-append"><button class="btn btn-small" data-act="add">＋ 添加任务</button></div>' +
        '</div>';
    }).join('');
    bindTomorrowEvents();
  }

  function bindTomorrowEvents() {
    const box = document.getElementById('tomorrow-columns');
    // 单独定价：修改任务积分（明天同样可定）
    box.onchange = function (e) {
      const inp = e.target.closest('.task-points');
      if (!inp) return;
      const row = inp.closest('.task-row');
      if (!row) return;
      const day = S().getDay(S().tomorrowKey());
      const task = day.tasks[row.dataset.list].find(function (t) { return t.id === row.dataset.id; });
      if (!task) return;
      task.points = Math.max(0, +inp.value || 0);
      S().save();
    };
    box.onclick = function (e) {
      const actBtn = e.target.closest('[data-act]');
      if (!actBtn) return;
      const act = actBtn.dataset.act;
      const row = e.target.closest('.task-row');
      const colEl = e.target.closest('.task-col');
      const listKey = colEl ? colEl.dataset.col : null;
      if (act === 'add') {
        if (!listKey) { App.ui.toast('无法识别任务栏'); return; }
        addTaskModal(listKey, S().tomorrowKey(), false);
        return;
      }
      if (act === 'sub-add' && listKey) { addSubModal(listKey, actBtn.dataset.task, null, S().tomorrowKey()); return; }
      if (act === 'sub-edit' && listKey) { addSubModal(listKey, actBtn.dataset.task, actBtn.dataset.sub, S().tomorrowKey()); return; }
      if (act === 'sub-del' && listKey) { delSub(listKey, actBtn.dataset.task, actBtn.dataset.sub, S().tomorrowKey()); return; }
      if (act === 'cd-start' && listKey) { App.ui.toast('明天的小任务，到了明天再开始倒计时哟'); return; }
      if (act === 'sub-note' && listKey) { editSubSummary(listKey, actBtn.dataset.task, actBtn.dataset.sub, S().tomorrowKey()); return; }
      if (act === 'g-sub-note' && listKey) { editSubSummary(listKey, actBtn.dataset.task, actBtn.dataset.sub, S().tomorrowKey(), actBtn.dataset.group); return; }
      if (act === 'group-new' && listKey) { addGroupModal(listKey, actBtn.dataset.task, S().tomorrowKey()); return; }
      if (act === 'g-sub-add' && listKey) { addSubModal(listKey, actBtn.dataset.task, null, S().tomorrowKey(), actBtn.dataset.group); return; }
      if (act === 'g-sub-edit' && listKey) { addSubModal(listKey, actBtn.dataset.task, actBtn.dataset.sub, S().tomorrowKey(), actBtn.dataset.group); return; }
      if (act === 'g-sub-del' && listKey) { delGroupSub(listKey, actBtn.dataset.task, actBtn.dataset.group, actBtn.dataset.sub, S().tomorrowKey()); return; }
      if (act === 'g-edit' && listKey) { editGroupModal(listKey, actBtn.dataset.task, actBtn.dataset.group, S().tomorrowKey()); return; }
      if (act === 'g-del' && listKey) { delGroup(listKey, actBtn.dataset.task, actBtn.dataset.group, S().tomorrowKey()); return; }
      if (act === 'g-cd-start') { App.ui.toast('明天的小任务，到了明天再开始倒计时哟'); return; }
      if (act === 'sub-split') { App.ui.toast('明天的小任务，到了明天再用 🧭 拆解吧'); return; }
      if (act === 'g-sub-split') { App.ui.toast('明天的小任务，到了明天再用 🧭 拆解吧'); return; }
      if (act === 'g-claim') { return; }
      if (!row) return;
      const taskId = row.dataset.id;
      if (act === 'edit') editTaskModal(listKey, taskId, S().tomorrowKey(), false);
      else if (act === 'del') {
        App.ui.confirm('删除这条任务？（先进回收站，可恢复）', '删除', function () {
          const list = S().getDay(S().tomorrowKey()).tasks[listKey];
          const idx = list.findIndex(function (t) { return t.id === taskId; });
          if (idx >= 0) { trashPush({ kind: 'task', dayKey: S().tomorrowKey(), col: listKey, payload: JSON.parse(JSON.stringify(list[idx])) }); list.splice(idx, 1); S().save(); }
          App.ui.toast('已删除 · 可到回收站恢复');
          App.tasks.renderAll();
        });
      }
    };
  }

  /* ---------- 添加 / 编辑任务弹窗 ---------- */
  function addTaskModal(listKey, dayKey, isTodayExtra) {
    const day = S().getDay(dayKey);
    const names = { required: '必须完成任务', ideal: '理想任务', extra: '长期拓展任务' };
    const defPts = taskPoints({}, listKey); // 默认积分（设置/内置兜底）
    const ptsField = defPts != null
      ? '<div class="field"><label>每条完成可得积分（可稍后在任务后面逐条修改）</label>' +
        '<input type="number" id="add-points" min="0" value="' + defPts + '" /></div>'
      : '';
    const modal = App.ui.openModal('＋ 添加' + names[listKey], '' +
      '<div class="field"><label>任务内容（支持多行，一行一条）</label>' +
      '<textarea id="add-text" placeholder=""></textarea></div>' +
      ptsField +
      '<div class="field"><label>推进类型</label>' +
      '<select id="add-kind" class="select-small">' +
      '<option value="main">主线推进（直接推进课程，纯学习，计入「有效学习」）</option>' +
      '<option value="aux">辅助推进（复盘 / 整理 / 写计划等，计入「辅助」）</option>' +
      '<option value="long">长期推进（长期自我提升，如兴趣/技能，计入「扩展」）</option>' +
      '</select></div>',
      '<button class="btn btn-primary" data-act="ok">添加</button><button class="btn" data-act="cancel">取消</button>');
    const ta = modal.querySelector('#add-text');
    ta.focus();
    App.ui.bindActions({
      ok: function () {
        const lines = ta.value.split(/\n+/).map(function (s) { return s.trim(); }).filter(Boolean);
        if (!lines.length) { App.ui.toast('请至少输入一条任务'); return; }
        const ptsInput = modal.querySelector('#add-points');
        const pts = ptsInput ? Math.max(0, +ptsInput.value || 0) : null;
        const kind = modal.querySelector('#add-kind');
        const kv = kind ? kind.value : 'main';
        lines.forEach(function (text) {
          const t = { id: S().uid(), text: text, aux: kv === 'aux', long: kv === 'long' };
          if (pts != null) t.points = pts;
          day.tasks[listKey].push(t);
        });
        S().save();
        App.ui.closeModal();
        App.ui.toast('已添加 ' + lines.length + ' 条任务');
        App.tasks.renderAll();
      },
      cancel: App.ui.closeModal
    });
  }

  function editTaskModal(listKey, taskId, dayKey) {
    const day = S().getDay(dayKey);
    const task = day.tasks[listKey].find(function (t) { return t.id === taskId; });
    if (!task) return;
    const ptsField = taskPoints(task, listKey) != null
      ? '<div class="field"><label>完成可得积分（单独定价）</label>' +
        '<input type="number" id="edit-points" min="0" value="' + taskPoints(task, listKey) + '" /></div>'
      : '';
    const modal = App.ui.openModal('✎ 编辑任务', '' +
      '<div class="field"><label>任务内容</label>' +
      '<textarea id="edit-text">' + S().esc(task.text) + '</textarea></div>' +
      ptsField +
      '<div class="field-row">' +
      '<div class="field"><label>任务分类（可移到别栏）</label>' +
      '<select id="edit-list" class="select-small">' +
      '<option value="required"' + (listKey === 'required' ? ' selected' : '') + '>必须完成任务</option>' +
      '<option value="ideal"' + (listKey === 'ideal' ? ' selected' : '') + '>理想任务（选做）</option>' +
      '<option value="extra"' + (listKey === 'extra' ? ' selected' : '') + '>长期拓展任务</option>' +
      '</select></div>' +
      '<div class="field"><label>推进类型</label>' +
      '<select id="edit-kind" class="select-small">' +
      '<option value="main"' + (!task.aux && !task.long ? ' selected' : '') + '>主线推进（纯学习）</option>' +
      '<option value="aux"' + (task.aux ? ' selected' : '') + '>辅助推进（复盘/整理等）</option>' +
      '<option value="long"' + (task.long ? ' selected' : '') + '>长期推进（自我提升，计入「扩展」）</option>' +
      '</select></div>' +
      '</div>',
      '<button class="btn btn-primary" data-act="save">保存</button>' +
      '<button class="btn btn-danger" data-act="del">删除任务</button>' +
      '<button class="btn" data-act="cancel">取消</button>');
    const ta = modal.querySelector('#edit-text');
    ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length);
    App.ui.bindActions({
      save: function () {
        const text = ta.value.trim();
        if (!text) { App.ui.toast('内容不能为空'); return; }
        task.text = text;
        const ptsInput = modal.querySelector('#edit-points');
        if (ptsInput) task.points = Math.max(0, +ptsInput.value || 0);
        const kindEl = modal.querySelector('#edit-kind');
        if (kindEl) {
          task.aux = kindEl.value === 'aux';
          task.long = kindEl.value === 'long';
        }
        const listEl = modal.querySelector('#edit-list');
        if (listEl && listEl.value !== listKey) {
          const from = day.tasks[listKey];
          const idx = from.findIndex(function (t) { return t.id === taskId; });
          if (idx >= 0) {
            from.splice(idx, 1);
            if (!day.tasks[listEl.value]) day.tasks[listEl.value] = [];
            day.tasks[listEl.value].push(task);
          }
        }
        S().save();
        App.ui.closeModal();
        App.tasks.renderAll();
      },
      del: function () {
        App.ui.confirm('删除这条任务？（先进回收站，可恢复）', '删除', function () {
          trashPush({ kind: 'task', dayKey: dayKey, col: listKey, payload: JSON.parse(JSON.stringify(task)) });
          const idx = day.tasks[listKey].findIndex(function (t) { return t.id === taskId; });
          if (idx >= 0) { day.tasks[listKey].splice(idx, 1); S().save(); }
          App.ui.toast('已删除 · 可到回收站恢复');
          App.ui.closeModal();
          App.tasks.renderAll();
        });
      },
      cancel: App.ui.closeModal
    });
  }

  /* ---------- 从往日粘贴任务（整批复制，含小题/任务组，再叉掉已做） ---------- */
  function deepCloneTask(t) {
    const c = JSON.parse(JSON.stringify(t));
    c.id = S().uid();
    // 粘贴的是"一天一开始"的任务：恢复为未完成状态，不带旧日的完成记录/拆解过程
    c.done = false;
    delete c.summary;
    if (c.subs) c.subs = c.subs.map(function (x) {
      x.id = S().uid();
      x.done = false;
      delete x.summary;
      delete x.splitlog;
      if (x.sessions) x.sessions = [];
      return x;
    });
    if (c.groups) c.groups = c.groups.map(function (g) {
      g.id = S().uid();
      g.done = false;
      if (g.subs) g.subs = g.subs.map(function (x) {
        x.id = S().uid();
        x.done = false;
        delete x.summary;
        delete x.splitlog;
        if (x.sessions) x.sessions = [];
        return x;
      });
      return g;
    });
    return c;
  }
  function pasteTasksModal(targetDayKey) {
    const data = S().data();
    const target = S().getDay(targetDayKey);
    const todayK = S().todayKey(), tomorrowK = S().tomorrowKey();
    const days = Object.keys(data.days || {}).filter(function (k) {
      return k !== todayK && k !== tomorrowK && k !== targetDayKey;
    }).sort();
    if (!days.length) { App.ui.toast('还没有可粘贴的往日'); return; }
    const modal = App.ui.openModal('📋 从往日粘贴任务',
      '<p style="font-size:12.5px;color:#8a919c;margin-bottom:10px">把某一天整批任务（含小题/任务组）复制到「今天」，任务保持原分类栏；粘贴后按自己的完成情况把做过的 ❌ 掉即可。</p>' +
      '<div class="field"><label>选择要粘贴的日期</label><select id="paste-date">' +
      days.map(function (k) {
        const n = ((data.days[k].tasks || {}).required || []).length;
        return '<option value="' + k + '">' + S().fmtDateCN(k) + '（必须 ' + n + ' 条）</option>';
      }).join('') + '</select></div>' +
      '<div id="paste-list" style="max-height:46vh;overflow:auto;border:1px solid #e5e8ec;border-radius:8px;padding:10px;margin-top:8px"></div>',
      '<button class="btn btn-primary" data-act="ok">📋 粘贴勾选任务</button><button class="btn" data-act="cancel">取消</button>');
    function colBlock(col, name) {
      const list = (data.days[modal.querySelector('#paste-date').value].tasks[col] || []);
      if (!list.length) return '';
      return '<div style="margin-bottom:10px"><div style="font-weight:600;margin-bottom:4px">' + name + '（' + list.length + '）</div>' +
        list.map(function (t, idx) {
          const extra = (t.subs && t.subs.length ? ' <span style="color:#8a919c">(小题' + t.subs.length + ')</span>' : '') +
            (t.groups && t.groups.length ? ' <span style="color:#8a919c">(组' + t.groups.length + ')</span>' : '');
          return '<label style="display:flex;gap:6px;align-items:center;font-size:13px;line-height:1.8"><input type="checkbox" value="' + col + ':' + idx + '" data-check />' + S().esc(t.text) + extra + '</label>';
        }).join('') + '</div>';
    }
    function renderPaste() {
      const box = modal.querySelector('#paste-list');
      const html = colBlock('required', '✅ 必须') + colBlock('ideal', '⭐ 理想') + colBlock('extra', '🌱 拓展');
      box.innerHTML = html || '<p style="color:#8a919c;text-align:center">这一天没有任务</p>';
    }
    modal.querySelector('#paste-date').onchange = renderPaste;
    renderPaste();
    App.ui.bindActions({
      ok: function () {
        const checks = modal.querySelectorAll('input[data-check]:checked');
        if (!checks.length) { App.ui.toast('先勾选要粘贴的任务'); return; }
        const srcDay = data.days[modal.querySelector('#paste-date').value];
        let n = 0;
        checks.forEach(function (ch) {
          const p = ch.value.split(':');
          const t = (srcDay.tasks[p[0]] || [])[+p[1]];
          if (!t) return;
          if (!target.tasks[p[0]]) target.tasks[p[0]] = [];
          target.tasks[p[0]].push(deepCloneTask(t));
          n++;
        });
        S().save();
        App.ui.closeModal();
        App.ui.toast('已粘贴 ' + n + ' 条任务');
        App.tasks.renderAll();
      },
      cancel: App.ui.closeModal
    });
  }

  /* ---------- 回收站弹窗：误删的任务/小题/任务组可一键恢复 ---------- */
  function trashModal() {
    const trash = (S().data().trash = S().data().trash || []);
    const modal = App.ui.openModal('🗑 回收站（误删恢复）', '' +
      '<p style="font-size:12.5px;color:#8a919c;margin-bottom:10px">删除的任务 / 小题 / 任务组都会先进这里，点「♻ 恢复」放回原处；「彻底删除」才会真正清掉。</p>' +
      '<div id="trash-list" style="max-height:52vh;overflow:auto;border:1px solid #e5e8ec;border-radius:8px;padding:6px 10px"></div>',
      '<button class="btn" data-act="cancel">关闭</button>');
    const box = modal.querySelector('#trash-list');
    const colName = function (c) { return { required: '必须', ideal: '理想', extra: '拓展' }[c] || ''; };
    function render() {
      box.innerHTML = trash.length
        ? trash.slice().reverse().map(function (entry) {
            const kind = entry.kind === 'task' ? '任务' : entry.kind === 'group' ? '任务组' : '小题';
            const text = entry.payload && entry.payload.text ? S().esc(entry.payload.text) : (entry.payload && entry.payload.name ? S().esc(entry.payload.name) : '');
            const when = new Date(entry.at).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
            return '<div style="display:flex;align-items:center;gap:8px;padding:8px 4px;border-bottom:1px solid #eceff3;font-size:13px">' +
              '<span style="flex:1">[' + kind + ' · ' + colName(entry.col) + '] <b>' + text + '</b>' +
              '<div style="color:#8a919c;font-size:11.5px">' + S().fmtDateCN(entry.dayKey) + ' · 删于 ' + when + '</div></span>' +
              '<button class="btn btn-small btn-primary" data-trash-id="' + entry.id + '">♻ 恢复</button>' +
              '<button class="btn btn-small btn-danger" data-trash-del="' + entry.id + '">彻底删除</button></div>';
          }).join('')
        : '<p style="color:#8a919c;text-align:center;padding:18px 0">回收站是空的，以后删除都会有保险～</p>';
    }
    function restore(id) {
      const i = trash.findIndex(function (x) { return x.id === id; });
      if (i < 0) return;
      const entry = trash[i];
      const day = S().getDay(entry.dayKey);
      day.tasks[entry.col] = day.tasks[entry.col] || [];
      if (entry.kind === 'task') {
        day.tasks[entry.col].push(entry.payload);
      } else if (entry.kind === 'group') {
        const task = day.tasks[entry.col].find(function (t) { return t.id === entry.taskId; });
        if (task) { task.groups = task.groups || []; task.groups.push(entry.payload); }
      } else {
        const task = day.tasks[entry.col].find(function (t) { return t.id === entry.taskId; });
        if (task) {
          if (entry.groupId) {
            const g = (task.groups || []).find(function (x) { return x.id === entry.groupId; });
            if (g) { g.subs = g.subs || []; g.subs.push(entry.payload); }
          } else { task.subs = task.subs || []; task.subs.push(entry.payload); }
        }
      }
      trash.splice(i, 1);
      S().save();
      render();
      App.ui.toast('已恢复');
      App.tasks.renderAll();
    }
    box.onclick = function (e) {
      const r = e.target.closest('[data-trash-id]');
      const d = e.target.closest('[data-trash-del]');
      if (r) { restore(r.dataset.trashId); return; }
      if (d) {
        const i = trash.findIndex(function (x) { return x.id === d.dataset.trashDel; });
        if (i >= 0) { trash.splice(i, 1); S().save(); render(); }
      }
    };
    render();
    App.ui.bindActions({ cancel: App.ui.closeModal });
  }

  /* ---------- Tab 切换 ---------- */
  function switchTab(tab) {
    activeTab = tab;
    document.querySelectorAll('.tab-btn').forEach(function (b) {
      b.classList.toggle('active', b.dataset.tab === tab);
    });
    document.getElementById('tasks-today').classList.toggle('active', tab === 'today');
    document.getElementById('tasks-tomorrow').classList.toggle('active', tab === 'tomorrow');
  }

  function renderAll() {
    renderToday();
    renderTomorrow();
    if (typeof App.app !== 'undefined') App.app.refreshStats();
  }

  function init() {
    document.querySelectorAll('.tab-btn').forEach(function (b) {
      b.onclick = function () { switchTab(b.dataset.tab); };
    });
    document.getElementById('btn-end-day').onclick = endDay;
    // ⏱ 小时计划常驻 tick：到点自动结算 + 实时刷新倒计时
    setInterval(function () { hourPlanAutoTick(); }, 1000);
  }

  App.tasks = {
    init: init, renderAll: renderAll, renderToday: renderToday,
    toggleTask: toggleTask, startTimer: startTimer, togglePause: togglePause,
    stopTimer: stopTimer, endDay: endDay, onTick: onTick,
    getTimer: function () { return timer; },
    getCdTimer: function () { return cdTimer; },
    isRunning: isRunning, elapsedMs: elapsedMs,
    toggleCdPause: toggleCdPause, cdFinish: cdFinish,
    startCdTimer: startCdTimer,
    // 从计时悬浮窗「🧭 回拆解」按钮回来：用当前倒计时的上下文重开拆解界面（不重置计时）
    reopenSplit: function () {
      if (!cdTimer) { App.ui.toast('当前没有在拆解的题'); return; }
      if (!cdTimer.fromSplit) { App.ui.toast('这个倒计时不是逐题拆解'); return; }
      openSplit(cdTimer.taskKey, cdTimer.taskId, cdTimer.subId, cdTimer.groupId || null);
    }
  };

  initFloatDrag();
})();