/* ============================================================
 * app.js — 应用骨架：启动 · 视图切换 · 顶部统计条 · 计时条绑定
 * ============================================================ */
(function () {
  'use strict';

  const App = (window.App = window.App || {});
  const S = () => App.store;

  let currentView = 'tasks';
  let lastPoints = null;

  /* ---------- 顶部统计条 ---------- */
  function refreshStats() {
    const day = S().getDay(S().todayKey());
    const done = function (k) { return day.tasks[k].filter(function (t) { return t.done; }).length; };
    document.getElementById('stat-req').textContent = done('required') + '/' + day.tasks.required.length;
    document.getElementById('stat-ideal').textContent = done('ideal') + '/' + day.tasks.ideal.length;
    document.getElementById('stat-extra').textContent = done('extra') + '/' + day.tasks.extra.length;

    const pts = S().pointsTotal();
    const ptsEl = document.getElementById('stat-points');
    ptsEl.textContent = pts;
    if (lastPoints !== null && pts !== lastPoints) {
      ptsEl.classList.remove('stat-points-bump');
      void ptsEl.offsetWidth; // 重启动画
      ptsEl.classList.add('stat-points-bump');
    }
    lastPoints = pts;

    document.getElementById('stat-leisure').textContent = S().fmtDur(S().leisureTotal());
    const used = day.sessions.reduce(function (s, x) { return s + (x.actualMinutes || 0); }, 0);
    document.getElementById('stat-used').textContent = S().fmtDur(used);
  }

  /* ---------- 公告 / 使用指南 ---------- */
  function aboutModal() {
    const bodyHTML = '' +
      '<div style="border-left:4px solid #3b82f6;padding:4px 12px;margin-bottom:14px">' +
      '<p style="font-size:13.5px;color:#374151">本工具由 <b>Goko</b> 开发，为个人学习管理而做：<b>系统是账本，你是会计</b>。它不替你做任何决定，只帮你把账算清楚，让你对自己的「时间资产」和「积分资产」一目了然。</p>' +
      '</div>' +

      '<h4 style="margin:14px 0 6px;color:#2d3a4a">🧠 这个工具是为了解决什么问题？</h4>' +
      '<p style="font-size:13.5px">作者在自我反思中发现：白天状态不错，但晚间状态很难保证；原计划要求晚 11 点前不浏览信息（信息节食），可学习枯燥，理智脑不在线时难免会刷手机，意志力被反复消耗，状态越来越差。核心矛盾是——<b>任务设置与状态形成是冲突的</b>。</p>' +

      '<h4 style="margin:14px 0 6px;color:#2d3a4a">💡 为什么这个方法有用？</h4>' +
      '<p style="font-size:13.5px"><b>① 任务降档（70%~80%）</b>：望不到头的任务会削减动力、导致懈怠和效率下降。把任务定成原来能完成的 70%~80%，同样的时间能完成、甚至因为轻松还多做一些，休闲时间也更长。</p>' +
      '<p style="font-size:13.5px"><b>② 奖惩机制</b>：更快完成任务 = 更快收获成果 = 更多休闲时间（不用死等 22:00 才结束）。用「完成就收工」的盼头抑制中途刷手机的冲动，而不是靠硬忍。</p>' +
      '<p style="font-size:13.5px"><b>③ 降低决策成本（附带结果）</b>：不再需要时刻调用意志力对抗「想玩手机」的念头，意志力不被持续消耗，专注力自然更稳。</p>' +

      '<h4 style="margin:14px 0 6px;color:#2d3a4a">🗂 所有功能是干什么的？</h4>' +
      '<ul style="font-size:13.5px;padding-left:20px;line-height:1.9">' +
      '<li><b>任务</b>：三栏目标——✅必须完成（核心任务）/ ⭐理想（状态好时额外做，得积分）/ 🌱拓展（兴趣技能类每日推进，得积分）。提前一天填写。</li>' +
      '<li><b>⏱ 计时</b>：每次开始前填写「预计完成内容 + 预计用时」，完成后对比预计 vs 实际并写一句总结（做完了吗/心得），暂停不计时。悬浮窗可按住拖到任意位置。</li>' +
      '<li><b>🧩 小任务</b>：总任务下可以再拆小任务（如「第3题 5分钟」），按 ▶ 开始倒计时，到点提醒你完成没——完成得积分、没完成也知道卡在哪，限时做题更容易进入心流。</li>' +
      '<li><b>🎯 任务组（SmartGoal）</b>：把几个关联的小题打包成一组，整组都做完就奖励一段休息（自动进时间轴+休闲累计）——专治「大任务太沉、开不了头」，比如「搞定第三章」拆成3题一组。</li>' +
      '<li><b>🔄 时段衔接</b>：学完一段，点底部「🔄 一段做完了」选休息/杂事/娱乐，填开始时间 → 结束后填结束时间/感想，自动进时间轴，一整天连贯。严格模式下休息要填状态（好好休息得积分）。</li>' +
      '<li><b>🤖 AI 复盘</b>：设置里填一个 SiliconFlow 免费 API Key，今天页点「🤖 AI 今日复盘」，自动把今日超时/薄弱点/建议总结出来（浏览器直连若被浏览器拦，可用代理/桌面插件）。</li>' +
      '<li><b>🎉 奖励</b>：必须任务全部完成 → 保底奖励弹窗；三类全部完成 → 完美额外奖励。<b>休闲时间和积分可以同时加</b>，加多少你说了算。</li>' +
      '<li><b>⭐ 积分</b>：每条理想/拓展任务都在任务后面直接标价（如弹琴30分钟 8分、弹琴1小时 5分，权重完全自己定），完成打勾即得积分；兑换表（多少分换什么）由你自定义，兑换即扣分。</li>' +
      '<li><b>📅 时间轴</b>：柳比歇夫式时间记录——任务计时自动生成记录（带现实起止时间），其余时间（吃饭/睡觉/游戏）手动点空白或拖动添加，让每一个小时都有据可查。</li>' +
      '<li><b>📊 历史</b>：按日记录、积分流水账、本周柱状图、本月学习趋势，看得到自己的成长。</li>' +
      '<li><b>⚙️ 设置</b>：时段、奖励数值、积分定价、顺延开关……全部由你自己定。</li>' +
      '</ul>' +

      '<h4 style="margin:14px 0 6px;color:#2d3a4a">🚀 应该如何使用？（一天完整流程）</h4>' +
      '<ol style="font-size:13.5px;padding-left:20px;line-height:1.9">' +
      '<li><b>前一天晚上</b>：任务页切到「明天」，填写明天的任务——必须任务一定要定少一点（70%~80% 的量），理想、拓展各填几条；顺便去设置里定好奖励数值和兑换表。</li>' +
      '<li><b>早上</b>：任务页切到「今天」，开始第一条任务，点 ▶ 开始计时，填预计完成内容和预计用时。</li>' +
      '<li><b>完成任务</b>：点 ⏹ 完成，看预计 vs 实际的对比，确认后给任务打勾 ☑（理想/拓展打勾即得积分）。</li>' +
      '<li><b>保底达成</b>：必须任务全部打勾 → 弹出奖励（休闲时间 + 积分可同时加，数值任意改），然后决定继续理想任务、进拓展、还是提前收工。</li>' +
      '<li><b>随时补账</b>：时间轴页把吃饭、午休、游戏的时间也补上，一天结束一目了然。</li>' +
      '<li><b>结束今天</b>：未完成任务勾选顺延到明天（无惩罚），再去「明天」页看看明天的任务。</li>' +
      '<li><b>常看历史</b>：看周图、月线和流水账——「看得见成果」是这个方法能否长期生效的关键。</li>' +
      '</ol>' +

      '<h4 style="margin:14px 0 6px;color:#2d3a4a">📋 默认规则（全部可在设置里改）</h4>' +
      '<p style="font-size:13.5px">任务时段 08:00–22:00 · 拓展时段 22:00–23:00 · 保底奖励 休闲+30分钟 和（或）积分+10 · 理想每条 +10 分 · 拓展每条 +5 分 · 完美奖励 休闲+30 和（或）积分+20 · 未完成顺延无惩罚 · 拓展可追加</p>' +

      '<p style="margin-top:16px;font-size:12.5px;color:#8a919c">数据只保存在你自己的浏览器里（双备份 + 可导出），不会上传到任何服务器。—— Goko</p>';

    App.ui.openModal('📖 公告 · 使用指南', bodyHTML,
      '<button class="btn btn-primary" data-act="close">开始使用</button>',
      { wide: true, closeIcon: true });
    App.ui.bindActions({
      close: App.ui.closeModal
    });
  }

  /* ---------- 视图切换 ---------- */
  function switchView(v) {
    currentView = v;
    document.querySelectorAll('.nav-btn').forEach(function (b) {
      b.classList.toggle('active', b.dataset.view === v);
    });
    document.querySelectorAll('.view').forEach(function (sec) {
      sec.classList.toggle('active', sec.id === 'view-' + v);
    });
    if (v === 'timeline') App.timeline.render();
    if (v === 'stats') App.stats.render();
    if (v !== 'timeline') { /* timeline 隐藏时仍可渲染，无碍 */ }
  }

  function refreshAll() {
    App.tasks.renderAll();
    if (App.timeline) App.timeline.render();
    if (App.stats) App.stats.render();
  }

  /* ---------- 启动 ---------- */
  function init() {
    S().load();

    // 主导航
    document.querySelectorAll('.nav-btn').forEach(function (b) {
      b.onclick = function () { switchView(b.dataset.view); };
    });

    // 顶部积分按钮 → 兑换
    document.getElementById('stat-points').onclick = function () {
      App.settings.redeemModal();
    };

    // 计时悬浮窗按钮（任务正向计时）
    document.getElementById('timer-pause').onclick = function () { App.tasks.togglePause(); };
    document.getElementById('timer-stop').onclick = function () {
      if (App.tasks.getTimer()) App.tasks.stopTimer();
    };
    // 小任务倒计时按钮
    document.getElementById('cd-pause').onclick = function () { App.tasks.toggleCdPause(); };
    document.getElementById('cd-stop').onclick = function () { App.tasks.cdFinish(); };

    App.tasks.init();
    App.settings.init();
    App.settings.render();
    if (App.link && App.link.init) App.link.init();

    // 初始化各视图
    switchView('tasks');
    App.tasks.renderAll();
    App.timeline.init();

    // 指南按钮 → 随时打开公告
    document.getElementById('btn-about').onclick = aboutModal;

    // 首次访问自动弹出公告（关闭后不再自动弹，可从「📖 指南」随时查看）
    try {
      if (!localStorage.getItem('focusPlan.aboutSeen')) {
        localStorage.setItem('focusPlan.aboutSeen', '1');
        aboutModal();
      }
    } catch (e) { /* 存储不可用时直接弹一次 */ }

    // 每分钟自动兜底保存一次（防意外）
    setInterval(function () { S().save(); }, 60000);
  }

  App.app = {
    init: init,
    switchView: switchView,
    currentView: function () { return currentView; },
    refreshAll: refreshAll,
    refreshStats: refreshStats
  };

  init();
})();