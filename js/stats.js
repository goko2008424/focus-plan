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
    'redeem': '🎁 积分兑换',
    'adjust': '✏ 调整'
  };

  /* ---------- 数据收集 ---------- */
  function collectDay(key) {
    const day = S().getDay(key);
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

    // 积分流水
    const ledger = S().ledger().slice().reverse();
    document.getElementById('ledger-list').innerHTML = ledger.length
      ? ledger.map(function (e) {
          const name = LEDGER_NAMES[e.type] || e.type;
          const pts = e.points || 0;
          const lei = e.leisure || 0;
          const sign = pts > 0 ? '+' + pts + '分' : pts < 0 ? pts + '分' : '';
          const leiStr = lei > 0 ? '🕐+' + lei + '分钟' : '';
          return '<div class="day-card">' +
            '<div class="day-card-head"><span class="d-date">' + e.date + '</span>' +
            '<span>' + name + '</span>' +
            '<span style="font-weight:700;color:' + (pts < 0 ? '#e2545d' : '#22a06b') + '">' + sign + '</span>' +
            '<span style="font-weight:700;color:#f59e0b">' + leiStr + '</span>' +
            '</div>' +
            (e.note ? '<div class="day-card-body"><span>' + S().esc(e.note) + '</span></div>' : '') +
            '</div>';
        }).join('')
      : '<p class="hint">还没有账目记录。完成理想/拓展任务、触发奖励、兑换积分都会记在这里。</p>';

    // 兑换记录专区（只列花掉积分的兑换）
    const redeems = S().ledger().filter(function (e) { return e.type === 'redeem' && (e.points || 0) < 0; }).slice().reverse();
    document.getElementById('redeem-list').innerHTML = redeems.length
      ? '<div class="redeem-log">' + redeems.map(function (e) {
          const total = e.date;
          return '<div class="redeem-log-row"><span class="d-date">' + e.date + '</span>' +
            '<span style="flex:1">' + S().esc(e.note || '（未写内容）') + '</span>' +
            '<span style="font-weight:700;color:#e2545d">-' + Math.abs(e.points) + '分</span></div>';
        }).join('') + '</div>' +
        '<p class="hint" style="margin-top:8px">共 ' + redeems.length + ' 次兑换，共花了 ' +
        (-redeems.reduce(function (s, e) { return s + (e.points || 0); }, 0)) + ' 分</p>'
      : '<p class="hint">还没有兑换过东西。以后点顶部积分数字「兑换」，扣掉的分会都在这里。</p>';

    // 按日记录
    const dayKeys = Object.keys(S().data().days).filter(function (k) {
      const day = S().getDay(k);
      return day.tasks.required.length || day.tasks.ideal.length || day.tasks.extra.length || day.timeline.length;
    }).sort().reverse();

    document.getElementById('day-history').innerHTML = dayKeys.length
      ? dayKeys.map(function (k) {
          const c = collectDay(k);
          const day = c.day;
          const done = function (list) { return list.filter(function (t) { return t.done; }).length; };
          const focusMin = day.sessions.reduce(function (s, x) { return s + (x.actualMinutes || 0); }, 0);
          const dayPts = S().ledger().filter(function (e) { return e.date === k; }).reduce(function (s, e) { return s + (e.points || 0); }, 0);
          const dayLei = S().ledger().filter(function (e) { return e.date === k; }).reduce(function (s, e) { return s + (e.leisure || 0); }, 0);
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
            (dayLei ? '<span>🕐 当日休闲 +' + dayLei + '分钟</span>' : '') +
            '</div>' +
            detailHTML + reviewHTML + reviewBtn +
            '</div>';
        }).join('')
      : '<p class="hint">还没有任何一天的任务或记录。</p>';

    // 补写/改复盘
    document.querySelectorAll('#day-history [data-reviewday]').forEach(function (b) {
      b.onclick = function () { editReviewModal(b.dataset.reviewday); };
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

  App.stats = { render: render, editReviewModal: editReviewModal };
})();