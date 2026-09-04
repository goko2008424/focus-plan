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
    let ms = Date.now() - timer.startedAt - timer.pausedMs;
    return timer.paused ? ms : ms;
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
    let ms = Date.now() - cdTimer.startedAt - cdTimer.pausedMs;
    return cdTimer.paused ? ms : ms;
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
      document.getElementById('cd-pause').textContent = cdTimer.paused ? '▶ 继续' : '⏸ 暂停';
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
    const session = {
      id: S().uid(),
      taskId: timer.taskId,
      taskText: timer.taskText,
      planContent: timer.planContent,
      planMinutes: timer.planMinutes,
      actualMinutes: actualMin,
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
            ? '<span class="sub-meta running-txt">⏳ 倒计时中…</span>'
            : '<button class="btn btn-small sub-start" data-act="cd-start" data-task="' + task.id + '" data-sub="' + s.id + '">▶ 开始</button>') +
          '<button class="task-timer-btn" data-act="sub-edit" data-task="' + task.id + '" data-sub="' + s.id + '" title="编辑">✎</button>' +
          '<button class="task-timer-btn" data-act="sub-del" data-task="' + task.id + '" data-sub="' + s.id + '" title="删除">🗑</button>' +
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
      '<div class="field"><label>完成积分</label><input type="number" id="sub-pts" min="0" value="' + (existing ? (existing.points || 0) : 1) + '" /></div>' +
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

  function delSub(taskKey, taskId, subId, dayKey) {
    const day = S().getDay(dayKey || S().todayKey());
    const task = day.tasks[taskKey].find(function (t) { return t.id === taskId; });
    const subs = task ? (task.subs || []) : [];
    const sub = subs.find(function (s) { return s.id === subId; });
    if (!sub) return;
    App.ui.confirm('删除小任务「' + sub.text + '」？', '删除', function () {
      const idx = subs.findIndex(function (s) { return s.id === subId; });
      if (idx >= 0) subs.splice(idx, 1);
      if (cdTimer && cdTimer.subId === subId) {
        cdTimer = null;
        stopTickIfIdle();
        showTimerBar();
      }
      S().save();
      App.tasks.renderAll();
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
      const allDone = subs.length > 0 && subs.every(function (s) { return s.done === true; });
      const items = subs.map(function (s) {
        const running = cdTimer && cdTimer.groupId === g.id && cdTimer.subId === s.id;
        const cls = s.done === true ? ' done' : (s.done === false ? ' fail' : (running ? ' running' : ''));
        const stateTxt = s.done === true ? ' ✓完成' : (s.done === false ? ' ✗未完成' : '');
        return '<div class="sub-item' + cls + '" data-sub="' + s.id + '">' +
          '<span class="sub-text">' + S().esc(s.text) + '</span>' +
          '<span class="sub-meta">限' + s.minutes + '分钟' + (s.points > 0 ? ' · +' + s.points + '分' : '') + stateTxt + '</span>' +
          (running
            ? '<span class="sub-meta running-txt">⏳ 倒计时中…</span>'
            : '<button class="btn btn-small sub-start" data-act="g-cd-start" data-task="' + task.id + '" data-group="' + g.id + '" data-sub="' + s.id + '">▶ 开始</button>') +
          '<button class="task-timer-btn" data-act="g-sub-edit" data-task="' + task.id + '" data-group="' + g.id + '" data-sub="' + s.id + '" title="编辑">✎</button>' +
          '<button class="task-timer-btn" data-act="g-sub-del" data-task="' + task.id + '" data-group="' + g.id + '" data-sub="' + s.id + '" title="删除">🗑</button>' +
          '</div>';
      }).join('');
      const rewardTxt = allDone
        ? (g.awarded
            ? '<span class="group-reward done">✅ 已领休息</span>'
            : '<button class="btn btn-small btn-primary" data-act="g-claim" data-task="' + task.id + '" data-group="' + g.id + '" title="整组做完，领取休息">🎁 领取休息 +' + (g.rewardRest || 10) + '分钟</button>')
        : '<span class="group-reward">整组做完 · 奖励休息</span>';
      return '<div class="group-card" data-group="' + g.id + '">' +
        '<div class="group-head"><span class="group-name">🎯 ' + S().esc(g.name) + '</span>' +
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
      '<div class="extra-append"><button class="btn btn-small btn-primary" data-act="group-new" data-task="' + task.id + '">🎯 建一个任务组（打包小题，整组做完奖励休息）</button></div>' +
      '</div>';
  }

  function addGroupModal(taskKey, taskId, dayKey) {
    const task = S().getDay(dayKey || S().todayKey()).tasks[taskKey].find(function (t) { return t.id === taskId; });
    if (!task) return;
    const m = App.ui.openModal('🎯 新建任务组（SmartGoal）', '' +
      '<p style="font-size:12.5px;color:#8a919c;margin-bottom:10px">把几个关联的小题打包成一组，整组都做完就奖励一段休息（自动进时间轴），专治“大任务太沉、开不了头”</p>' +
      '<div class="field"><label>任务组名称</label><input type="text" id="g-name" placeholder="如：搞定第三章" /></div>' +
      '<div class="field"><label>整组奖励休息（分钟）</label><input type="number" id="g-rest" min="1" value="10" /></div>',
      '<button class="btn btn-primary" data-act="ok">创建</button><button class="btn" data-act="cancel">取消</button>');
    App.ui.bindActions({
      ok: function () {
        const name = m.querySelector('#g-name').value.trim();
        if (!name) { App.ui.toast('请填写组名称'); return; }
        task.groups = task.groups || [];
        task.groups.push({ id: S().uid(), name: name, rewardRest: Math.max(1, +m.querySelector('#g-rest').value || 10), subs: [], awarded: false });
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
      '<div class="field"><label>组名称</label><input type="text" id="g-name" value="' + S().esc(g.name) + '" /></div>' +
      '<div class="field"><label>整组奖励休息（分钟）</label><input type="number" id="g-rest" min="1" value="' + (g.rewardRest || 10) + '" /></div>',
      '<button class="btn btn-primary" data-act="ok">保存</button><button class="btn" data-act="cancel">取消</button>');
    App.ui.bindActions({
      ok: function () {
        g.name = m.querySelector('#g-name').value.trim() || g.name;
        g.rewardRest = Math.max(1, +m.querySelector('#g-rest').value || 10);
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
      const idx = task.groups.findIndex(function (x) { return x.id === groupId; });
      task.groups.splice(idx, 1);
      if (cdTimer && cdTimer.groupId === groupId) { cdTimer = null; stopTickIfIdle(); showTimerBar(); }
      S().save(); App.tasks.renderAll();
    });
  }

  function delGroupSub(taskKey, taskId, groupId, subId, dayKey) {
    const task = S().getDay(dayKey || S().todayKey()).tasks[taskKey].find(function (t) { return t.id === taskId; });
    const g = task && (task.groups || []).find(function (x) { return x.id === groupId; });
    const subs = g ? (g.subs || []) : [];
    const sub = subs.find(function (s) { return s.id === subId; });
    if (!sub) return;
    App.ui.confirm('删除小题「' + sub.text + '」？', '删除', function () {
      const idx = subs.findIndex(function (s) { return s.id === subId; });
      subs.splice(idx, 1);
      if (cdTimer && cdTimer.groupId === groupId && cdTimer.subId === subId) { cdTimer = null; stopTickIfIdle(); showTimerBar(); }
      S().save(); App.tasks.renderAll();
    });
  }

  /* 领取组奖励：填休息时长 + 备注 → 休闲累计 + 时间轴（fun 类） */
  function groupClaim(taskKey, taskId, groupId, dayKey) {
    const day = S().getDay(dayKey || S().todayKey());
    const task = day.tasks[taskKey].find(function (t) { return t.id === taskId; });
    const g = task && (task.groups || []).find(function (x) { return x.id === groupId; });
    if (!g || g.awarded) return;
    const m = App.ui.openModal('🎁 整组达成，奖励休息！', '' +
      '<p style="font-size:14px">「' + S().esc(g.name) + '」全部做完，犒劳一下自己</p>' +
      '<div class="field"><label>休息时长（分钟）</label><input type="number" id="g-rest" min="1" value="' + (g.rewardRest || 10) + '" /></div>' +
      '<div class="field"><label>备注 / 感想（可选）</label><input type="text" id="g-note" placeholder="如：看会儿窗外的云" /></div>',
      '<button class="btn btn-primary" data-act="ok">记录休息</button><button class="btn" data-act="cancel">跳过</button>');
    App.ui.bindActions({
      ok: function () {
        const rest = Math.max(1, +m.querySelector('#g-rest').value || 10);
        const note = m.querySelector('#g-note').value.trim();
        const now = new Date();
        let sm = now.getHours() * 60 + now.getMinutes();
        let em = sm + rest; if (em > 1440) em = 1440;
        day.timeline.push({ id: S().uid(), start: sm, end: em, minutes: Math.max(1, em - sm), content: '组奖励休息：' + g.name + (note ? '（' + note + '）' : ''), category: 'fun', countAsStudy: false, auto: true, source: 'group', note: note || '' });
        S().addLedger(dayKey, 'rest', { leisure: rest, note: '组奖励休息：' + g.name });
        g.awarded = true;
        S().save(); App.ui.closeModal(); App.tasks.renderAll();
        if (App.app && App.app.refreshStats) App.app.refreshStats();
        App.ui.toast('🕐 休闲 +' + rest + '分钟，好好歇会儿');
      },
      cancel: App.ui.closeModal
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
      startedAt: Date.now(), pausedMs: 0, paused: false, finished: false
    };
    startTick();
    showTimerBar();
    App.tasks.renderAll();
    App.ui.toast('⏳「' + sub.text + '」限时 ' + cdTimer.minutes + ' 分钟 · ' + QUOTES[Math.floor(Math.random() * QUOTES.length)]);
  }

  function toggleCdPause() {
    if (!cdTimer) return;
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
    const timeLine = '实际用时 ' + S().fmtClock(elapsed) + ' / 目标 ' + S().fmtDur(cd.minutes) +
      (over > 0 ? '  <span style="color:#e2545d">（超时 ' + S().fmtClock(over).replace(/^00:/, '') + '）</span>' : '  <span style="color:#22a06b">（在目标内）</span>');
    const noteEl = '<div class="field"><label>小总结（超时可写一句为什么超时）</label>' +
      '<textarea id="cd-note" style="width:100%;min-height:56px;border:1px solid #e5e8ec;border-radius:8px;padding:8px 10px;font-size:13px;resize:vertical"></textarea></div>';
    const modal = App.ui.openModal('⏰ 时间到！', '' +
      '<div class="field"><label>小任务</label><p style="font-size:14px;font-weight:700">' + S().esc(cd.text) + '</p></div>' +
      '<p style="font-size:12.5px;color:#8a919c;margin-bottom:8px">所属任务：' + S().esc(cd.taskText) + '</p>' +
      '<div class="field"><label>用时对比</label><p style="font-size:13px">' + timeLine + '</p></div>' +
      (cd.points > 0
        ? '<div class="field"><label>完成可得</label><p style="font-weight:700;color:#22a06b">+' + cd.points + ' 分</p></div>'
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
      if (doneFlag && cd.points > 0) {
        S().addLedger(S().todayKey(), 'earn-sub', { points: cd.points, note: '小任务：' + cd.text + '（' + task.text + '）', taskId: cd.taskId });
        App.ui.floatAt(document.getElementById('stat-points'), '+' + cd.points + '分');
      }
    }
    // 整组全部完成后自动弹出组奖励
    if (sub && group && group.subs.length > 0 && group.subs.every(function (s) { return s.done === true; }) && !group.awarded) {
      groupClaim(cd.taskKey, cd.taskId, group.id, S().todayKey());
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
      actualMinutes: mins, sub: true, done: doneFlag, note: summary || '',
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

  /* ---------- 保底奖励弹窗（必须任务全部完成；休闲+积分可同时加、数量自选） ---------- */
  function baseRewardModal() {
    const dayKey = S().todayKey();
    const day = S().getDay(dayKey);
    const settings = S().settings();
    let granted = null; // {ledgerId, leisure, points}

    const body = function () {
      return '' +
        '<p style="font-size:14px">必须完成的任务全部完成！</p>' +
        '<div class="field"><label>当前休闲时间累计</label><p style="font-weight:700;color:#f59e0b">' + S().fmtDur(S().leisureTotal()) + '</p></div>' +
        '<div class="field"><label>当前积分累计</label><p style="font-weight:700;color:#22a06b">' + S().pointsTotal() + ' 分</p></div>' +
        (granted
          ? '<div class="field"><label>已领取奖励</label><p>🕐 休闲 +' + granted.leisure + '分钟 · ⭐ 积分 +' + granted.points + '分</p></div>'
          : '<div class="field"><label>本次奖励（休闲和积分可同时加，数值可改）</label>' +
            '<div class="field-row">' +
            '<div class="field"><input type="number" id="rw-time" min="0" value="' + settings.baseRewardTime + '" /><label>休闲分钟</label></div>' +
            '<div class="field"><input type="number" id="rw-pts" min="0" value="' + settings.baseRewardPoints + '" /><label>积分</label></div>' +
            '</div>' +
            '<div class="btn-row" style="margin-top:8px">' +
            '<button class="btn btn-primary" data-act="rw-grant">🎁 确认领取（两块一起加）</button>' +
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
          const tv = Math.max(0, +m.querySelector('#rw-time').value || 0);
          const pv = Math.max(0, +m.querySelector('#rw-pts').value || 0);
          if (tv <= 0 && pv <= 0) { App.ui.toast('至少加一项（休闲或积分）'); return; }
          if (granted) { App.store.undoLastLedger(granted.ledgerId); }
          const idx = day.rewards.findIndex(function (r) { return r.kind === 'base'; });
          if (idx >= 0) day.rewards.splice(idx, 1);
          const lId = S().uid();
          S().data().ledger.push({ id: lId, date: dayKey, type: 'reward-base', points: pv, leisure: tv, note: '保底奖励：休闲+' + tv + '分钟 积分+' + pv + '分', at: new Date().toISOString() });
          day.rewards.push({ kind: 'base', leisure: tv, points: pv, at: new Date().toISOString() });
          S().save();
          granted = { ledgerId: lId, leisure: tv, points: pv };
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

  /* ---------- 完美奖励弹窗（三类全部完成；休闲+积分可同时加） ---------- */
  function perfectRewardModal() {
    const dayKey = S().todayKey();
    const day = S().getDay(dayKey);
    const settings = S().settings();
    let granted = null;

    const body = function () {
      return '' +
        '<p style="font-size:14px">必须 + 理想 + 拓展全部完成，完美的一天！</p>' +
        (granted
          ? '<div class="field"><label>已领取额外奖励</label><p>🕐 休闲 +' + granted.leisure + '分钟 · ⭐ 积分 +' + granted.points + '分</p></div>'
          : '<div class="field"><label>额外奖励（休闲和积分可同时加，数值可改）</label>' +
            '<div class="field-row">' +
            '<div class="field"><input type="number" id="pf-time" min="0" value="' + settings.perfectRewardTime + '" /><label>休闲分钟</label></div>' +
            '<div class="field"><input type="number" id="pf-pts" min="0" value="' + settings.perfectRewardPoints + '" /><label>积分</label></div>' +
            '</div>' +
            '<div class="btn-row" style="margin-top:8px">' +
            '<button class="btn btn-primary" data-act="pf-grant">🎁 确认领取（两块一起加）</button>' +
            '</div></div>');
    };

    function reopen() {
      const m = App.ui.openModal('🏆 完美！今日全部任务完成！', body(), '', { rechoose: true });
      App.ui.bindActions({
        'pf-grant': function () {
          const tv = Math.max(0, +m.querySelector('#pf-time').value || 0);
          const pv = Math.max(0, +m.querySelector('#pf-pts').value || 0);
          if (tv <= 0 && pv <= 0) { App.ui.toast('至少加一项（休闲或积分）'); return; }
          if (granted) { App.store.undoLastLedger(granted.ledgerId); }
          const idx = day.rewards.findIndex(function (r) { return r.kind === 'perfect'; });
          if (idx >= 0) day.rewards.splice(idx, 1);
          const lId = S().uid();
          S().data().ledger.push({ id: lId, date: dayKey, type: 'reward-perfect', points: pv, leisure: tv, note: '100%额外奖励：休闲+' + tv + '分钟 积分+' + pv + '分', at: new Date().toISOString() });
          day.rewards.push({ kind: 'perfect', leisure: tv, points: pv, at: new Date().toISOString() });
          S().save();
          granted = { ledgerId: lId, leisure: tv, points: pv };
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
    return '<div class="task-row' + (task.done ? ' done' : '') + '" data-list="' + listKey + '" data-id="' + task.id + '">' +
      '<span class="task-check' + (task.done ? ' checked' : '') + '" data-act="check">✓</span>' +
      '<span class="task-text" data-act="edit">' + S().esc(task.text) + '</span>' +
      ptsInput +
      btn +
      '</div>' +
      subBlockHTML(task) +
      groupBlockHTML(task);
  }

  function renderToday() {
    const dayKey = S().todayKey();
    const day = S().getDay(dayKey);
    const box = document.getElementById('task-columns');
    // 日期显示
    document.getElementById('today-date').textContent = '📅 今天：' + S().fmtDateCN(dayKey);
    box.innerHTML = COLS.map(function (col) {
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
        const colEl = actBtn.closest('.task-col');
        const listKey = colEl ? colEl.dataset.col : null;
        if (!listKey) { App.ui.toast('无法识别任务栏'); return; }
        if (act2 === 'add') { addTaskModal(listKey, S().todayKey(), false); return; }
        if (act2 === 'sub-add') { addSubModal(listKey, actBtn.dataset.task, null, S().todayKey()); return; }
        if (act2 === 'sub-edit') { addSubModal(listKey, actBtn.dataset.task, actBtn.dataset.sub, S().todayKey()); return; }
        if (act2 === 'sub-del') { delSub(listKey, actBtn.dataset.task, actBtn.dataset.sub, S().todayKey()); return; }
        if (act2 === 'cd-start') { startCdTimer(listKey, actBtn.dataset.task, actBtn.dataset.sub); return; }
        if (act2 === 'group-new') { addGroupModal(listKey, actBtn.dataset.task, S().todayKey()); return; }
        if (act2 === 'g-sub-add') { addSubModal(listKey, actBtn.dataset.task, null, S().todayKey(), actBtn.dataset.group); return; }
        if (act2 === 'g-sub-edit') { addSubModal(listKey, actBtn.dataset.task, actBtn.dataset.sub, S().todayKey(), actBtn.dataset.group); return; }
        if (act2 === 'g-sub-del') { delGroupSub(listKey, actBtn.dataset.task, actBtn.dataset.group, actBtn.dataset.sub, S().todayKey()); return; }
        if (act2 === 'g-cd-start') { startCdTimer(listKey, actBtn.dataset.task, actBtn.dataset.sub, actBtn.dataset.group); return; }
        if (act2 === 'g-claim') { groupClaim(listKey, actBtn.dataset.task, actBtn.dataset.group, S().todayKey()); return; }
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
      if (act === 'group-new' && listKey) { addGroupModal(listKey, actBtn.dataset.task, S().tomorrowKey()); return; }
      if (act === 'g-sub-add' && listKey) { addSubModal(listKey, actBtn.dataset.task, null, S().tomorrowKey(), actBtn.dataset.group); return; }
      if (act === 'g-sub-edit' && listKey) { addSubModal(listKey, actBtn.dataset.task, actBtn.dataset.sub, S().tomorrowKey(), actBtn.dataset.group); return; }
      if (act === 'g-sub-del' && listKey) { delGroupSub(listKey, actBtn.dataset.task, actBtn.dataset.group, actBtn.dataset.sub, S().tomorrowKey()); return; }
      if (act === 'g-edit' && listKey) { editGroupModal(listKey, actBtn.dataset.task, actBtn.dataset.group, S().tomorrowKey()); return; }
      if (act === 'g-del' && listKey) { delGroup(listKey, actBtn.dataset.task, actBtn.dataset.group, S().tomorrowKey()); return; }
      if (act === 'g-cd-start') { App.ui.toast('明天的小任务，到了明天再开始倒计时哟'); return; }
      if (act === 'g-claim') { App.ui.toast('明天还没开始用，等哪天完成了再领休息'); return; }
      if (!row) return;
      const taskId = row.dataset.id;
      if (act === 'edit') editTaskModal(listKey, taskId, S().tomorrowKey(), false);
      else if (act === 'del') {
        App.ui.confirm('删除这条任务？', '删除', function () {
          const list = S().getDay(S().tomorrowKey()).tasks[listKey];
          const idx = list.findIndex(function (t) { return t.id === taskId; });
          if (idx >= 0) { list.splice(idx, 1); S().save(); App.tasks.renderAll(); }
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
      ptsField,
      '<button class="btn btn-primary" data-act="ok">添加</button><button class="btn" data-act="cancel">取消</button>');
    const ta = modal.querySelector('#add-text');
    ta.focus();
    App.ui.bindActions({
      ok: function () {
        const lines = ta.value.split(/\n+/).map(function (s) { return s.trim(); }).filter(Boolean);
        if (!lines.length) { App.ui.toast('请至少输入一条任务'); return; }
        const ptsInput = modal.querySelector('#add-points');
        const pts = ptsInput ? Math.max(0, +ptsInput.value || 0) : null;
        lines.forEach(function (text) {
          const t = { id: S().uid(), text: text };
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
      ptsField,
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
        S().save();
        App.ui.closeModal();
        App.tasks.renderAll();
      },
      del: function () {
        App.ui.confirm('删除这条任务？', '删除', function () {
          const idx = day.tasks[listKey].findIndex(function (t) { return t.id === taskId; });
          if (idx >= 0) { day.tasks[listKey].splice(idx, 1); S().save(); }
          App.ui.closeModal();
          App.tasks.renderAll();
        });
      },
      cancel: App.ui.closeModal
    });
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
  }

  App.tasks = {
    init: init, renderAll: renderAll, renderToday: renderToday,
    toggleTask: toggleTask, startTimer: startTimer, togglePause: togglePause,
    stopTimer: stopTimer, endDay: endDay, onTick: onTick,
    getTimer: function () { return timer; },
    getCdTimer: function () { return cdTimer; },
    isRunning: isRunning, elapsedMs: elapsedMs,
    toggleCdPause: toggleCdPause, cdFinish: cdFinish,
    startCdTimer: startCdTimer
  };

  initFloatDrag();
})();