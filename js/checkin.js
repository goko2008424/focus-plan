/* ============================================================
 * checkin.js — ✅ 每天打卡（v99）
 *
 * 为什么要有它：有些事不是"任务"，是**每天要养成/坚持的小习惯** ——
 * 喝够 2000ml 水、吃保健品、运动一下、几点之前休息。它们不该占"今天要完成几条"的名额，
 * 但应该有地方记、有正反馈（打卡给积分、看连续多少天）。
 *
 * 数据（懒初始化）：
 *   data.checkins = [ { id, text, points, target, note, createdAt,
 *                       days: { '2026-09-22': 1 } } ]     // days[日期] = 那天打了几次
 * 积分走账本（type = 'earn-checkin'），取消打卡会把那一笔撤掉。
 * 🔁 v119：补打卡 —— 最近一周没打满的小圆点直接点就能补（或 ✏️ 编辑里勾选）。
 *    积分照发、记在补的那天，算「那天打了」（连续天数自动接上）；
 *    但补卡永远 ×1，不触发连击倍率（防「想起来一起补 7 天刷倍率」）。未来日期不能补。
 * ============================================================ */
(function () {
  'use strict';

  const App = (window.App = window.App || {});
  const S = function () { return App.store; };
  const esc = function (s) { return S().esc(s); };

  /* ---------- 数据 ---------- */
  function D() {
    const d = S().data(); if (!d) return [];
    if (!Array.isArray(d.checkins)) d.checkins = [];
    return d.checkins;
  }
  function find(id) { return D().filter(function (x) { return x.id === id; })[0] || null; }
  function today() { return S().todayKey(); }
  function keyOf(dt) {
    const z = function (n) { return (n < 10 ? '0' : '') + n; };
    return dt.getFullYear() + '-' + z(dt.getMonth() + 1) + '-' + z(dt.getDate());
  }
  function shiftKey(k, n) {
    const p = String(k || '').split('-');
    const d = new Date(+p[0], (+p[1]) - 1, +p[2]);
    d.setDate(d.getDate() + n);
    return keyOf(d);
  }
  function timesToday(it) { return (it && it.days && it.days[today()]) || 0; }
  function targetOf(it) { return Math.max(1, +it.target || 1); }
  function doneToday(it) { return timesToday(it) >= targetOf(it); }
  /** 连续多少天（今天还没打就从昨天数起，不然一早就显示 0 很打击人） */
  function streakOf(it) {
    if (!it || !it.days) return 0;
    let k = today(), n = 0;
    if (!it.days[k]) k = shiftKey(k, -1);
    while (it.days[k]) { n++; k = shiftKey(k, -1); }
    return n;
  }
  /** 最近 7 天的完成情况（今天在最右） */
  function weekOf(it) {
    const out = [];
    for (let i = 6; i >= 0; i--) {
      const k = shiftKey(today(), -i);
      out.push({ k: k, on: !!(it.days && it.days[k]), times: (it.days && it.days[k]) || 0 });
    }
    return out;
  }
  function save() { S().save(); try { App.app.refreshStats && App.app.refreshStats(); } catch (e) { /* 忽略 */ } }

  /* ---------- 🔥 v108：长期打卡的连击奖励 ----------
     用户：「你长期打卡的话，实际上是有一些奖励…比如说，你连续打7天的话，最后一天那个奖励翻倍，
            然后每周都是这个样子。然后，你如果持续一个月的话，那么就是翻4倍，像是这个样子。」

     口径（跟用户对齐过的那种"越坚持越值钱"）：
       · **连击按"全局连续打卡天数"算** —— 那天只要打过任意一项，就算这一天打了卡（跟"一年打卡多少天"同一套口径）
       · 倍率分档：连续 7 天起 ×2、30 天起 ×4、60 天起 ×6、90 天起 ×8（一档一档往上涨，断一天就回 ×1）
       · **只有"每天第一次打卡"吃倍率** —— 连击奖励是奖励"你今天来了"，不是奖励多刷几次
     ⚠️ 想改档位只动 multOf() 这一张表就行。 */
  const MULT_TABLE = [[7, 2], [30, 4], [60, 6], [90, 8]];   // [连续满多少天, 倍率]
  function multOf(cs) {
    let m = 1;
    for (let i = 0; i < MULT_TABLE.length; i++) if (cs >= MULT_TABLE[i][0]) m = MULT_TABLE[i][1];
    return m;
  }
  /** 全局"哪天打过卡"：{ '2026-09-22': 当天总次数 } */
  function dayMap() {
    const s = {};
    D().forEach(function (it) {
      Object.keys(it.days || {}).forEach(function (k) {
        const n = it.days[k] || 0;
        if (n > 0) s[k] = (s[k] || 0) + n;
      });
    });
    return s;
  }
  /** 全局连续打卡天数（今天还没打就从昨天数起，不然一早显示 0 很打击人） */
  function streakAll() {
    const s = dayMap();
    let k = today(), n = 0;
    if (!s[k]) k = shiftKey(k, -1);
    while (s[k]) { n++; k = shiftKey(k, -1); }
    return n;
  }
  /** 算上今天之后的连续天数（今天打了就接上，没打就算"打了会变成几天"） */
  function streakWithToday() {
    const s = dayMap();
    return s[today()] ? streakAll() : streakAll() + 1;
  }
  function timesTodayAll() { let n = 0; D().forEach(function (it) { n += timesToday(it); }); return n; }
  /** 下一次打卡能拿到的倍率（今天已经打过就只剩 ×1） */
  function nextMult() { return timesTodayAll() > 0 ? 1 : multOf(streakWithToday()); }
  /** 倍率说明（给界面用）：下一档还差几天 */
  function nextTierHint() {
    const cs = streakWithToday();
    for (let i = 0; i < MULT_TABLE.length; i++) {
      if (cs < MULT_TABLE[i][0]) return { need: MULT_TABLE[i][0] - cs, mult: MULT_TABLE[i][1] };
    }
    return null;
  }

  /* ---------- 📊 v108：年度统计（一年打卡多少天） ---------- */
  const pad2 = function (n) { return (n < 10 ? '0' : '') + n; };
  function yearOf(k) { return +String(k).slice(0, 4); }
  function yearsWithData() {
    const ys = {};
    const s = dayMap();
    Object.keys(s).forEach(function (k) { if (s[k] > 0) ys[yearOf(k)] = true; });
    const arr = Object.keys(ys).map(Number).sort(function (a, b) { return b - a; });
    return arr;
  }
  function yearStats(y) {
    const s = dayMap();
    const keys = Object.keys(s).filter(function (k) { return yearOf(k) === y && s[k] > 0; }).sort();
    const months = [];
    for (let m = 0; m < 12; m++) months.push({ days: 0, times: 0 });
    let times = 0, maxStreak = 0, run = 0, prev = '';
    keys.forEach(function (k) {
      const n = s[k];
      times += n;
      const m = (+String(k).slice(5, 7)) - 1;
      if (months[m]) { months[m].days++; months[m].times += n; }
      if (prev && shiftKey(prev, 1) === k) run++; else run = 1;
      if (run > maxStreak) maxStreak = run;
      prev = k;
    });
    return { year: y, days: keys.length, times: times, maxStreak: maxStreak, months: months, map: s };
  }
  let yearSel = null;   // 📊 年度卡看的是哪一年（默认今年，可左右翻）
  function yearCardHTML() {
    const ys = yearsWithData();
    const thisYear = new Date().getFullYear();
    // 📅 v108：允许往前翻最近 5 年（空年份也要能看 —— "去年几乎没打"本身就是有用的信息），但不给看未来
    const minY = thisYear - 4;
    if (yearSel == null) yearSel = thisYear;
    if (yearSel > thisYear) yearSel = thisYear;
    if (yearSel < minY) yearSel = minY;
    const st = yearStats(yearSel);
    const kToday = today();
    let rows = '';
    for (let m = 0; m < 12; m++) {
      const daysIn = new Date(yearSel, m + 1, 0).getDate();
      let cells = '';
      for (let d = 1; d <= daysIn; d++) {
        const k = yearSel + '-' + pad2(m + 1) + '-' + pad2(d);
        const n = st.map[k] || 0;
        const future = k > kToday;
        const lv = n <= 0 ? 0 : (n >= 3 ? 3 : (n >= 2 ? 2 : 1));
        cells += '<span class="ck-cell lv' + lv + (future ? ' future' : '') + (k === kToday ? ' today' : '') +
          '" title="' + k + (future ? '（还没到）' : '：' + (n ? n + ' 次' : '没打卡')) + '"></span>';
      }
      const mm = st.months[m];
      rows += '<div class="ck-yrow"><span class="ck-ymon">' + (m + 1) + '月</span>' +
        '<span class="ck-ycells">' + cells + '</span>' +
        '<span class="ck-ymsum">' + (mm.days ? mm.days + ' 天' : '—') + '</span></div>';
    }
    const hint = nextTierHint();
    return '<div class="card">' +
      '<h2>📊 打卡统计' +
      '<span class="ck-yhead">' +
      '<button class="q-ib" data-act="ck-y-prev" title="上一年"' + (yearSel <= thisYear - 4 ? ' disabled style="opacity:.35"' : '') + '>‹</button>' +
      '<b>' + yearSel + '</b>' +
      '<button class="q-ib" data-act="ck-y-next" title="下一年"' + (yearSel >= thisYear ? ' disabled style="opacity:.35"' : '') + '>›</button>' +
      '</span></h2>' +
      '<div class="ck-ystats">' +
      '<span>这一年打卡 <b>' + st.days + '</b> 天</span>' +
      '<span>共 <b>' + st.times + '</b> 次</span>' +
      '<span>最长连续 <b>' + st.maxStreak + '</b> 天</span>' +
      '<span>当前连续 <b>' + streakAll() + '</b> 天</span>' +
      '</div>' +
      '<p class="hint" style="margin-top:-2px">所有打卡项合起来算：<b>那天只要打过任意一项，就算一天</b>。' +
      '格子颜色越深 = 那天打得越多（超过 2 次就到顶）。<b>以后的日子留白</b>，还没到不算。' +
      (hint ? '<br>🔥 连击：再连续 <b>' + hint.need + '</b> 天，每天第一次打卡就是 <b>×' + hint.mult + '</b>。' :
        '<br>🔥 连击已经到顶（×' + multOf(streakWithToday()) + '）—— 保持住！') +
      '</p>' +
      rows +
      '</div>';
  }

  /* ---------- 打卡 / 取消 ---------- */
  function punch(id) {
    const it = find(id); if (!it) return;
    const k = today();
    if (!it.days) it.days = {};
    const n = (it.days[k] || 0) + 1;
    const tg = targetOf(it);
    if (n > tg) { App.ui.toast('今天已经打满 ' + tg + ' 次啦'); return; }
    // 🔥 v108：今天第一次打卡 → 吃连击倍率（多刷的不加，免得刷分）
    const mult = timesTodayAll() === 0 ? multOf(streakWithToday()) : 1;
    it.days[k] = n;
    const base = Math.max(0, +it.points || 0);
    const pts = base * mult;
    if (pts > 0) {
      S().addLedger(k, 'earn-checkin', {
        points: pts, taskId: it.id,
        note: '✅ 打卡：' + it.text + (mult > 1 ? '（连击 ×' + mult + '）' : '')
      });
    }
    save(); render();
    const stAll = streakAll();
    App.ui.toast('✅ ' + it.text.slice(0, 12) + ' +' + pts + ' 分' +
      (mult > 1 ? '（🔥 连击 ×' + mult + '）' : '') +
      (tg > 1 ? '（今天 ' + n + '/' + tg + '）' : '') +
      (stAll > 1 ? ' · 连续打卡 ' + stAll + ' 天' : ''), 4200);
  }
  function unpunch(id) {
    const it = find(id); if (!it) return;
    const k = today();
    const n = (it.days && it.days[k]) || 0;
    if (!n) return;
    if (n > 1) { it.days[k] = n - 1; }
    else { delete it.days[k]; }
    // 撤掉今天这笔积分
    try {
      const led = S().ledger();
      for (let i = led.length - 1; i >= 0; i--) {
        if (led[i].type === 'earn-checkin' && led[i].taskId === id && led[i].date === k) {
          S().undoLastLedger(led[i].id);
          break;
        }
      }
    } catch (e) { /* 忽略 */ }
    save(); render();
    App.ui.toast('↩ 撤销了今天一次：' + it.text.slice(0, 12));
  }

  /* ---------- 🔁 v119：补打卡 ----------
     用户：「可不可以加一个补打卡？」—— 忘了打的卡要能补。
     口径（AGENTS.md 待办里对齐过的）：
       · 入口两个：① 最近 7 天的小圆点直接点（过去且没打满的 = 补那天）
                   ② ✏️ 编辑弹窗里列最近 6 天勾选（今天的卡用页面上那个按钮打）
       · 补卡走同一账本 earn-checkin，积分照发（记在补的那天，不扣）
       · 补卡算「那天打了」（days[日期] 落了就是打了 → 连续天数自动接上）
       · 🔴 但补卡永远 ×1 —— 倍率只给「真实打卡那次」，防「想起来一起补 7 天刷倍率」
       · 未来日期不能补（还没到的日子不存在「忘了打」） */
  function makeupCore(it, k) {
    const t = today();
    if (!k || k >= t) return '未来的日子不能补 —— 还没到的不存在「忘了打」';
    if (k < shiftKey(t, -6)) return '只能补最近一周的卡，更早的就翻篇啦';
    if (!it.days) it.days = {};
    const tg = targetOf(it);
    const cur = it.days[k] || 0;
    if (cur >= tg) return '那天已经打满 ' + tg + ' 次啦';
    it.days[k] = cur + 1;
    const base = Math.max(0, +it.points || 0);
    if (base > 0) {
      S().addLedger(k, 'earn-checkin', {
        points: base, taskId: it.id,
        note: '✅ 补卡：' + it.text + '（补 ' + k.slice(5).replace('-', '/') + ' 的卡）'
      });
    }
    return null;
  }
  function makeupPunch(id, k) {
    const it = find(id); if (!it) return;
    const err = makeupCore(it, k);
    if (err) { App.ui.toast('⚠️ ' + err); return; }
    save(); render();
    App.ui.toast('✅ 补了 ' + k.slice(5).replace('-', '/') + ' 的卡：' + it.text.slice(0, 12) +
      ' +' + Math.max(0, +it.points || 0) + ' 分（记在那天 · 不吃连击倍率）', 4200);
  }

  /* ---------- 弹窗：加 / 改 ---------- */
  function editModal(id) {
    const it = id ? find(id) : null;
    const isNew = !it;
    const v = it || { text: '', points: 5, target: 1, note: '' };
    // 🔁 v119：编辑已有项时，列最近 6 天补卡勾选（今天除外 —— 今天的卡用页面按钮打）
    let mkHTML = '';
    if (!isNew) {
      const tg0 = targetOf(it);
      let rows = '';
      for (let i = 6; i >= 1; i--) {
        const k = shiftKey(today(), -i);
        const n = (it.days && it.days[k]) || 0;
        const full = n >= tg0;
        rows += '<label class="ck-mk-row' + (full ? ' full' : '') + '">' +
          '<input type="checkbox" class="ck-mk" data-day="' + k + '"' + (full ? ' disabled' : '') + ' />' +
          '<span class="ck-mk-day">' + k.slice(5).replace('-', '/') + '</span>' +
          '<span class="ck-mk-st">' + (full ? '✅ 已打满' : (n ? '打过 ' + n + '/' + tg0 + '，还能补' : '没打')) + '</span>' +
          '</label>';
      }
      mkHTML = '<div class="field"><label>🔁 漏打了？勾上就补那张卡（积分照发记在那天 · 不触发连击倍率）</label>' +
        '<div class="ck-mk-list">' + rows + '</div></div>';
    }
    const modal = App.ui.openModal(isNew ? '✅ 加一个打卡项' : '✏️ 改打卡项',
      '<p class="hint" style="margin-top:0">每天要养成的小习惯 —— 喝水、保健品、运动、几点休息都行。' +
      '打一次卡得一次分，也能看连续了多少天。</p>' +
      '<div class="field"><label>打卡项（想坚持的事）</label>' +
      '<input id="ck-text" type="text" value="' + esc(v.text) + '" placeholder="比如：喝水 2000ml / 运动 20 分钟 / 23:30 前躺下" /></div>' +
      '<div class="field-row">' +
      '<div class="field"><label>打卡一次得多少分</label>' +
      '<input id="ck-points" type="number" min="0" value="' + (v.points == null ? 5 : v.points) + '" /></div>' +
      '<div class="field"><label>一天要打几次（默认 1）</label>' +
      '<input id="ck-target" type="number" min="1" value="' + (v.target || 1) + '" /></div>' +
      '</div>' +
      '<div class="field"><label>备注（选填，写给自己）</label>' +
      '<input id="ck-note" type="text" value="' + esc(v.note || '') + '" placeholder="比如：分 4 次喝，每次 500ml" /></div>' + mkHTML,
      '<button class="btn btn-primary" data-act="ok">' + (isNew ? '加好' : '保存') + '</button>' +
      '<button class="btn" data-act="cancel">取消</button>');
    App.ui.bindActions({
      ok: function () {
        const t = (modal.querySelector('#ck-text').value || '').trim();
        if (!t) { App.ui.toast('先写个名字'); return; }
        const pts = Math.max(0, +modal.querySelector('#ck-points').value || 0);
        const tg = Math.max(1, +modal.querySelector('#ck-target').value || 1);
        const nt = (modal.querySelector('#ck-note').value || '').trim();
        if (isNew) {
          D().push({
            id: S().uid(), text: t, points: pts, target: tg, note: nt,
            days: {}, createdAt: new Date().toISOString()
          });
        } else {
          it.text = t; it.points = pts; it.target = tg; it.note = nt;
        }
        // 🔁 v119：勾了的补卡一起落账（积分照发记在那天 · 永远 ×1）
        const mks = [];
        modal.querySelectorAll('.ck-mk:checked:not(:disabled)').forEach(function (c) {
          mks.push(c.dataset.day);
        });
        const mkBad = [];
        mks.forEach(function (k) { const e = makeupCore(it, k); if (e) mkBad.push(k + '：' + e); });
        save(); render();
        App.ui.closeModal();
        App.ui.toast((isNew ? '✅ 加好了：' + t.slice(0, 14) : '改好了') +
          (mks.length ? ' · 补卡 ' + (mks.length - mkBad.length) + '/' + mks.length + ' 张' +
          (mkBad.length ? '（' + mkBad[0] + '）' : '') : ''), 4200);
      },
      cancel: function () { App.ui.closeModal(); }
    });
  }

  /* ---------- 渲染 ---------- */
  function rowHTML(it) {
    const n = timesToday(it), tg = targetOf(it), done = doneToday(it), st = streakOf(it);
    // 🔥 v108：这是今天第一次打卡时，按钮上直接写明"连击后到手多少分"
    const firstToday = timesTodayAll() === 0;
    const mult = firstToday ? multOf(streakWithToday()) : 1;
    const gain = Math.max(0, +it.points || 0) * mult;
    const kToday = today();
    const wk = weekOf(it).map(function (w) {
      const on = w.times > 0;
      const full = w.times >= tg;
      // 🔁 v119：过去且没打满的圆点 → 直接点就是补卡（今天/未来不在其列）
      if (w.k < kToday && !full) {
        return '<span class="ck-dot makeup" data-act="ck-makeup" data-id="' + it.id + '" data-day="' + w.k +
          '" title="' + w.k + '：' + (w.times ? w.times + ' 次，点一下再补一次' : '没打，点一下补这张卡') +
          '（积分照发 · 不触发连击倍率）"></span>';
      }
      return '<span class="ck-dot' + (full ? ' on' : (on ? ' half' : '')) + '" title="' + w.k + '：' +
        (w.times ? w.times + ' 次' : '没打') + '"></span>';
    }).join('');
    return '<div class="ck-row' + (done ? ' done' : '') + '" data-id="' + it.id + '">' +
      '<div class="ck-main">' +
      '<div class="ck-name">' + esc(it.text) +
      (tg > 1 ? ' <span class="ck-cnt">' + n + '/' + tg + '</span>' : '') +
      (st > 1 ? '<span class="ck-streak">🔥 这项连续 ' + st + ' 天</span>' : '') +
      (yearDaysOf(it) > 0 ? '<span class="ck-year">今年 ' + yearDaysOf(it) + ' 天</span>' : '') + '</div>' +
      (it.note ? '<div class="ck-note">' + esc(it.note) + '</div>' : '') +
      '<div class="ck-week">' + wk + '</div>' +
      '</div>' +
      '<span class="ck-acts">' +
      (done
        ? '<button class="btn btn-small" data-act="ck-undo" data-id="' + it.id + '" title="撤销今天一次">↩ 撤销</button>'
        : '<button class="btn btn-small btn-primary" data-act="ck-punch" data-id="' + it.id + '">✅ 打卡' +
          (it.points ? ' +' + gain : '') + (mult > 1 ? '（×' + mult + '）' : '') + '</button>') +
      '<button class="q-ib" data-act="ck-edit" data-id="' + it.id + '" title="改">✏️</button>' +
      '<button class="q-ib" data-act="ck-del" data-id="' + it.id + '" title="删掉">🗑</button>' +
      '</span></div>';
  }

  /** 这一项在今年打了多少天（行里显示用） */
  function yearDaysOf(it) {
    const y = String(new Date().getFullYear());
    let n = 0;
    Object.keys(it.days || {}).forEach(function (k) { if (k.indexOf(y + '-') === 0 && it.days[k] > 0) n++; });
    return n;
  }

  function pageHTML() {
    const list = D();
    const k = today();
    const doneN = list.filter(doneToday).length;
    let ptsToday = 0;
    try {
      S().ledger().forEach(function (e) {
        if (e.type === 'earn-checkin' && e.date === k) ptsToday += (e.points || 0);
      });
    } catch (e) { /* 忽略 */ }

    let h = '<div class="card">' +
      '<h2>✅ 每天打卡</h2>' +
      '<p class="hint" style="margin-top:-2px">想养成的小习惯放这儿 —— <b>喝水、保健品、运动、几点休息</b>都行。' +
      '打一次卡得一次分，下面那 7 个小点是最近一周（今天在最右），还能看连续了多少天。<br>' +
      '🔁 <b>漏打了能补（v119）</b>：最近一周里<b>没打满的小圆点直接点一下就是补卡</b>（积分照发、记在那天，' +
      '不触发连击倍率），或在 ✏️ 编辑里勾选补卡；<b>未来的日子不能补</b>。<br>' +
      '⚠️ 它<b>不算进「必须 x/x」的完成率</b>，也不占队列 —— 就是给自己的一个正反馈。' +
      '<br>🔥 <b>长期打卡有奖励</b>：连续 7 天起、每天第一次打卡 <b>×2</b>；满 30 天 <b>×4</b>；满 60 天 <b>×6</b>；满 90 天 <b>×8</b>（断一天回 ×1）。' +
      (list.length
        ? '<br>今天：<b>' + doneN + '/' + list.length + '</b>' +
          (streakAll() > 0 ? ' · 连续打卡 <b>' + streakAll() + '</b> 天' + (multOf(streakAll()) > 1 ? '（今天第一次打卡 <b>×' + multOf(streakAll()) + '</b>）' : '') : '') +
          (ptsToday ? ' · 打卡已得 <b>' + ptsToday + '</b> 分' : '')
        : '') +
      '</p>' +
      '<div class="mc-acts" style="margin-bottom:10px">' +
      '<button class="btn btn-small" data-act="ck-add">＋ 加一个打卡项</button>' +
      '</div>';

    if (!list.length) {
      h += '<div class="q-empty">还没有。<br>想坚持什么事？加一条，每天来点一下 —— 比如「喝水 2000ml」「23:30 前躺下」。</div>';
    } else {
      h += list.map(rowHTML).join('');
    }
    h += '</div>';
    h += yearCardHTML();      // 📊 v108：年度统计（一年打卡多少天）
    return h;
  }

  function render() {
    const el = document.getElementById('checkin-view');
    if (el) el.innerHTML = pageHTML();
  }

  function onClick(e) {
    const b = e.target.closest ? e.target.closest('[data-act]') : null;
    if (!b) return;
    const act = b.dataset.act, id = b.dataset.id;
    if (act === 'ck-add') { editModal(null); return; }
    if (act === 'ck-y-prev') { yearSel = (yearSel || new Date().getFullYear()) - 1; render(); return; }
    if (act === 'ck-y-next') { yearSel = (yearSel || new Date().getFullYear()) + 1; render(); return; }
    if (act === 'ck-edit') { editModal(id); return; }
    if (act === 'ck-punch') { punch(id); return; }
    if (act === 'ck-makeup') { makeupPunch(id, b.dataset.day); return; }
    if (act === 'ck-undo') { unpunch(id); return; }
    if (act === 'ck-del') {
      const it = find(id); if (!it) return;
      App.ui.confirm('删掉打卡项「<b>' + esc(it.text) + '</b>」？<br>' +
        '<span class="hint">以前打过的记录也一起没了（已经拿到的积分不退）。</span>', '删掉', function () {
        const i = D().findIndex(function (x) { return x.id === id; });
        if (i >= 0) D().splice(i, 1);
        save(); render();
        App.ui.toast('🗑 删掉了');
      });
      return;
    }
  }

  function init() {
    const el = document.getElementById('checkin-view');
    if (el) el.addEventListener('click', onClick);
    render();
  }

  App.checkin = {
    init: init,
    render: render,
    pageHTML: pageHTML,
    punch: punch,
    unpunch: unpunch,
    streakOf: streakOf,
    doneToday: doneToday,
    // 🔁 v119：补打卡（也给测试用）
    makeupPunch: makeupPunch, makeupCore: makeupCore, timesTodayAll: timesTodayAll,
    // 🔥 v108：连击与年度统计（也给测试/别处用）
    multOf: multOf, streakAll: streakAll, streakWithToday: streakWithToday,
    nextMult: nextMult, dayMap: dayMap, yearStats: yearStats, yearsWithData: yearsWithData,
    countDone: function () { return D().filter(doneToday).length; },
    countAll: function () { return D().length; }
  };
})();
