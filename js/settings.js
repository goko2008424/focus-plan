/* ============================================================
 * settings.js — 设置模块：全部自定义规则 · 积分兑换表 · 数据管理
 * ============================================================ */
(function () {
  'use strict';

  const App = (window.App = window.App || {});
  const S = () => App.store;

  function numRow(id, label, value, unit) {
    return '<div class="set-row"><label>' + label + '</label>' +
      '<input type="number" id="' + id + '" min="0" value="' + value + '" />' +
      (unit ? '<span class="unit">' + unit + '</span>' : '') + '</div>';
  }
  function timeRow(id, label, value) {
    return '<div class="set-row"><label>' + label + '</label>' +
      '<input type="time" id="' + id + '" value="' + value + '" /></div>';
  }
  function switchRow(id, label, checked) {
    return '<div class="set-row"><label>' + label + '</label>' +
      '<label class="switch"><input type="checkbox" id="' + id + '"' + (checked ? ' checked' : '') + ' />' +
      '<span class="slider"></span></label></div>';
  }

  /* ---------- 渲染 ---------- */
  function render() {
    const s = S().settings();
    const box = document.getElementById('settings-form');
    box.innerHTML =
      '<div class="set-group"><h4>⏰ 时间设置（完全自定义）</h4>' +
      timeRow('set-task-start', '任务执行时段 · 开始', s.taskStart) +
      timeRow('set-task-end', '任务执行时段 · 结束', s.taskEnd) +
      timeRow('set-ext-start', '拓展任务时段 · 开始', s.extStart) +
      timeRow('set-ext-end', '拓展任务时段 · 结束', s.extEnd) +
      '</div>' +
      '<div class="set-group"><h4>🎉 保底奖励（必须任务全部完成时）</h4>' +
      numRow('set-base-time', '增加休闲时间', s.baseRewardTime, '分钟') +
      numRow('set-base-points', '累积积分', s.baseRewardPoints, '分') +
      '</div>' +
      '<div class="set-group"><h4>⭐ 积分规则（每条任务可单独定价）</h4>' +
      numRow('set-ideal-points', '新理想任务默认积分', s.idealPoints, '分/条') +
      numRow('set-ext-points', '新拓展任务默认积分', s.extPoints, '分/条') +
      '<p class="hint">每条任务的积分现在直接写在任务后面（任务行上的数字框），随时可单独修改：完成这条给多少分由你定。这里的数值只是新任务的默认值。</p>' +
      '</div>' +
      '<div class="set-group"><h4>🏆 完美额外奖励（三类全部完成时）</h4>' +
      numRow('set-perfect-time', '增加休闲时间', s.perfectRewardTime, '分钟') +
      numRow('set-perfect-points', '累积积分', s.perfectRewardPoints, '分') +
      '</div>' +
      '<div class="set-group"><h4>🔘 行为开关</h4>' +
      switchRow('set-ext-append', '拓展任务完成后可继续追加', s.extAppendable) +
      switchRow('set-rollover', '每日未完成任务自动顺延到明天', s.rollover) +
      '</div>' +
      '<div class="set-group"><h4>🎛 记录模式（时段衔接的监管强度）</h4>' +
      '<div class="set-row"><span class="set-label">模式</span>' +
      '<select id="set-mode" class="select-small">' +
      '<option value="strict"' + (s.recordMode === 'strict' ? ' selected' : '') + '>严格监管（休息要填状态、好好休息得积分）</option>' +
      '<option value="easy"' + (s.recordMode === 'easy' ? ' selected' : '') + '>平常心（只记学习时长，休息不拷问）</option>' +
      '</select></div>' +
      numRow('set-rest-points', '严格模式「好好休息」奖励积分', s.restRewardPoints, '分') +
      '<p class="hint">两种模式都会在休息回来后问一句「休息得怎么样」（好好休息得积分 / 干别的或没休息好要写原因），也都可以「跳过这段直接接着学」。差别只在：严格版更强调每段都要记录完整。</p>' +
      '</div>' +
      '<div class="set-group"><h4>🤖 AI 复盘（SiliconFlow · 可选）</h4>' +
      '<div class="set-row"><span class="set-label">API Key</span><input type="password" id="set-ai-key" class="set-input" value="' + S().esc(s.aiKey || '') + '" placeholder="sk-..." /></div>' +
      '<div class="set-row"><span class="set-label">模型</span><input type="text" id="set-ai-model" class="set-input" value="' + S().esc(s.aiModel || '') + '" placeholder="Qwen/Qwen2.5-7B-Instruct" /></div>' +
      '<p class="hint">到 cloud.siliconflow.cn 申请免费 Key，填好后今天页点「🤖 AI 今日复盘」即可生成超时/弱点总结。Key 只存你浏览器本地，不联网上传。</p>' +
      '</div>';

    // 绑定
    function bind(id, fn) {
      document.getElementById(id).addEventListener('change', fn);
    }
    bind('set-task-start', function () { s.taskStart = this.value; S().save(); });
    bind('set-task-end', function () { s.taskEnd = this.value; S().save(); });
    bind('set-ext-start', function () { s.extStart = this.value; S().save(); });
    bind('set-ext-end', function () { s.extEnd = this.value; S().save(); });
    bind('set-base-time', function () { s.baseRewardTime = Math.max(0, +this.value || 0); S().save(); });
    bind('set-base-points', function () { s.baseRewardPoints = Math.max(0, +this.value || 0); S().save(); });
    bind('set-ideal-points', function () { s.idealPoints = Math.max(0, +this.value || 0); S().save(); });
    bind('set-ext-points', function () { s.extPoints = Math.max(0, +this.value || 0); S().save(); });
    bind('set-perfect-time', function () { s.perfectRewardTime = Math.max(0, +this.value || 0); S().save(); });
    bind('set-perfect-points', function () { s.perfectRewardPoints = Math.max(0, +this.value || 0); S().save(); });
    bind('set-ext-append', function () { s.extAppendable = this.checked; S().save(); });
    bind('set-rollover', function () { s.rollover = this.checked; S().save(); });
    bind('set-mode', function () { s.recordMode = this.value; S().save(); });
    bind('set-rest-points', function () { s.restRewardPoints = Math.max(0, +this.value || 0); S().save(); });
    bind('set-ai-key', function () { s.aiKey = this.value.trim(); S().save(); });
    bind('set-ai-model', function () { s.aiModel = this.value.trim(); S().save(); });

    renderRedeem();
    bindDataButtons();
  }

  /* ---------- 兑换表 ---------- */
  function renderRedeem() {
    const s = S().settings();
    const box = document.getElementById('redeem-table');
    box.innerHTML = s.redeemTable.length
      ? s.redeemTable.map(function (r, i) {
          return '<div class="redeem-row" data-i="' + i + '">' +
            '<input type="number" min="0" value="' + r.points + '" class="rd-pts" />' +
            '<span class="unit">分 =</span>' +
            '<input type="text" value="' + S().esc(r.item) + '" class="rd-item" placeholder="兑换内容" />' +
            '<button class="icon-btn rd-del" title="删除">🗑</button>' +
            '</div>';
        }).join('')
      : '<p class="hint">还没有兑换项，加一条吧：多少分换什么，你说了算。</p>';
    box.querySelectorAll('.rd-pts').forEach(function (input) {
      input.onchange = function () {
        s.redeemTable[+this.closest('.redeem-row').dataset.i].points = Math.max(0, +this.value || 0);
        S().save();
      };
    });
    box.querySelectorAll('.rd-item').forEach(function (input) {
      input.onchange = function () {
        s.redeemTable[+this.closest('.redeem-row').dataset.i].item = this.value.trim();
        S().save();
      };
    });
    box.querySelectorAll('.rd-del').forEach(function (btn) {
      btn.onclick = function () {
        const i = +btn.closest('.redeem-row').dataset.i;
        App.ui.confirm('删除这个兑换项？', '删除', function () {
          s.redeemTable.splice(i, 1);
          S().save();
          renderRedeem();
        });
      };
    });
  }

  /* ---------- 数据按钮 ---------- */
  function bindDataButtons() {
    document.getElementById('btn-export-json').onclick = function () {
      S().exportJSON();
      App.ui.toast('已导出 .json 全量备份');
    };
    document.getElementById('btn-export-csv').onclick = function () {
      S().exportCSV();
      App.ui.toast('已导出 .csv 记录（时间轴 + 流水）');
    };
    document.getElementById('btn-import-json').onclick = function () {
      document.getElementById('import-file').click();
    };
    document.getElementById('btn-reset').onclick = function () {
      App.ui.confirm('确定清空全部数据吗？建议先导出备份。<br/>此操作不可恢复！', '清空全部数据', function () {
        S().reset();
        App.ui.toast('已清空，一切从头开始');
        App.tasks.renderAll();
        if (App.timeline) App.timeline.render();
        if (App.stats) App.stats.render();
      });
    };
  }

  /* ---------- 兑换操作（顶部积分按钮触发） ---------- */
  function redeemModal() {
    const s = S().settings();
    const balance = S().pointsTotal();
    const table = s.redeemTable.filter(function (r) { return r.points > 0; });
    if (!table.length) {
      App.ui.toast('兑换表还是空的，去"设置"里添加兑换项吧');
      return;
    }
    const body = '<div class="field"><label>当前积分余额</label>' +
      '<p style="font-weight:800;color:#22a06b;font-size:20px">' + balance + ' 分</p></div>' +
      '<div class="field"><label>选择要兑换的内容</label>' +
      '<div style="display:grid;gap:8px">' +
      table.map(function (r) {
        const afford = balance >= r.points;
        return '<button class="btn" data-act="redeem" data-pts="' + r.points + '" data-item="' + S().esc(r.item) + '"' +
          (afford ? '' : ' disabled style="opacity:.45"') + '>' +
          r.points + ' 分 → ' + S().esc(r.item) + (afford ? '' : '（积分不足）') + '</button>';
      }).join('') +
      '</div></div>';
    App.ui.openModal('🎁 积分兑换', body,
      '<button class="btn" data-act="cancel">取消</button>', { lock: true });
    App.ui.bindActions({
      redeem: function (btn) {
        const pts = +btn.dataset.pts;
        const item = btn.dataset.item;
        App.ui.confirm('用 ' + pts + ' 积分兑换「' + item + '」？', '兑换', function () {
          S().addLedger(S().todayKey(), 'redeem', { points: -pts, note: '兑换：' + item });
          App.ui.closeModal();
          App.ui.toast('已兑换「' + item + '」，扣 ' + pts + ' 分');
          App.app.refreshStats();
          App.ui.floatAt(document.getElementById('stat-points'), '-' + pts + '分', 'neg');
        });
      },
      cancel: App.ui.closeModal
    });
  }

  /* ---------- 初始化 ---------- */
  function init() {
    document.getElementById('btn-add-redeem').onclick = function () {
      S().settings().redeemTable.push({ points: 10, item: '' });
      S().save();
      renderRedeem();
    };
  }

  App.settings = {
    init: init, render: render, renderRedeem: renderRedeem, redeemModal: redeemModal
  };
})();