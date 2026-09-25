/* ============================================================
 * stats.js — 历史统计模块：周柱状图 · 月折线图 · 积分流水 · 按日记录
 * ============================================================ */
(function () {
  'use strict';

  const App = (window.App = window.App || {});
  const S = () => App.store;

  const LEDGER_NAMES = {
    'earn-ideal': '⭐ 理想任务完成',
    'earn-extra': '🌱 拓展任务完成',
    'earn-sub': '🧩 小任务完成',
    'rest': '🧘 好好休息奖励',
    'reward-base': '🎉 保底奖励',
    'reward-perfect': '🏆 完美奖励',
    'hour-reward': '⏱ 小时计划达标奖励',
    'rest-reward': '☕ 好好休息奖励',
    'sport': '🏃 运动完成',
    'sport-cut': '🏃 运动没做到（扣）',
    'ext-penalty': '🌱 长期拓展没做完（扣）',
    'group-reward': '🎯 任务组整组做完奖励',
    'focus-cut': '🔥 学习休息时消耗（扣）',
    'redeem': '🎁 积分兑换',
    'adjust': '✏ 调整'
  };

  /* ---------- 数据收集 ---------- */
  // v63：只读取数用的空壳（个别日子没记录时不创建它，也不影响下游 day.xxx 的访问）
  const EMPTY_DAY = {
    tasks: { required: [], ideal: [], extra: [] },
    sessions: [], timeline: [], rewards: [], hourPlans: [], rests: [],
    plannedHourPlans: [], sports: [], lectures: [], ended: false
  };
  function collectDay(key) {
    // ⚠️ 这里必须【只读】：以前用 getDay 会把【本月每一天】都创建成空记录
    // （翻一下历史页，data.days 里就凭空多出 30 天）
    const day = (S().peekDay ? S().peekDay(key) : S().getDay(key)) || EMPTY_DAY;
    let study = 0, extend = 0, fun = 0;
    day.timeline.forEach(function (r) {
      if (r.category === 'study' && r.countAsStudy !== false) study += r.minutes || 0;
      else if (r.category === 'extend') extend += r.minutes || 0;
      else if (r.category === 'fun') fun += r.minutes || 0;
    });
    return { key: key, day: day, study: study, extend: extend, fun: fun };
  }

  function lastNDays(n) {
    const out = [];
    const today = new Date();
    for (let i = n - 1; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const key = S().dateKey(d);
      out.push(collectDay(key));
    }
    return out;
  }

  function monthDays() {
    const out = [];
    const now = new Date();
    const d = new Date(now.getFullYear(), now.getMonth(), 1);
    while (d.getMonth() === now.getMonth()) {
      out.push(collectDay(S().dateKey(d)));
      d.setDate(d.getDate() + 1);
      if (d > now) break;
    }
    return out;
  }

  /* ---------- 渲染 ---------- */
  function render() {
    if (typeof App.app !== 'undefined' && App.app.currentView() !== 'stats') return;

    // 🧭 v124 复盘看板（放在最上面的图表前）
    renderReviewBoard();

    // 周柱状图
    const week = lastNDays(7);
    const weekData = week.map(function (x) {
      const d = S().keyToDate(x.key);
      return { label: (d.getMonth() + 1) + '/' + d.getDate(), study: x.study, extend: x.extend, fun: x.fun };
    });
    App.ui.barChart(document.getElementById('chart-week'), weekData);

    // 月折线
    const month = monthDays();
    const monthVals = month.map(function (x) { return x.study; });
    const monthLabels = month.map(function (x) {
      const d = S().keyToDate(x.key);
      return (d.getMonth() + 1) + '.' + d.getDate();
    });
    App.ui.lineChart(document.getElementById('chart-month'), monthVals, monthLabels);

    // 积分流水（整体折叠：点一下才展开；里面再按天分组）
    const ledger = S().ledger();
    const byDay = {};
    ledger.forEach(function (e) {
      (byDay[e.date] = byDay[e.date] || []).push(e);
    });
    const ldDays = Object.keys(byDay).sort().reverse();
    document.getElementById('ledger-list').innerHTML = ldDays.length
      ? '<details class="ledger-all"><summary>📓 积分流水：共 <b>' + ldDays.length + '</b> 天 · ' + ledger.length +
        ' 条 · 点开按天查看</summary><div style="margin-top:8px">' + ldDays.map(function (day) {
          const evs = byDay[day];
          const net = evs.reduce(function (s, e) { return s + (e.points || 0); }, 0);
          return '<details class="ledger-day"><summary>🗓 ' + day + ' · ' + evs.length + ' 条 · <b style="color:' + (net >= 0 ? '#22a06b' : '#e2545d') + '">' +
            (net >= 0 ? '净 +' : '净 ') + net + ' 分</b></summary>' +
            '<div style="margin-top:6px">' + evs.map(function (e) {
              const name = LEDGER_NAMES[e.type] || e.type;
              const pts = e.points || 0;
              const sign = pts > 0 ? '+' + pts + '分' : pts < 0 ? pts + '分' : '';
              return '<div class="day-card">' +
                '<div class="day-card-head"><span class="d-date">' + (e.at ? new Date(e.at).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) : '') + '</span>' +
                '<span>' + name + '</span>' +
                '<span style="font-weight:700;color:' + (pts < 0 ? '#e2545d' : '#22a06b') + '">' + sign + '</span>' +
                '</div>' +
                (e.note ? '<div class="day-card-body"><span>' + S().esc(e.note) + '</span></div>' : '') +
                '</div>';
            }).join('') + '</div></details>';
        }).join('') + '</div></details>'
      : '<p class="hint">还没有账目记录。完成理想/拓展任务、触发奖励、兑换积分都会记在这里。</p>';

    // 兑换记录专区（只列花掉积分的兑换）——卡片式
    const redeems = S().ledger().filter(function (e) { return e.type === 'redeem' && (e.points || 0) < 0; }).slice().reverse();
    const spentTotal = -redeems.reduce(function (s, e) { return s + (e.points || 0); }, 0);
    document.getElementById('redeem-list').innerHTML = redeems.length
      ? redeems.map(function (e) {
          const item = (e.note || '').replace(/^兑换：/, '') || '（未写内容）';
          const emoji = (App.settings && App.settings.itemEmoji) ? App.settings.itemEmoji(item) : '🎁';
          return '<div class="rlog-card">' +
            '<span class="rlog-emoji">' + emoji + '</span>' +
            '<div class="rlog-main"><div class="rlog-item">' + S().esc(item) + '</div>' +
            '<div class="rlog-date">' + e.date + '</div></div>' +
            '<span class="rlog-cost">-' + Math.abs(e.points) + ' 分</span></div>';
        }).join('') +
        '<div class="rlog-total">共 ' + redeems.length + ' 次兑换 · 累计花了 <b>' + spentTotal + '</b> 分</div>'
      : '<p class="hint">还没有兑换过东西。以后点顶部积分数字「兑换」，扣掉的分会都在这里。</p>';

    // 🎓 听课记录（三步面板现在长在任务页里，记录汇总到这里）
    const lh = document.getElementById('lec-history');
    if (lh) lh.innerHTML = (App.lecture && App.lecture.historyHTML) ? App.lecture.historyHTML() : '';

    // 按日记录（v63：**只统计已经过完的日子**，未来的日期不再混进来）
    const tk = S().todayKey();
    // ⚠️ 明天不算：那是页面每天正常创建的（明天页要用），只盯「后天以后」
    const tmk = S().tomorrowKey();
    const futureKeys = Object.keys(S().data().days).filter(function (k) { return k > tmk; }).sort();
    const dayKeys = Object.keys(S().data().days).filter(function (k) {
      if (k > tk) return false;
      const day = S().peekDay ? S().peekDay(k) : S().getDay(k);
      if (!day) return false;
      return day.tasks.required.length || day.tasks.ideal.length || day.tasks.extra.length || day.timeline.length;
    }).sort().reverse();

    // v63：数据里如果还留着【未来日期】的记录，在这里点一句，给个一键清理的入口
    const futureTip = futureKeys.length
      ? '<div class="card" style="border-left:3px solid #e0a02c">' +
        '<b>⚠️ 发现 ' + futureKeys.length + ' 个"还没到"的日期在数据里留了记录</b>' +
        '<p class="hint" style="margin:6px 0 8px">它们不会显示在下面的按日记录里（那页只记已经过完的日子）。' +
        '多半是点开过日历/时间轴留下的空壳；也可能有你<b>提前安排</b>的任务。点按钮看清单，空的可以一次删掉。</p>' +
        '<button class="btn btn-small" id="btn-future-clean2">🧹 查看 / 清理未来的记录</button></div>'
      : '';
    document.getElementById('day-history').innerHTML = futureTip + (dayKeys.length
      ? '<details class="ledger-all"><summary>📅 按日记录：共 ' + dayKeys.length + ' 天 · 点开查看</summary><div style="margin-top:8px">' +
      dayKeys.map(function (k) {
          const c = collectDay(k);
          const day = c.day;
          const done = function (list) { return list.filter(function (t) { return t.done; }).length; };
          const focusMin = day.sessions.reduce(function (s, x) { return s + (x.actualMinutes || 0); }, 0);
          const dayPts = S().ledger().filter(function (e) { return e.date === k; }).reduce(function (s, e) { return s + (e.points || 0); }, 0);
          // 当天任务明细（每条：完成状态 + 文本 + 积分）
          const detailLines = [];
          ['required', 'ideal', 'extra'].forEach(function (lk) {
            day.tasks[lk].forEach(function (t) {
              const pts = t.points != null ? t.points
                : (lk === 'ideal' ? (S().settings().idealPoints || 0)
                  : lk === 'extra' ? (S().settings().extPoints || 0) : null);
              detailLines.push('<div class="task-detail-line">' +
                (t.done ? '☑' : '☐') + ' ' + S().esc(t.text) +
                (t.done ? '' : ' <span style="color:#e2545d">未完成</span>') +
                (pts != null ? ' <span style="color:#8a919c">+' + pts + '分</span>' : '') +
                (t.summary && t.summary.text
                  ? '<div style="color:#6b7280;font-size:12px;margin:2px 0 4px 18px">📝 ' + S().esc(t.summary.text) + (t.summary.done ? '' : ' <span style="color:#e2545d">（未做完）</span>') + '</div>'
                  : '') +
                '</div>');
            });
          });
          // ⏱ 小时计划记录：每段可点开写/看感想复盘
          const hourPlans = day.hourPlans || [];
          const hourHtml = hourPlans.length
            ? '<details class="task-details" style="margin-top:8px"><summary>⏱ 小时代记录（' + hourPlans.length + ' 段）</summary>' +
              hourPlans.map(function (hp) {
                const hsd = new Date(hp.startAt), hed = new Date(hp.endAt);
                const hsTxt = S().hhmmOf(hsd.getHours() * 60 + hsd.getMinutes());
                const heTxt = S().hhmmOf(hed.getHours() * 60 + hed.getMinutes());
                const tg = hp.targets || {};
                const tTot = (tg.required || 0) + (tg.ideal || 0) + (tg.extra || 0);
                const metMark = hp.met
                  ? '<span style="color:#22a06b">🎉 达标</span>'
                  : (hp.autoEnd ? '<span style="color:#e2545d">⏰ 到点未达标</span>' : '<span style="color:#e2545d">未达标</span>');
                const rv = hp.review && hp.review.text
                  ? '<div style="margin:4px 0 4px 10px;font-size:12.5px;color:#374151;background:#f4faf6;border-left:3px solid #22a06b;padding:4px 8px;border-radius:6px">📝 ' + S().esc(hp.review.text) + '</div>'
                  : '';
                return '<div style="margin:6px 0;font-size:12.5px">' +
                  '<div><b>' + hsTxt + ' → ' + heTxt + '</b> · ' + (hp.duration || '') + ' 分</div>' +
                  (hp.taskText ? '<div style="color:#6b7280">🔗 关联：' + S().esc(hp.taskText) + '</div>' : '') +
                  '<div style="color:#6b7280">目标 ' + tTot + ' · 实际 ' + (hp.usedMin != null ? Math.round(hp.usedMin) : 0) + ' 分 · 奖励 ' + (hp.rewardPoints || 0) + '</div>' +
                  rv +
                  '<button class="btn btn-small" data-hpreview="' + hp.id + '" style="margin-top:4px">' + (rv ? '✏️ 改这段感想' : '📝 写这段感想') + '</button>' +
                  '</div>';
              }).join('') + '</details>'
            : '';
          const detailHTML = detailLines.length
            ? '<details class="task-details"><summary>查看当天任务明细（' + detailLines.length + ' 条）</summary>' + detailLines.join('') + '</details>'
            : '';
          // 当日复盘（可随时补写/修改）
          const reviewHTML = (day.review && day.review.text)
            ? '<div style="margin-top:8px;font-size:13px;color:#374151;background:#f4faf6;border-left:3px solid #22a06b;padding:6px 10px;border-radius:6px">📝 复盘：' + S().esc(day.review.text) + '</div>'
            : '';
          const reviewBtn = '<button class="btn btn-small" data-reviewday="' + k + '" style="margin-top:8px">' +
            (day.review && day.review.text ? '✏️ 改这一天的复盘' : '📝 补写这一天的复盘（忘了写的）') + '</button>';
          return '<div class="day-card">' +
            '<div class="day-card-head">' +
            '<button class="d-date" data-day="' + k + '" style="background:none;border:none;font-size:14.5px;font-weight:700;color:var(--primary);cursor:pointer">' + S().fmtDateCN(k) + ' →</button>' +
            (day.ended ? '<span style="color:#8a919c;font-size:12px">已结束</span>' : '') +
            '<span style="font-size:12.5px;color:#8a919c">必须 ' + done(day.tasks.required) + '/' + day.tasks.required.length +
            ' · 理想 ' + done(day.tasks.ideal) + '/' + day.tasks.ideal.length +
            ' · 拓展 ' + done(day.tasks.extra) + '/' + day.tasks.extra.length + '</span>' +
            '</div>' +
            '<div class="day-card-body">' +
            '<span>📚 学习 ' + S().fmtDur(c.study) + '</span>' +
            '<span>⏱ 计时专注 ' + S().fmtDur(focusMin) + '</span>' +
            '<span>⭐ 当日积分 ' + (dayPts >= 0 ? '+' : '') + dayPts + '</span>' +
            '</div>' +
            hourHtml + detailHTML + reviewHTML + reviewBtn +
            '</div>';
        }).join('') + '</div></details>'
      : '<p class="hint">还没有任何一天的任务或记录。</p>');

    const fc2 = document.getElementById('btn-future-clean2');
    if (fc2) fc2.onclick = function () { if (App.tasks && App.tasks.futureDaysModal) App.tasks.futureDaysModal(); };

    // 补写/改复盘
    document.querySelectorAll('#day-history [data-reviewday]').forEach(function (b) {
      b.onclick = function () { editReviewModal(b.dataset.reviewday); };
    });
    document.querySelectorAll('#day-history [data-hpreview]').forEach(function (b) {
      b.onclick = function () { editHourPlanReview(b.dataset.hpreview); };
    });

    // 点击日期 → 跳到时间轴那天
    document.querySelectorAll('#day-history [data-day]').forEach(function (b) {
      b.onclick = function () {
        App.timeline.setDate(b.dataset.day);
        if (typeof App.app !== 'undefined') App.app.switchView('timeline');
      };
    });
  }

  /* ---------- 补写 / 修改一天的复盘 ---------- */
  function editReviewModal(dayKey) {
    const day = S().getDay(dayKey);
    const m = App.ui.openModal('📝 复盘 · ' + S().fmtDateCN(dayKey), '' +
      '<p class="hint">补写这一天的复盘，写给自己看的总结。忘了写随时能回来补。</p>' +
      '<div class="field"><label>复盘内容</label>' +
      '<textarea id="rv-text" style="width:100%;min-height:96px;border:1px solid #e5e8ec;border-radius:8px;padding:8px;font-size:13.5px;resize:vertical">' + S().esc((day.review && day.review.text) || '') + '</textarea></div>',
      '<button class="btn btn-primary" data-act="ok">保存复盘</button>' +
      '<button class="btn" data-act="clear">清空</button>' +
      '<button class="btn" data-act="cancel">取消</button>');
    App.ui.bindActions({
      ok: function () {
        const t = m.querySelector('#rv-text').value.trim();
        if (t) day.review = { text: t, at: new Date().toISOString() }; else day.review = null;
        S().save(); App.ui.closeModal(); render();
      },
      clear: function () { day.review = null; S().save(); App.ui.closeModal(); render(); },
      cancel: App.ui.closeModal
    });
  }

  // ⏱ 写某段小时代的感想 / 复盘
  function editHourPlanReview(hpId) {
    const days = S().data().days;
    let hp = null;
    Object.keys(days).forEach(function (k) {
      (days[k].hourPlans || []).forEach(function (p) { if (p.id === hpId) hp = p; });
    });
    if (!hp) return;
    const m = App.ui.openModal('📝 这段小时代感想 · ' + S().fmtDateCN(S().dateKey(new Date(hp.endAt))), '' +
      '<p class="hint">写给自己：这一段做了什么、状态、想法。</p>' +
      '<div class="field"><label>感想 / 复盘</label>' +
      '<textarea id="hpv-text" style="width:100%;min-height:70px;border:1px solid #e5e8ec;border-radius:8px;padding:8px;font-size:13.5px;resize:vertical">' + S().esc((hp.review && hp.review.text) || '') + '</textarea></div>',
      '<button class="btn btn-primary" data-act="ok">保存</button><button class="btn" data-act="clear">清空</button><button class="btn" data-act="cancel">取消</button>');
    App.ui.bindActions({
      ok: function () {
        const t = m.querySelector('#hpv-text').value.trim();
        if (t) hp.review = { text: t, at: new Date().toISOString() }; else delete hp.review;
        S().save(); App.ui.closeModal(); render();
      },
      clear: function () { delete hp.review; S().save(); App.ui.closeModal(); render(); },
      cancel: App.ui.closeModal
    });
  }

  // 📤 导出复盘总结（给真实 AI）：纯文本、只客观提取小时代/休息/感想，不加评语
  function exportReview() {
    const days = S().data().days;
    const keys = Object.keys(days).sort();
    if (!keys.length) { App.ui.toast('还没有任何记录'); return; }
    const lines = [];
    keys.forEach(function (k) {
      const d = days[k];
      lines.push('===== ' + S().fmtDateCN(k) + ' =====');
      const hpA = [];
      (d.hourPlans || []).forEach(function (hp) {
        const hs = new Date(hp.startAt), he = new Date(hp.endAt);
        const tg = hp.targets || {};
        const tTot = (tg.required || 0) + (tg.ideal || 0) + (tg.extra || 0);
        let s = '小时代 ' + S().hhmmOf(hs.getHours() * 60 + hs.getMinutes()) + '→' +
          S().hhmmOf(he.getHours() * 60 + he.getMinutes()) + '（' + (hp.duration || '') + '分）目标' +
          tTot + '/实际' + Math.round(hp.usedMin || 0) + '分，' + (hp.met ? '达标' : '未达标');
        if (hp.taskText) s += '，关联任务：' + hp.taskText;
        if (hp.rewardPoints) s += '，得积分+' + hp.rewardPoints;
        if (hp.review && hp.review.text) s += '，感想：' + hp.review.text;
        hpA.push(s);
      });
      const rsA = [];
      (d.rests || []).forEach(function (r) {
        const a = new Date(r.startAt), b2 = new Date(r.endAt);
        let s = '休息(' + r.typeName + ') ' + S().hhmmOf(a.getHours() * 60 + a.getMinutes()) + '→' +
          S().hhmmOf(b2.getHours() * 60 + b2.getMinutes()) + '（' + (r.duration || '') + '分）';
        if (r.rewardPoints) s += '，得积分+' + r.rewardPoints;
        if (r.review && r.review.text) s += '，感想：' + r.review.text;
        rsA.push(s);
      });
      const sessSec = (d.sessions || []).reduce(function (a2, s) {
        return a2 + (s.actualSeconds != null ? s.actualSeconds : (s.actualMinutes || 0) * 60);
      }, 0);
      if (hpA.length) lines.push(hpA.join('\n'));
      if (rsA.length) lines.push(rsA.join('\n'));
      if (!hpA.length) lines.push('计时专注约 ' + Math.round(sessSec / 60) + ' 分钟');
      if (d.review && d.review.text) lines.push('【当天复盘】' + d.review.text);
      lines.push('');
    });
    const text = lines.join('\n');
    const m = App.ui.openModal('📤 复盘总结（复制后粘给 AI）', '' +
      '<p class="hint">只客观提取每天的小时代/休息/感想，不加评语；复制后粘贴给任意 AI 生成你的成长报告。</p>' +
      '<textarea id="exp-text" readonly style="width:100%;min-height:220px;border:1px solid #e5e8ec;border-radius:8px;padding:8px;font-size:12px;background:#f7f8fa;resize:vertical;font-family:monospace">' + S().esc(text) + '</textarea>',
      '<button class="btn btn-primary" data-act="copy">📋 全选复制</button>' +
      '<button class="btn" data-act="save">💾 下载 .txt</button>' +
      '<button class="btn" data-act="cancel">关闭</button>');
    App.ui.bindActions({
      copy: function () {
        const ta = m.querySelector('#exp-text');
        ta.focus(); ta.select();
        try { document.execCommand('copy'); } catch (e) {}
        App.ui.toast('已复制，粘贴给 AI 即可');
      },
      save: function () {
        const blob = new Blob([text], { type: 'text/plain' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'focus-plan-review.txt';
        document.body.appendChild(a); a.click();
        setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 100);
        App.ui.closeModal(); App.ui.toast('已导出 focus-plan-review.txt');
      },
      cancel: App.ui.closeModal
    });
  }
  // 今日每个小时代单独复盘（和「每日/整年总结」分开的两套之一）
  function exportHourReviewToday(dayKey) {
    const k = dayKey || S().todayKey();
    const d = S().getDay(k);
    const lines = [];
    lines.push('【今日小时代复盘】 ' + S().fmtDateCN(k));
    const hps = d.hourPlans || [];
    if (!hps.length) lines.push('今天还没有已结算的小时代');
    else {
      hps.forEach(function (hp) {
        const hs = new Date(hp.startAt), he = new Date(hp.endAt);
        const tg = hp.targets || {};
        const tTot = (tg.required || 0) + (tg.ideal || 0) + (tg.extra || 0);
        lines.push('—— 小时代 ' + S().hhmmOf(hs.getHours() * 60 + hs.getMinutes()) +
          ' → ' + S().hhmmOf(he.getHours() * 60 + he.getMinutes()) + ' ——');
        if (hp.taskText) lines.push('关联任务：' + hp.taskText);
        lines.push('目标 ' + tTot + ' 分 / 实际学 ' + Math.round(hp.usedMin || 0) + ' 分 · ' +
          (hp.met ? '✔ 达标' : '✘ 未达标') +
          (hp.disturbCount ? ' · 中途消耗' + hp.disturbCount + '次' : '') +
          (hp.rewardPoints ? ' · 得 +' + hp.rewardPoints + ' 分' : ''));
        lines.push('感想：' + ((hp.review && hp.review.text) ? hp.review.text : '（这段还没写感想）'));
        lines.push('');
      });
    }
    showExportText(lines.join('\n'), '📕 今日小时代复盘（每段单独，粘给 AI）');
  }
  // 通用导出弹窗
  function showExportText(text, title) {
    const m = App.ui.openModal(title || '📤 导出', '' +
      '<p class="hint">只客观提取，不加评语；复制后粘给 AI 生成你的报告。</p>' +
      '<textarea id="exp-text" readonly style="width:100%;min-height:220px;border:1px solid #e5e8ec;border-radius:8px;padding:8px;font-size:12px;background:#f7f8fa;resize:vertical;font-family:monospace">' + S().esc(text) + '</textarea>',
      '<button class="btn btn-primary" data-act="copy">📋 全选复制</button>' +
      '<button class="btn" data-act="save">💾 下载 .txt</button>' +
      '<button class="btn" data-act="cancel">关闭</button>');
    App.ui.bindActions({
      copy: function () {
        const ta = m.querySelector('#exp-text'); ta.focus(); ta.select();
        try { document.execCommand('copy'); } catch (e) {}
        App.ui.toast('已复制，粘给 AI 即可');
      },
      save: function () {
        const blob = new Blob([text], { type: 'text/plain' });
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
        a.download = 'focus-plan-export.txt'; document.body.appendChild(a); a.click();
        setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 100);
        App.ui.closeModal(); App.ui.toast('已导出');
      },
      cancel: App.ui.closeModal
    });
  }
  /* ============================================================
   * v124 复盘看板 —— 本周 vs 上周 · 学科分布 · 时段分布 · 一键长图
   * 口径三条：
   *  1)「学习时长」= 时间轴 study+extend；「计时专注」= sessions 净时长
   *  2) 未来不统计（只算 k <= today）；「上周」= 完整的周一→周日
   *  3) 复习轮按「完成时刻 at」落周；同一轮在多份载体（任务/队列）上只算一次
   * ============================================================ */
  function weekMonday(d) {
    const x = new Date(d); x.setHours(0, 0, 0, 0);
    x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
    return x;
  }
  function weekKeys(offset) { // 0=本周（周一→周日） 1=上周
    const mon = weekMonday(new Date());
    mon.setDate(mon.getDate() - 7 * offset);
    const out = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(mon); d.setDate(d.getDate() + i);
      out.push(S().dateKey(d));
    }
    return out;
  }
  /** 从任务名里认学科：化学 · 平衡常数 / 背英语单词 / 数学卷子 都能认出来 */
  function subjectOf(text) {
    if (!text) return null;
    const t = String(text).trim();
    const subs = (App.memcards && App.memcards.subjects) ? App.memcards.subjects()
      : ['语文', '数学', '英语', '物理', '化学', '生物', '政治', '历史', '地理'];
    for (let i = 0; i < subs.length; i++) if (t.indexOf(subs[i]) === 0) return subs[i];
    const head = t.slice(0, 5);
    for (let i = 0; i < subs.length; i++) if (head.indexOf(subs[i]) >= 0) return subs[i];
    const di = t.indexOf('·');
    if (di > 0) {
      const h = t.slice(0, di).trim();
      if (subs.indexOf(h) >= 0) return h;
    }
    return null;
  }
  function weekStats(offset) {
    const keys = weekKeys(offset), set = {};
    keys.forEach(function (k) { set[k] = true; });
    const tk = S().todayKey();
    const st = {
      keys: keys, study: 0, extend: 0, focus: 0, daysPassed: 0,
      req: [0, 0], ideal: [0, 0], extra: [0, 0],
      rev: { done: 0, ok: 0, no: 0, onTime: 0 },
      ckDays: 0, earned: 0, spent: 0
    };
    const seen = {}, cked = {};
    const countRounds = function (plan, text) {
      (plan || []).forEach(function (r) {
        if (r.done !== true || !r.at) return;
        const rk = S().dateKey(new Date(r.at));
        if (!set[rk]) return;
        const kk = r.at + '|' + (r.n || 0) + '|' + (text || '');
        if (seen[kk]) return;          // 任务页副本 + 队列载体是同一轮，只算一次
        seen[kk] = true;
        st.rev.done++;
        if (r.result === 'ok') st.rev.ok++; else if (r.result === 'no') st.rev.no++;
        if (r.due && S().dateKey(new Date(r.at)) <= S().dateKey(new Date(r.due))) st.rev.onTime++;
      });
    };
    keys.forEach(function (k) {
      if (k > tk) return;              // 🔒 还没到的日子绝不统计
      st.daysPassed++;
      const c = collectDay(k), day = c.day;
      st.study += c.study; st.extend += c.extend;
      (day.sessions || []).forEach(function (s) { st.focus += s.actualMinutes || 0; });
      ['required', 'ideal', 'extra'].forEach(function (lk) {
        const f = lk === 'required' ? 'req' : lk;   // st 里必须存 req，lk 是 required
        (day.tasks[lk] || []).forEach(function (t) {
          st[f][1]++;
          if (t.done) st[f][0]++;
          countRounds(t.sp && t.sp.planned, t.text);
        });
      });
      (S().data().checkins || []).forEach(function (ci) {
        if (ci.days && ci.days[k]) cked[k] = true;
      });
    });
    ['queue', 'queueDone'].forEach(function (arr) {   // v112：复习计划也会住在队列载体上
      (S().data()[arr] || []).forEach(function (q) { countRounds(q.sp && q.sp.planned, q.text); });
    });
    st.ckDays = Object.keys(cked).length;
    S().ledger().forEach(function (e) {
      if (!set[e.date]) return;
      const p = e.points || 0;
      if (p > 0) st.earned += p; else if (p < 0) st.spent += -p;
    });
    return st;
  }
  /** 最近 30 天计时专注按学科前缀分桶 */
  function subjectDist() {
    const buckets = {}; let total = 0;
    lastNDays(30).forEach(function (c) {
      (c.day.sessions || []).forEach(function (s) {
        const m = s.actualMinutes || 0;
        if (m <= 0) return;
        const sub = subjectOf(s.taskText) || '未分类';
        buckets[sub] = (buckets[sub] || 0) + m;
        total += m;
      });
    });
    const list = Object.keys(buckets).map(function (k) { return { name: k, min: buckets[k] }; });
    list.sort(function (a, b) { return b.min - a.min; });
    return { list: list, total: total };
  }
  /** 最近 14 天计时「开始时段」分布（24 格） */
  function hourDist() {
    const counts = [];
    for (let i = 0; i < 24; i++) counts.push(0);
    let total = 0;
    lastNDays(14).forEach(function (c) {
      (c.day.sessions || []).forEach(function (s) {
        if (!s.startAt) return;
        const d = new Date(s.startAt);
        if (isNaN(d.getTime())) return;
        counts[d.getHours()]++; total++;
      });
    });
    return { counts: counts, total: total };
  }
  function rvCmp(nowV, prevV, fmt) {
    if (!prevV) return nowV > 0 ? '上周还没开始' : '上周也是 0';
    const diff = nowV - prevV;
    if (!diff) return '与上周持平';
    const pct = Math.round(Math.abs(diff) / prevV * 100);
    return '上周 ' + fmt(prevV) + ' · ' + (diff > 0 ? '↑' : '↓') + pct + '%';
  }
  function rvTile(cap, num, cmp) {
    return '<div class="rv-tile"><div class="rv-cap">' + cap + '</div>' +
      '<div class="rv-num">' + num + '</div><div class="rv-cmp">' + cmp + '</div></div>';
  }
  function renderReviewBoard() {
    const box = document.getElementById('review-board');
    if (!box) return;
    const cur = weekStats(0), prev = weekStats(1);
    const kA = S().keyToDate(cur.keys[0]), kB = S().keyToDate(cur.keys[6]);
    const rangeTxt = (kA.getMonth() + 1) + '/' + kA.getDate() + ' — ' + (kB.getMonth() + 1) + '/' + kB.getDate();
    const curDone = cur.req[0] + cur.ideal[0] + cur.extra[0];
    const curTotal = cur.req[1] + cur.ideal[1] + cur.extra[1];
    const prevDone = prev.req[0] + prev.ideal[0] + prev.extra[0];
    const net = cur.earned - cur.spent;
    const onTimePct = cur.rev.done ? Math.round(cur.rev.onTime / cur.rev.done * 100) : 0;

    const sd = subjectDist(), hd = hourDist();
    const PALETTE = ['#3b82f6', '#22a06b', '#f59e0b', '#8b5cf6', '#0ea5e9', '#e2545d', '#14b8a6', '#94a3b8'];
    let subHtml = '';
    if (sd.list.length) {
      const maxMin = sd.list[0].min;
      subHtml = sd.list.slice(0, 8).map(function (x, i) {
        const w = Math.max(3, Math.round(x.min / maxMin * 100));
        const col = x.name === '未分类' ? '#94a3b8' : PALETTE[i % PALETTE.length];
        return '<div class="rv-bar-row"><span class="rv-bar-label" title="' + S().esc(x.name) + '">' + S().esc(x.name) + '</span>' +
          '<span class="rv-bar-track"><span class="rv-bar-fill" style="width:' + w + '%;background:' + col + '"></span></span>' +
          '<span class="rv-bar-val">' + S().fmtDur(x.min) + '</span></div>';
      }).join('');
      subHtml = '<div class="rv-sec"><h4>🧪 最近 30 天计时专注 · 学科分布（共 ' + S().fmtDur(sd.total) + '）</h4>' + subHtml +
        (sd.list.length > 8 ? '<p class="hint">还有 ' + (sd.list.length - 8) + ' 类没列出来</p>' : '') + '</div>';
    } else {
      subHtml = '<div class="rv-sec"><h4>🧪 学科分布</h4><p class="hint">最近 30 天还没有计时记录 —— 点任务右边的 ▶ 开始计时，这里就能看出时间花在哪科。</p></div>';
    }

    let hourHtml = '';
    if (hd.total) {
      const maxC = Math.max.apply(null, hd.counts);
      const cols = hd.counts.map(function (c, h) {
        const hp = maxC ? Math.max(4, Math.round(c / maxC * 100)) : 4;
        return '<span class="rv-hour-col' + (c === maxC && c > 0 ? ' hot' : '') + '" style="height:' + hp + '%" title="' + h + ' 点开始 · ' + c + ' 次"></span>';
      }).join('');
      const xs = hd.counts.map(function (c, h) { return '<span>' + (h % 6 === 0 || h === 23 ? h : '') + '</span>'; }).join('');
      let topH = 0; hd.counts.forEach(function (c, h) { if (c > hd.counts[topH]) topH = h; });
      hourHtml = '<div class="rv-sec"><h4>⏰ 最近 14 天计时开始时段（共 ' + hd.total + ' 次）</h4>' +
        '<div class="rv-hours">' + cols + '</div><div class="rv-hour-x">' + xs + '</div>' +
        '<p class="hint">最常开始：' + topH + ' 点（' + hd.counts[topH] + ' 次）</p></div>';
    } else {
      hourHtml = '<div class="rv-sec"><h4>⏰ 时段分布</h4><p class="hint">最近 14 天还没有计时记录。</p></div>';
    }

    box.innerHTML =
      '<div class="rv-range">🗓 <b>' + rangeTxt + '</b>（本周）· 已过 ' + cur.daysPassed + ' 天</div>' +
      '<div class="rv-grid">' +
      rvTile('📚 学习时长', S().fmtDur(cur.study + cur.extend), rvCmp(cur.study + cur.extend, prev.study + prev.extend, S().fmtDur)) +
      rvTile('⏱ 计时专注', S().fmtDur(cur.focus), rvCmp(cur.focus, prev.focus, S().fmtDur)) +
      rvTile('✅ 任务完成', curDone + '/' + curTotal, rvCmp(curDone, prevDone, function (v) { return v + ' 条'; })) +
      rvTile('🌱 复习轮次', cur.rev.done + ' 次', cur.rev.done
        ? ('按时 ' + onTimePct + '% · ✅ 写出来了 ' + cur.rev.ok + ' · ✗ 没写出来 ' + cur.rev.no)
        : (prev.rev.done ? '上周 ' + prev.rev.done + ' 次' : '这周还没复习过')) +
      rvTile('✅ 打卡', cur.ckDays + '/7 天', rvCmp(cur.ckDays, prev.ckDays, function (v) { return v + ' 天'; })) +
      rvTile('💰 净积分', (net >= 0 ? '+' : '') + net, '得 +' + cur.earned + ' · 花扣 ' + cur.spent) +
      '</div>' +
      subHtml + hourHtml +
      '<div class="rv-btns">' +
      '<button class="btn btn-primary" id="rv-png">📤 存成长图</button>' +
      '<button class="btn" id="rv-copy">📋 复制文字版</button></div>';

    const bp = document.getElementById('rv-png');
    if (bp) bp.onclick = function () { weekCardPNG(cur, sd, hd); };
    const bc = document.getElementById('rv-copy');
    if (bc) bc.onclick = function () { weekCardCopy(weekCardText(cur, rangeTxt, onTimePct)); };
  }
  /** 纯数据汇总（探针 / 导出共用） */
  function weekStatsAll() {
    return { cur: weekStats(0), prev: weekStats(1), subjects: subjectDist(), hours: hourDist() };
  }
  function weekCardText(cur, rangeTxt, onTimePct) {
    if (!cur) { cur = weekStats(0); }
    const sd = subjectDist(), hd = hourDist();
    const net = cur.earned - cur.spent;
    const L = [];
    L.push('🧭 本周复盘（' + rangeTxt + ' · 已过 ' + cur.daysPassed + ' 天）');
    L.push('📚 学习 ' + S().fmtDur(cur.study + cur.extend) + ' · ⏱ 计时专注 ' + S().fmtDur(cur.focus));
    L.push('✅ 任务：必须 ' + cur.req[0] + '/' + cur.req[1] + ' · 理想 ' + cur.ideal[0] + '/' + cur.ideal[1] + ' · 拓展 ' + cur.extra[0] + '/' + cur.extra[1]);
    L.push('🌱 复习 ' + cur.rev.done + ' 次' + (cur.rev.done ? '（按时 ' + onTimePct + '% · ✅ 写出来了 ' + cur.rev.ok + ' · ✗ 没写出来 ' + cur.rev.no + '）' : ''));
    L.push('✅ 打卡 ' + cur.ckDays + '/7 天 · 💰 净积分 ' + (net >= 0 ? '+' : '') + net + '（得 +' + cur.earned + ' · 花扣 ' + cur.spent + '）');
    if (sd.list.length) L.push('🧪 学科分布：' + sd.list.slice(0, 6).map(function (x) { return x.name + ' ' + S().fmtDur(x.min); }).join(' · '));
    if (hd.total) {
      let topH = 0; hd.counts.forEach(function (c, h) { if (c > hd.counts[topH]) topH = h; });
      L.push('⏰ 最常开始时段：' + topH + ' 点（' + hd.counts[topH] + ' 次）');
    }
    return L.join('\n');
  }
  function weekCardCopy(text) {
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (e) {}
    ta.remove();
    if (ok) App.ui.toast('📋 复盘文字版已复制，粘给 AI 或备忘录都行');
    else showExportText(text, '📋 本周复盘（文字版）');
  }
  function rr(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  /** 📤 把本周复盘画成一张 PNG 长图 */
  function weekCardPNG(cur, sd, hd) {
    if (!cur) { cur = weekStats(0); sd = subjectDist(); hd = hourDist(); }
    const W = 750, pad = 34, gap = 12;
    const subN = Math.min(sd.list.length, 8);
    const hasSub = sd.list.length > 0, hasHour = hd.total > 0;
    const H = 136 + 2 * (92 + 12) + 8 + (hasSub ? 66 + subN * 30 : 0) + (hasHour ? 150 : 0) + 74;
    const cv = document.createElement('canvas');
    cv.width = W * 2; cv.height = H * 2;
    const ctx = cv.getContext('2d');
    if (!ctx) { App.ui.toast('这个浏览器画不了长图'); return; }
    ctx.scale(2, 2);
    ctx.fillStyle = '#f4f6f8'; ctx.fillRect(0, 0, W, H);
    // 头
    ctx.fillStyle = '#2d3a4a'; ctx.fillRect(0, 0, W, 118);
    const kA = S().keyToDate(cur.keys[0]), kB = S().keyToDate(cur.keys[6]);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 28px "Microsoft YaHei", sans-serif';
    ctx.fillText('🧭 本周复盘', pad, 48);
    ctx.font = '15px "Microsoft YaHei", sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,.82)';
    ctx.fillText((kA.getMonth() + 1) + '/' + kA.getDate() + ' — ' + (kB.getMonth() + 1) + '/' + kB.getDate() + ' · 已过 ' + cur.daysPassed + ' 天', pad, 76);
    ctx.fillText('focus-plan · 数据来自你自己的账本', pad, 100);
    // 六格
    const curDone = cur.req[0] + cur.ideal[0] + cur.extra[0];
    const curTotal = cur.req[1] + cur.ideal[1] + cur.extra[1];
    const net = cur.earned - cur.spent;
    const onTimePct = cur.rev.done ? Math.round(cur.rev.onTime / cur.rev.done * 100) : 0;
    const tiles = [
      ['📚 学习时长', S().fmtDur(cur.study + cur.extend)],
      ['⏱ 计时专注', S().fmtDur(cur.focus)],
      ['✅ 任务完成', curDone + '/' + curTotal],
      ['🌱 复习轮次', cur.rev.done + ' 次' + (cur.rev.done ? '（按时 ' + onTimePct + '%）' : '')],
      ['✅ 打卡', cur.ckDays + '/7 天'],
      ['💰 净积分', (net >= 0 ? '+' : '') + net]
    ];
    const tw = (W - pad * 2 - gap * 2) / 3, th = 92;
    tiles.forEach(function (t, i) {
      const x = pad + (i % 3) * (tw + gap), y = 136 + Math.floor(i / 3) * (th + gap);
      ctx.fillStyle = '#ffffff'; rr(ctx, x, y, tw, th, 10); ctx.fill();
      ctx.fillStyle = '#8a919c'; ctx.font = '13px "Microsoft YaHei", sans-serif';
      ctx.fillText(t[0], x + 14, y + 26);
      ctx.fillStyle = '#1f2328'; ctx.font = 'bold 21px "Microsoft YaHei", sans-serif';
      ctx.fillText(t[1], x + 14, y + 60);
    });
    let y = 136 + 2 * (th + gap) + 8;
    // 学科分布
    if (hasSub) {
      ctx.fillStyle = '#1f2328'; ctx.font = 'bold 16px "Microsoft YaHei", sans-serif';
      ctx.fillText('🧪 最近 30 天计时专注 · 学科分布（共 ' + S().fmtDur(sd.total) + '）', pad, y + 20);
      const maxMin = sd.list[0].min, bw = W - pad * 2;
      const PAL = ['#3b82f6', '#22a06b', '#f59e0b', '#8b5cf6', '#0ea5e9', '#e2545d', '#14b8a6', '#94a3b8'];
      sd.list.slice(0, 8).forEach(function (sb, i) {
        const yy = y + 36 + i * 30;
        ctx.fillStyle = '#1f2328'; ctx.font = '13px "Microsoft YaHei", sans-serif';
        ctx.textAlign = 'right'; ctx.fillText(sb.name, pad + 56, yy + 13); ctx.textAlign = 'left';
        const w = Math.max(6, (bw - 150) * sb.min / maxMin);
        ctx.fillStyle = sb.name === '未分类' ? '#94a3b8' : PAL[i % PAL.length];
        rr(ctx, pad + 66, yy, w, 16, 8); ctx.fill();
        ctx.fillStyle = '#8a919c'; ctx.fillText(S().fmtDur(sb.min), pad + 76 + w, yy + 13);
      });
      y += 66 + subN * 30;
    }
    // 时段分布
    if (hasHour) {
      ctx.fillStyle = '#1f2328'; ctx.font = 'bold 16px "Microsoft YaHei", sans-serif';
      ctx.fillText('⏰ 最近 14 天计时开始时段（共 ' + hd.total + ' 次）', pad, y + 20);
      const maxC = Math.max.apply(null, hd.counts);
      const hw = W - pad * 2, hgt = 64, by = y + 34;
      hd.counts.forEach(function (c, h) {
        const bw2 = hw / 24 - 3;
        const bh = maxC ? Math.max(3, hgt * c / maxC) : 3;
        ctx.fillStyle = (c === maxC && c > 0) ? '#3b82f6' : 'rgba(59,130,246,.35)';
        rr(ctx, pad + h * (hw / 24), by + hgt - bh, bw2, bh, 3); ctx.fill();
        if (h % 6 === 0 || h === 23) {
          ctx.fillStyle = '#8a919c'; ctx.font = '11px sans-serif';
          ctx.fillText(String(h), pad + h * (hw / 24), by + hgt + 16);
        }
      });
    }
    // 尾
    ctx.fillStyle = '#8a919c'; ctx.font = '12px "Microsoft YaHei", sans-serif';
    ctx.fillText('系统是账本，你是会计', pad, H - 26);
    const a = document.createElement('a');
    a.href = cv.toDataURL('image/png');
    a.download = '本周复盘-' + cur.keys[0] + '.png';
    document.body.appendChild(a); a.click();
    setTimeout(function () { a.remove(); }, 300);
    App.ui.toast('📤 长图已生成：本周复盘-' + cur.keys[0] + '.png');
  }

  App.stats = { render: render, editReviewModal: editReviewModal, editHourPlanReview: editHourPlanReview, exportReview: exportReview, exportHourReviewToday: exportHourReviewToday,
    weekStatsAll: weekStatsAll, subjectOf: subjectOf, renderReviewBoard: renderReviewBoard, weekCardPNG: weekCardPNG, weekCardText: weekCardText };
})();