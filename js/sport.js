/* sport.js — 🏃 运动强化：任何一天都能安排（今天临时加 / 明天 / 自选日期），
   做好给积分、没做到结算扣分。配色跟随浅色主题，不再白字白底。 */
(function () {
  'use strict';
  const App = (window.App = window.App || {});
  const S = () => App.store;
  const DEFAULT_PTS = 5;

  // 跟随主题变量：之前硬编码深色配色（白字）在浅色卡片上完全看不清
  const INPUT_STYLE = 'background:#fff;border:1px solid var(--line);border-radius:6px;padding:6px 8px;color:var(--ink);font-size:13px';

  let planDayKey = null; // 安排视图当前编辑哪天；null = 默认明天

  function planDateLabel(key) {
    if (key === S().todayKey()) return '今天';
    if (key === S().tomorrowKey()) return '明天';
    const d = S().keyToDate(key);
    return d && !isNaN(d.getTime()) ? ((d.getMonth() + 1) + '月' + d.getDate() + '日') : key;
  }

  /* ---------- 今日执行视图：做的 +分，没做的结算时扣分 ---------- */
  function renderToday() {
    const day = S().getDay(S().todayKey());
    const wrap = document.getElementById('sport-today');
    if (!wrap) return;
    const sports = day.sports || [];
    if (!sports.length) {
      wrap.innerHTML = '<div class="card"><h3>🏃 今日运动</h3>' +
        '<p class="hint">今天还没有运动安排。可以临时加一项马上做，也可以提前把明天的安排写好。</p>' +
        '<div class="btn-row" style="margin-top:8px">' +
        '<button class="btn btn-primary" id="sport-quick-add">➕ 今天临时加一项</button>' +
        '<button class="btn" id="sport-goto-plan" style="margin-left:6px">📅 去安排运动</button></div></div>';
      const qa = wrap.querySelector('#sport-quick-add');
      if (qa) qa.onclick = quickAddToday;
      const gb = wrap.querySelector('#sport-goto-plan');
      if (gb) gb.onclick = function () { document.getElementById('sport-tab-plan').click(); };
      return;
    }
    let html = '<div class="card"><h3>🏃 今日运动</h3><p class="hint">做完一项点它 = +分立即入账；没做完的，点底部「结算」会统一扣分。临时想起来的直接「➕ 临时加一项」。</p>';
    sports.forEach(function (grp, gi) {
      html += '<div class="card"><h4>' + S().esc(grp.name) +
        (grp.points > 0 ? ' <span style="color:var(--extra);font-size:12px">· 整组全做完再 +' + grp.points + ' 分</span>' : '') + '</h4>';
      (grp.items || []).forEach(function (it, ii) {
        const pts = it.points || DEFAULT_PTS;
        const pen = it.pen != null ? it.pen : pts;
        const st = it.done ? '✅ 已完成 +' + pts + ' 分'
          : (it.settled ? '❌ 没做到 · 已扣 ' + pen + ' 分' : '🕐 还没做（没做扣 ' + pen + ' 分）');
        html += '<div class="sport-item" style="display:flex;align-items:center;gap:8px;padding:9px 2px;border-bottom:1px solid var(--line);cursor:pointer" data-g="' + gi + '" data-i="' + ii + '">' +
          '<span style="flex:0 0 auto">' + (it.done ? '✅' : (it.settled ? '❌' : '⬜')) + '</span>' +
          '<span style="flex:1;color:var(--ink)">' + S().esc(it.text) + '</span>' +
          '<span style="flex:0 0 auto;color:' + (it.done ? 'var(--extra)' : (it.settled ? 'var(--req)' : 'var(--muted)')) + ';font-weight:700">' +
          (it.done ? '+' : (it.settled ? '-' : '+')) + (it.settled ? pen : pts) + '分</span>' +
          '<span style="flex:0 0 auto;font-size:11px;color:var(--muted)">' + st + '</span></div>';
      });
      html += '</div>';
    });
    html += '<div class="btn-row" style="margin-top:10px">' +
      '<button class="btn" id="sport-quick-add">➕ 临时加一项</button>' +
      '<button class="btn btn-primary" id="sport-settle" style="margin-left:6px">🏁 结算今日运动（没做完的扣分）</button></div>' +
      '<button class="btn btn-block" id="sport-clear" style="margin-top:6px">🔄 清空今日运动重新开始</button></div>';
    wrap.innerHTML = html;
    wrap.querySelectorAll('.sport-item').forEach(function (el) {
      el.onclick = function () {
        const grp = sports[+el.dataset.g], it = grp.items[+el.dataset.i];
        if (it.done || it.settled) return;
        it.done = true; it.rewarded = true;
        App.store.addLedger(S().todayKey(), 'sport', { points: it.points || DEFAULT_PTS, note: '🏃 运动完成：' + it.text + '，+' + (it.points || DEFAULT_PTS) + ' 分' });
        if (grp.points > 0 && !grp.groupRewarded && (grp.items || []).every(function (x) { return !!x.done; })) {
          grp.groupRewarded = true;
          App.store.addLedger(S().todayKey(), 'sport', { points: grp.points, note: '🏃 整组「' + grp.name + '」全做完，奖励 +' + grp.points + ' 分' });
        }
        S().save();
        if (App.app && App.app.refreshStats) App.app.refreshStats();
        renderToday();
      };
    });
    const qa = wrap.querySelector('#sport-quick-add');
    if (qa) qa.onclick = quickAddToday;
    const sb = wrap.querySelector('#sport-settle');
    if (sb) sb.onclick = settleToday;
    const cb = wrap.querySelector('#sport-clear');
    if (cb) cb.onclick = function () {
      App.ui.confirm('清空今天的全部运动记录？已入账的积分/扣分不会撤销，只清列表。', '清空', function () {
        day.sports = []; S().save(); renderToday();
      });
    };
  }

  // 今天临时加一项：直接进今天第一组（没有组就建一个「今天临时加的」）
  function quickAddToday() {
    const day = S().getDay(S().todayKey());
    const modal = App.ui.openModal('➕ 今天临时加一项运动',
      '<p style="font-size:12.5px;color:var(--muted);margin-bottom:10px">临时想起来的运动直接加，做完回今日运动点它就 +分。</p>' +
      '<div class="field"><label>运动内容</label><input id="qa-text" style="width:100%;' + INPUT_STYLE + '" placeholder="如：开合跳 100 个" /></div>' +
      '<div class="field-row">' +
      '<div class="field"><label>做完 +分</label><input type="number" id="qa-pts" min="0" value="' + DEFAULT_PTS + '" /></div>' +
      '<div class="field"><label>没做 −分</label><input type="number" id="qa-pen" min="0" value="' + DEFAULT_PTS + '" /></div>' +
      '</div>',
      '<button class="btn btn-primary" data-act="ok">➕ 加进去</button><button class="btn" data-act="cancel">取消</button>');
    const tEl = modal.querySelector('#qa-text');
    if (tEl) tEl.focus();
    App.ui.bindActions({
      ok: function () {
        const t = (modal.querySelector('#qa-text').value || '').trim();
        if (!t) { App.ui.toast('先写运动内容'); return; }
        const p = Math.max(0, +modal.querySelector('#qa-pts').value || DEFAULT_PTS);
        const pen = Math.max(0, +modal.querySelector('#qa-pen').value || p);
        day.sports = day.sports || [];
        if (!day.sports.length) day.sports.push({ id: S().uid(), name: '今天临时加的', points: 0, items: [] });
        day.sports[0].items.push({ id: S().uid(), text: t, points: p, pen: pen });
        S().save();
        App.ui.closeModal();
        renderToday();
        App.ui.toast('已加上「' + t + '」，做完点它 +' + p + ' 分');
      },
      cancel: App.ui.closeModal
    });
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
          const pen = it.pen != null ? it.pen : (it.points || DEFAULT_PTS);
          penalized += pen;
          App.store.addLedger(k, 'sport-cut', { points: -pen, note: '🏃 运动没做到：' + it.text + '，扣 ' + pen + ' 分' });
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

  /* ---------- 安排视图：任选日期（今天/明天/其他）+ 分组编辑 ---------- */
  function renderPlan() {
    const wrap = document.getElementById('sport-plan');
    if (!wrap) return;
    if (!planDayKey) planDayKey = S().tomorrowKey();
    const day = S().getDay(planDayKey);
    const sports = day.sports || [];
    const isToday = planDayKey === S().todayKey();
    const isTomorrow = planDayKey === S().tomorrowKey();

    let html = '<div class="card"><h3>📅 运动安排 · <span style="color:var(--primary)">' + planDateLabel(planDayKey) + '</span></h3>' +
      '<div class="btn-row" style="margin:8px 0">' +
      '<button class="btn btn-small' + (isToday ? ' btn-primary' : '') + '" data-sday="today">今天</button>' +
      '<button class="btn btn-small' + (isTomorrow ? ' btn-primary' : '') + '" data-sday="tomorrow" style="margin-left:6px">明天</button>' +
      '<input type="date" id="sport-plan-date" style="margin-left:6px;' + INPUT_STYLE + '" value="' + planDayKey + '" title="安排其他日期" />' +
      '</div>' +
      '<p class="hint">两步：① 「➕ 新建一组运动」给这组起个名（比如「核心力量」）→ ② 「➕ 这组加一项运动」写具体项目。' +
      '每项可定 做完+分 / 没做−分（默认各 5 分），整组全做完还能加组奖励。' +
      (isToday ? '<b style="color:var(--primary)">正在编辑今天：已做 ✅ / 已扣 ❌ 的记录保存后原样保留，放心改。</b>' : '今晚提前写好，当天直接照着做。') + '</p>';

    (sports && sports.length ? sports : []).forEach(function (grp, gi) {
      html += '<div class="card sport-plan-group" data-g="' + gi + '" data-oid="' + (grp.id || '') + '" style="margin-top:8px">' +
        '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">' +
        '<input class="sport-group-name" style="flex:1;min-width:130px;' + INPUT_STYLE + '" placeholder="组名，如：核心力量" value="' + S().esc(grp.name) + '" />' +
        '<label style="font-size:11px;color:var(--muted)" title="这组全部做完，额外奖励的积分">整组全做完＋</label>' +
        '<input class="sport-group-pts" type="number" min="0" style="width:56px;' + INPUT_STYLE + '" value="' + (grp.points || 0) + '" />' +
        '<span style="font-size:11px;color:var(--muted)">分</span>' +
        '<button class="btn btn-small btn-danger sport-del-g">🗑 删这组</button></div>' +
        '<div class="sport-plan-items" style="margin-top:6px">' +
        '<div style="display:flex;gap:6px;font-size:11px;color:var(--muted);margin-bottom:2px">' +
        '<span style="flex:1">运动内容（做什么、做多少个）</span>' +
        '<span style="width:52px;text-align:center">做完＋分</span>' +
        '<span style="width:52px;text-align:center">没做−分</span>' +
        '<span style="width:36px"></span></div>';
      (grp.items || []).forEach(function (it, ii) {
        html += '<div class="sport-plan-item" style="display:flex;gap:6px;margin:4px 0;align-items:center" data-i="' + ii + '" data-oid="' + (it.id || '') + '">' +
          '<input class="sport-item-text" style="flex:1;' + INPUT_STYLE + '" placeholder="如：深蹲 20 个" value="' + S().esc(it.text) + '" />' +
          '<input class="sport-item-pts" type="number" min="0" style="width:52px;' + INPUT_STYLE + '" title="做完得几分" value="' + (it.points || DEFAULT_PTS) + '" />' +
          '<input class="sport-item-pen" type="number" min="0" style="width:52px;' + INPUT_STYLE + '" title="没做到扣几分" value="' + (it.pen != null ? it.pen : (it.points || DEFAULT_PTS)) + '" />' +
          '<button class="btn btn-small btn-danger sport-del-i" title="删这一项">✕</button></div>';
      });
      html += '<button class="btn btn-small sport-add-item" style="margin-top:4px">➕ 这组加一项运动</button></div></div>';
    });

    html += '<div style="margin-top:10px">' +
      '<button class="btn btn-small" id="sport-add-group">➕ 新建一组运动</button> ' +
      '<button class="btn btn-primary" id="sport-save-plan" style="margin-left:6px">💾 保存' + planDateLabel(planDayKey) + '的运动安排</button></div></div>';
    wrap.innerHTML = html;

    // 日期切换：今天 / 明天 / 自选日期
    wrap.querySelectorAll('[data-sday]').forEach(function (b) {
      b.onclick = function () {
        planDayKey = b.dataset.sday === 'today' ? S().todayKey() : S().tomorrowKey();
        renderPlan();
      };
    });
    const dateInp = wrap.querySelector('#sport-plan-date');
    if (dateInp) dateInp.onchange = function () {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateInp.value)) { App.ui.toast('日期格式不对'); return; }
      planDayKey = dateInp.value;
      renderPlan();
    };

    const addG = wrap.querySelector('#sport-add-group');
    if (addG) addG.onclick = function () {
      sports.push({ id: S().uid(), name: '', points: 0, items: [] });
      renderPlan();
    };
    wrap.querySelectorAll('.sport-add-item').forEach(function (b) {
      b.onclick = function () {
        const gi = +b.closest('.sport-plan-group').dataset.g;
        sports[gi].items = sports[gi].items || [];
        sports[gi].items.push({ id: S().uid(), text: '', points: DEFAULT_PTS, pen: DEFAULT_PTS });
        renderPlan();
        // 新加的行直接聚焦，顺手就能写
        const gEl = wrap.querySelector('.sport-plan-group[data-g="' + gi + '"]');
        const last = gEl ? gEl.querySelector('.sport-plan-item:last-of-type .sport-item-text') : null;
        if (last) last.focus();
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
        // 按 oid 找回旧对象：今天编辑时保留 已做✅/已扣❌/组奖励 等记录，别的日期也不会莫名换 id
        const oldG = (sports || []).find(function (x) { return x.id && x.id === g.dataset.oid; }) || null;
        const name = (g.querySelector('.sport-group-name').value || '').trim() || '运动组';
        const gpts = Math.max(0, parseInt(g.querySelector('.sport-group-pts').value, 10)) || 0;
        const items = [];
        g.querySelectorAll('.sport-plan-item').forEach(function (itEl) {
          const t = itEl.querySelector('.sport-item-text').value.trim();
          const p = Math.max(0, parseInt(itEl.querySelector('.sport-item-pts').value, 10));
          const pen = Math.max(0, parseInt(itEl.querySelector('.sport-item-pen').value, 10));
          if (!t) return; // 空行不保存
          const oldIt = oldG && (oldG.items || []).find(function (x) { return x.id && x.id === itEl.dataset.oid; });
          items.push({
            id: oldIt ? oldIt.id : S().uid(),
            text: t, points: p || DEFAULT_PTS, pen: pen || (p || DEFAULT_PTS),
            done: oldIt ? !!oldIt.done : false,
            rewarded: oldIt ? !!oldIt.rewarded : false,
            settled: oldIt ? !!oldIt.settled : false
          });
        });
        if (items.length) {
          cleaned.push({
            id: oldG ? oldG.id : S().uid(), name: name, points: gpts, items: items,
            groupRewarded: oldG ? !!oldG.groupRewarded : false
          });
        }
      });
      day.sports = cleaned;
      S().save();
      App.ui.toast('已保存 ' + planDateLabel(planDayKey) + ' 的运动安排 ✅');
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
