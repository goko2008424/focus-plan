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

  let timer = null;     // 全局唯一计时器
  let tickId = null;
  let activeTab = 'today';

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

  function onTick() {
    if (!timer) return;
    const f = document.getElementById('timer-float');
    if (!f || f.classList.contains('hidden')) return;
    const usedMs = elapsedMs();
    const planMs = timer.planMinutes * 60000;
    // 实际时间实时更新
    document.getElementById('tf-used').textContent = S().fmtClock(usedMs);
    const pct = planMs > 0 ? Math.min(100, (usedMs / planMs) * 100) : 0;
    const prog = document.getElementById('tf-progress');
    prog.style.width = pct + '%';
    prog.style.background = pct >= 100
      ? 'linear-gradient(90deg,#e2545d,#f59e0b)'
      : 'linear-gradient(90deg,#3b82f6,#22a06b)';
  }

  function showTimerBar() {
    const f = document.getElementById('timer-float');
    f.classList.remove('hidden');
    // 悬浮窗：预计完成内容 / 预计时间 / 实际时间
    document.getElementById('tf-content').textContent = timer.planContent;
    document.getElementById('tf-plan').textContent = S().fmtDur(timer.planMinutes);
    document.getElementById('tf-used').textContent = S().fmtClock(elapsedMs());
    document.getElementById('timer-pause').textContent = timer.paused ? '▶ 继续' : '⏸ 暂停';
    onTick();
  }
  function hideTimerBar() { document.getElementById('timer-float').classList.add('hidden'); }

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

  /* ---------- 完成计时（对比确认弹窗） ---------- */
  function stopTimer() {
    if (!timer) return;
    const usedMs = elapsedMs();
    const actualMin = Math.max(1, Math.ceil(usedMs / 60000));
    const planMin = timer.planMinutes;

    const modal = App.ui.openModal('✅ 任务完成确认', '' +
      '<div class="field"><label>预计完成内容</label><p style="font-size:14px">' + S().esc(timer.planContent) + '</p></div>' +
      '<div class="field"><label>预计用时</label><p style="font-size:14px">' + S().fmtDur(planMin) + '</p></div>' +
      '<div class="field"><label>实际用时</label><p style="font-size:14px">' + S().fmtDur(actualMin) +
      (actualMin < planMin ? ' <span style="color:#22a06b">（比预计快，好样的！）</span>' :
        actualMin > planMin * 1.3 ? ' <span style="color:#e2545d">（超出预计较多）</span>' : '') + '</p></div>',
      '<button class="btn btn-primary" data-act="done">确认完成</button>' +
      '<button class="btn btn-primary" data-act="cont" style="background:#22a06b;border-color:#22a06b">继续计时</button>' +
      '<button class="btn" data-act="cancel">取消（不保存）</button>');

    App.ui.bindActions({
      done: function () {
        saveSession(actualMin);
        App.ui.closeModal();
      },
      cont: App.ui.closeModal, // 继续计时：仅关闭确认弹窗
      cancel: function () { App.ui.closeModal(); }
    });
  }

  function saveSession(actualMin) {
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
      pausedMs: timer.pausedMs || 0
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
      taskText: timer.taskText
    });
    S().save();
    timer = null;
    stopTick();
    hideTimerBar();
    App.ui.toast('已保存：时间轴已自动生成记录（' + S().hhmmOf(startMin) + '–' + S().hhmmOf(endMin) + '），记得打勾 ☑');
    App.tasks.renderAll();
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

    // 奖励触发检查（只在打勾为完成时）
    if (task.done) {
      const allDone = function (k) { return day.tasks[k].length > 0 && day.tasks[k].every(function (t) { return t.done; }); };
      if (allDone('required') && !day.rewards.some(function (r) { return r.kind === 'base'; })) {
        baseRewardModal();
      } else if (['required', 'ideal', 'extra'].every(allDone) && !day.rewards.some(function (r) { return r.kind === 'perfect'; })) {
        perfectRewardModal();
      }
    }
  }

  /* ---------- 保底奖励弹窗（必须任务全部完成） ---------- */
  function baseRewardModal() {
    const dayKey = S().todayKey();
    const day = S().getDay(dayKey);
    const settings = S().settings();
    let granted = null; // {ledgerId, choice, value}

    const body = function () {
      return '' +
        '<p style="font-size:14px">必须完成的任务全部完成！</p>' +
        '<div class="field"><label>当前休闲时间累计</label><p style="font-weight:700;color:#f59e0b">' + S().fmtDur(S().leisureTotal()) + '</p></div>' +
        '<div class="field"><label>当前积分累计</label><p style="font-weight:700;color:#22a06b">' + S().pointsTotal() + ' 分</p></div>' +
        (granted
          ? '<div class="field"><label>已选择奖励</label><p>' + (granted.choice === 'time' ? '🕐 休闲时间 +' + granted.value + '分钟' : '⭐ 积分 +' + granted.value + '分') + '</p></div>'
          : '<div class="field"><label>请选择本次奖励（数值可临时修改）</label>' +
            '<div class="field-row">' +
            '<div class="field"><input type="number" id="rw-time" min="0" value="' + settings.baseRewardTime + '" /><label>休闲分钟</label></div>' +
            '<div class="field"><input type="number" id="rw-pts" min="0" value="' + settings.baseRewardPoints + '" /><label>积分</label></div>' +
            '</div>' +
            '<div class="btn-row" style="margin-top:8px">' +
            '<button class="btn" data-act="rw-time">🕐 增加休闲时间</button>' +
            '<button class="btn" data-act="rw-points">⭐ 累积积分</button>' +
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
        'rw-time': function () {
          const v = Math.max(0, +m.querySelector('#rw-time').value || 0);
          if (granted) { App.store.undoLastLedger(granted.ledgerId); }
          const idx = day.rewards.findIndex(function (r) { return r.kind === 'base'; });
          if (idx >= 0) day.rewards.splice(idx, 1);
          // 入账
          const lId = S().uid();
          S().data().ledger.push({ id: lId, date: dayKey, type: 'reward-base', points: 0, leisure: v, note: '保底奖励：休闲时间+' + v + '分钟', at: new Date().toISOString() });
          day.rewards.push({ kind: 'base', choice: 'time', value: v, at: new Date().toISOString() });
          S().save();
          granted = { ledgerId: lId, choice: 'time', value: v };
          App.ui.closeModal(); reopen();
          App.app.refreshStats();
        },
        'rw-points': function () {
          const v = Math.max(0, +m.querySelector('#rw-pts').value || 0);
          if (granted) { App.store.undoLastLedger(granted.ledgerId); }
          const idx = day.rewards.findIndex(function (r) { return r.kind === 'base'; });
          if (idx >= 0) day.rewards.splice(idx, 1);
          const lId = S().uid();
          S().data().ledger.push({ id: lId, date: dayKey, type: 'reward-base', points: v, leisure: 0, note: '保底奖励：积分+' + v + '分', at: new Date().toISOString() });
          day.rewards.push({ kind: 'base', choice: 'points', value: v, at: new Date().toISOString() });
          S().save();
          granted = { ledgerId: lId, choice: 'points', value: v };
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

  /* ---------- 完美奖励弹窗（三类全部完成） ---------- */
  function perfectRewardModal() {
    const dayKey = S().todayKey();
    const day = S().getDay(dayKey);
    const settings = S().settings();
    let granted = null;

    const body = function () {
      return '' +
        '<p style="font-size:14px">必须 + 理想 + 拓展全部完成，完美的一天！</p>' +
        (granted
          ? '<div class="field"><label>已选择额外奖励</label><p>' + (granted.choice === 'time' ? '🕐 休闲时间 +' + granted.value + '分钟' : '⭐ 积分 +' + granted.value + '分') + '</p></div>'
          : '<div class="field"><label>额外奖励（二选一，数值可临时修改）</label>' +
            '<div class="field-row">' +
            '<div class="field"><input type="number" id="pf-time" min="0" value="' + settings.perfectRewardTime + '" /><label>休闲分钟</label></div>' +
            '<div class="field"><input type="number" id="pf-pts" min="0" value="' + settings.perfectRewardPoints + '" /><label>积分</label></div>' +
            '</div>' +
            '<div class="btn-row" style="margin-top:8px">' +
            '<button class="btn" data-act="pf-time">🕐 休闲时间</button>' +
            '<button class="btn" data-act="pf-points">⭐ 积分</button>' +
            '</div></div>');
    };

    function reopen() {
      const m = App.ui.openModal('🏆 完美！今日全部任务完成！', body(), '', { rechoose: true });
      App.ui.bindActions({
        'pf-time': function () {
          const v = Math.max(0, +m.querySelector('#pf-time').value || 0);
          if (granted) { App.store.undoLastLedger(granted.ledgerId); }
          const idx = day.rewards.findIndex(function (r) { return r.kind === 'perfect'; });
          if (idx >= 0) day.rewards.splice(idx, 1);
          const lId = S().uid();
          S().data().ledger.push({ id: lId, date: dayKey, type: 'reward-perfect', points: 0, leisure: v, note: '100%额外奖励：休闲时间+' + v + '分钟', at: new Date().toISOString() });
          day.rewards.push({ kind: 'perfect', choice: 'time', value: v, at: new Date().toISOString() });
          S().save();
          granted = { ledgerId: lId, choice: 'time', value: v };
          App.ui.closeModal(); reopen();
          App.app.refreshStats();
        },
        'pf-points': function () {
          const v = Math.max(0, +m.querySelector('#pf-pts').value || 0);
          if (granted) { App.store.undoLastLedger(granted.ledgerId); }
          const idx = day.rewards.findIndex(function (r) { return r.kind === 'perfect'; });
          if (idx >= 0) day.rewards.splice(idx, 1);
          const lId = S().uid();
          S().data().ledger.push({ id: lId, date: dayKey, type: 'reward-perfect', points: v, leisure: 0, note: '100%额外奖励：积分+' + v + '分', at: new Date().toISOString() });
          day.rewards.push({ kind: 'perfect', choice: 'points', value: v, at: new Date().toISOString() });
          S().save();
          granted = { ledgerId: lId, choice: 'points', value: v };
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
      '</div>';
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
        if (actBtn && actBtn.dataset.act === 'add') {
          const colEl = actBtn.closest('.task-col');
          const listKey = colEl ? colEl.dataset.col : null;
          if (!listKey) { App.ui.toast('无法识别任务栏'); return; }
          addTaskModal(listKey, S().todayKey(), false);
        }
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
          '</div>';
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
    isRunning: isRunning, elapsedMs: elapsedMs
  };
})();