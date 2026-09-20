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
    // ⏰ v71 学习时段：这里只是把当前值显示出来，逻辑都在 tasks.js
    const slA = (App.tasks && App.tasks.slotHM) ? App.tasks.slotHM('slotNewStart') : '08:00';
    const slB = (App.tasks && App.tasks.slotHM) ? App.tasks.slotHM('slotNewEnd') : '16:00';
    const slSame = slA === slB;
    const slRest = slSame ? '<br><b>起止时间填成一样了</b> → 不区分时段，全天都算复习时间。' : '';
    // 📐 实时对照：新知识时间结束 + 最后一轮复习间隔 ↔ 复习截止时刻（用户最关心的那个等式）
    const slDl = s.srDeadline || '22:00';
    const slGaps = (s.srGaps && s.srGaps.length) ? s.srGaps : [30, 120, 360];
    const slLastGap = Math.max(1, +slGaps[slGaps.length - 1] || 360);
    const slToMin = function (t) {
      const p = String(t || '').split(':');
      return (parseInt(p[0], 10) || 0) * 60 + (parseInt(p[1], 10) || 0);
    };
    const slFmt = function (m) {
      m = ((m % 1440) + 1440) % 1440;
      return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
    };
    const slGapTxt = (slLastGap % 60 === 0) ? (slLastGap / 60) + ' 小时' : slLastGap + ' 分钟';
    const slEndMin = slToMin(slB), slDlMin = slToMin(slDl), slTieMin = slEndMin + slLastGap;
    let slTie;
    if (slSame) {
      slTie = '';
    } else if (slTieMin === slDlMin) {
      slTie = '<br>📐 按你现在填的：<b>' + slB + '</b> 学完 + 最后一轮 <b>' + slGapTxt +
        '</b> = <b>' + slFmt(slTieMin) + '</b>，正好压在「复习截止 ' + slDl + '」上 ✅ 一轮不多、一轮不少。';
    } else if (slTieMin < slDlMin) {
      slTie = '<br>📐 按你现在填的：<b>' + slB + '</b> 学完 + 最后一轮 <b>' + slGapTxt +
        '</b> = <b>' + slFmt(slTieMin) + '</b>，比「复习截止 ' + slDl + '」还早 <b>' + (slDlMin - slTieMin) +
        ' 分钟</b>，很宽裕 ✅';
    } else {
      slTie = '<br>⚠️ 按你现在填的：<b>' + slB + '</b> 学完 + 最后一轮 <b>' + slGapTxt +
        '</b> = <b>' + slFmt(slTieMin) + '</b>，会<b>超过</b>「复习截止 ' + slDl + '」<b>' + (slTieMin - slDlMin) +
        ' 分钟</b> —— 把新知识时间提前结束，或去「🌱 主动回忆」里把截止时刻改晚点。';
    }

    box.innerHTML =
      '<div class="set-group"><h4>📦 当前版本</h4>' +
      '<p class="hint">页面版本 <b>v' + (window.__BUILD || '?') + '</b>。' +
      '每次改完上传后，这个数字就会变大；' +
      '<b>如果还是老数字</b>，说明浏览器还在用缓存的旧页面 —— ' +
      '按一次 <b>Ctrl + F5</b> 强刷即可。</p>' +
      '</div>' +
      '<div class="set-group"><h4>🎉 保底奖励（必须任务全部完成时）</h4>' +
      numRow('set-base-points', '累积积分', s.baseRewardPoints, '分') +
      '</div>' +
      '<div class="set-group"><h4>⭐ 积分规则（每条任务可单独定价）</h4>' +
      numRow('set-ideal-points', '新理想任务默认积分', s.idealPoints, '分/条') +
      numRow('set-ext-points', '新拓展任务默认积分', s.extPoints, '分/条') +
      numRow('set-sub-points', '新小题默认积分', s.subDefaultPoints, '分/题') +
      '<p class="hint">每条任务的积分现在直接写在任务后面（任务行上的数字框），随时可单独修改：完成这条给多少分由你定。这里的数值只是新任务的默认值。</p>' +
      '</div>' +
      '<div class="set-group"><h4>🌱 长期拓展任务：没做完怎么算</h4>' +
      (s.extStrict
        ? '<p class="hint" style="margin-bottom:6px">现在是<b>严格模式</b>，就这样走：</p>' +
          '<p class="hint" style="margin-bottom:6px">' +
          '① 今天没做完 → 点「🏁 结束今天」时<b>自动搬到明天的拓展栏</b>（前面带「↩ 顺延」标记）——<br/>' +
          '   明天照样能打勾、能开计时、能开课，不用翻回昨天去处理；<br/>' +
          '② 搬过来的那条<b>第二天还是没做完</b> → 明天结算时按下面这个倍数<b>真扣分</b>，' +
          '并且不再往后搬（只宽限一次，不会一路挂着扣）。</p>'
        : '<p class="hint" style="margin-bottom:6px">现在<b>没开</b>严格模式：长期拓展没做完，跟普通任务一样处理（跟着「顺延」开关走，不扣分）。</p>') +
      numRow('set-ext-debt-rate', '拖过宽限期还没做完，扣任务分值的', s.extDebtRate, '倍') +
      '<p class="hint">1 倍 = 一条 5 分的拓展拖了两天还没做就扣 5 分；填 <b>0</b> = 只记账不扣分；填 2 = 双倍扣。' +
      '想彻底关掉这套，就把下面「行为开关」里的「🌱 长期拓展严格模式」关掉。</p>' +
      '</div>' +
      '<div class="set-group"><h4>🌱 主动回忆 + 间隔重复</h4>' +
      switchRow('set-sr-on', '开启（任务可标「📘 新知识」，完成后按遗忘曲线排当天复习）', s.srEnabled !== false) +
      '<div class="set-row"><span class="set-label">当天复习的截止时刻</span>' +
      '<input type="time" id="set-sr-deadline" class="set-input" value="' + (s.srDeadline || '22:00') + '" /></div>' +
      '<div class="set-row"><label>三轮复习的间隔（分钟，逗号隔开）</label>' +
      '<input type="text" id="set-sr-gaps" class="set-input" style="width:120px" value="' +
      ((s.srGaps && s.srGaps.length ? s.srGaps : [30, 120, 360]).join(',')) + '" /></div>' +
      numRow('set-sr-points', '每完成一轮复习，得积分', s.srPoints == null ? 5 : s.srPoints, '分') +
      numRow('set-sr-kp-points', '每设一条知识点（自己出题），得积分', s.srKpPoints == null ? 2 : s.srKpPoints, '分') +
      numRow('set-sr-bonus', '当天这一课的几轮全做完，额外奖励', s.srFinishBonus == null ? 5 : s.srFinishBonus, '分') +
      '<p class="hint">' +
      '在「添加任务 / 编辑任务」里把一条任务标成 <b>📘 新知识</b>，它完成后会：<br>' +
      '① 引导你<b>自己出几个小问题</b>（这就是主动回忆 —— 试着复述一遍，比单纯再看一遍书管用）；<br>' +
      '② 按上面的<b>三个间隔</b>，从「完成时刻」往后排当天的复习轮次，到点会在首页顶部提醒你。<br>' +
      '默认 <b>30 / 120 / 360 分钟</b>（最后一次放在睡前效果最好，睡眠会帮你巩固）。<br>' +
      '按默认值算，想在 <b>' + (s.srDeadline || '22:00') + '</b> 前跑完三轮，最晚要在 <b>' +
      '16:00</b> 左右把学习任务做完 —— 首页会告诉你具体几点前。<br>' +
      '<b>只安排当天</b>：第二天以后要不要再复习，你自己用日历的 🔁 安排（间隔拉长反而更好）。' +
      '当天没做完的轮次<b>不扣分</b>，只作记录。</p>' +
      '</div>' +
      '<div class="set-group"><h4>⏰ 学习时段（新知识时间 / 复习时间）</h4>' +
      switchRow('set-slot-on', '开启（首页顶部会显示「现在是新知识时间还是复习时间」）', s.slotOn !== false) +
      '<div class="set-row"><span class="set-label">新知识时间</span>' +
      '<input type="time" id="set-slot-start" class="set-input" value="' + slA + '" />' +
      '<span class="unit">到</span>' +
      '<input type="time" id="set-slot-end" class="set-input" value="' + slB + '" />' +
      '<span class="unit">结束（这个点之后，新的课就先别开了）</span></div>' +
      '<p class="hint">' +
      '<b>' + slA + ' – ' + slB + '</b> 是<b>开新课的时段</b> —— <b>复习在这段时间里照样做，不用避开</b>' +
      '（比如每半小时一轮的小复习，本来就是在这一段里发生的）。<br>' +
      '过了 <b>' + slB + '</b>，<b>新的课就先别开了</b> —— 剩下的时间一直交到第二天 ' + slA + ' 之前，都留给复习（复习 / 整理 / 做题）。<br>' +
      '首页最上面那条会随时告诉你现在处在哪一段、还有多久切段；任务行上「📘 新知识」的徽标在复习时间里会变淡，' +
      '提示你这一条留到下次新知识时间开头学更划算（添加 / 编辑任务时也会写一行）。<br>' +
      '<b>不是硬性规定</b> —— 到点了也不会拦你，只是提醒你「新的先别开、把学过的东西过一遍」；' +
      '想继续学新课照样能打勾、能计时。把最上面那个开关关掉，这些提示就全没了。' +
      slTie + slRest + '</p>' +
      '</div>' +
      '<div class="set-group"><h4>🎯 任务组：整组做完的整体奖励</h4>' +
      numRow('set-group-reward', '整组题目全做完，额外奖励', s.groupRewardPoints, '分') +
      '<p class="hint">任务组（用「🎯 建一个任务组」打包起来的那一摞小题）里的题<b>全部做完</b>时，' +
      '除了每道题自己的积分，再额外发这一笔<b>整体奖励</b>。新建/编辑任务组时还能给每组单独定分（填 0 = 这组不要）。' +
      '奖励只在第一次全做完时发一次，不会重复发。</p>' +
      '</div>' +
      '<div class="set-group"><h4>🧹 数据体检</h4>' +
      '<div class="set-row"><span class="set-label">未来日期的空记录</span>' +
      '<button class="btn btn-small" id="btn-future-clean">🔍 查看 / 清理</button></div>' +
      '<p class="hint">有些"还没到"的日期会不小心在数据里留下记录（点开过日历就会）。这里能一次看清楚：' +
      '<b>空白的</b>一键删掉；你<b>提前安排</b>了任务的未来日期会单独标出来，默认不动它。</p>' +
      '</div>' +
      '<div class="set-group"><h4>🏆 完美额外奖励（三类全部完成时）</h4>' +
      numRow('set-perfect-points', '全部任务完成奖励积分（可自定义）', s.perfectRewardPoints, '分') +
      '</div>' +
      '<div class="set-group"><h4>⏱ 小时计划</h4>' +
      numRow('set-hour-min', '每个小时计划的默认时长', s.hourPlanDefaultMin, '分钟') +
      numRow('set-hour-cut', '中途消耗自查扣积分（出现一次扣这段的%）', s.hourDistractCut, '%') +
      '<p class="hint">开始一小时计划时可改。这一段的时长内，你分配 必须/理想/拓展 各学多久；达标后自查中途有没有干消耗性的事（看手机/刷屏等），有就按上面这个百分比扣掉这段奖励积分（默认100%＝出现过就扣光）。</p>' +
      '</div>' +
      '<div class="set-group"><h4>🎨 主题外观</h4><div class="theme-row">' +
      [
        ['', '☀️ 默认浅色', '#f4f6f8'],
        ['ocean', '🌊 海洋', '#0284c7'],
        ['sakura', '🌸 樱花', '#e56b8c'],
        ['forest', '🌲 森林', '#2f9e63'],
        ['dark', '🌙 深色', '#17203a'],
        ['purple', '🌌 暗夜紫', '#a78bfa']
      ].map(function (t) {
        return '<button class="theme-chip' + ((s.theme || '') === t[0] ? ' on' : '') + '" data-th="' + t[0] + '">' +
          '<span class="theme-dot" style="background:' + t[2] + '"></span>' + t[1] + '</button>';
      }).join('') +
      '</div><p class="hint">换主题即时生效，选择会记住。深色主题下所有页面自动适配。</p></div>' +
      '<div class="set-group"><h4>🔘 行为开关</h4>' +
      switchRow('set-ext-append', '拓展任务完成后可继续追加', s.extAppendable) +
      switchRow('set-rollover', '每日未完成任务自动顺延到明天', s.rollover) +
      switchRow('set-ext-strict', '🌱 长期拓展：没做完自动搬到第二天的拓展栏（明天还能打勾/计时），第二天还没做完才扣分', s.extStrict) +
      '</div>' +
      '<div class="set-group"><h4>📋 队列 + 📌 每日必做</h4>' +
      numRow('set-queue-points', '完成一条队列任务的积分', (s.queuePoints == null ? 5 : s.queuePoints), '分/条') +
      switchRow('set-queue-bar', '任务页顶部显示「📋 现在做这条」', s.queueBarOn !== false) +
      switchRow('set-qfirst', '🧲 队列优先模式：打开 app 直接进队列页；任务页空着的栏目自动收起（适合「不定任务、按顺序做、到点收工」的用法）', s.queueFirst === true) +
      '<p class="hint">队列是一串<b>按顺序做</b>的任务：页面上只显示「现在做这条」，做完下一条自动顶上，<b>刻意不显示完成率</b>。复习、听力、单词这类每天都要碰的放进「📌 每日必做」，打勾即可、也不算完成率。</p>' +
      '</div>' +
      '<div class="set-group"><h4>⏰ 到点自动结算</h4>' +
      switchRow('set-auto-end', '每天到点自动结算今天（不用自己点「🏁 结束今天」）', s.autoEndDay) +
      '<div class="set-row"><span class="set-label">每天几点结算</span>' +
      '<input type="time" id="set-auto-end-at" class="set-input" value="' + (s.autoEndDayAt || '23:59') + '" /></div>' +
      '<p class="hint">到点会自动做和「结束今天」一样的事：把没做完的长期拓展移到第二天、该扣的扣掉、其余未完成任务按上面「顺延」开关搬走，然后那天的账就封存了。' +
      '<b>结算点设在凌晨（如 01:30）也行</b> —— 它算作「前一天的收工点」，适合熬夜到半夜。' +
      '还有任务在计时时不会结算（不打断你），停下来了才结。</p>' +
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
      '<div class="set-group"><h4>🪟 计时悬浮窗（能不能拖出浏览器）</h4>' +
      switchRow('set-float-pip', '把计时悬浮窗拖出浏览器：独立小窗、可拖到屏幕任何位置、永远置顶', s.floatPiP) +
      switchRow('set-notify', '⏰ 到点发系统通知（小时代结束 / 休息结束时，网页挂后台也能提醒）', s.notifyOnEnd) +
      '<p class="hint">拖出浏览器后，小窗里也是同一份数据：切到别的软件、甚至最小化浏览器，计时照常在走。<b>电脑版 Chrome / Edge 支持，手机上浏览器不允许，会自动退回页内悬浮窗</b>（手机上我做了防息屏）。刷新页面后小窗会收回页内，再点一次悬浮窗上的「⇱ 拖出」或任务行的「▶ 开始计时」就好——浏览器不允许网页自己偷偷开窗。</p>' +
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
    // 🌱 v70 主动回忆 + 间隔重复
    bind('set-sr-on', function () { s.srEnabled = this.checked; S().save(); App.tasks.renderAll(); });
    bind('set-sr-deadline', function () { s.srDeadline = this.value || '22:00'; S().save(); });
    bind('set-sr-gaps', function () {
      const g = String(this.value || '').split(/[,，\s]+/)
        .map(function (x) { return parseInt(x, 10); })
        .filter(function (n) { return isFinite(n) && n > 0; });
      s.srGaps = g.length ? g : [30, 120, 360];
      this.value = s.srGaps.join(',');
      S().save();
    });
    bind('set-sr-points', function () { s.srPoints = Math.max(0, +this.value || 0); S().save(); });
    bind('set-sr-kp-points', function () { s.srKpPoints = Math.max(0, +this.value || 0); S().save(); });
    bind('set-sr-bonus', function () { s.srFinishBonus = Math.max(0, +this.value || 0); S().save(); });
    // ⏰ v71 学习时段
    bind('set-slot-on', function () { s.slotOn = this.checked; S().save(); render(); App.tasks.renderAll(); });
    bind('set-slot-start', function () { s.slotNewStart = this.value || '08:00'; S().save(); render(); App.tasks.renderAll(); });
    bind('set-slot-end', function () { s.slotNewEnd = this.value || '16:00'; S().save(); render(); App.tasks.renderAll(); });
    bind('set-base-points', function () { s.baseRewardPoints = Math.max(0, +this.value || 0); S().save(); });
    bind('set-ideal-points', function () { s.idealPoints = Math.max(0, +this.value || 0); S().save(); });
    bind('set-ext-points', function () { s.extPoints = Math.max(0, +this.value || 0); S().save(); });
    bind('set-sub-points', function () { s.subDefaultPoints = Math.max(1, +this.value || 10); S().save(); });
    bind('set-perfect-points', function () { s.perfectRewardPoints = Math.max(0, +this.value || 0); S().save(); });
    bind('set-hour-min', function () { s.hourPlanDefaultMin = Math.max(1, +this.value || 30); S().save(); });
    bind('set-hour-cut', function () { s.hourDistractCut = Math.max(0, Math.min(100, +this.value || 100)); S().save(); });
    bind('set-ext-append', function () { s.extAppendable = this.checked; S().save(); });
    bind('set-rollover', function () { s.rollover = this.checked; S().save(); });
    bind('set-ext-strict', function () { s.extStrict = this.checked; S().save(); render(); });
    // 📋 v77 队列
    bind('set-queue-points', function () { s.queuePoints = Math.max(0, +this.value || 0); S().save(); });
    bind('set-queue-bar', function () { s.queueBarOn = this.checked; S().save(); if (App.queue) App.queue.refreshBar(); });
    bind('set-qfirst', function () { s.queueFirst = this.checked; S().save(); if (App.tasks) App.tasks.renderAll(); });
    bind('set-auto-end', function () { s.autoEndDay = this.checked; S().save(); });
    bind('set-auto-end-at', function () { s.autoEndDayAt = this.value || '23:59'; S().save(); });
    bind('set-ext-debt-rate', function () { s.extDebtRate = Math.max(0, +this.value || 0); S().save(); });
    bind('set-group-reward', function () { s.groupRewardPoints = Math.max(0, +this.value || 0); S().save(); });
    const fcb = document.getElementById('btn-future-clean');
    if (fcb) fcb.onclick = function () { if (App.tasks && App.tasks.futureDaysModal) App.tasks.futureDaysModal(); };
    document.querySelectorAll('.theme-chip[data-th]').forEach(function (c) {
      c.onclick = function () {
        s.theme = c.dataset.th;
        S().save();
        applyTheme();
        render();
      };
    });
    bind('set-mode', function () { s.recordMode = this.value; S().save(); });
    bind('set-rest-points', function () { s.restRewardPoints = Math.max(0, +this.value || 0); S().save(); });
    bind('set-sr-rest-min', function () { s.srRestMin = Math.max(1, +this.value || 2); S().save(); });
    bind('set-split', function () { s.splitEnabled = this.checked; S().save(); });
    bind('set-float-pip', function () {
      s.floatPiP = this.checked; S().save();
      if (!this.checked && App.tasks && App.tasks.pipBack) App.tasks.pipBack();
    });
    bind('set-notify', function () {
      s.notifyOnEnd = this.checked; S().save();
      if (this.checked && App.tasks && App.tasks.askNotify) App.tasks.askNotify();
    });
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
  /* 兑换项 emoji 猜测：按关键词给个好看的图标 */
  function itemEmoji(item) {
    const t = item || '';
    if (/游戏|steam|epic/i.test(t)) return '🎮';
    if (/零食|奶茶|咖啡|吃|喝|蛋糕|冰淇淋/.test(t)) return '🍰';
    if (/睡|懒觉|午休/.test(t)) return '😴';
    if (/视频|剧|电影|动画|番/.test(t)) return '📺';
    if (/玩一小时|玩半小时|娱乐|休息/.test(t)) return '🕹️';
    if (/买/.test(t)) return '🛍️';
    if (/外出|出去玩|公园|游乐/.test(t)) return '🎡';
    return '🎁';
  }

  function redeemModal() {
    const s = S().settings();
    const balance = S().pointsTotal();
    const table = s.redeemTable.filter(function (r) { return r.points > 0; })
      .slice()
      .sort(function (a, b) { return a.points - b.points; });
    if (!table.length) {
      App.ui.toast('兑换表还是空的，去"设置"里添加兑换项吧');
      return;
    }
    const body = '' +
      '<div class="rd-balance"><span class="rd-balance-label">当前可用积分</span>' +
      '<span class="rd-balance-num">' + balance + '</span><span class="rd-balance-unit">分</span></div>' +
      '<div class="rd-grid">' +
      table.map(function (r) {
        const afford = balance >= r.points;
        const pct = Math.min(100, Math.round(balance / r.points * 100));
        return '<div class="rd-card ' + (afford ? 'ok' : 'lock') + '">' +
          '<div class="rd-emoji">' + itemEmoji(r.item) + '</div>' +
          '<div class="rd-item">' + S().esc(r.item) + '</div>' +
          '<div class="rd-cost">' + r.points + ' 分</div>' +
          '<div class="rd-bar"><i style="width:' + pct + '%"></i></div>' +
          (afford
            ? '<button class="btn btn-primary rd-btn" data-act="redeem" data-pts="' + r.points + '" data-item="' + S().esc(r.item) + '">🎁 立刻兑换</button>'
            : '<div class="rd-locked">🔒 还差 ' + (r.points - balance) + ' 分</div>') +
          '</div>';
      }).join('') +
      '</div>' +
      '<p class="hint" style="margin-top:10px">灰色的是还没攒够的——继续赚，进度条会一点点填满。兑换会计入流水账（历史页可查）。</p>';
    const m = App.ui.openModal('🎁 积分兑换商店', body,
      '<button class="btn" data-act="cancel">关闭</button>', { lock: true });
    m.classList.add('rd-modal');
    App.ui.bindActions({
      redeem: function (btn) {
        const pts = +btn.dataset.pts;
        const item = btn.dataset.item;
        App.ui.confirm('用 ' + pts + ' 积分兑换「' + item + '」？', '兑换', function () {
          S().addLedger(S().todayKey(), 'redeem', { points: -pts, note: '兑换：' + item });
          App.ui.closeModal();
          App.ui.floatAt(document.getElementById('stat-points'), '-' + pts + '分', 'neg');
          App.ui.toast('🎉 已兑换「' + item + '」，扣 ' + pts + ' 分，好好享受！');
          App.app.refreshStats();
        });
      },
      cancel: App.ui.closeModal
    });
  }

  /* ---------- 🎨 主题应用 ---------- */
  function applyTheme() {
    document.body.dataset.theme = S().settings().theme || '';
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
    init: init, render: render, renderRedeem: renderRedeem, redeemModal: redeemModal, applyTheme: applyTheme,
    itemEmoji: itemEmoji
  };
})();