/* ============================================================
 * memcards.js — 🃏 设问卡（主动回忆 / 自测卡片）
 *
 * 为什么要有它：听课时「整理」这一步，最强的动作其实是**给自己出题**——
 * 主动回忆比再看一遍书管用得多。所以这里做的不是「记笔记」，是「出题」：
 * 每张卡正面一个要问自己的问题，反面是答案与要点，之后靠翻卡自测。
 *
 * 跟同学那份「记忆卡片」的关系：渲染那层（Markdown + LaTeX + 化学式）直接沿用
 * （marked + KaTeX + mhchem 那三个库就是从他文件里搬来的），
 * 但**排期逻辑全部砍掉**：没有 1/2/4/7/15 的艾宾浩斯曲线、没有 due/level、
 * 没有复习量柱状图（那套是他自己排的）。复习日期用我这边本来就有的
 * 日历 / 安排到某一天 来管 —— 卡片本身只负责「有题、有答案」。
 *
 * 数据（懒初始化，老数据不用迁移）：
 *   data.memcards = [ { id, name, taskId, subId, course, dayKey,
 *                       createdAt, updatedAt,
 *                       cards: [ { id, front, back, at } ] } ]
 *   一个合集 = 一节课整理出来的那套卡；名称默认取课程/任务名。
 * ============================================================ */
