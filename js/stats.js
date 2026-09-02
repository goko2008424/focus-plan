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
            '</div>';
        }).join('')
      : '<p class="hint">还没有任何一天的任务或记录。</p>';

    // 点击日期 → 跳到时间轴那天
    document.querySelectorAll('#day-history [data-day]').forEach(function (b) {
      b.onclick = function () {
        App.timeline.setDate(b.dataset.day);
        if (typeof App.app !== 'undefined') App.app.switchView('timeline');
      };
    });
  }

  App.stats = { render: render };
})();