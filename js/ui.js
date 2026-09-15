/* ============================================================
 * ui.js — 弹窗 · Toast · 浮动动画 · SVG 图表工具
 * ============================================================ */
(function () {
  'use strict';

  const App = (window.App = window.App || {});

  /* ---------- 弹窗 / Toast 挂在哪个文档 ----------
     悬浮窗被拖出浏览器（小窗）时，用户看的是小窗 —— 弹窗和提示必须开在小窗里，
     否则他得切回主页面才能继续操作（2026-09-14 用户反馈："点了以后得回到原先的页面"）。
     判断依据：小窗开着 且 主页面此刻没聚焦（用户正在小窗里操作）。 */
  let floatActAt = 0;                 // 最后一次"在悬浮窗里点击"的时间
  function markFloatAction() { floatActAt = Date.now(); }
  function pipDocIfAny() {
    const T = App.tasks;
    if (T && T.isPip && T.isPip() && T.floatDoc) {
      try { return T.floatDoc(); } catch (e) { /* 忽略 */ }
    }
    return null;
  }
  /** 弹窗/提示该开在哪个文档：优先"用户刚刚在悬浮窗里点的"，
      其次"主页面被切到后台"，最后才是主文档。 */
  function uiDoc() {
    const d = pipDocIfAny();
    if (d && (Date.now() - floatActAt < 2500 || document.hidden)) return d;
    return document;
  }
  function willUsePip() { return uiDoc() !== document; }
  /** 当前弹窗实际在哪个文档（有弹窗就按它在的地方查，避免查错文档） */
  function currentDoc() {
    const has = function (dd) {
      if (!dd) return false;
      const r = dd.getElementById('modal-root');
      return !!(r && r.querySelector('.modal'));
    };
    if (has(document)) return document;
    const pd = pipDocIfAny();
    if (has(pd)) return pd;
    return uiDoc();
  }
  /** 查弹窗里的元素（等价于"在弹窗所在文档里 querySelector"） */
  function query(sel) { return currentDoc().querySelector(sel); }
  /** 在小窗里懒建 #modal-root / #toast-root（主文档里 index.html 已经有） */
  function layerEl(id) {
    const d = uiDoc();
    let el = d.getElementById(id);
    if (!el) { el = d.createElement('div'); el.id = id; d.body.appendChild(el); }
    return el;
  }

  /* ---------- 弹窗 ---------- */
  function openModal(title, bodyHTML, actionsHTML, opts) {
    opts = opts || {};
    const root = layerEl('modal-root');
    // 弹窗开在小窗里时，先把小窗临时放大一点，不然 330px 宽太挤
    if (App.tasks && App.tasks.pipNeedSpace) App.tasks.pipNeedSpace(true);
    root.innerHTML = '';
    const mask = document.createElement('div');
    mask.className = 'modal-mask';
    mask.innerHTML =
      '<div class="modal">' +
      (title ? '<h3>' + title + '</h3>' : '') +
      (bodyHTML || '') +
      '<div class="modal-actions">' + (actionsHTML || '') + '</div>' +
      (opts.rechoose ? '<button class="rechoose-btn" data-act="rechoose">重新选择</button>' : '') +
      '</div>';
    root.appendChild(mask);
    const modal = mask.querySelector('.modal');
    // 宽弹窗（公告/长内容用）
    if (opts.wide) modal.style.maxWidth = '680px';
    // 右上角 ✕ 关闭按钮
    if (opts.closeIcon) {
      const x = document.createElement('button');
      x.className = 'modal-x';
      x.textContent = '✕';
      x.title = '关闭';
      x.onclick = closeModal;
      modal.appendChild(x);
    }
    // 遮罩点击关闭（不允许时忽略）
    mask.addEventListener('mousedown', function (e) {
      if (e.target === mask && !opts.lock) closeModal();
    });
    if (opts.onOpen) opts.onOpen(modal);
    return modal;
  }
  function closeModal() {
    const clear = function (d) { if (!d) return; const r = d.getElementById('modal-root'); if (r) r.innerHTML = ''; };
    clear(document);
    if (App.tasks && App.tasks.floatDoc) { try { clear(App.tasks.floatDoc()); } catch (e) { /* 忽略 */ } }
    if (App.tasks && App.tasks.pipNeedSpace) App.tasks.pipNeedSpace(false);   // 小窗恢复原尺寸
  }
  /** 绑定弹窗内 [data-act] 按钮：map = { act: fn } */
  function bindActions(map) {
    const list = uiDoc().querySelectorAll('#modal-root [data-act]');
    for (let i = 0; i < list.length; i++) {
      list[i].onclick = function () {
        const fn = map[this.dataset.act];
        if (fn) fn(this);
      };
    }
  }
  function confirm(msg, okText, onOk) {
    openModal('⚠️ 确认', '<p style="font-size:14px">' + msg + '</p>',
      '<button class="btn btn-danger" data-act="ok">' + (okText || '确认') + '</button>' +
      '<button class="btn" data-act="cancel">取消</button>');
    bindActions({
      ok: function () { closeModal(); if (onOk) onOk(); },
      cancel: closeModal
    });
  }

  /* ---------- Toast ---------- */
  function toast(msg, ms) {
    const root = layerEl('toast-root');
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = msg;
    root.appendChild(el);
    setTimeout(function () {
      el.classList.add('out');
      setTimeout(function () { el.remove(); }, 320);
    }, ms || 2200);
  }

  /* ---------- 浮动动画（积分变动等） ---------- */
  function floatText(text, x, y, cls) {
    const el = document.createElement('div');
    el.className = 'float-points' + (cls ? ' ' + cls : '');
    el.textContent = text;
    el.style.left = x + 'px';
    el.style.top = y + 'px';
    document.body.appendChild(el);
    setTimeout(function () { el.remove(); }, 1050);
  }
  function floatAt(originEl, text, cls) {
    if (!originEl) return;
    const r = originEl.getBoundingClientRect();
    floatText(text, r.left + r.width / 2 - 18, r.top - 8, cls);
  }

  /* ---------- 分类元数据 ---------- */
  const CATS = {
    study: { label: '学习', color: '#3b82f6' },
    extend: { label: '拓展', color: '#22a06b' },
    fun: { label: '辅助', color: '#0ea5e9' },
    life: { label: '生活', color: '#8b5cf6' },
    other: { label: '其他', color: '#94a3b8' }
  };

  /* ---------- SVG 图表 ---------- */
  const SVG_NS = 'http://www.w3.org/2000/svg';
  function svgEl(tag, attrs) {
    const el = document.createElementNS(SVG_NS, tag);
    for (const k in attrs) el.setAttribute(k, attrs[k]);
    return el;
  }
  /**
   * 堆叠柱状图（学习/拓展/休闲）
   * dataArr: [{label, study, extend, fun}]  分钟数
   */
  function barChart(container, dataArr) {
    container.innerHTML = '';
    const W = 640, H = 236, padL = 40, padR = 18, padT = 26, padB = 34;
    const plotW = W - padL - padR, plotH = H - padT - padB;
    const n = Math.max(1, dataArr.length);
    const sumOf = function (d) { return (d.study || 0) + (d.extend || 0) + (d.fun || 0); };
    const maxRaw = dataArr.length ? Math.max.apply(null, dataArr.map(sumOf)) : 0;
    const maxV = Math.max(60, maxRaw);
    const slot = plotW / n;
    const barW = Math.max(3, Math.min(26, slot * 0.62));
    const svg = svgEl('svg', { viewBox: '0 0 ' + W + ' ' + H, width: '100%', height: H, preserveAspectRatio: 'xMidYMid meet' });
    /** 统一按小时显示 —— 左边刻度和柱子上的数值口径一致，才不会一个写「分」一个写「h」 */
    const hLabel = function (min) {
      const h = min / 60;
      return (h >= 10 ? Math.round(h) : Math.round(h * 10) / 10) + 'h';
    };

    // 参考线 + 刻度（刻度放左边，右边不再被卡片边缘切掉）
    [0.25, 0.5, 0.75, 1].forEach(function (f) {
      const y = padT + plotH * (1 - f);
      svg.appendChild(svgEl('line', {
        x1: padL, y1: y, x2: W - padR, y2: y, stroke: '#e3e7ec',
        'stroke-width': 1, 'stroke-dasharray': (f === 1 ? '' : '3 3')
      }));
      const t = svgEl('text', { x: padL - 7, y: y + 3.5, 'text-anchor': 'end', 'font-size': 10, fill: '#9aa1ab' });
      t.textContent = hLabel(maxV * f);
      svg.appendChild(t);
    });

    // 日期标签最多留 8 个：30 天全写出来会挤成一团
    const step = Math.max(1, Math.ceil(n / 8));
    let lastValX = -9999;
    dataArr.forEach(function (d, i) {
      const cx = padL + slot * i + slot / 2;
      const x = cx - barW / 2;
      const stacks = [
        { v: d.study || 0, c: CATS.study.color },
        { v: d.extend || 0, c: CATS.extend.color },
        { v: d.fun || 0, c: CATS.fun.color }
      ];
      let y = padT + plotH;
      stacks.forEach(function (s) {
        const h = (s.v / maxV) * plotH;
        if (h < 1) return;
        svg.appendChild(svgEl('rect', { x: x, y: y - h, width: barW, height: h, fill: s.c, rx: Math.min(3, barW / 2) }));
        y -= h;
      });
      // 标签：从最后一天往前每隔 step 天标一个（保证「今天」一定有标签、间距也均匀）
      if ((n - 1 - i) % step === 0) {
        const label = svgEl('text', { x: cx, y: H - 13, 'text-anchor': 'middle', 'font-size': 10, fill: '#6b7280' });
        label.textContent = d.label;
        svg.appendChild(label);
      }
      // 柱子顶上的数值：离上一个太近就不标，免得压在一起
      const total = sumOf(d);
      if (total > 0 && cx - lastValX >= Math.max(24, barW + 8)) {
        const tv = svgEl('text', {
          x: cx, y: padT + plotH - (total / maxV) * plotH - 5,
          'text-anchor': 'middle', 'font-size': 9.5, fill: '#374151', 'font-weight': 700
        });
        tv.textContent = hLabel(total);
        svg.appendChild(tv);
        lastValX = cx;
      }
    });
    container.appendChild(svg);
  }
  /** 折线图 values: 分钟数数组（最近 N 天） */
  function lineChart(container, values, labels) {
    container.innerHTML = '';
    const W = 600, H = 220, padL = 40, padR = 12, padT = 14, padB = 26;
    const plotW = W - padL - padR, plotH = H - padT - padB;
    const maxV = Math.max(60, Math.max.apply(null, values.concat([0])));
    const n = values.length;
    const svg = svgEl('svg', { viewBox: '0 0 ' + W + ' ' + H });
    for (const f of [0.25, 0.5, 0.75, 1]) {
      const y = padT + plotH * (1 - f);
      svg.appendChild(svgEl('line', { x1: padL, y1: y, x2: W - padR, y2: y, stroke: '#e3e7ec', 'stroke-width': 1 }));
      const t = svgEl('text', { x: padL - 4, y: y + 3, 'text-anchor': 'end', 'font-size': 9, fill: '#9aa1ab' });
      t.textContent = Math.round(maxV * f) + '分';
      svg.appendChild(t);
    }
    const px = function (i) { return n <= 1 ? padL + plotW / 2 : padL + (plotW * i) / (n - 1); };
    const py = function (v) { return padT + plotH - (v / maxV) * plotH; };
    // 面积
    let area = 'M ' + px(0) + ' ' + py(values[0] || 0);
    for (let i = 1; i < n; i++) area += ' L ' + px(i) + ' ' + py(values[i] || 0);
    area += ' L ' + px(n - 1) + ' ' + (padT + plotH) + ' L ' + px(0) + ' ' + (padT + plotH) + ' Z';
    svg.appendChild(svgEl('path', { d: area, fill: 'rgba(59,130,246,.14)' }));
    // 折线
    let line = 'M ' + px(0) + ' ' + py(values[0] || 0);
    for (let i = 1; i < n; i++) line += ' L ' + px(i) + ' ' + py(values[i] || 0);
    svg.appendChild(svgEl('path', { d: line, fill: 'none', stroke: '#3b82f6', 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));
    // 点与标签（隔天标）
    values.forEach(function (v, i) {
      const dot = svgEl('circle', { cx: px(i), cy: py(v || 0), r: v > 0 ? 2.6 : 1.4, fill: v > 0 ? '#3b82f6' : '#c6ccd4' });
      svg.appendChild(dot);
      if ((i % Math.ceil(n / 8)) === 0) {
        const t = svgEl('text', { x: px(i), y: H - 8, 'text-anchor': 'middle', 'font-size': 9, fill: '#6b7280' });
        t.textContent = labels ? labels[i] : (i + 1);
        svg.appendChild(t);
      }
    });
    container.appendChild(svg);
  }

  App.ui = {
    openModal: openModal, closeModal: closeModal, bindActions: bindActions, confirm: confirm,
    toast: toast, floatText: floatText, floatAt: floatAt,
    // 弹窗"开在哪个文档"这套：给 tasks.js 用（拆解界面等要按弹窗所在文档查元素）
    query: query, markFloatAction: markFloatAction, willUsePip: willUsePip, uiDoc: uiDoc,
    CATS: CATS, svgEl: svgEl, barChart: barChart, lineChart: lineChart
  };
})();