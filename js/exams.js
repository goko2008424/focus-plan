/* ============================================================
 * exams.js — 📈 考试成绩追踪（v128）
 *
 * 为什么要有它：任务/计时管的是「每天怎么学」，考试分数才是「学得怎么样」的
 * 终极反馈。把每次月考/周测记一笔，画出每科的分数曲线，再和学习时长放在一起看
 * —— 「这科这月学了 15 小时，分数 78→85」这种正反馈，高三最提劲。
 *
 * 数据（懒初始化）：
 *   data.exams = [ { id, date:'2026-09-05', subject:'化学', score:85, full:100,
 *                    type:'月考', note:'', at } ]
 *
 * 规则：
 *   · 考试日期不允许是未来（还没考的试没有分数 —— 用户对未来的日子极度敏感）
 *   · score ≤ full；full 常见 100/120/150
 *   · 曲线按科目各画各的；投入对照 = 该科近 30 天计时专注（复用 stats 的 subjectDist）
 * ============================================================ */
(function () {
  'use strict';

  const App = (window.App = window.App || {});
  const S = function () { return App.store; };

  function D() {
    const d = S().data();
    if (!d) return [];
    if (!Array.isArray(d.exams)) d.exams = [];
    return d.exams;
  }
  function find(id) { return D().filter(function (x) { return x.id === id; })[0] || null; }

  function subjects() {
    return (App.memcards && App.memcards.subjects) ? App.memcards.subjects()
      : ['语文', '数学', '英语', '物理', '化学', '生物', '政治', '历史', '地理'];
  }

  const TYPE_COLOR = { '月考': '#e2545d', '周测': '#0ea5e9', '模拟': '#8b5cf6', '测验': '#f59e0b' };
  function typeColor(t) { return TYPE_COLOR[t] || '#94a3b8'; }

  function bySubjectAsc(sub) {
    return D().filter(function (e) { return e.subject === sub; })
      .slice().sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
  }
  function subsWithExams() {
    const seen = {}, out = [];
    D().slice().sort(function (a, b) { return a.date < b.date ? 1 : -1; }).forEach(function (e) {
      if (!seen[e.subject]) { seen[e.subject] = true; out.push(e.subject); }
    });
    return out;
  }

  function addExam(o) {
    D().push({
      id: S().uid(), date: o.date, subject: o.subject, score: o.score, full: o.full,
      type: o.type || '其他', note: o.note || '', at: Date.now()
    });
    S().save();
  }
  function updateExam(id, patch) {
    const e = find(id);
    if (!e) return;
    Object.keys(patch).forEach(function (k) { e[k] = patch[k]; });
    S().save();
  }
  function delExam(id) {
    const d = S().data();
    const i = d.exams.indexOf(find(id));
    if (i >= 0) { d.exams.splice(i, 1); S().save(); }
  }

  /* ---------- 曲线（SVG 字符串） ---------- */
  function chartSVG(exs) {
    if (!exs.length) return '';
    const W = 640, H = 216, padL = 36, padR = 18, padT = 20, padB = 30;
    const full = Math.max.apply(null, exs.map(function (e) { return e.full || 100; }));
    const n = exs.length;
    const plotW = W - padL - padR, plotH = H - padT - padB;
    const X = function (i) { return n === 1 ? padL + plotW / 2 : padL + plotW * i / (n - 1); };
    const Y = function (v) { return padT + plotH * (1 - Math.min(v, full) / full); };

    let s = '<svg class="exam-chart" viewBox="0 0 ' + W + ' ' + H + '" width="100%" height="' + H + '" preserveAspectRatio="xMidYMid meet">';
    // 参考线
    [0.25, 0.5, 0.75, 1].forEach(function (f) {
      const y = padT + plotH * (1 - f);
      s += '<line x1="' + padL + '" y1="' + y + '" x2="' + (W - padR) + '" y2="' + y + '" stroke="var(--line)" stroke-width="1" stroke-dasharray="' + (f === 1 ? '' : '3 3') + '"/>';
      s += '<text x="' + (padL - 6) + '" y="' + (y + 3.5) + '" text-anchor="end" font-size="10" fill="var(--muted)">' + Math.round(full * f) + '</text>';
    });
    // 分数线 + 点
    if (n > 1) {
      s += '<polyline fill="none" stroke="var(--primary)" stroke-width="2.5" stroke-linejoin="round" points="' +
        exs.map(function (e, i) { return X(i) + ',' + Y(e.score); }).join(' ') + '"/>';
    }
    exs.forEach(function (e, i) {
      s += '<circle cx="' + X(i) + '" cy="' + Y(e.score) + '" r="4.5" fill="var(--primary)" stroke="var(--card)" stroke-width="2"/>';
      s += '<text x="' + X(i) + '" y="' + (Y(e.score) - 10) + '" text-anchor="middle" font-size="11.5" font-weight="700" fill="var(--ink)">' + e.score + '</text>';
      s += '<text x="' + X(i) + '" y="' + (H - 10) + '" text-anchor="middle" font-size="10" fill="var(--muted)">' + e.date.slice(5).replace('-', '/') + '</text>';
    });
    s += '</svg>';
    return s;
  }

  /** 该科近 30 天计时专注（分钟）——复用 stats 的 subjectDist */
  function focus30Of(sub) {
    try {
      const sd = App.stats.subjectDist();
      const hit = sd.list.filter(function (x) { return x.name === sub; })[0];
      return hit ? hit.min : 0;
    } catch (e) { return 0; }
  }

  /* ---------- 渲染 ---------- */
  let selSub = null;
  function render() {
    if (typeof App.app !== 'undefined' && App.app.currentView() !== 'stats') return;
    const box = document.getElementById('exams-card');
    if (!box) return;
    const all = D();

    if (!all.length) {
      box.innerHTML = '<p class="hint">还没有考试记录。每次月考/周测出分后花十秒记一笔，就能看到每一科的分数曲线和学习的对照。</p>' +
        '<button class="btn btn-primary" id="exam-add">＋ 记第一笔</button>';
      bindAdd(box);
      return;
    }

    const subs = subsWithExams();
    if (!selSub || subs.indexOf(selSub) < 0) selSub = subs[0];
    const exs = bySubjectAsc(selSub);
    const last = exs[exs.length - 1], prev = exs.length > 1 ? exs[exs.length - 2] : null;
    const delta = prev ? last.score - prev.score : null;
    const focusMin = focus30Of(selSub);

    const chips = subs.map(function (s2) {
      return '<button class="btn btn-small exam-chip' + (s2 === selSub ? ' on' : '') + '" data-sub="' + S().esc(s2) + '">' + S().esc(s2) + '</button>';
    }).join('');

    const sorted = D().slice().sort(function (a, b) { return a.date < b.date ? 1 : -1; });
    const rows = sorted.slice(0, 6).map(function (e) { return examRow(e); }).join('');
    const rest = sorted.length > 6
      ? '<details class="exam-more"><summary>更早的 ' + (sorted.length - 6) + ' 条</summary>' +
        sorted.slice(6).map(function (e) { return examRow(e); }).join('') + '</details>'
      : '';

    box.innerHTML =
      '<div class="exam-chips">' + chips +
      '<span style="flex:1"></span><button class="btn btn-small btn-primary" id="exam-add">＋ 记一笔</button></div>' +
      chartSVG(exs) +
      '<p class="hint">' +
      (delta != null
        ? ('上次 <b>' + prev.score + '</b> → 这次 <b style="color:' + (delta >= 0 ? 'var(--extra)' : 'var(--req)') + '">' + last.score + '</b>（' + (delta >= 0 ? '+' : '') + delta + ' 分）')
        : ('这一科记了 <b>1</b> 次，再考一次就能看进步')) +
      ' · 近 30 天这一科计时专注 <b>' + S().fmtDur(focusMin) + '</b></p>' +
      '<div class="exam-list">' + rows + '</div>' + rest;

    bindAdd(box);
    box.querySelectorAll('.exam-chip').forEach(function (b) {
      b.onclick = function () { selSub = b.dataset.sub; render(); };
    });
    box.querySelectorAll('[data-exdel]').forEach(function (b) {
      b.onclick = function () {
        App.ui.confirm('删掉这条成绩？（' + b.dataset.exsub + ' ' + b.dataset.exdate + ' ' + b.dataset.exscore + ' 分，删了就找不回来）', '删掉', function () {
          delExam(b.dataset.exdel); render();
        });
      };
    });
    box.querySelectorAll('[data-exedit]').forEach(function (b) {
      b.onclick = function () { editModal(b.dataset.exedit); };
    });
  }

  function examRow(e) {
    return '<div class="exam-row">' +
      '<span class="exam-type" style="background:' + typeColor(e.type) + '">' + S().esc(e.type || '其他') + '</span>' +
      '<span class="exam-sub">' + S().esc(e.subject) + '</span>' +
      '<span class="exam-score">' + e.score + '<small>/' + (e.full || 100) + '</small></span>' +
      '<span class="exam-date">' + e.date + '</span>' +
      (e.note ? '<span class="exam-note">' + S().esc(e.note) + '</span>' : '') +
      '<span class="exam-acts"><button class="btn btn-small" data-exedit="' + e.id + '">✏️</button>' +
      '<button class="btn btn-small" data-exdel="' + e.id + '" data-exsub="' + S().esc(e.subject) + '" data-exdate="' + e.date + '" data-exscore="' + e.score + '">🗑</button></span>' +
      '</div>';
  }

  function bindAdd(box) {
    const b = box.querySelector('#exam-add');
    if (b) b.onclick = function () { addModal(); };
  }

  /* ---------- 录入 / 编辑弹窗 ---------- */
  function addModal() {
    const today = S().todayKey();
    const subs = subjects();
    const m = App.ui.openModal('📈 记一次考试成绩', '' +
      '<p class="hint">出分后花十秒记一笔；考得不理想也记 —— 曲线要看的是趋势，不是每次都涨。</p>' +
      '<div class="field-row">' +
      '<div class="field"><label>哪一科</label><input id="ex-sub" list="ex-sub-list" placeholder="如：化学" style="width:120px" />' +
      '<datalist id="ex-sub-list">' + subs.map(function (s2) { return '<option value="' + S().esc(s2) + '"></option>'; }).join('') + '</datalist></div>' +
      '<div class="field"><label>哪种考试</label><select id="ex-type" class="select-small">' +
      ['月考', '周测', '模拟', '测验', '其他'].map(function (t) { return '<option>' + t + '</option>'; }).join('') + '</select></div>' +
      '</div>' +
      '<div class="field-row">' +
      '<div class="field"><label>分数</label><input type="number" id="ex-score" min="0" style="width:90px" /></div>' +
      '<div class="field"><label>满分</label><input type="number" id="ex-full" min="1" value="100" style="width:90px" /></div>' +
      '<div class="field"><label>考试日期</label><input type="date" id="ex-date" value="' + today + '" max="' + today + '" style="width:160px" /></div>' +
      '</div>' +
      '<div class="field"><label>备注（可选：哪张卷子 / 哪里丢分）</label><input id="ex-note" style="width:100%" /></div>',
      '<button class="btn btn-primary" data-act="ok">记下这次成绩</button>' +
      '<button class="btn" data-act="cancel">取消</button>');
    App.ui.bindActions({
      ok: function () {
        const sub = m.querySelector('#ex-sub').value.trim();
        const score = Math.round(+m.querySelector('#ex-score').value);
        const full = Math.round(+m.querySelector('#ex-full').value) || 100;
        const date = m.querySelector('#ex-date').value;
        if (!sub) { App.ui.toast('先写哪一科'); return; }
        if (isNaN(score) || score < 0) { App.ui.toast('分数还没填对'); return; }
        if (score > full) { App.ui.toast('分数比满分还高 —— 检查一下？'); return; }
        if (!date) { App.ui.toast('考试日期还没选'); return; }
        if (date > today) { App.ui.toast('考试日期不能是还没到的日子'); return; }
        addExam({ date: date, subject: sub, score: score, full: full, type: m.querySelector('#ex-type').value, note: m.querySelector('#ex-note').value.trim() });
        selSub = sub;
        App.ui.closeModal(); render();
        App.ui.toast('📈 已记下：' + sub + ' ' + score + ' 分');
      },
      cancel: App.ui.closeModal
    });
  }

  function editModal(id) {
    const e = find(id);
    if (!e) return;
    const today = S().todayKey();
    const m = App.ui.openModal('✏️ 改这条成绩', '' +
      '<div class="field-row">' +
      '<div class="field"><label>哪一科</label><input id="ex-sub" value="' + S().esc(e.subject) + '" style="width:120px" /></div>' +
      '<div class="field"><label>哪种考试</label><select id="ex-type" class="select-small">' +
      ['月考', '周测', '模拟', '测验', '其他'].map(function (t) { return '<option' + (t === (e.type || '其他') ? ' selected' : '') + '>' + t + '</option>'; }).join('') + '</select></div>' +
      '</div>' +
      '<div class="field-row">' +
      '<div class="field"><label>分数</label><input type="number" id="ex-score" min="0" value="' + e.score + '" style="width:90px" /></div>' +
      '<div class="field"><label>满分</label><input type="number" id="ex-full" min="1" value="' + (e.full || 100) + '" style="width:90px" /></div>' +
      '<div class="field"><label>考试日期</label><input type="date" id="ex-date" value="' + e.date + '" max="' + today + '" style="width:160px" /></div>' +
      '</div>' +
      '<div class="field"><label>备注</label><input id="ex-note" value="' + S().esc(e.note || '') + '" style="width:100%" /></div>',
      '<button class="btn btn-primary" data-act="ok">保存</button>' +
      '<button class="btn" data-act="cancel">取消</button>');
    App.ui.bindActions({
      ok: function () {
        const sub = m.querySelector('#ex-sub').value.trim();
        const score = Math.round(+m.querySelector('#ex-score').value);
        const full = Math.round(+m.querySelector('#ex-full').value) || 100;
        const date = m.querySelector('#ex-date').value;
        if (!sub || isNaN(score) || score < 0 || score > full || !date) { App.ui.toast('有没填对的项'); return; }
        if (date > today) { App.ui.toast('考试日期不能是还没到的日子'); return; }
        updateExam(id, { subject: sub, score: score, full: full, type: m.querySelector('#ex-type').value, date: date, note: m.querySelector('#ex-note').value.trim() });
        selSub = sub;
        App.ui.closeModal(); render();
      },
      cancel: App.ui.closeModal
    });
  }

  App.exams = {
    render: render, addModal: addModal, addExam: addExam, updateExam: updateExam,
    delExam: delExam, bySubjectAsc: bySubjectAsc, chartSVG: chartSVG, D: D
  };
})();
