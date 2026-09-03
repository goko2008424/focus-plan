/* ============================================================
 * timeline.js — 时间轴模块：24h 时间轴 · 点击/拖动添加
 *              记录编辑 · 自动生成 · 筛选 · 统计摘要
 * ============================================================ */
(function () {
  'use strict';

  const App = (window.App = window.App || {});
  const S = () => App.store;

  const HOUR_H = 40; // 每小时高度 px
  let selDate = null;
  let selCat = '';
  let selKw = '';
  let drag = null;   // {startMin, currentMin}

  /* ---------- 日期工具 ---------- */
  function shift(days) {
    const d = S().keyToDate(selDate);
    d.setDate(d.getDate() + days);
    selDate = S().dateKey(d);
  }

  /* ---------- 主渲染 ---------- */
  function render() {
    if (typeof App.app !== 'undefined' && App.app.currentView() !== 'timeline') return;
    const day = S().getDay(selDate);
    const grid = document.getElementById('timeline-grid');

    // 小时底格
    let html = '';
    for (let h = 0; h < 24; h++) {
      html += '<div class="tl-hour"></div>' +
        '<span class="tl-hour-label">' + S().pad2(h) + ':00</span>';
    }
    grid.innerHTML = html;

    // 筛选
    const filtered = day.timeline.filter(function (r) {
      if (selCat && r.category !== selCat) return false;
      if (selKw && (r.content || '').toLowerCase().indexOf(selKw.toLowerCase()) < 0) return false;
      return true;
    });

    filtered.forEach(function (r) {
      const el = document.createElement('div');
      el.className = 'tl-record cat-' + r.category + (r.auto ? ' auto-mark' : '');
      el.dataset.id = r.id;
      const top = (r.start / 60) * HOUR_H;
      const height = Math.max(14, ((r.end - r.start) / 60) * HOUR_H);
      el.style.top = top + 'px';
      el.style.height = height + 'px';
      el.innerHTML = '<span class="tl-rec-time">' + S().hhmmOf(r.start) + '–' + S().hhmmOf(r.end) +
        ' · ' + S().fmtDur(r.minutes) + '</span><br/>' + (r.auto ? '⏱ ' : '') + S().esc(r.content);
      el.title = r.content + '（' + App.ui.CATS[r.category].label + '）';
      grid.appendChild(el);
    });

    // 日期控件
    document.getElementById('tl-date').value = selDate;
    renderSummary(day);
  }

  /* ---------- 统计摘要 ---------- */
  function renderSummary(day) {
    const recs = day.timeline;
    const sum = function (f) { return recs.reduce(function (s, r) { return s + (f(r) ? (r.minutes || 0) : 0); }, 0); };
    const studyMin = sum(function (r) { return r.category === 'study' && r.countAsStudy; });
    const extMin = sum(function (r) { return r.category === 'extend'; });
    const funMin = sum(function (r) { return r.category === 'fun'; });
    const linked = recs.filter(function (r) { return r.taskId; }).length;
    const totalMin = recs.reduce(function (s, r) { return s + (r.minutes || 0); }, 0);
    const req = day.tasks.required;
    const reqRate = req.length ? Math.round(req.filter(function (t) { return t.done; }).length / req.length * 100) + '%' : '--';

    document.getElementById('tl-summary').innerHTML =
      '<div class="sum-item"><b>' + S().fmtDur(totalMin) + '</b>总记录时间</div>' +
      '<div class="sum-item"><b style="color:#3b82f6">' + S().fmtDur(studyMin) + '</b>有效学习</div>' +
      '<div class="sum-item"><b style="color:#22a06b">' + S().fmtDur(extMin) + '</b>拓展时间</div>' +
      '<div class="sum-item"><b style="color:#f59e0b">' + S().fmtDur(funMin) + '</b>休闲时间</div>' +
      '<div class="sum-item"><b>' + (recs.length ? Math.round(linked / recs.length * 100) + '%' : '--') + '</b>任务关联率</div>' +
      '<div class="sum-item"><b>' + reqRate + '</b>必须任务完成率</div>' +
      '<div class="sum-item"><b>' + S().fmtDur(S().leisureTotal()) + '</b>休闲累计</div>' +
      '<div class="sum-item"><b>' + S().pointsTotal() + ' 分</b>积分累计</div>';
  }

  /* ---------- 添加 / 编辑弹窗 ---------- */
  function recordModal(startMin, endMin, record, dayKey) {
    const day = S().getDay(dayKey);
    const isEdit = !!record;
    const content = isEdit ? record.content : '';
    const cat = isEdit ? record.category : 'study';
    const countStudy = isEdit ? record.countAsStudy !== false : true;
    const taskId = isEdit ? (record.taskId || '') : '';

    // 今日任务选项
    const taskOpts = [];
    [{ k: 'required', n: '必须' }, { k: 'ideal', n: '理想' }, { k: 'extra', n: '拓展' }].forEach(function (c) {
      day.tasks[c.k].forEach(function (t) {
        taskOpts.push({ id: t.id, label: '[' + c.n + (t.done ? '✓' : '') + '] ' + t.text });
      });
    });

    const modal = App.ui.openModal(isEdit ? '✎ 编辑时间记录' : '＋ 添加时间记录', '' +
      '<div class="field-row">' +
      '<div class="field"><label>开始时间</label><input type="time" id="rec-start" value="' + S().hhmmOf(startMin) + '" /></div>' +
      '<div class="field"><label>结束时间</label><input type="time" id="rec-end" value="' + S().hhmmOf(endMin) + '" /></div>' +
      '</div>' +
      '<div class="field"><label>持续时间（自动计算）</label><p id="rec-dur" style="font-weight:700;color:#3b82f6">--</p></div>' +
      '<div class="field"><label>活动内容</label><textarea id="rec-content" placeholder="">' + S().esc(content) + '</textarea></div>' +
      (isEdit && record.note
        ? '<div class="field"><label>本次总结（计时完成时填写）</label><p style="font-size:13px;color:#374151;background:#f4faf6;border-radius:8px;padding:6px 10px">' + S().esc(record.note) + '</p></div>'
        : '') +
      '<div class="field"><label>活动分类</label>' +
      '<div class="cat-picker" id="rec-cats">' +
      Object.keys(App.ui.CATS).map(function (k) {
        return '<button data-cat="' + k + '" class="' + (cat === k ? 'active' : '') + '">' + App.ui.CATS[k].label + '</button>';
      }).join('') +
      '</div></div>' +
      '<div class="field-row">' +
      '<div class="field"><label>关联任务（可选）</label><select id="rec-task">' +
      '<option value="">— 不关联 —</option>' +
      taskOpts.map(function (o) {
        return '<option value="' + o.id + '"' + (taskId === o.id ? ' selected' : '') + '>' + S().esc(o.label) + '</option>';
      }).join('') +
      '</select></div>' +
      '</div>' +
      '<div class="field"><label style="display:flex;align-items:center;gap:8px;color:#374151">' +
      '<input type="checkbox" id="rec-study"' + (countStudy ? ' checked' : '') + ' /> 计入学习时间（用于有效学习统计）</label></div>',
      (isEdit
        ? '<button class="btn btn-primary" data-act="save">保存修改</button><button class="btn btn-danger" data-act="del">删除</button>'
        : '<button class="btn btn-primary" data-act="save">保存</button>') +
      '<button class="btn" data-act="cancel">取消</button>' +
      (isEdit ? '<button class="btn" data-act="copy">复制到今日</button>' : ''));

    // 分类选择
    let selCat2 = cat;
    modal.querySelectorAll('#rec-cats button').forEach(function (b) {
      b.onclick = function () {
        modal.querySelectorAll('#rec-cats button').forEach(function (x) { x.classList.remove('active'); });
        b.classList.add('active');
        selCat2 = b.dataset.cat;
      };
    });

    const startInput = modal.querySelector('#rec-start');
    const endInput = modal.querySelector('#rec-end');
    const durEl = modal.querySelector('#rec-dur');

    function calcDur() {
      const st = S().minOfDay(startInput.value);
      const en = S().minOfDay(endInput.value);
      let d = en - st;
      if (d < 0) d = 1440 - st + en; // 跨午夜
      durEl.textContent = S().fmtDur(d);
    }
    startInput.onchange = calcDur;
    endInput.onchange = calcDur;
    calcDur();

    App.ui.bindActions({
      save: function () {
        const st = S().minOfDay(startInput.value);
        const en = S().minOfDay(endInput.value);
        let d = en - st;
        if (d < 0) d = 1440 - st + en;
        if (d < 1) { App.ui.toast('时间区间无效'); return; }
        const text = modal.querySelector('#rec-content').value.trim();
        if (!text) { App.ui.toast('请填写活动内容'); return; }
        const tId = modal.querySelector('#rec-task').value;
        const rec = {
          id: isEdit ? record.id : S().uid(),
          start: st, end: en, minutes: d,
          content: text,
          category: selCat2,
          taskId: tId || undefined,
          taskText: tId ? (day.tasks.required.concat(day.tasks.ideal, day.tasks.extra).find(function (t) { return t.id === tId; }) || {}).text : undefined,
          countAsStudy: modal.querySelector('#rec-study').checked,
          auto: isEdit ? !!record.auto : false
        };
        if (isEdit) {
          const idx = day.timeline.findIndex(function (r) { return r.id === record.id; });
          if (idx >= 0) day.timeline[idx] = rec;
        } else {
          day.timeline.push(rec);
        }
        S().save();
        App.ui.closeModal();
        render();
      },
      del: function () {
        App.ui.confirm('删除这条时间记录？', '删除', function () {
          const idx = day.timeline.findIndex(function (r) { return r.id === record.id; });
          if (idx >= 0) day.timeline.splice(idx, 1);
          S().save();
          App.ui.closeModal();
          render();
        });
      },
      copy: function () {
        if (!isEdit) return;
        const today = S().getDay(S().todayKey());
        today.timeline.push({
          id: S().uid(), start: record.start, end: record.end, minutes: record.minutes,
          content: record.content, category: record.category,
          taskId: record.taskId, taskText: record.taskText,
          countAsStudy: record.countAsStudy !== false, auto: false
        });
        S().save();
        selDate = S().todayKey();
        App.ui.closeModal();
        render();
        App.ui.toast('已复制到今日');
      },
      cancel: App.ui.closeModal
    });
  }

  /* ---------- 拖动手势（Pointer Events 统一鼠标/触摸） ---------- */
  function bindDrag() {
    const grid = document.getElementById('timeline-wrap');
    const inner = document.getElementById('timeline-grid');

    function yToMin(y) {
      const rect = inner.getBoundingClientRect();
      const pct = (y - rect.top) / rect.height;
      const m = Math.round(Math.max(0, Math.min(1, pct)) * 1440 / 5) * 5;
      return Math.min(1439, m);
    }

    inner.onpointerdown = function (e) {
      if (e.target.closest('.tl-record')) return; // 记录块由 click 处理
      inner.setPointerCapture(e.pointerId);
      const startMin = yToMin(e.clientY);
      drag = { start: startMin, end: startMin, pid: e.pointerId };
      showSel(startMin, startMin);
    };
    inner.onpointermove = function (e) {
      if (!drag || e.pointerId !== drag.pid) return;
      drag.end = yToMin(e.clientY);
      showSel(drag.start, drag.end);
    };
    inner.onpointerup = function (e) {
      if (!drag || e.pointerId !== drag.pid) return;
      const a = Math.min(drag.start, drag.end);
      const b = Math.max(drag.start, drag.end);
      hideSel();
      const span = b - a;
      if (span < 5) {
        // 点击空白 → 默认 30 分钟
        recordModal(a, Math.min(1439, a + 30), null, selDate);
      } else {
        recordModal(a, b, null, selDate);
      }
      drag = null;
    };
  }

  function showSel(a, b) {
    let el = document.getElementById('tl-selection');
    if (!el) {
      el = document.createElement('div');
      el.id = 'tl-selection';
      el.className = 'tl-selection';
      document.getElementById('timeline-grid').appendChild(el);
    }
    const top = (Math.min(a, b) / 60) * HOUR_H;
    const height = Math.max(8, ((Math.abs(b - a)) / 60) * HOUR_H);
    el.style.top = top + 'px';
    el.style.height = height + 'px';
  }
  function hideSel() {
    const el = document.getElementById('tl-selection');
    if (el) el.remove();
  }

  /* ---------- 记录点击 → 编辑 ---------- */
  function bindRecordClick() {
    const grid = document.getElementById('timeline-grid');
    grid.onclick = function (e) {
      if (drag) return;
      const recEl = e.target.closest('.tl-record');
      if (!recEl) return;
      const day = S().getDay(selDate);
      const rec = day.timeline.find(function (r) { return r.id === recEl.dataset.id; });
      if (rec) recordModal(rec.start, rec.end, rec, selDate);
    };
  }

  /* ---------- 工具栏 ---------- */
  function bindToolbar() {
    document.getElementById('tl-today-btn').onclick = function () {
      selDate = S().todayKey();
      document.getElementById('tl-date').value = selDate;
      render();
    };
    document.getElementById('tl-prev-day').onclick = function () { shift(-1); render(); };
    document.getElementById('tl-next-day').onclick = function () { shift(1); render(); };
    document.getElementById('tl-date').onchange = function () {
      selDate = this.value || S().todayKey();
      render();
    };
    document.getElementById('tl-filter-cat').onchange = function () { selCat = this.value; render(); };
    document.getElementById('tl-keyword').oninput = function () { selKw = this.value.trim(); render(); };
    document.getElementById('tl-export').onclick = exportModal;
    document.getElementById('tl-import').onclick = function () {
      document.getElementById('import-file').click();
    };
    document.getElementById('import-file').onchange = function () {
      const f = this.files[0];
      if (!f) return;
      const reader = new FileReader();
      reader.onload = function () {
        const ok = S().importJSON(String(reader.result));
        App.ui.toast(ok ? '✅ 导入成功，数据已恢复' : '❌ 文件格式不对');
        if (ok) { App.tasks.renderAll(); render(); if (App.stats) App.stats.render(); }
        document.getElementById('import-file').value = '';
      };
      reader.readAsText(f, 'utf-8');
    };
  }

  function exportModal() {
    App.ui.openModal('📤 导出数据', '<p style=\"font-size:13.5px\">选择导出格式：</p>',
      '<button class=\"btn btn-primary\" data-act=\"json\">导出全部数据 (.json)</button>' +
      '<button class=\"btn\" data-act=\"csv\">导出记录 (.csv)</button>' +
      '<button class=\"btn\" data-act=\"cancel\">取消</button>');
    App.ui.bindActions({
      json: function () { S().exportJSON(); App.ui.closeModal(); App.ui.toast('已导出 .json 备份'); },
      csv: function () { S().exportCSV(); App.ui.closeModal(); App.ui.toast('已导出 .csv 记录'); },
      cancel: App.ui.closeModal
    });
  }

  /* ---------- 初始化 ---------- */
  function init() {
    selDate = S().todayKey();
    render();
    bindDrag();
    bindRecordClick();
    bindToolbar();
  }

  App.timeline = {
    init: init, render: render,
    setDate: function (k) { selDate = k; },
    getDate: function () { return selDate; }
  };
})();