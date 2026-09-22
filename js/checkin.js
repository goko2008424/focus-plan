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

  /* ---------- 打卡 / 取消 ---------- */
  function punch(id) {
    const it = find(id); if (!it) return;
    const k = today();
    if (!it.days) it.days = {};
    const n = (it.days[k] || 0) + 1;
    const tg = targetOf(it);
    if (n > tg) { App.ui.toast('今天已经打满 ' + tg + ' 次啦'); return; }
    it.days[k] = n;
    const pts = Math.max(0, +it.points || 0);
    if (pts > 0) {
      S().addLedger(k, 'earn-checkin', { points: pts, note: '✅ 打卡：' + it.text, taskId: it.id });
    }
    save(); render();
    App.ui.toast('✅ ' + it.text.slice(0, 12) + ' +' + pts + ' 分' +
      (tg > 1 ? '（今天 ' + n + '/' + tg + '）' : '') +
      (streakOf(it) > 1 ? ' · 连续 ' + streakOf(it) + ' 天 🔥' : ''), 3600);
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

  /* ---------- 弹窗：加 / 改 ---------- */
  function editModal(id) {
    const it = id ? find(id) : null;
    const isNew = !it;
    const v = it || { text: '', points: 5, target: 1, note: '' };
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
      '<input id="ck-note" type="text" value="' + esc(v.note || '') + '" placeholder="比如：分 4 次喝，每次 500ml" /></div>',
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
        save(); render();
        App.ui.closeModal();
        App.ui.toast(isNew ? '✅ 加好了：' + t.slice(0, 14) : '改好了');
      },
      cancel: function () { App.ui.closeModal(); }
    });
  }

  /* ---------- 渲染 ---------- */
  function rowHTML(it) {
    const n = timesToday(it), tg = targetOf(it), done = doneToday(it), st = streakOf(it);
    const wk = weekOf(it).map(function (w) {
      const on = w.times > 0;
      const full = w.times >= tg;
      return '<span class="ck-dot' + (full ? ' on' : (on ? ' half' : '')) + '" title="' + w.k + '：' +
        (w.times ? w.times + ' 次' : '没打') + '"></span>';
    }).join('');
    return '<div class="ck-row' + (done ? ' done' : '') + '" data-id="' + it.id + '">' +
      '<div class="ck-main">' +
      '<div class="ck-name">' + esc(it.text) +
      (tg > 1 ? ' <span class="ck-cnt">' + n + '/' + tg + '</span>' : '') +
      (st > 1 ? '<span class="ck-streak">🔥 连续 ' + st + ' 天</span>' : '') + '</div>' +
      (it.note ? '<div class="ck-note">' + esc(it.note) + '</div>' : '') +
      '<div class="ck-week">' + wk + '</div>' +
      '</div>' +
      '<span class="ck-acts">' +
      (done
        ? '<button class="btn btn-small" data-act="ck-undo" data-id="' + it.id + '" title="撤销今天一次">↩ 撤销</button>'
        : '<button class="btn btn-small btn-primary" data-act="ck-punch" data-id="' + it.id + '">✅ 打卡' +
          (it.points ? ' +' + it.points : '') + '</button>') +
      '<button class="q-ib" data-act="ck-edit" data-id="' + it.id + '" title="改">✏️</button>' +
      '<button class="q-ib" data-act="ck-del" data-id="' + it.id + '" title="删掉">🗑</button>' +
      '</span></div>';
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
      '⚠️ 它<b>不算进「必须 x/x」的完成率</b>，也不占队列 —— 就是给自己的一个正反馈。' +
      (list.length ? '<br>今天：<b>' + doneN + '/' + list.length + '</b>' + (ptsToday ? ' · 打卡已得 <b>' + ptsToday + '</b> 分' : '') : '') +
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
    if (act === 'ck-edit') { editModal(id); return; }
    if (act === 'ck-punch') { punch(id); return; }
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
    countDone: function () { return D().filter(doneToday).length; },
    countAll: function () { return D().length; }
  };
})();
