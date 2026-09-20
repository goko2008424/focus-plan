/* ============================================================
 * milestones.js — ⏳ 时间节点 / 截止日期倒计时（v79）
 *
 * 参考 D:/todo-academic.html 里那条「时间节点 MILESTONES」做的：
 *   顶部一个入口（跟 ✨演示 / 📖指南 同一排），上面直接写着最近的节点还剩几天；
 *   点开能看全部节点、能加能改能删；≤30 天亮红、≤100 天亮橙。
 *
 * 数据：data.milestones = [{id, name, start, end, note}]
 *   start / end 都是 'YYYY-MM-DD'；end 可空（只有一天时不用填）
 * ============================================================ */
(function () {
  'use strict';

  const App = (window.App = window.App || {});
  const S = function () { return App.store; };
  const esc = function (s) { return S().esc(s); };
  const DAY = 86400000;

  /* ⚠️ 这里**绝对不预填任何节点**。
     上一版（v79）自作主张塞了「高考 + 三次模考」—— 那是照着参考文件里的江苏数据编的，
     纯属瞎猜：每个人要记的截止日期根本不一样，这个列表就该是空的，让他自己填。
     唯一保留的自动动作：**把上一版自动生成的那几个 id 清掉**（他把 v79 数据带过来也不会脏）。 */
  const JUNK_IDS = ['ms_gk', 'ms_m1', 'ms_m2', 'ms_m3'];

  function MS() {
    const d = S().data();
    if (!d) return [];
    if (!Array.isArray(d.milestones)) {
      d.milestones = [];
      S().save();
    } else if (d.milestones.some(function (m) { return JUNK_IDS.indexOf(m.id) >= 0; })) {
      d.milestones = d.milestones.filter(function (m) { return JUNK_IDS.indexOf(m.id) < 0; });
      S().save();
    }
    return d.milestones;
  }

  /* ---------- 日期 ---------- */
  function daysLeft(m) {
    if (!m || !m.start) return null;
    const a = S().keyToDate(m.start).getTime();
    const b = S().keyToDate(S().todayKey()).getTime();
    return Math.round((a - b) / DAY);
  }
  function lvl(n) {
    if (n === null) return '';
    if (n < 0) return 'ms-past';
    if (n <= 30) return 'ms-now';
    if (n <= 100) return 'ms-soon';
    return '';
  }
  function ddText(n) {
    if (n === null) return '没填日期';
    if (n < 0) return '已过 ' + (-n) + ' 天';
    if (n === 0) return '就是今天';
    if (n === 1) return '明天';
    return '还有 ' + n + ' 天';
  }
  function rangeText(m) {
    if (!m.start) return '';
    const a = S().shortDateCN(m.start);
    if (m.end && m.end !== m.start) return a + ' – ' + S().shortDateCN(m.end);
    return a;
  }
  function sorted() {
    return MS().slice().sort(function (a, b) {
      return String(a.start || '').localeCompare(String(b.start || ''));
    });
  }
  /** 最近的「还没过」的那个；全过了就返回 null */
  function nearest() {
    const f = sorted().filter(function (m) { return daysLeft(m) !== null && daysLeft(m) >= 0; });
    return f[0] || null;
  }

  /* ---------- 顶部那个入口上的小字 ---------- */
  function refresh() {
    const el = document.getElementById('ms-mini');
    const btn = document.getElementById('btn-ms');
    if (!el) return;
    const m = nearest();
    if (!m) {
      el.textContent = '截止日期';
      el.className = 'ms-mini';
      if (btn) btn.title = '⏳ 截止日期倒计时 —— 点一下就能加一条（报名截止 / 交作业 / 考试…）';
      return;
    }
    const n = daysLeft(m);
    el.textContent = m.name + ' ' + (n === 0 ? '今天' : (n === 1 ? '明天' : n + '天'));
    el.className = 'ms-mini ' + (n === 0 || n <= 30 ? 'ms-mini-now' : (n <= 100 ? 'ms-mini-soon' : ''));
    if (btn) {
      btn.title = '最近：' + m.name + '（' + rangeText(m) + '）· ' + ddText(n) + ' —— 点开看全部';
    }
  }

  /* ---------- 列表 ---------- */
  function listModal() {
    const list = sorted();
    let h = '<p class="hint" style="margin-top:0">任何<b>有确定日期</b>的事都能放这儿 —— 报名截止、交作业、考试、' +
      '面试、还书、缴费……<b>≤30 天标红、≤100 天标橙</b>，顶部那个入口常年显示最近的一个。</p>';

    if (!list.length) {
      h += '<div class="q-empty"><b>一条都没预填</b> —— 你要记什么就加什么。<br>' +
        '写上名字 + 挑个日期就行，只有一天的话「结束日期」留空。</div>';
    } else {
      h += '<div class="ms-list">';
      list.forEach(function (m) {
        const n = daysLeft(m);
        h += '<div class="ms-row ' + lvl(n) + '">' +
          '<div class="ms-info">' +
          '<div class="ms-name">' + esc(m.name) + '</div>' +
          '<div class="ms-sub">' + esc(rangeText(m)) + (m.note ? ' · ' + esc(m.note) : '') + '</div>' +
          '</div>' +
          '<div class="ms-dd">' + ddText(n) + '</div>' +
          '<div class="ms-acts">' +
          '<button class="q-ib" data-act="ms-edit" data-id="' + m.id + '" title="改">✏️</button>' +
          '<button class="q-ib" data-act="ms-del" data-id="' + m.id + '" title="删掉">🗑</button>' +
          '</div></div>';
      });
      h += '</div>';
    }

    h += '<div class="btn-row" style="margin-top:14px">' +
      '<button class="btn btn-primary" data-act="ms-add">＋ 添加截止日期</button></div>';

    App.ui.openModal('⏳ 截止日期', h,
      '<button class="btn" data-act="close">关闭</button>', { wide: true });
    App.ui.bindActions({
      close: function () { App.ui.closeModal(); },
      'ms-add': function () { editModal(null); },
      'ms-edit': function (b) { editModal(b.dataset.id); },
      'ms-del': function (b) {
        const id = b.dataset.id;
        const m = MS().filter(function (x) { return x.id === id; })[0];
        if (!m) return;
        App.ui.confirm('删掉节点「' + esc(m.name) + '」？', '删掉', function () {
          const arr = MS();
          const i = arr.findIndex(function (x) { return x.id === id; });
          if (i >= 0) arr.splice(i, 1);
          S().save();
          refresh();
          listModal();
        });
      }
    });
  }

  /* ---------- 添加 / 编辑 ---------- */
  function editModal(id) {
    const isNew = !id;
    const m = isNew
      ? { name: '', start: '', end: '', note: '' }
      : MS().filter(function (x) { return x.id === id; })[0];
    if (!m) return;

    App.ui.openModal(isNew ? '⏳ 添加截止日期' : '⏳ 编辑 · ' + esc(m.name),
      '<div><label class="q-lab">名称</label>' +
      '<input id="ms-name" class="q-input" type="text" value="' + esc(m.name) + '" placeholder="如：交作业 / 报名截止 / 考试" /></div>' +
      '<div style="display:flex;gap:10px;margin-top:8px">' +
      '<div style="flex:1"><label class="q-lab">开始日期</label>' +
      '<input id="ms-start" class="q-input" type="date" value="' + (m.start || '') + '" /></div>' +
      '<div style="flex:1"><label class="q-lab">结束日期（选填）</label>' +
      '<input id="ms-end" class="q-input" type="date" value="' + (m.end || '') + '" /></div>' +
      '</div>' +
      '<div style="margin-top:8px"><label class="q-lab">备注（选填）</label>' +
      '<input id="ms-note" class="q-input" type="text" value="' + esc(m.note || '') + '" placeholder="说明（选填）：交到哪 / 具体要求" /></div>',
      '<button class="btn btn-primary" data-act="save">保存</button>' +
      (isNew ? '' : '<button class="btn btn-danger" data-act="del">删除</button>') +
      '<button class="btn" data-act="back">返回列表</button>');

    const q = function (sel) { return App.ui.query(sel); };
    App.ui.bindActions({
      save: function () {
        const name = (q('#ms-name').value || '').trim();
        const start = q('#ms-start').value;
        const end = q('#ms-end').value;
        const note = (q('#ms-note').value || '').trim();
        if (!name) { App.ui.toast('给它起个名字吧'); return; }
        if (!start) { App.ui.toast('挑一个日期吧'); return; }
        if (end && end < start) { App.ui.toast('结束日期比开始还早，改一下'); return; }
        if (isNew) {
          MS().push({ id: S().uid(), name: name, start: start, end: end, note: note });
        } else {
          m.name = name; m.start = start; m.end = end; m.note = note;
        }
        S().save();
        refresh();
        listModal();
        App.ui.toast(isNew ? '⏳ 已添加：' + name : '⏳ 已保存：' + name);
      },
      del: function () {
        App.ui.confirm('删掉节点「' + esc(m.name) + '」？', '删掉', function () {
          const arr = MS();
          const i = arr.findIndex(function (x) { return x.id === id; });
          if (i >= 0) arr.splice(i, 1);
          S().save();
          refresh();
          listModal();
        });
      },
      back: function () { listModal(); }
    });
  }

  /* ---------- 启动 ---------- */
  /** 顶部入口点开：一条都没有就直接进添加表单，省一步 */
  function open() {
    if (!MS().length) { editModal(null); return; }
    listModal();
  }

  function init() {
    const btn = document.getElementById('btn-ms');
    if (btn) btn.onclick = open;
    MS();          // 只是确保这个数组存在（空的）
    refresh();
    // 跨天之后「还剩几天」要跟着变（页面放着不动也要走）
    setInterval(function () { try { refresh(); } catch (e) { /* 忽略 */ } }, 60000);
  }

  App.ms = {
    init: init,
    refresh: refresh,
    list: MS,
    daysLeft: daysLeft,
    open: open,
    openList: listModal      // 直接开列表（一条都没有时也开列表；测试/截图用）
  };
})();
