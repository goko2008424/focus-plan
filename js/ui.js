/* ============================================================
 * ui.js — 弹窗 · Toast · 浮动动画 · SVG 图表工具
 * ============================================================ */
(function () {
  'use strict';

  const App = (window.App = window.App || {});

  /* ---------- 弹窗 ---------- */
  function openModal(title, bodyHTML, actionsHTML, opts) {
    opts = opts || {};
    const root = document.getElementById('modal-root');
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
    document.getElementById('modal-root').innerHTML = '';
  }
  /** 绑定弹窗内 [data-act] 按钮：map = { act: fn } */
  function bindActions(map) {
    const list = document.querySelectorAll('#modal-root [data-act]');
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
    const root = document.getElementById('toast-root');
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
    const r = originEl.getBoundingClientRect();
    floatText(text, r.left + r.width / 2 - 18, r.top - 8, cls);
  }

  /* ---------- 分类元数据 ---------- */
  const CATS = {
    study: { label: '学习', color: '#3b82f6' },
    extend: { label: '拓展', color: '#22a06b' },
    fun: { label: '休闲', color: '#f59e0b' },
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
    const W = 600, H = 220, padL = 8, padR = 8, padT = 14, padB = 26;
    const plotW = W - padL - padR, plotH = H - padT - padB;
    const maxV = Math.max(60, Math.max.apply(null, dataArr.map(function (d) {
      return (d.study || 0) + (d.extend || 0) + (d.fun || 0);
    })));
    const n = dataArr.length;
    const slot = plotW / n;
    const barW = Math.min(34, slot * 0.55);
    const svg = svgEl('svg', { viewBox: '0 0 ' + W + ' ' + H });
    // 水平参考线
    for (const f of [0.25, 0.5, 0.75, 1]) {
      const y = padT + plotH * (1 - f);
      svg.appendChild(svgEl('line', { x1: padL, y1: y, x2: W - padR, y2: y, stroke: '#e3e7ec', 'stroke-width': 1 }));
      svg.appendChild(svgEl('text', { x: W - padR - 2, y: y - 3, 'text-anchor': 'end', 'font-size': 9, fill: '#9aa1ab' }));
      const t = svg.querySelectorAll('text');
      t[t.length - 1].textContent = Math.round(maxV * f) + '分';
    }
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
        const rect = svgEl('rect', { x: x, y: y - h, width: barW, height: h, fill: s.c, rx: 2 });
        svg.appendChild(rect);
        y -= h;
      });
      const label = svgEl('text', { x: cx, y: H - 8, 'text-anchor': 'middle', 'font-size': 10, fill: '#6b7280' });
      label.textContent = d.label;
      svg.appendChild(label);
      // 数值
      const total = (d.study || 0) + (d.extend || 0) + (d.fun || 0);
      if (total > 0) {
        const tv = svgEl('text', { x: cx, y: padT + plotH - (total / maxV) * plotH - 4, 'text-anchor': 'middle', 'font-size': 9, fill: '#374151', 'font-weight': 700 });
        tv.textContent = Math.round(total / 60 * 10) / 10 + 'h';
        svg.appendChild(tv);
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
    CATS: CATS, svgEl: svgEl, barChart: barChart, lineChart: lineChart
  };
})();