(function () {
  'use strict';

  const App = (window.App = window.App || {});
  const S = function () { return App.store; };
  const esc = function (s) { return S().esc(s); };

  /* ---------- 数据 ---------- */
  function D() {
    const d = S().data(); if (!d) return [];
    if (!Array.isArray(d.memcards)) d.memcards = [];
    return d.memcards;
  }
  function find(id) {
    return D().filter(function (c) { return c.id === id; })[0] || null;
  }
  function forTask(taskId) {
    return D().filter(function (c) { return c.taskId === taskId; });
  }
  function countForTask(taskId) {
    return forTask(taskId).reduce(function (n, c) { return n + (c.cards || []).length; }, 0);
  }
  function countAll() {
    return D().reduce(function (n, c) { return n + (c.cards || []).length; }, 0);
  }
  function save() { S().save(); }

  /** 找一个已有合集（同一节课：任务 + 小题 + 那天）；找不到就新建 */
  function ensureCollection(o) {
    o = o || {};
    let col = D().filter(function (c) {
      return c.taskId === o.taskId && (c.subId || null) === (o.subId || null) && c.dayKey === o.dayKey;
    })[0];
    if (col) return col;
    col = {
      id: S().uid(),
      name: String(o.name || o.course || '设问卡').slice(0, 40),
      taskId: o.taskId || null,
      subId: o.subId || null,
      course: o.course || o.name || '',
      dayKey: o.dayKey || S().todayKey(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      cards: []
    };
    D().push(col);
    save();
    return col;
  }

  function touch(col) { col.updatedAt = new Date().toISOString(); save(); }

  /* ---------- Markdown + LaTeX + 化学式（懒加载同学的三个库） ---------- */
  let mathState = 0;              // 0 没开始 · 1 加载中 · 2 好了 · 3 失败
  let mathWait = [];
  function ensureMath(cb) {
    if (cb) {
      if (mathState === 2 || mathState === 3) { cb(); return; }
      mathWait.push(cb);
    }
    if (mathState !== 0) return;
    mathState = 1;
    const done = function () {
      mathState = (typeof window.katex !== 'undefined') ? 2 : 3;
      const q = mathWait.slice(); mathWait = [];
      q.forEach(function (f) { try { f(); } catch (e) { /* 忽略 */ } });
    };
    const addCss = function () {
      if (document.getElementById('katex-css')) return;
      const l = document.createElement('link');
      l.id = 'katex-css'; l.rel = 'stylesheet'; l.href = 'css/katex.css?v=91';
      document.head.appendChild(l);
    };
    const load = function (src) {
      return new Promise(function (res) {
        const st = document.createElement('script');
        st.src = src; st.async = true;
        st.onload = function () { res(true); };
        st.onerror = function () { res(false); };
        document.head.appendChild(st);
      });
    };
    addCss();
    load('js/marked.min.js?v=91').then(function () {
      return load('js/katex.min.js?v=91');
    }).then(function () {
      return load('js/mhchem.min.js?v=91');
    }).then(done, done);
  }

  /* 公式占位：先抽走，别让 Markdown 把 * _ \ 吃掉 */
  let MATH = [];
  function protectMath(src) {
    MATH = [];
    let out = String(src).replace(/\r\n?/g, '\n');
    out = out.replace(/\$\$([\s\S]+?)\$\$/g, function (m, tex) {
      MATH.push({ tex: tex.trim(), display: true });
      return '@@MATH' + (MATH.length - 1) + '@@';
    });
    out = out.replace(/\\\[([\s\S]+?)\\\]/g, function (m, tex) {
      MATH.push({ tex: tex.trim(), display: true });
      return '@@MATH' + (MATH.length - 1) + '@@';
    });
    out = out.replace(/\\\(([\s\S]+?)\\\)/g, function (m, tex) {
      MATH.push({ tex: tex.trim(), display: false });
      return '@@MATH' + (MATH.length - 1) + '@@';
    });
    out = out.replace(/\$(?!\s)((?:[^$\n\\]|\\.)+?)(?<!\s)\$/g, function (m, tex) {
      MATH.push({ tex: tex.trim(), display: false });
      return '@@MATH' + (MATH.length - 1) + '@@';
    });
    return out;
  }
  function restoreMath(html) {
    return html.replace(/@@MATH(\d+)@@/g, function (m, i) {
      const item = MATH[+i];
      if (!item) return m;
      if (typeof window.katex === 'undefined') return '<code>' + esc(item.tex) + '</code>';
      try {
        return window.katex.renderToString(item.tex, {
          displayMode: item.display, throwOnError: false, strict: false, trust: true
        });
      } catch (e) { return '<code>' + esc(item.tex) + '</code>'; }
    });
  }
  /** 渲染一段（Markdown + 公式）；库还没加载好就先出纯文本，加载完自己会重画 */
  function render(src) {
    if (!src) return '';
    if (typeof window.marked === 'undefined') {
      ensureMath(refreshOpen);
      return esc(src).replace(/\n/g, '<br>');
    }
    if (typeof window.katex !== 'undefined') {
      return restoreMath(window.marked.parse(protectMath(src)));
    }
    return window.marked.parse(String(src).replace(/\r\n?/g, '\n'));
  }

  /* 批量导入解析：=== 分卡 · --- 分正反 · 单行用 | 或 Tab */
  function parseBulk(text) {
    const out = [];
    const blocks = String(text).replace(/\r\n?/g, '\n').split(/^\s*===\s*$/m);
    blocks.forEach(function (b) {
      const t = b.replace(/^\n+|\n+$/g, '');
      if (!t) return;
      if (t.indexOf('\n') >= 0) {
        const parts = t.split(/^\s*---\s*$/m);
        if (parts.length >= 2) {
          out.push({ front: parts[0].replace(/^\n+|\n+$/g, ''), back: parts.slice(1).join('\n').replace(/^\n+|\n+$/g, '') });
        } else {
          const ls = t.split('\n');
          out.push({ front: ls[0].trim(), back: ls.slice(1).join('\n').replace(/^\n+|\n+$/g, '') });
        }
      } else {
        const seg = t.split(/\t|｜|\|/);
        if (seg.length >= 2) out.push({ front: seg[0].trim(), back: seg.slice(1).join(' ').trim() });
        else out.push({ front: t.trim(), back: '' });
      }
    });
    return out.filter(function (c) { return c.front; });
  }

  /* ---------- Obsidian 导出（不带任何日期字段，日期你自己排） ---------- */
  function oneLine(s) { return String(s || '').replace(/\s*\n\s*/g, ' ').trim(); }
  function safeName(s) {
    return String(s || '设问卡').replace(/[\\/:*?"<>|#^\[\]]/g, '·').replace(/\s+/g, ' ').trim().slice(0, 60) || '设问卡';
  }
  function mdFor(col) {
    const L = [];
    L.push('---');
    L.push('title: ' + oneLine(col.name));
    L.push('tags: [设问卡]');
    if (col.course) L.push('来源: ' + oneLine(col.course));
    L.push('整理日期: ' + (col.dayKey || ''));
    L.push('卡片数: ' + (col.cards || []).length);
    L.push('---');
    L.push('');
    L.push('# ' + oneLine(col.name));
    L.push('');
    (col.cards || []).forEach(function (c, i) {
      L.push('## ' + (i + 1) + '. ' + oneLine(c.front));
      L.push('');
      L.push(String(c.back || '').trim());
      L.push('');
    });
    return L.join('\n');
  }
  function download(name, text) {
    const a = document.createElement('a');
    const blob = new Blob([text], { type: 'text/markdown;charset=utf-8' });
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () {
      try { URL.revokeObjectURL(a.href); a.remove(); } catch (e) { /* 忽略 */ }
    }, 1500);
  }
  /** 选 Obsidian 里的文件夹写进去；不支持就直接下载 */
  function exportCol(col) {
    const file = safeName(col.name) + '.md';
    const text = mdFor(col);
    if (!window.showDirectoryPicker) {
      download(file, text);
      App.ui.toast('⬇ 已下载 ' + file + '（这个浏览器不能直接写文件夹，把它拖进 Obsidian 就行）', 4200);
      return;
    }
    window.showDirectoryPicker({ mode: 'readwrite' }).then(function (dir) {
      return dir.getFileHandle(file, { create: true }).then(function (h) {
        return h.createWritable().then(function (w) {
          return w.write(text).then(function () { return w.close(); });
        });
      });
    }).then(function () {
      App.ui.toast('📥 已写进你选的文件夹：' + file + '（' + col.cards.length + ' 张卡）', 4200);
    }).catch(function (e) {
      if (e && e.name === 'AbortError') return;
      download(file, text);
      App.ui.toast('写不进那个文件夹，已改成下载 ' + file);
    });
  }

  /* ---------- 弹窗 ---------- */
  let cur = null;       // 当前打开的弹窗元素
  let state = null;     // { col, mode, idx, flipped, order, editId }

  function refreshOpen() {
    if (cur && state && document.body.contains(cur)) paint();
  }

  function paint() {
    const box = cur.querySelector('.mc-body');
    if (!box) return;
    const col = state.col;
    const n = (col.cards || []).length;

    if (state.mode === 'review') {
      const order = state.order || [];
      if (!order.length) { state.mode = 'box'; paint(); return; }
      if (state.idx >= order.length) state.idx = 0;
      const c = col.cards.filter(function (x) { return x.id === order[state.idx]; })[0];
      if (!c) { state.mode = 'box'; paint(); return; }
      box.innerHTML =
        '<div class="mc-revtop"><span class="mc-cnt">' + (state.idx + 1) + ' / ' + order.length + '</span>' +
        '<span><button class="btn btn-small" data-act="mc-shuffle">🔀 打乱</button> ' +
        '<button class="btn btn-small" data-act="mc-backbox">← 回到列表</button></span></div>' +
        '<div class="mc-face" data-act="mc-flip" title="点一下翻面">' + render(c.front) + '</div>' +
        (state.flipped
          ? '<div class="mc-face mc-back">' + render(c.back) + '</div>'
          : '<div class="mc-flip-hint">👆 点卡片翻面看答案（空格也行）</div>') +
        '<div class="mc-revacts">' +
        '<button class="btn btn-small" data-act="mc-prev">⬅ 上一张</button>' +
        '<button class="btn btn-small btn-primary" data-act="mc-flip">' + (state.flipped ? '↩ 看正面' : '🔄 翻面') + '</button>' +
        '<button class="btn btn-small" data-act="mc-next">下一张 ➡</button></div>';
      return;
    }

    if (state.mode === 'import') {
      box.innerHTML =
        '<p class="hint" style="margin-top:0">把 AI 出的题 / 自己写的一堆题粘进来，一次全变成卡：<br>' +
        '每张卡之间用<b>单独一行 ===</b>；正面和反面之间用<b>单独一行 ---</b>；' +
        '一行搞定的也能写「正面 | 反面」。</p>' +
        '<textarea class="mc-imp" rows="10" placeholder="平衡常数 K 只与什么有关？\n---\n只与温度有关。\n浓度、压强变了 K 不变，但 Q 会变。\n===\n催化剂影响 K 吗？ | 不影响。"></textarea>' +
        '<div class="mc-row"><button class="btn btn-primary" data-act="mc-doimport">📋 导入</button>' +
        '<button class="btn" data-act="mc-backbox">返回</button></div>';
      return;
    }

    if (state.mode === 'rename') {
      box.innerHTML =
        '<div class="mc-lab">合集名字（导出成 Obsidian 文件时就用它）</div>' +
        '<input class="mc-inp" data-f="name" value="' + esc(col.name) + '" />' +
        '<div class="mc-row"><button class="btn btn-primary" data-act="mc-dorename">保存</button>' +
        '<button class="btn" data-act="mc-backbox">返回</button></div>';
      return;
    }

    // 主视图：加卡 + 列表
    const list = (col.cards || []).map(function (c, i) {
      const open = state.editId === c.id;
      return '<div class="mc-card" data-id="' + c.id + '">' +
        '<div class="mc-card-top"><span class="mc-idx">' + (i + 1) + '</span>' +
        '<span class="mc-front" data-act="mc-toggle">' + render(c.front) + '</span>' +
        '<button class="mc-ib" data-act="mc-card-ed" data-id="' + c.id + '" title="改">✏️</button>' +
        '<button class="mc-ib" data-act="mc-card-del" data-id="' + c.id + '" title="删">🗑</button></div>' +
        (state.openId === c.id ? '<div class="mc-back">' + render(c.back) + '</div>' : '') +
        (open
          ? '<div class="mc-edit"><textarea class="mc-ta" data-f="ef" rows="2">' + esc(c.front) + '</textarea>' +
            '<textarea class="mc-ta" data-f="eb" rows="3">' + esc(c.back) + '</textarea>' +
            '<div class="mc-row"><button class="btn btn-small btn-primary" data-act="mc-card-save" data-id="' + c.id + '">保存</button>' +
            '<button class="btn btn-small" data-act="mc-card-cancel">取消</button></div></div>'
          : '') +
        '</div>';
    }).join('');

    box.innerHTML =
      '<div class="mc-head">' +
      '<div><b>' + esc(col.name) + '</b> <span class="mc-cnt">' + n + ' 张</span></div>' +
      '<div class="mc-sub">' + (col.course ? '来自：' + esc(col.course) + ' · ' : '') + (col.dayKey || '') +
      '　·　卡片只存在你本机，<b>复习日期你自己排</b></div>' +
      '<div class="mc-acts">' +
      '<button class="btn btn-small btn-primary" data-act="mc-review"' + (n ? '' : ' disabled') + '>🃏 开始复习</button>' +
      '<button class="btn btn-small" data-act="mc-export"' + (n ? '' : ' disabled') + '>📥 导出到 Obsidian</button>' +
      '<button class="btn btn-small" data-act="mc-import">📋 批量粘贴导入</button>' +
      '<button class="btn btn-small" data-act="mc-rename">✏️ 改名字</button>' +
      '</div></div>' +
      '<div class="mc-add">' +
      '<div class="mc-lab">➕ 加一张（正面 = 要问自己的问题；反面 = 答案与要点）</div>' +
      '<textarea class="mc-ta" data-f="front" rows="2" placeholder="正面：如 平衡常数 K 只与什么有关？"></textarea>' +
      '<textarea class="mc-ta" data-f="back" rows="3" placeholder="反面：如 只与温度有关。浓度压强变了 K 不变、Q 变。"></textarea>' +
      '<div class="mc-prev"><span class="mc-prevlab">反面预览</span><div class="mc-prevbody" data-prev></div></div>' +
      '<div class="mc-row"><button class="btn btn-primary" data-act="mc-add">＋ 加这张</button>' +
      '<span class="hint" style="margin:0">支持 Markdown、$x^2$、$\\ce{H2SO4}$（化学式）</span></div></div>' +
      (n ? '<div class="mc-list">' + list + '</div>'
         : '<p class="hint">还没有卡片。想到什么就问自己一句，写完点「＋ 加这张」——一节课攒 5~10 张就够。</p>');

    const f = box.querySelector('[data-f="front"]');
    if (f && state.focusAdd) { try { f.focus(); } catch (e) { /* 忽略 */ } }
    state.focusAdd = false;
    paintPrev();
  }

  function paintPrev() {
    if (!cur) return;
    const box = cur.querySelector('.mc-body'); if (!box) return;
    const ta = box.querySelector('[data-f="back"]'); const pv = box.querySelector('[data-prev]');
    if (!ta || !pv) return;
    const v = (ta.value || '').trim();
    pv.innerHTML = v ? render(v) : '<span class="hint" style="margin:0">（写点答案，这里会照着 Obsidian 里的样子显示）</span>';
  }

  /* ---------- 事件 ---------- */
  function onClick(e) {
    const b = e.target.closest ? e.target.closest('[data-act]') : null;
    if (!b || !state || !cur) return;
    const act = b.dataset.act;
    const col = state.col;

    if (act === 'mc-close') { App.ui.closeModal(); return; }
    if (act === 'mc-backbox') { state.mode = 'box'; state.flipped = false; state.editId = null; paint(); return; }
    if (act === 'mc-rename') { state.mode = 'rename'; paint(); return; }
    if (act === 'mc-dorename') {
      const inp = cur.querySelector('[data-f="name"]');
      const v = inp ? (inp.value || '').trim() : '';
      if (!v) { App.ui.toast('名字不能为空'); return; }
      col.name = v.slice(0, 40); touch(col);
      state.mode = 'box'; paint(); App.ui.toast('✏️ 改好了：' + col.name);
      return;
    }
    if (act === 'mc-import') { state.mode = 'import'; paint(); return; }
    if (act === 'mc-doimport') {
      const ta = cur.querySelector('.mc-imp');
      const arr = parseBulk(ta ? ta.value : '');
      if (!arr.length) { App.ui.toast('没解析出卡片 —— 记得每张之间空一行 ==='); return; }
      arr.forEach(function (x) { col.cards.push({ id: S().uid(), front: x.front, back: x.back, at: Date.now() }); });
      touch(col);
      state.mode = 'box'; paint();
      App.ui.toast('📋 导入了 ' + arr.length + ' 张卡');
      afterChange();
      return;
    }
    if (act === 'mc-add') {
      const f = cur.querySelector('[data-f="front"]');
      const bk = cur.querySelector('[data-f="back"]');
      const fv = f ? (f.value || '').trim() : '';
      const bv = bk ? (bk.value || '').trim() : '';
      if (!fv) { App.ui.toast('正面（要问自己的问题）先写一句'); return; }
      col.cards.push({ id: S().uid(), front: fv, back: bv, at: Date.now() });
      touch(col);
      if (f) f.value = ''; if (bk) bk.value = '';
      state.focusAdd = true;
      paint();
      afterChange();
      App.ui.toast('🃏 加好了（共 ' + col.cards.length + ' 张）');
      return;
    }
    if (act === 'mc-review') {
      state.mode = 'review'; state.idx = 0; state.flipped = false;
      state.order = (col.cards || []).map(function (c) { return c.id; });
      paint(); return;
    }
    if (act === 'mc-shuffle') {
      const o = state.order.slice();
      for (let i = o.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); const t = o[i]; o[i] = o[j]; o[j] = t; }
      state.order = o; state.idx = 0; state.flipped = false; paint(); return;
    }
    if (act === 'mc-flip') { state.flipped = !state.flipped; paint(); return; }
    if (act === 'mc-next') {
      state.flipped = false;
      state.idx = (state.idx + 1) % state.order.length;
      paint(); return;
    }
    if (act === 'mc-prev') {
      state.flipped = false;
      state.idx = (state.idx - 1 + state.order.length) % state.order.length;
      paint(); return;
    }
    if (act === 'mc-export') { exportCol(col); return; }
    if (act === 'mc-toggle') {
      const id = b.closest('.mc-card') ? b.closest('.mc-card').dataset.id : null;
      state.openId = (state.openId === id) ? null : id;
      paint(); return;
    }
    if (act === 'mc-card-ed') { state.editId = b.dataset.id; state.openId = b.dataset.id; paint(); return; }
    if (act === 'mc-card-cancel') { state.editId = null; paint(); return; }
    if (act === 'mc-card-save') {
      const t = cur.querySelectorAll('[data-f="ef"]');
      const k = cur.querySelectorAll('[data-f="eb"]');
      const card = col.cards.filter(function (c) { return c.id === b.dataset.id; })[0];
      if (!card) return;
      card.front = (t[0].value || '').trim() || card.front;
      card.back = (k[0].value || '').trim();
      touch(col);
      state.editId = null; paint(); afterChange();
      App.ui.toast('改好了');
      return;
    }
    if (act === 'mc-card-del') {
      const id = b.dataset.id;
      const card = col.cards.filter(function (c) { return c.id === id; })[0];
      if (!card) return;
      App.ui.confirm('删掉这张卡？<br><span class="hint">' + esc(oneLine(card.front)).slice(0, 40) + '</span>', '删掉', function () {
        const i = col.cards.findIndex(function (c) { return c.id === id; });
        if (i >= 0) col.cards.splice(i, 1);
        touch(col); paint(); afterChange();
        App.ui.toast('🗑 删掉了');
      });
      return;
    }
  }

  function onInput(e) {
    const t = e.target;
    if (!t || !t.dataset) return;
    if (t.dataset.f === 'back') paintPrev();
  }
  function onKey(e) {
    if (!state) return;
    if (e.key === 'Escape') { App.ui.closeModal(); return; }
    const typing = e.target && /textarea|input/i.test(e.target.tagName);
    if (state.mode !== 'review' || typing) return;
    if (e.key === ' ') { e.preventDefault(); state.flipped = !state.flipped; paint(); }
    if (e.key === 'ArrowRight') { state.flipped = false; state.idx = (state.idx + 1) % state.order.length; paint(); }
    if (e.key === 'ArrowLeft') { state.flipped = false; state.idx = (state.idx - 1 + state.order.length) % state.order.length; paint(); }
  }

  /** 卡片变了之后：刷新任务页（🃏 计数）和听课面板（整理那步的计数） */
  function afterChange() {
    try { if (App.tasks && App.tasks.renderAll) App.tasks.renderAll(); } catch (e) { /* 忽略 */ }
    try { if (App.lecture && App.lecture.refresh) App.lecture.refresh(); } catch (e) { /* 忽略 */ }
  }

  function openCol(colId, opts) {
    const col = find(colId);
    if (!col) { App.ui.toast('这个合集不在了'); return; }
    state = { col: col, mode: 'box', idx: 0, flipped: false, order: [], openId: null, editId: null, focusAdd: !!(opts && opts.focusAdd) };
    const foot = '<button class="btn" data-act="mc-close">关闭</button>';
    cur = App.ui.openModal('🃏 设问卡 · ' + esc(col.name).slice(0, 14), '<div class="mc-body"></div>', foot);
    cur.addEventListener('click', onClick);
    cur.addEventListener('input', onInput);
    document.addEventListener('keydown', onKey);
    paint();
    ensureMath(function () { refreshOpen(); });
  }

  /** 从任务行进：有合集就开最近那个，没有就新建一个 */
  function openForTask(task, opts) {
    opts = opts || {};
    const list = forTask(task.id).sort(function (a, b) {
      return String(b.updatedAt || '').localeCompare(String(a.updatedAt || ''));
    });
    if (!list.length) {
      const col = ensureCollection({
        taskId: task.id, subId: opts.subId || null, course: task.text,
        name: opts.name || task.text, dayKey: opts.dayKey || S().todayKey()
      });
      openCol(col.id, { focusAdd: true });
      App.ui.toast('🃏 给「' + task.text.slice(0, 12) + '」开了个新合集');
      return;
    }
    if (opts.colId) {
      const hit = list.filter(function (c) { return c.id === opts.colId; })[0];
      openCol((hit || list[0]).id);
      return;
    }
    openCol(list[0].id);
  }

  /** 听课用：按「这节课」定位合集（同一任务 + 小题 + 那天） */
  function openForLecture(L, dayKey) {
    if (!L) return;
    const day = dayKey || S().todayKey();
    const name = L.course || L.name || '设问卡';
    let task = null;
    try {
      const d = S().getDay(day);
      ['required', 'ideal', 'extra'].forEach(function (k) {
        (d.tasks[k] || []).forEach(function (t) { if (!task && t.id === L.taskId) task = t; });
      });
    } catch (e) { /* 忽略 */ }
    const col = ensureCollection({
      taskId: L.taskId, subId: L.subId || null, course: L.course || (task ? task.text : ''),
      name: (task && !L.subId) ? task.text : name, dayKey: day
    });
    openCol(col.id, { focusAdd: true });
  }

  /* ---------- 入口 ---------- */
  function init() {
    // 历史页的听课记录（补加入口）：容器是 innerHTML 重画的，监听挂在容器上
    document.addEventListener('click', function (e) {
      const b = e.target.closest ? e.target.closest('[data-act="mc-hist"]') : null;
      if (!b) return;
      const k = b.dataset.k, id = b.dataset.id;
      let rec = null;
      try {
        ((S().peekDay ? S().peekDay(k) : S().getDay(k)).lectures || []).forEach(function (x) { if (!rec && x.id === id) rec = x; });
      } catch (err) { /* 忽略 */ }
      if (!rec) { App.ui.toast('这条记录找不到了'); return; }
      openForLecture({ taskId: rec.taskId, subId: rec.subId || null, course: rec.course, name: rec.course }, k);
    });
  }

  App.memcards = {
    init: init,
    render: render,
    ensureMath: ensureMath,
    parseBulk: parseBulk,
    mdFor: mdFor,
    openForTask: openForTask,
    openForLecture: openForLecture,
    openCol: openCol,
    forTask: forTask,
    countForTask: countForTask,
    countAll: countAll,
    ensureCollection: ensureCollection
  };
})();
