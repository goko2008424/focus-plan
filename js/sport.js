/* sport.js — 🏃 运动强化：前一天安排明天的运动项目（分组），做好给积分、没做到扣分 */
(function () {
  'use strict';
  const App = (window.App = window.App || {});
  const S = () => App.store;
  const DEFAULT_PTS = 5;

  const INPUT_STYLE = 'background:transparent;border:1px solid #394154;border-radius:6px;padding:6px 8px;color:#eaf0ff;font-size:13px';

  /* ---------- 今日执行视图：做的 +分，没做的结算时扣分 ---------- */
  function renderToday() {
    const day = S().getDay(S().todayKey());
    const wrap = document.getElementById('sport-today');
    if (!wrap) return;
    const sports = day.sports || [];
    if (!sports.length) {
      wrap.innerHTML = '<div class="card"><h3>🏃 今日运动</h3>' +
        '<p class="hint">今天还没有运动安排。昨晚没写？去下面「运动安排」写明天的，今晚就安排好了，明天直接做。</p>' +
        '<button class="btn btn-primary" id="sport-goto-plan">📅 去安排明天的运动</button></div>';
      const gb = wrap.querySelector('#sport-goto-plan');
      if (gb) gb.onclick = function () { document.getElementById('sport-tab-plan').click(); };
      return;
    }
    let html = '<div class="card"><h3>🏃 今日运动</h3><p class="hint">做完一项点它 = +分立即入账；没做完的，点底部「结算」会统一扣分。</p>';
    sports.forEach(function (grp, gi) {
      html += '<div class="card"><h4>' + S().esc(grp.name) + '</h4>';
      (grp.items || []).forEach(function (it, ii) {
        const st = it.done ? '✅ 已完成 +' + (it.points || DEFAULT_PTS) + ' 分'
          : (it.settled ? '❌ 没做到 · 已扣分' : '🕐 还没做');
        html += '<div class="sport-item" style="display:flex;align-items:center;gap:8px;padding:9px 2px;border-bottom:1px solid rgba(255,255,255,.08);cursor:pointer" data-g="' + gi + '" data-i="' + ii + '">' +
          '<span style="flex:0 0 auto">' + (it.done ? '✅' : (it.settled ? '❌' : '⬜')) + '</span>' +
          '<span style="flex:1">' + S().esc(it.text) + '</span>' +
          '<span style="flex:0 0 auto;color:' + (it.done ? 'var(--c2)' : (it.settled ? 'var(--c4)' : 'var(--muted)')) + ';font-weight:700">' +
          (it.done ? '+' : (it.settled ? '-' : '')) + (it.points || DEFAULT_PTS) + '分</span>' +
          '<span style="flex:0 0 auto;font-size:11px;color:var(--muted)">' + st + '</span></div>';
      });
      html += '</div>';
    });
    html += '<button class="btn btn-primary btn-block" id="sport-settle">🏁 结算今日运动（没做完的扣分）</button>' +
      '<button class="btn btn-block" id="sport-clear" style="margin-top:6px">🔄 重新开始今日运动</button></div>';
    wrap.innerHTML = html;
    wrap.querySelectorAll('.sport-item').forEach(function (el) {
      el.onclick = function () {
        const grp = sports[+el.dataset.g], it = grp.items[+el.dataset.i];
        if (it.done || it.settled) return;
        it.done = true; it.rewarded = true;
        App.store.addLedger(S().todayKey(), 'sport', { points: it.points || DEFAULT_PTS, note: '🏃 运动完成：' + it.text + '，+' + (it.points || DEFAULT_PTS) + ' 分' });
        S().save();
        if (App.app && App.app.refreshStats) App.app.refreshStats();
        renderToday();
      };
    });
    const sb = wrap.querySelector('#sport-settle');
    if (sb) sb.onclick = settleToday;
    const cb = wrap.querySelector('#sport-clear');
    if (cb) cb.onclick = function () { day.sports = []; S().save(); renderToday(); };
  }

  function settleToday() {
    const k = S().todayKey();
    const day = S().getDay(k);
    const sports = day.sports || [];
    let penalized = 0, doneCount = 0, total = 0;
    sports.forEach(function (grp) {
      (grp.items || []).forEach(function (it) {
        total++;
        if (it.done) doneCount++;
        else if (!it.settled) {
          it.settled = true;
          penalized += it.points || DEFAULT_PTS;
          App.store.addLedger(k, 'sport-cut', { points: -(it.points || DEFAULT_PTS), note: '🏃 运动没做到：' + it.text + '，扣 ' + (it.points || DEFAULT_PTS) + ' 分' });
        }
      });
    });
    S().save();
    if (App.app && App.app.refreshStats) App.app.refreshStats();
    renderToday();
    App.ui.toast(penalized > 0
      ? ('⚠️ 今天 ' + doneCount + '/' + total + ' 项运动做到，有 ' + penalized + ' 分没做完已扣，明天补回来 💪')
      : ('✅ 今天 ' + total + ' 项运动全做到了，保持住！'));
  }

  /* ---------- 明天安排视图：加组/加项/设分 ---------- */
  function renderPlan() {
    const day = S().getDay(S().tomorrowKey());
    const wrap = document.getElementById('sport-plan');
    if (!wrap) return;
    const sports = day.sports || [];
    let html = '<div class="card"><h3>📅 明天的运动安排</h3>' +
      '<p class="hint">先建组，再往组里加运动项（每项默认 5 分，可改）。今晚写好，明天就有得做。</p>';
    (sports && sports.length ? sports : []).forEach(function (grp, gi) {
      html += '<div class="card sport-plan-group" data-g="' + gi + '">' +
        '<div style="display:flex;align-items:center;gap:8px">' +
        '<input class="sport-group-name" style="flex:1;' + INPUT_STYLE + '" value="' + S().esc(grp.name) + '" />' +
        '<button class="btn btn-small btn-danger sport-del-g">🗑 删这组</button></div>' +
        '<div class="sport-plan-items" style="margin-top:6px">';
      (grp.items || []).forEach(function (it, ii) {
        html += '<div class="sport-plan-item" style="display:flex;gap:6px;margin:6px 0;align-items:center" data-i="' + ii + '">' +
          '<input class="sport-item-text" style="flex:1;' + INPUT_STYLE + '" value="' + S().esc(it.text) + '" />' +
          '<input class="sport-item-pts" type="number" min="0" style="width:60px;' + INPUT_STYLE + '" value="' + (it.points || DEFAULT_PTS) + '" />' +
          '<button class="btn btn-small btn-danger sport-del-i">🗑</button></div>';
      });
      html += '<button class="btn btn-small sport-add-item">＋ 加一项</button></div>';
    });
    html += '<button class="btn btn-small" id="sport-add-group">＋ 加一组</button><br/><br/>' +
      '<button class="btn btn-primary" id="sport-save-plan">💾 保存明天的运动安排</button></div>';
    wrap.innerHTML = html;

    const addG = wrap.querySelector('#sport-add-group');
    if (addG) addG.onclick = function () { sports.push({ id: S().uid(), name: '新的运动组 ' + (sports.length + 1), items: [] }); renderPlan(); };
    wrap.querySelectorAll('.sport-add-item').forEach(function (b) {
      b.onclick = function () {
        const gi = +b.closest('.sport-plan-group').dataset.g;
        sports[gi].items.push({ id: S().uid(), text: '新的运动项', points: DEFAULT_PTS });
        renderPlan();
      };
    });
    wrap.querySelectorAll('.sport-del-g').forEach(function (b) {
      b.onclick = function () {
        sports.splice(+b.closest('.sport-plan-group').dataset.g, 1); renderPlan();
      };
    });
    wrap.querySelectorAll('.sport-del-i').forEach(function (b) {
      b.onclick = function () {
        const grp = sports[+b.closest('.sport-plan-group').dataset.g];
        grp.items.splice(+b.closest('div[data-i]').dataset.i, 1); renderPlan();
      };
    });
    const sb = wrap.querySelector('#sport-save-plan');
    if (sb) sb.onclick = function () {
      const cleaned = [];
      wrap.querySelectorAll('.sport-plan-group').forEach(function (g) {
        const old = sports[+g.dataset.g];
        const name = (g.querySelector('.sport-group-name').value || '').trim() || '运动组';
        const items = [];
        g.querySelectorAll('.sport-plan-item').forEach(function (itEl) {
          const t = itEl.querySelector('.sport-item-text').value.trim();
          const p = Math.max(0, parseInt(itEl.querySelector('.sport-item-pts').value, 10));
          if (t) items.push({ id: S().uid(), text: t, points: p || DEFAULT_PTS });
        });
        if (items.length) cleaned.push({ id: old ? old.id : S().uid(), name: name, items: items });
      });
      day.sports = cleaned;
      S().save();
      App.ui.toast('已保存明天的运动安排 ✅');
      renderPlan();
    };
  }

  function init() {
    const t = document.getElementById('sport-tab-today');
    const p = document.getElementById('sport-tab-plan');
    if (t && p) {
      t.onclick = function () {
        t.classList.add('active'); p.classList.remove('active');
        document.getElementById('sport-today').classList.add('active');
        document.getElementById('sport-plan').classList.remove('active');
        renderToday();
      };
      p.onclick = function () {
        p.classList.add('active'); t.classList.remove('active');
        document.getElementById('sport-plan').classList.add('active');
        document.getElementById('sport-today').classList.remove('active');
        renderPlan();
      };
    }
    renderToday();
  }

  App.sport = { init: init, renderToday: renderToday, renderPlan: renderPlan };
})();
