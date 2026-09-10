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
      '<div class="set-group"><h4>🎉 保底奖励（必须任务全部完成时）</h4>' +
      numRow('set-base-points', '累积积分', s.baseRewardPoints, '分') +
      '</div>' +
      '<div class="set-group"><h4>⭐ 积分规则（每条任务可单独定价）</h4>' +
      numRow('set-ideal-points', '新理想任务默认积分', s.idealPoints, '分/条') +
      numRow('set-ext-points', '新拓展任务默认积分', s.extPoints, '分/条') +
      numRow('set-sub-points', '新小题默认积分', s.subDefaultPoints, '分/题') +
      '<p class="hint">每条任务的积分现在直接写在任务后面（任务行上的数字框），随时可单独修改：完成这条给多少分由你定。这里的数值只是新任务的默认值。</p>' +
      '</div>' +
      '<div class="set-group"><h4>🏆 完美额外奖励（三类全部完成时）</h4>' +
      numRow('set-perfect-points', '全部任务完成奖励积分（可自定义）', s.perfectRewardPoints, '分') +
      '</div>' +
      '<div class="set-group"><h4>⏱ 小时计划</h4>' +
      numRow('set-hour-min', '每个小时计划的默认时长', s.hourPlanDefaultMin, '分钟') +
      numRow('set-hour-cut', '中途消耗自查扣积分（出现一次扣这段的%）', s.hourDistractCut, '%') +
      '<p class="hint">开始一小时计划时可改。这一段的时长内，你分配 必须/理想/拓展 各学多久；达标后自查中途有没有干消耗性的事（看手机/刷屏等），有就按上面这个百分比扣掉这段奖励积分（默认100%＝出现过就扣光）。</p>' +
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
      '<option value="strong"' + (s.recordMode === 'strong' ? ' selected' : '') + '>💪 强化休息系统（任务内高频短休）</option>' +
      '</select></div>' +
      numRow('set-rest-points', '休息奖励积分（好好休息才有）', s.restRewardPoints, '分') +
      '<p class="hint">「强化休息系统」：完成任务不休息、直接无缝切下一个；休息放在任务进行中。高频·短时·放空才是真休息，玩手机不算。系统不再自动弹休息提醒，什么时候休息完全由你自己决定——点计时悬浮窗里的「☕ 小休」。</p>' +
      '<div class="set-row"><span class="set-label">每次小休</span>' +
      '<input type="number" id="set-sr-rest-min" class="set-input" min="1" value="' + s.srRestMin + '" />' +
      '<span class="unit">分钟（你主动小休一次休多久）</span></div>' +
      '<p class="hint">原理见「📖 指南」里的《强化休息系统》：完成任务不安排休息、休息放在任务内；最有效的是提前、高频、短时、放空的休息。</p>' +
      '</div>' +
      '<div class="set-group"><h4>🧭 逐题拆解（可扩展小工具 · 独立开关）</h4>' +
      switchRow('set-split', '开启「🧭 逐题拆解」语音引导工具', s.splitEnabled) +
      '<p class="hint">这是为我自己效率做的可扩展小功能，跟上面三个模式互不干扰。订正一道题时：先出声思考这道题的思路（可语音转文字）→ 判断思路「明确/不明确」→ 明确了就自己写步骤、对答案；不明确就先看答案、复述、回忆串通。它<b>复用每个小题自己的倒计时和三档积分</b>（提前×2 / 按时×1.5 / 超时×1），不另搞一套积分。</p>' +
      '<p class="hint">语音转文字是浏览器原生功能，Chrome / Edge 最好用；其它浏览器（Firefox / Safari）会<b>自动降级成手动输入文字</b>，照常能用。</p>' +
      '</div>' +
      '';

    // 绑定
    function bind(id, fn) {
      document.getElementById(id).addEventListener('change', fn);
    }
    bind('set-base-points', function () { s.baseRewardPoints = Math.max(0, +this.value || 0); S().save(); });
    bind('set-ideal-points', function () { s.idealPoints = Math.max(0, +this.value || 0); S().save(); });
    bind('set-ext-points', function () { s.extPoints = Math.max(0, +this.value || 0); S().save(); });
    bind('set-sub-points', function () { s.subDefaultPoints = Math.max(1, +this.value || 10); S().save(); });
    bind('set-perfect-points', function () { s.perfectRewardPoints = Math.max(0, +this.value || 0); S().save(); });
    bind('set-hour-min', function () { s.hourPlanDefaultMin = Math.max(1, +this.value || 30); S().save(); });
    bind('set-hour-cut', function () { s.hourDistractCut = Math.max(0, Math.min(100, +this.value || 100)); S().save(); });
    bind('set-ext-append', function () { s.extAppendable = this.checked; S().save(); });
    bind('set-rollover', function () { s.rollover = this.checked; S().save(); });
    bind('set-mode', function () { s.recordMode = this.value; S().save(); });
    bind('set-rest-points', function () { s.restRewardPoints = Math.max(0, +this.value || 0); S().save(); });
    bind('set-sr-rest-min', function () { s.srRestMin = Math.max(1, +this.value || 2); S().save(); });
    bind('set-split', function () { s.splitEnabled = this.checked; S().save(); });
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