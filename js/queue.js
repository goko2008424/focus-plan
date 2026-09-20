/* ============================================================
 * queue.js — 📋 队列（按顺序做，没有完成率）+ 📌 每日必做（v77）
 *
 * 为什么要这一页：「每天要完成 N 条」这个指标本身在制造挫败感 ——
 * 只要分母在，每天都会得出「没完成」。所以这里刻意不显示完成率，
 * 只告诉你「现在这一条是什么」，做完下一条自动顶上。
 *
 * 数据结构（懒初始化，老数据不用迁移）：
 *   data.queue      = [ {id,text,note,createdAt} ]        数组顺序 = 执行顺序
 *   data.queueDone  = [ {id,text,note,doneDay,doneAt} ]   已完成，可「↻ 放回队列」
 *   data.daily      = [ {id,text,days:{'2026-09-20':ts}} ] 每日必做
 * ============================================================ */
(function () {
  'use strict';

  const App = (window.App = window.App || {});
  const S = function () { return App.store; };
  const esc = function (s) { return S().esc(s); };

  let showDone = false;

  /* ---------- 数据存取 ---------- */
  function Q() {
    const d = S().data(); if (!d) return [];
    if (!Array.isArray(d.queue)) d.queue = [];
    return d.queue;
  }
  function QD() {
    const d = S().data(); if (!d) return [];
    if (!Array.isArray(d.queueDone)) d.queueDone = [];
    return d.queueDone;
  }
  function DY() {
    const d = S().data(); if (!d) return [];
    if (!Array.isArray(d.daily)) d.daily = [];
    return d.daily;
  }

  function current() { return Q()[0] || null; }
  function findIn(list, id) {
    return list.filter(function (x) { return x.id === id; })[0] || null;
  }
  function idxOf(list, id) {
    return list.findIndex(function (x) { return x.id === id; });
  }
  function dDone(it, k) { return !!(it.days && it.days[k]); }

  /** 每日必做：连续做了几天（今天还没做就从昨天往前数） */
  function dStreak(it) {
    const days = it.days || {};
    const today = S().todayKey();
    let t = S().keyToDate(today).getTime();
    if (!days[today]) t -= 86400000;
    let n = 0;
    while (n < 999) {
      if (!days[S().dateKey(new Date(t))]) break;
      n++;
      t -= 86400000;
    }
    return n;
  }

  /* ---------- 写操作 ---------- */
  function addItem(text, note) {
    const it = { id: S().uid(), text: text, note: note || '', createdAt: new Date().toISOString() };
    Q().push(it);
    S().save();
    return it;
  }

  function addDaily(text) {
    const it = { id: S().uid(), text: text, days: {}, createdAt: new Date().toISOString() };
    DY().push(it);
    S().save();
    return it;
  }

  function moveItem(id, dir) {
    const list = Q();
    const i = idxOf(list, id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= list.length) return false;
    const t = list[i]; list[i] = list[j]; list[j] = t;
    S().save();
    return true;
  }

  function moveToEnd(id) {
    const list = Q();
    const i = idxOf(list, id);
    if (i < 0 || i === list.length - 1) return;
    list.push(list.splice(i, 1)[0]);
    S().save();
  }

  /** 做完一条：从队列挪到「已完成」，记下今天、发积分，然后问一句要不要进每日必做 */
  function finish(id) {
    const list = Q();
    const i = idxOf(list, id);
    if (i < 0) return;
    const it = list.splice(i, 1)[0];
    it.doneDay = S().todayKey();
    it.doneAt = new Date().toISOString();
    QD().unshift(it);

    const pts = +((S().settings() || {}).queuePoints == null ? 5 : S().settings().queuePoints) || 0;
    if (pts > 0) {
      S().addLedger(S().todayKey(), 'earn-queue', { points: pts, note: '📋 队列完成：' + it.text });
    }
    S().save();
    render();

    const nxt = current();
    App.ui.toast('✅ 做完了' + (pts > 0 ? '（+' + pts + ' 分）' : '') +
      (nxt ? ' · 下一条顶上来了' : ' · 队列空了'), 3400);
    askAfterDone(it);
  }

  function askAfterDone(it) {
    App.ui.openModal('✅ 做完了 · 这条以后怎么处理？',
      '<p class="hint" style="margin-top:0">「<b>' + esc(it.text) + '</b>」已经做完了（记在今天、进了「已完成」）。</p>' +
      '<p class="hint" style="margin-top:2px">📌 = 以后天天/定期看（复习、要背的）｜📅 = 过几天再做一次（错题、卷子）<br>' +
      '什么都不选也行 —— 它就留在「已完成」里。</p>',
      '<button class="btn btn-primary" data-act="daily">📌 加进「每日必做」</button>' +
      '<button class="btn" data-act="sched">📅 安排到某天再做</button>' +
      '<button class="btn" data-act="none">不用了</button>');
    App.ui.bindActions({
      daily: function () {
        App.ui.closeModal();
        addDaily(it.text);
        render();
        App.ui.toast('已加进「每日必做」📌');
      },
      sched: function () {
        App.ui.closeModal();
        schedModal(it.text, 'queueDone', it.id);
      },
      none: function () { App.ui.closeModal(); }
    });
  }

  function dToggle(id) {
    const it = findIn(DY(), id);
    if (!it) return;
    if (!it.days) it.days = {};
    const k = S().todayKey();
    if (it.days[k]) delete it.days[k]; else it.days[k] = Date.now();
    S().save();
    render();
  }

  /* ---------- 📅 安排到某一天（v78）----------
     复用日历那套 copyTaskToDay —— 安排过去的就是一条**普通任务**，
     落在那天的「必须 / 理想 / 拓展」某一栏，日历里点开那天就能看到、能改期。
     队列 / 已完成 / 每日必做 都走这一个弹窗。 */
  function addDays(k, n) {
    const p = String(k).split('-');
    const d = new Date(+p[0], +p[1] - 1, +p[2]);
    d.setDate(d.getDate() + n);
    return S().dateKey(d);
  }
  function dayLabel(k) {
    if (k === S().todayKey()) return '今天';
    if (k === S().tomorrowKey()) return '明天';
    return S().shortDateCN(k);
  }
  function colOptions(cur) {
    return [['required', '✅ 必须'], ['ideal', '⭐ 理想'], ['extra', '🌱 拓展']].map(function (c) {
      return '<option value="' + c[0] + '"' + (c[0] === cur ? ' selected' : '') + '>' + c[1] + '</option>';
    }).join('');
  }
  /** 从来源里彻底移除（队列 / 已完成 / 每日必做） */
  function removeFromSrc(kind, id) {
    const list = kind === 'daily' ? DY() : (kind === 'queueDone' ? QD() : Q());
    const i = idxOf(list, id);
    if (i >= 0) list.splice(i, 1);
  }

  function schedModal(text, kind, id) {
    const srcName = kind === 'daily' ? '「每日必做」' : (kind === 'queueDone' ? '「已完成」' : '「队列」');
    let pickKey = addDays(S().todayKey(), 3);
    let targetCol = 'required';
    let delSrc = true;   // 默认把这条从原处删掉 —— 不删就变成"两处都有"
    const modal = App.ui.openModal('📅 安排到某一天 · ' + esc(text).slice(0, 12),
      '<p class="hint" style="margin-top:0">把这条<b>排到某一天去做</b>。到那天它就在<b>日历</b>和那天的任务清单里' +
      '（跟日历里 🔁 那套是同一个地方，之后也能再改期）。</p>' +
      '<div class="field"><label>哪一天做</label>' +
      '<input type="date" id="q-sch-date" value="' + pickKey + '" style="width:180px" /></div>' +
      '<div class="field"><label>放到哪一栏</label>' +
      '<select id="q-sch-col" style="width:180px">' + colOptions(targetCol) + '</select></div>' +
      '<div class="field"><label>标准：要做到什么程度（选填，如：全对 / 8 分钟内解出）</label>' +
      '<input type="text" id="q-sch-std" style="width:100%" placeholder="写清楚标准，那天做的时候才知道够不够格" /></div>' +
      '<label style="display:flex;gap:8px;align-items:center;font-size:13.5px;cursor:pointer;margin-top:4px">' +
      '<input type="checkbox" id="q-sch-rm"' + (delSrc ? ' checked' : '') + ' style="width:16px;height:16px" /> ' +
      '同时把这条从 ' + srcName + ' 里<b>删掉</b>（不勾 = 两边都留一份）</label>',
      '<button class="btn btn-primary" data-act="ok">✔ 安排到 ' + dayLabel(pickKey) + '</button>' +
      '<button class="btn" data-act="cancel">取消</button>');
    const dateEl = modal.querySelector('#q-sch-date');
    const okBtn = modal.querySelector('[data-act="ok"]');
    dateEl.onchange = function () {
      pickKey = dateEl.value || pickKey;
      okBtn.textContent = '✔ 安排到 ' + dayLabel(pickKey);
    };
    const colEl = modal.querySelector('#q-sch-col');
    if (colEl) colEl.onchange = function () { targetCol = colEl.value || 'required'; };
    const rmEl = modal.querySelector('#q-sch-rm');
    if (rmEl) rmEl.onchange = function () { delSrc = rmEl.checked; };
    App.ui.bindActions({
      ok: function () {
        const std = (modal.querySelector('#q-sch-std').value || '').trim();
        if (dateEl.value) pickKey = dateEl.value;
        if (pickKey < S().todayKey()) { App.ui.toast('目标日期在过去啦，往后面挑一天'); return; }
        if (!App.calendar || !App.calendar.copyTaskToDay) { App.ui.toast('日历模块没加载，先刷新一下'); return; }
        const n = App.calendar.copyTaskToDay({ text: text }, 'required', pickKey, std, false, targetCol);
        if (!n) { App.ui.toast('那一天已经有一条同名任务了，没重复安排'); return; }
        if (delSrc) removeFromSrc(kind, id);
        S().save();
        App.ui.closeModal();
        render();
        App.ui.toast('📅 已安排到 ' + dayLabel(pickKey) + '：' + text.slice(0, 14) +
          (delSrc ? '（已从' + srcName + '删掉）' : '') + (std ? '（标准：' + std + '）' : ''));
      },
      cancel: function () { App.ui.closeModal(); }
    });
  }

  /* ---------- 弹窗 ---------- */
  function addModal(isDaily) {
    const title = isDaily ? '📌 加进「每日必做」' : '📋 往队列里加一条';
    const hint = isDaily
      ? '加进来的会每天出现在「每日必做」里 —— 适合复习、听力、单词这类每天都要碰的。'
      : '加进来的会排在队尾。以后就按顺序做 —— 不用再想「今天要完成几条」。';
    const ph = isDaily ? '比如：听力 10 分钟' : '比如：数学 · 导数第二讲';
    App.ui.openModal(title,
      '<p class="hint" style="margin-top:0">' + hint + '</p>' +
      '<div style="margin-top:10px"><label class="q-lab">内容</label>' +
      '<input id="q-add-text" class="q-input" type="text" placeholder="' + ph + '" /></div>' +
      (isDaily ? '' :
        '<div style="margin-top:8px"><label class="q-lab">备注（可选）</label>' +
        '<input id="q-add-note" class="q-input" type="text" placeholder="比如：约 40 分钟 / 讲义 P32" /></div>'),
      '<button class="btn btn-primary" data-act="ok">加进去</button>' +
      '<button class="btn" data-act="cancel">取消</button>');
    const inp = App.ui.query('#q-add-text');
    if (inp) inp.focus();
    App.ui.bindActions({
      ok: function () {
        const t = (App.ui.query('#q-add-text').value || '').trim();
        if (!t) { App.ui.toast('先写点内容吧'); return; }
        if (isDaily) {
          addDaily(t);
        } else {
          const nt = App.ui.query('#q-add-note');
          addItem(t, nt ? (nt.value || '').trim() : '');
        }
        App.ui.closeModal();
        render();
      },
      cancel: function () { App.ui.closeModal(); }
    });
  }

  function editModal(id, isDaily) {
    const it = isDaily ? findIn(DY(), id) : findIn(Q(), id);
    if (!it) return;
    App.ui.openModal('✏️ 改这一条',
      '<div><label class="q-lab">内容</label>' +
      '<input id="q-ed-text" class="q-input" type="text" value="' + esc(it.text) + '" /></div>' +
      (isDaily ? '' :
        '<div style="margin-top:8px"><label class="q-lab">备注（可选）</label>' +
        '<input id="q-ed-note" class="q-input" type="text" value="' + esc(it.note || '') + '" /></div>'),
      '<button class="btn btn-primary" data-act="ok">保存</button>' +
      '<button class="btn" data-act="cancel">取消</button>');
    App.ui.bindActions({
      ok: function () {
        const t = (App.ui.query('#q-ed-text').value || '').trim();
        if (!t) { App.ui.toast('内容不能为空'); return; }
        it.text = t;
        if (!isDaily) {
          const nt = App.ui.query('#q-ed-note');
          if (nt) it.note = (nt.value || '').trim();
        }
        S().save();
        App.ui.closeModal();
        render();
      },
      cancel: function () { App.ui.closeModal(); }
    });
  }

  /* ---------- 渲染 ---------- */
  function rowQ(it, n) {
    return '<div class="q-row" data-id="' + it.id + '">' +
      '<span class="q-idx">' + n + '</span>' +
      '<span class="q-text">' + esc(it.text) + '</span>' +
      '<span class="q-acts">' +
      '<button class="q-ib" data-act="q-done" data-id="' + it.id + '" title="做完了">✓</button>' +
      '<button class="q-ib" data-act="q-up" data-id="' + it.id + '" title="上移">↑</button>' +
      '<button class="q-ib" data-act="q-down" data-id="' + it.id + '" title="下移">↓</button>' +
      '<button class="q-ib" data-act="q-sched" data-id="' + it.id + '" title="安排到某一天做">📅</button>' +
      '<button class="q-ib" data-act="q-edit" data-id="' + it.id + '" title="改">✏️</button>' +
      '<button class="q-ib" data-act="q-del" data-id="' + it.id + '" title="删掉">🗑</button>' +
      '</span></div>';
  }

  function rowDone(it) {
    return '<div class="q-row q-row-done" data-id="' + it.id + '">' +
      '<span class="q-idx">✓</span>' +
      '<span class="q-text">' + esc(it.text) + '</span>' +
      '<span class="q-meta">' + (it.doneDay ? S().shortDateCN(it.doneDay) : '') + '</span>' +
      '<span class="q-acts">' +
      '<button class="q-ib" data-act="q-sched" data-kind="done" data-id="' + it.id + '" title="安排到某一天再做一次">📅</button>' +
      '<button class="q-ib" data-act="q-again" data-id="' + it.id + '" title="放回队列末尾">↻</button>' +
      '<button class="q-ib" data-act="q-deldone" data-id="' + it.id + '" title="从记录里删掉">🗑</button>' +
      '</span></div>';
  }

  function queueCard() {
    const list = Q();
    const done = QD();
    let h = '<div class="card q-card">';
    h += '<h2>📋 队列</h2>';
    h += '<p class="hint" style="margin-top:-2px">一串按顺序做的任务 —— 做完一条，下一条自己顶上。' +
      '<b>这里没有完成率</b>，只有「现在这条」。<br>' +
      '不想现在做？点 <b>📅</b> 把它<b>安排到某一天</b>去做（跟日历里 🔁 是同一套），或者 <b>↧</b> 排到队尾。</p>';

    if (!list.length) {
      h += '<div class="q-empty">队列是空的。<br>往里加一条，以后就按顺序做 —— 不用再想「今天要完成几条」。</div>';
    } else {
      const c = list[0];
      h += '<div class="q-now">' +
        '<div class="q-now-tag">▶ 现在做这条</div>' +
        '<div class="q-now-text">' + esc(c.text) + '</div>' +
        (c.note ? '<div class="q-now-note">' + esc(c.note) + '</div>' : '') +
        '<div class="q-now-acts">' +
        '<button class="btn btn-primary btn-small" data-act="q-done" data-id="' + c.id + '">✓ 做完了</button>' +
        '<button class="btn btn-small" data-act="q-sched" data-id="' + c.id + '">📅 安排到某天</button>' +
        '<button class="btn btn-small" data-act="q-end" data-id="' + c.id + '">↧ 排到最后</button>' +
        '<button class="btn btn-small" data-act="q-edit" data-id="' + c.id + '">✏️ 改</button>' +
        '<button class="btn btn-small" data-act="q-del" data-id="' + c.id + '">🗑 删</button>' +
        '</div></div>';
    }

    h += '<div class="q-head"><span>接下来</span>' +
      '<button class="btn btn-small" data-act="q-add">+ 加一条</button></div>';

    if (list.length > 1) {
      for (let i = 1; i < list.length; i++) h += rowQ(list[i], i + 1);
    } else if (list.length === 1) {
      h += '<p class="hint">后面没有了 —— 想加就点上面的「+ 加一条」。</p>';
    }

    if (done.length) {
      h += '<div class="q-head"><span>已完成（' + done.length + '）</span>' +
        '<button class="btn btn-small" data-act="q-toggledone">' + (showDone ? '收起' : '展开') + '</button></div>';
      if (showDone) {
        done.slice(0, 60).forEach(function (it) { h += rowDone(it); });
        if (done.length > 60) h += '<p class="hint">只显示最近 60 条。</p>';
      }
    }
    h += '</div>';
    return h;
  }

  function dailyCard() {
    const list = DY();
    const k = S().todayKey();
    let h = '<div class="card q-card">';
    h += '<h2>📌 每日必做</h2>';
    h += '<p class="hint" style="margin-top:-2px">每天都会出现的小事（复习、听力、单词）。打勾就行 —— ' +
      '<b>不算在完成率里</b>。<br>' +
      '某一条要挪到别的日子做？点它右边的 <b>📅</b>（安排到日历某一天）。</p>';

    if (!list.length) {
      h += '<div class="q-empty">还没有。<br>做完一条队列任务时可以顺手把它加进来当复习；也可以直接点下面「+ 加一条」。</div>';
    } else {
      const sorted = list.slice().sort(function (a, b) {
        return (dDone(a, k) ? 1 : 0) - (dDone(b, k) ? 1 : 0);
      });
      sorted.forEach(function (it) {
        const done = dDone(it, k);
        const st = dStreak(it);
        const meta = st > 1 ? '连续 ' + st + ' 天' : (done ? '今天已做' : '');
        h += '<div class="q-row' + (done ? ' q-row-done' : '') + '" data-id="' + it.id + '">' +
          '<button class="task-check' + (done ? ' checked' : '') + '" data-act="d-toggle" data-id="' + it.id + '">' +
          (done ? '✓' : '') + '</button>' +
          '<span class="q-text">' + esc(it.text) + '</span>' +
          '<span class="q-meta">' + meta + '</span>' +
          '<span class="q-acts">' +
          '<button class="q-ib" data-act="d-sched" data-id="' + it.id + '" title="安排到某一天做">📅</button>' +
          '<button class="q-ib" data-act="d-edit" data-id="' + it.id + '" title="改">✏️</button>' +
          '<button class="q-ib" data-act="d-del" data-id="' + it.id + '" title="删掉">🗑</button>' +
          '</span></div>';
      });
    }
    h += '<div class="q-head"><span></span><button class="btn btn-small" data-act="d-add">+ 加一条</button></div>';
    h += '</div>';
    return h;
  }

  function render() {
    const root = document.getElementById('queue-view');
    if (root) root.innerHTML = queueCard() + dailyCard();
    refreshBar();
  }

  /** 任务页顶部那条：只说"现在做哪条"，一律不给分母 */
  function refreshBar() {
    const el = document.getElementById('queue-bar');
    if (!el) return;
    const st = S().settings();
    if (st && st.queueBarOn === false) { el.innerHTML = ''; return; }
    const k = S().todayKey();
    const c = current();
    const todo = DY().filter(function (x) { return !dDone(x, k); });
    if (!c && !todo.length) { el.innerHTML = ''; return; }

    let h = '<div class="q-bar">';
    if (c) {
      h += '<div class="q-bar-line"><span class="q-bar-tag">📋 现在做</span>' +
        '<span class="q-bar-text">' + esc(c.text) + '</span>' +
        '<button class="q-bar-go" data-act="go-queue">去队列 →</button></div>';
    }
    if (todo.length) {
      h += '<div class="q-bar-line"><span class="q-bar-tag">📌 今天的小事</span>' +
        '<span class="q-bar-text">' +
        todo.slice(0, 6).map(function (x) { return esc(x.text); }).join(' · ') +
        (todo.length > 6 ? ' 等' : '') +
        '</span>' +
        '<button class="q-bar-go" data-act="go-queue">去队列 →</button></div>';
    }
    h += '</div>';
    el.innerHTML = h;
  }

  /* ---------- 事件 ---------- */
  function onClick(e) {
    const b = e.target && e.target.closest ? e.target.closest('[data-act]') : null;
    if (!b || !b.dataset) return;
    const act = b.dataset.act;
    const id = b.dataset.id;

    if (act === 'go-queue') { App.app.switchView('queue'); return; }
    if (act === 'q-add') { addModal(false); return; }
    if (act === 'd-add') { addModal(true); return; }
    if (act === 'q-toggledone') { showDone = !showDone; render(); return; }
    if (act === 'q-done') { finish(id); return; }
    if (act === 'q-sched') {
      const isDone = b.dataset.kind === 'done';
      const it = isDone ? findIn(QD(), id) : findIn(Q(), id);
      if (it) schedModal(it.text, isDone ? 'queueDone' : 'queue', id);
      return;
    }
    if (act === 'd-sched') {
      const it = findIn(DY(), id);
      if (it) schedModal(it.text, 'daily', id);
      return;
    }
    if (act === 'q-up') { moveItem(id, -1); render(); return; }
    if (act === 'q-down') { moveItem(id, 1); render(); return; }
    if (act === 'q-end') { moveToEnd(id); render(); return; }
    if (act === 'q-edit') { editModal(id, false); return; }
    if (act === 'd-edit') { editModal(id, true); return; }
    if (act === 'd-toggle') { dToggle(id); return; }

    if (act === 'q-del') {
      const it = findIn(Q(), id); if (!it) return;
      App.ui.confirm('把「' + esc(it.text) + '」从队列里删掉？', '删掉', function () {
        const list = Q();
        const i = idxOf(list, id);
        if (i >= 0) list.splice(i, 1);
        S().save();
        render();
      });
      return;
    }
    if (act === 'q-deldone') {
      const it = findIn(QD(), id); if (!it) return;
      App.ui.confirm('把这条已完成记录删掉？（只删记录，不影响别的）', '删掉', function () {
        const list = QD();
        const i = idxOf(list, id);
        if (i >= 0) list.splice(i, 1);
        S().save();
        render();
      });
      return;
    }
    if (act === 'd-del') {
      const it = findIn(DY(), id); if (!it) return;
      App.ui.confirm('把「' + esc(it.text) + '」从每日必做里删掉？（以前打过的勾也一起没了）', '删掉', function () {
        const list = DY();
        const i = idxOf(list, id);
        if (i >= 0) list.splice(i, 1);
        S().save();
        render();
      });
      return;
    }
    if (act === 'q-again') {
      const d = QD();
      const i = idxOf(d, id);
      if (i < 0) return;
      const it = d.splice(i, 1)[0];
      delete it.doneDay;
      delete it.doneAt;
      Q().push(it);
      S().save();
      render();
      App.ui.toast('↻ 已放回队列末尾 —— 想调位置用 ↑ ↓');
      return;
    }
  }

  function init() {
    const root = document.getElementById('queue-view');
    if (root) root.addEventListener('click', onClick);
    const bar = document.getElementById('queue-bar');
    if (bar) bar.addEventListener('click', onClick);
    render();
  }

  App.queue = {
    init: init,
    render: render,
    refreshBar: refreshBar,
    addItem: addItem,
    addDaily: addDaily,
    current: current
  };
})();
