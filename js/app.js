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

    // 三段时间：与时间轴摘要完全同源（都从 day.timeline 按分类统计），保证两处一致
    var recs = day.timeline || [];
    var sum = function (f) { return recs.reduce(function (s, r) { return s + (f(r) ? (r.minutes || 0) : 0); }, 0); };
    var mainMs = sum(function (r) { return r.category === 'study' && r.countAsStudy; }) * 60000;
    var extMs = sum(function (r) { return r.category === 'extend'; }) * 60000;
    var auxMs = sum(function (r) { return r.category === 'fun'; }) * 60000;
    document.getElementById('stat-main').textContent = S().fmtDur(mainMs / 60000);
    document.getElementById('stat-extend').textContent = S().fmtDur(extMs / 60000);
    document.getElementById('stat-aux').textContent = S().fmtDur(auxMs / 60000);
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
      '<p style="font-size:13.5px"><b>① 任务降档（70%~80%）</b>：望不到头的任务会削减动力、导致懈怠和效率下降。把任务定成原来能完成的 70%~80%，同样的时间能完成、甚至因为轻松还多做一些，自由可支配的时间也更多。</p>' +
      '<p style="font-size:13.5px"><b>② 奖惩机制</b>：更快完成任务 = 更快收获成果 = 更多自由时间。用「完成就收工」的盼头抑制中途刷手机的冲动，而不是靠硬忍。</p>' +
      '<p style="font-size:13.5px"><b>③ 降低决策成本（附带结果）</b>：不再需要时刻调用意志力对抗「想玩手机」的念头，意志力不被持续消耗，专注力自然更稳。</p>' +

      '<h4 style="margin:14px 0 6px;color:#2d3a4a">🗂 所有功能是干什么的？</h4>' +
      '<ul class="about-guide-list" style="font-size:13.5px;padding-left:20px;line-height:1.9">' +
      '<li><b>任务</b>：三栏目标——✅必须完成（核心任务）/ ⭐理想（状态好时额外做，得积分）/ 🌱拓展（兴趣技能类每日推进，得积分）。每条任务可选「主线推进 / 辅助推进 / 长期推进」，编辑时可在三栏之间移动。顶部用 <b>有效学习 / 扩展 / 辅助</b> 三段时间分开记账（不复原已删的休闲体系）。</li>' +
      '<li><b>📋 从往日粘贴任务</b>：把某一天整批任务（含小题 / 任务组）一键复制到今天对应栏，再叉掉已做的——订正十几道题时不用每天重输。</li>' +
      '<li><b>🗑 回收站</b>：删任务 / 小题 / 任务组都会先进回收站，误删点「♻ 恢复」放回原处，永远不会因为手滑丢任务。</li>' +
      '<li><b>🖼 一键导出任务长图</b>：任务页顶部点「🖼 导出长图」，今天的任务清单立刻变成一张竖长图（PNG）——必须 / 理想 / 长期拓展三栏、每条的完成状态和分值、当天汇总（完成几条 / 计时多久 / 赚了多少分）全在上面，任务名长会自动折行。发给家长 / 老师 / 同学看进度，一张图就够；「明天」页也能导出。</li>' +
      '<li><b>⏱ 计时</b>：每次开始前填写「预计完成内容 + 预计用时」，完成后对比预计 vs 实际并写一句总结（做完了吗/心得），暂停不计时。悬浮窗可按住拖到任意位置。</li>' +
      '<li><b>🎯 小时计划</b>：今天页顶部的小时计划卡片——每段先<b>提前定</b>：几点开始、多长、必须/理想/拓展各做多久、以及<b>达标给多少奖励积分</b>。<b>计时权威</b>：到点自动结算、只把 [开始→到点] 窗口内的实际学习计入、超时补做不算、未达标＝0积分。<b>中途消耗自查</b>：达标先自查有没有看手机/刷屏，有则按设置%扣（默认100%＝扣光），休息结束同样自查。</li><li><b>休息系统</b>：段结束强制选「继续做 / 去休息」；休息可定 类型（纯休息/吃饭/睡觉）+时长+提前填「好好休息」积分，可提前结束、到点自动结束，结束强制开下一段。</li><li><b>秒级计时 + 复盘</b>：小任务记到秒可累加；开始段可关联任务，历史页每条可写感想；可「📤 导出复盘给AI」提取整天/整年；可「📌 预定明天的段」第二天一键开跑。</li><li><b>☕ 小休×小时代</b>：学习中途点「☕ 小休」，这一段的倒计时同步暂停，休多久这段就顺延多久（休息不吃窗口）。</li><li><b>到点自动结算不怕忘</b>：到点自动结算时，还在做、还没点结算的任务时间也会一并算进这一段，学够了就照常加分。<b>听课的时间也算得进来</b>——包括"上一段就开始听、跨到这一段"的课（按重叠分钟算，不会再整条丢掉）；如果到点时你没开着页面，回来会立刻补结算并告诉你结果。<b>🌙 提示关掉也不会丢</b>：小任务到点会<b>先把时间结算掉</b>（进时间轴和今日用时），再问你完成没有——顺手关掉弹窗也没关系，任务页顶部会留一条「这题算完成吗？」（小窗抽屉里也有），随时能补标，期间照样能开下一个任务。「接着做 / 去休息」这类选择同样不会丢：没选就常驻在任务页顶部，刷新、重开都还在。</li><li><b>🪟 计时悬浮窗能拖出浏览器</b>：点悬浮窗右上「⇱ 拖出」，它变成一个独立小窗口——可拖到屏幕任意位置、永远置顶，切到别的软件甚至最小化浏览器，计时照常走字。小窗下方叠着一个可收起的抽屉：显示本组进度、剩几题，还能「✅ 做完这题」→「▶ 下一题」一键连做同一个任务组，不用回网页来回切；整组做完会弹「☕ 去休息 / ▶ 再安排点」。小时代和休息到点会发系统通知（网页挂后台也能提醒你回来安排）。<b>听课进行中也能拖出小窗</b>，且小窗里的听课面板和网页版一样全（预算能改、清单能勾、白板能写）。手机浏览器不允许网页开小窗，会自动用页内悬浮窗并开启防息屏。<b>悬浮窗的位置永远会被摁回屏幕内</b>——不管换到哪个页面、把窗口拉小，它都还在原地看得见；点「⇲ 收回」会回到默认位置。</b></li><li><b>🎓 听课三步（长在任务里）</b>：<b>没有单独的听课页了</b>——每条任务右边都有 🎧（今天、明天都有），<b>任务组里的每一道小题、单独加的小任务也都有 🎧</b>——点一下三步面板就直接展开在<b>那一条</b>下面，不用跳页。<b>小任务开课时</b>：课程名自动=题目，听课预算自动=这题的限时（5 分的题就听 5 分），走完三步自动勾掉这一题、组进度跟着 +1。面板上随手能改预算（预习/听课/整理/大奖分，会记住你上次用的）。<b>听课时能「⏸ 暂停」和「☕ 小休」</b>：刚进去就能先暂停——坐下来把预算和时间调好再开始，中途去吃饭也点暂停；暂停/小休期间时间完全冻结，1 秒都不多算（小休到点自动继续），而且这段时间<b>不会计进学习时长</b>（时间轴上会单独标出「含暂停 X 不计」）。<b>最后「整理」这一步可写可不写</b>：不想写就直接点完成，不影响积分、也不影响记录，更不会把你卡在"进行中"；想留点东西就写，之后在「历史」页能翻到。<b>🎧 连听多节</b>：点<b>整条任务</b>那一行右边的大 🎧（不是每道小题的小 🎧），会弹出「这次要连着听哪几节」的勾选窗——按任务组分组列出，<b>已听完的默认不勾</b>，底部实时显示「已选 N 节 · 预计 N 分钟」。点「▶ 开始连听」后：一节上完会<b>自动弹出下一节</b>（不点任何东西 5 秒后也会自己接着上），面板右上角有「🎧 连听 3/12」的进度。中途点「🕘 停一下」不会丢——任务页顶部会留一条「▶ 下一节」，小窗里也一样能点。正在上课时又点别的 🎧，会明确问你「换成新选的 / 先上完当前这节」，不会再像点了没反应。流程：预习封顶只读目标与总结 → 课前准备清单 → 听课空白纸记重点 → 课后用自己的逻辑重构并写核心逻辑链，三步齐了才发大奖——把"被动复制"变成"主动筛选"（方法来源：<a href="https://www.bilibili.com/video/BV1DA411N78G" target="_blank" style="color:var(--primary)">📺 B站【让我效率翻倍的听网课方法！】</a>，高度个性化，建议按自己节奏改预算）。</li><li><b>📅 日历 + 🔁 间隔重做（能细到一道题）</b>：<b>每道题后面都有 🔁</b>——任务组里的每一题、单独小任务都能单独安排到另一天重做，<b>带着它所属的任务组</b>（到了那天还是「数学复习 → 函数第一章 → 这道题」的结构）；写清重做标准（如全对/限时解出），默认复制、勾「移走」就是真转移。整条任务也能安排：可勾「把小任务/任务组一起带过去」或只带任务本身。日历页能往前翻历史任务、往后规划任意一天，忘了安排、手误安排都能 🔁 改期救回；附一年份学习热力图，学得越久颜色越深。如果今天还没结算，点「结束今天」会先结昨天，没做完的任务可当场补勾划掉；🌱 长期拓展没做完会自动搬到第二天的拓展栏（明天还能打勾、能计时），第二天还没做完才扣分。</li><li><b>🎙 笔记工坊</b>：用桌面「开始录课.bat」+「笔记网站.bat」把网课录音变成 AI 课程笔记，在「🎙 笔记」页直接看。专治「没指标就休息太久 / 中途跑去做别的」。</li>' +
      '<li><b>🧩 小任务</b>：总任务下可以再拆小任务（如「第3题 5分钟」），按 ▶ 开始倒计时，到点提醒你完成没——完成得积分、没完成也知道卡在哪，限时做题更容易进入心流。</li>' +
      '<li><b>🎯 任务组</b>：把几个关联的小题打包成一组，整组都做完就算完成——专治「大任务太沉、开不了头」，比如「搞定第三章」拆成3题一组。<b>整组全做完会额外发一笔「整组奖励积分」</b>（默认 10 分，设置里能改；新建/编辑任务组时还能给每组单独定，填 0 就是这组不要）。奖励只在第一次全做完时发一次。</li>' +
      '<li><b>📅 日历 + 🔁 间隔重做</b>：整月日历，过去显示学了多久、未来显示已排任务；点任意一天像「明天的任务」一样编辑。<b>每道题（含任务组里的题）后面都有 🔁</b>，单独安排到另一天并带着组归属；整条任务也能安排，可选用不用连小任务/任务组一起带。「明天」页还能 📋 从其他天转移任务过来（<b>只列今天和以前、且那天真有任务可搬</b>，未来的日子不会出现）：<b>每条能展开看清楚昨天哪道题做完了、哪道没做</b>，<b>默认只带没做完的题</b>（做过的不用再做一遍），也能一键「全部都带」；每道题可单独勾选，每条任务还能改<b>目标分类栏</b>——<b>拓展没做完的直接搬成第二天的「必须」</b>。搬过来的一律是初始状态。忘了安排、手误安排都能 🔁 改期救回；附一年学习热力图、近30天柱状图和当天时间构成饼图。</li>' +
      '<li><b>🌱 主动回忆 + 间隔重复（v70）</b>：把任务标成 <b>📘 新知识</b>，完成时会引导你<b>自己出几个小问题</b>（试着复述一遍，比单纯再看一遍书管用得多），并按遗忘曲线在当天排 3 轮复习（默认 完成后 +30 分 / +2 时 / +6 时）。到点首页顶部会亮一条提醒，点「▶ 开始复习」直接进 —— <b>每轮都有积分</b>，几轮全做完再给一笔。自己出题也算一笔（那是主动回忆本身）。</li>' +
      '<li><b>⏰ 留够时间才吃得到红利</b>：按默认截止 22:00 倒推，<b>最晚 16:00 前把学习任务做完</b>，三轮才跑得完；太晚开始它会问你要「只排跑得完的 / 照排 / 今天不排」。<b>只安排当天</b> —— 第二天以后要不要再复习，你用日历的 🔁 自己排，间隔拉长反而更好。当天没做完的轮次<b>不扣分</b>。</li>' +
      '<li><b>🌱 长期拓展（设置可关、扣分倍数可调）</b>：当天没做完的长期拓展，<b>结束当天时会自动复制一条到第二天的拓展栏</b>——第二天照样能打勾、能开计时、能开课，不用翻回前一天去处理。<b>两条的标签不一样，一眼分得清</b>：当天那条原任务留在原地不动，标红色的「✗ 未完成 · 已移到明天」（只作记录）；第二天多出来的那条标橙色的「↩ 昨天移过来」。搬过来的那条<b>第二天还是没做完</b>，才在第二天结算时按分值扣分（扣多少 = 任务分值 × 设置里的倍数，1 倍 = 5 分的任务扣 5 分，填 0 = 只记账不扣），扣过就不再往后搬，不会一路挂着扣。结算弹窗里「☑ 补记」勾上的照样划掉、积分照发。</li>' +
      '<li><b>🎨 主题外观</b>：设置里六套主题一键切换——默认浅色 / 海洋 / 樱花 / 森林 / 深色 / 暗夜紫，换上即刻生效、选择会记住。</li>' +
      '<li><b>🔄 时段衔接</b>：学完一段，点底部「🔄 一段做完了」选休息/杂事/娱乐，填开始时间 → 结束后填结束时间/感想，自动进时间轴，一整天连贯。严格模式下休息要填状态（好好休息得积分）。</li>' +
      '<li><b>⏰ 到点自动结算</b>：设置里定一个时刻（默认 23:59），到点自动做和「🏁 结束今天」一样的事：把没做完的长期拓展复制到第二天、该扣的扣掉、其余未完成任务按「顺延」开关搬走，然后那天的账就封存了；<b>结算点设在凌晨（如 01:30）也行</b>——它算作「前一天的收工点」，适合熬夜到半夜；到点时页面没开着也没关系，下次打开会立刻补结算一次。<b>还有任务在计时时不结算</b>（不打断你），停下来了才自动结。<b>哪天忘了结也不会漏</b>：自动结算每次都会先回头看一眼有没有「该结却还没结」的日子（最多往前 7 天），从最早那天开始依次补上 —— 所以昨天忘了点「结束今天」也没关系，没做完的拓展照样会搬到今天来。</li>' +
      '<li><b>🔄 更新之后怎么生效</b>：页面打开时会自己问一句「有没有新版本」，' +
      '有新版就自己切过去并刷新一次 —— <b>不用再按 Ctrl+F5</b>。' +
      '想确认自己看到的是不是新版：进「⚙️ 设置」页，最上面有「📦 当前版本」那一行，数字变了就是新版；' +
      '如果顶栏弹出<b>红色横幅</b>，说明有文件没传上去（横幅会点名是哪个）。</li>' +
      '<li><b>🎉 奖励</b>：必须任务全部完成 → 保底奖励弹窗；三类全部完成 → 完美额外奖励。<b>积分加多少你说了算</b>（不再发休息时间奖励，休息由你自己安排）。</li>' +
      '<li><b>⭐ 积分</b>：每条理想/拓展任务都在任务后面直接标价（如弹琴30分钟 8分、弹琴1小时 5分，权重完全自己定），完成打勾即得积分；兑换表（多少分换什么）由你自定义，兑换即扣分。点顶部积分数字打开「🎁 兑换商店」——卡片式界面，每个奖品带进度条，攒够就能换。</li>' +
      '<li><b>📅 时间轴</b>：柳比歇夫式时间记录——任务计时自动生成记录（带现实起止时间），其余时间（吃饭/睡觉/游戏）手动点空白或拖动添加，让每一个小时都有据可查。<b>听课记录只算真在学的时间</b>：中途「⏸ 暂停 / ☕ 小休」的那段不计入，卡片上会写清楚（如「含暂停 3小时 不计」），顶部「有效学习」、时间轴汇总、历史页的口径都跟着走。</li>' +
      '<li><b>📊 历史</b>：按日记录、积分流水账、本周柱状图、本月学习趋势，看得到自己的成长。<b>按日记录只记「已经过完的日子」</b>——还没到的日期不会混进来；要是发现数据里留着未来的空记录（点开过日历就会），历史页和「设置 → 🧹 数据体检」都有一个「查看 / 清理」的入口，空白的能一次删干净，你提前安排好的未来任务会单独标出来、默认不动它。</li>' +
      '<li><b>🎯 小时计划</b>：详见顶部卡片（一段定死：到点结算 / 两问自查扣分 / 休息系统衔接 / 秒级 / 每段强制复盘 / 两套AI导出 / 预定明天）。</li>' +
      '<li><b>🔥 连续学习 & 小休</b>：任务页顶部实时显示「已连续学习」——真在学就每秒累计（任务计时 / 小题倒计时 / 小时代段内都算），暂停和休息不涨，刷新页面也不丢（当天有效）。只有 ☕ 小休、小时代一段结束、小时休息结束才清零重新算。学习时点「☕ 小休」（休息单独算、不占学习，默认5分钟），休息结束问「休息中有没有消耗性的事」，有则记一次、结束今天统一扣分。只开小时代没开计时时，顶栏小休走小时计划的休息（有积分）。</li>' +
      '<li><b>🏃 运动强化</b>：新增「运动」页——运动安排<b>任选日期</b>（今天 / 明天 / 自选日期）都能写，两步操作：➕ 新建一个<b>大项</b>（这次做什么，如「跳绳 3000 个」） → ➕ 在它下面<b>加分项</b>（拆成几段，如「第1段 500 个 · +5 分」，每段可设 做完+分 / 没做−分，大项还能设整组奖励）。今天临时想起来的，今日运动页「➕ 临时加一项」直接加；做完一项点它得积分，<b>手滑点错了点右侧「↩ 撤销」，加的分原路退回</b>（结算判错的「没做到」也能撤销，整组奖励一起退）；分项/大项都能 🗑 删除。没做到的结算统一扣分（扣多少由你定），编辑今天的安排不会弄丢已完成/已扣的记录。</li>' +
      '<li><b>⚙️ 设置</b>：时段、奖励数值、积分定价、顺延开关、消耗扣分比例……全部由你自己定。</li>' +
      '</ul>' +

      '<h4 style="margin:14px 0 6px;color:#2d3a4a">💪 强化休息系统（一个可自选的模式）</h4>' +
      '<p style="font-size:13.5px"><b>核心原理</b>：完成任务后<b>不该安排休息</b>，而应直接流畅切到下一个任务；休息要放在<b>任务进行中</b>（打断那个还没做完的任务）。因为没做完的任务还吊在你脑子里（工作记忆 + 未完成感），休息完你更容易回来继续；而在任务之间休息，等于强行切断做事状态，重新启动很难。</p>' +
      '<p style="font-size:13.5px">最有效的休息是<b>提前、高频、短时、放空</b>的休息；<b>玩手机 / 游戏这种高强度用脑不算休息</b>，真正的休息是闭眼放空、让大脑后台继续巩固记忆。</p>' +
      '<p style="font-size:13.5px"><b>怎么开</b>：设置 → 记录模式 → 选「💪 强化休息系统」。开启后：<b>系统不会自动弹休息提醒</b>，什么时候休息<b>完全由你决定</b>——随时点计时悬浮窗里的「☕ 小休」主动短休（每次休多久可在设置里调）。有小题的任务会显示<b>预计 / 实际 / 连续</b>三个时间：连续=上次休息后一直没歇的工作时长，小休后会重置，帮你判断自己该不该歇。</p>' +
      '<p style="font-size:13.5px">原理详解视频：<a href="https://www.bilibili.com/video/BV1J3tz6jEP3" target="_blank" rel="noopener">《完成一个任务后，不应该安排休息，应该在任务中间安排休息；最有效的休息是提前、高频、短时、放空；玩手机不是休息》</a></p>' +

      '<h4 style="margin:14px 0 6px;color:#2d3a4a">🧭 逐题拆解（可扩展小工具 · 为做一题更高效）</h4>' +
      '<p style="font-size:13.5px">这是为我自己效率做的可扩展小功能，跟三个模式互不干扰，可在「设置 → 🧭 逐题拆解」单独开关。它的由来：过去订正一道题常常<b>没有目标地发呆</b>，把答案看一遍又一遍却不进脑子。改成把一道题拆成几个<b>有目标、有计时的小步骤</b>，逼自己"主动想"而不是"被动看"。</p>' +
      '<p style="font-size:13.5px"><b>流程</b>：① 出声思考（可语音转文字，说错可重来）→ 判断思路「明确 / 不明确」→ <b>明确</b>就自己写步骤、对答案；<b>不明确</b>就先看答案、复述、回忆串通。</p>' +
      '<p style="font-size:13.5px">它<b>复用每个小题自己的倒计时和三档积分</b>（提前×2 / 按时×1.5 / 超时×1），不另搞一套积分。语音是浏览器原生功能，Chrome / Edge 最好用；其它浏览器自动降级成手打文字，照常能用。</p>' +

      '<h4 style="margin:14px 0 6px;color:#2d3a4a">🚀 应该如何使用？（一天完整流程）</h4>' +
      '<ol style="font-size:13.5px;padding-left:20px;line-height:1.9">' +
      '<li><b>前一天晚上</b>：任务页切到「明天」，填写明天的任务——必须任务一定要定少一点（70%~80% 的量），理想、拓展各填几条；顺便去设置里定好奖励数值和兑换表。</li>' +
      '<li><b>早上</b>：任务页切到「今天」，开始第一条任务，点 ▶ 开始计时，填预计完成内容和预计用时。</li>' +
      '<li><b>完成任务</b>：点 ⏹ 完成，看预计 vs 实际的对比，确认后给任务打勾 ☑（理想/拓展打勾即得积分）。</li>' +
      '<li><b>保底达成</b>：必须任务全部打勾 → 弹出积分奖励（多少你说了算），然后决定继续理想任务、进拓展、还是提前收工。休息时间由你自己安排，系统不再发"休息奖励"。</li>' +
      '<li><b>随时补账</b>：时间轴页把吃饭、午休、游戏的时间也补上，一天结束一目了然。</li>' +
      '<li><b>结束今天</b>：必须/理想的未完成任务勾选顺延到明天（无惩罚）；实际做完但没来得及勾的当场补勾划掉；拓展没做完的会自己复制一条到第二天（第二天还没做完才扣分）。结算完去「明天」页看看明天的任务。</li>' +
      '<li><b>常看历史</b>：看周图、月线和流水账——「看得见成果」是这个方法能否长期生效的关键。</li>' +
      '</ol>' +

      '<h4 style="margin:14px 0 6px;color:#2d3a4a">📋 默认规则（全部可在设置里改）</h4>' +
      '<p style="font-size:13.5px">理想每条 +10 分 · 拓展每条 +5 分 · 小题默认 +10 分 · 保底奖励 积分+10 · 完美奖励 积分+20 · 未完成顺延无惩罚 · 拓展可追加 · 任务组整组完成奖励 +10 分（可改） · 长期拓展严格模式 默认开（挂账宽限+补勾，扣分倍数默认 1 倍，都可改） · 六套主题随便换</p>' +

      '<h4 style="margin:14px 0 6px;color:#2d3a4a">📜 版本历史</h4>' +
      '<button class="btn btn-small btn-primary" id="btn-versions">📜 打开版本更新史（独立精美页）</button>' +

      '<p style="margin-top:16px;font-size:12.5px;color:#8a919c">数据只保存在你自己的浏览器里（双备份 + 可导出），不会上传到任何服务器。—— Goko</p>';

    App.ui.openModal('📖 公告 · 使用指南', bodyHTML,
      '<button class="btn btn-primary" data-act="close">开始使用</button>',
      { wide: true, closeIcon: true });
    App.ui.bindActions({
      close: App.ui.closeModal
    });
    const vb = document.getElementById('btn-versions');
    if (vb) vb.onclick = function () { window.open('version.html', '_blank'); };
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
    if (v === 'calendar' && App.calendar) App.calendar.render();
    // 运动页原来切过来不重渲染 → 改了数据切回来还是旧的（2026-09-15 修）
    if (v === 'sport' && App.sport) {
      if (App.sport.renderToday) App.sport.renderToday();
      if (App.sport.renderPlan) App.sport.renderPlan();
    }
    if (v === 'notes') notesPing();
    if (v !== 'timeline') { /* timeline 隐藏时仍可渲染，无碍 */ }
  }

  /* ---------- 🎙 笔记工坊（本机 127.0.0.1:8890）----------
     入口默认隐藏：只有本机笔记服务在运行时才显示导航按钮。
     别人的设备（没有工坊）看不到这一项，也不会被"双击bat"之类的提示困扰。 */
  function notesPing(quiet) {
    const st = document.getElementById('notes-status');
    const wrap = document.getElementById('notes-frame-wrap');
    const nav = document.getElementById('nav-notes');
    if (!st || !wrap) return;
    fetch('http://127.0.0.1:8890/api/ping', { cache: 'no-store' })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        if (j && j.ok) {
          if (nav) nav.style.display = '';
          if (quiet) return; // 开机自检：只负责亮出入口，不打扰当前页面
          st.innerHTML = '';
          wrap.style.display = 'block';
        } else {
          throw new Error('bad');
        }
      })
      .catch(function () {
        if (nav) nav.style.display = 'none';
        if (quiet) return;
        wrap.style.display = 'none';
        st.innerHTML = '<div class="card"><h3>🎙 网课笔记工坊没在运行</h3>' +
          '<p class="hint">这是装在你自己电脑上的功能：双击桌面「笔记网站.bat」启动，然后刷新本页即可。' +
          '（录音 → 转文字 → AI 笔记，全部在本机完成；其他设备上不会显示这个入口。）</p></div>';
      });
  }

  function refreshAll() {
    App.tasks.renderAll();
    if (App.timeline) App.timeline.render();
    if (App.stats) App.stats.render();
    // 听课三步面板现在挂在任务行里，renderAll 已经带上了，不用再单独渲染
    refreshStats();
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

    // 计时悬浮窗按钮：统一交给 tasks.js 绑（悬浮窗被小窗搬走 / 自愈重造后也能重新绑上）
    if (App.tasks.bindFloatButtons) App.tasks.bindFloatButtons(document.getElementById('timer-float'));

    App.tasks.init();
    App.settings.init();
    App.settings.render();
    if (App.settings.applyTheme) App.settings.applyTheme();
    if (App.sport && App.sport.init) App.sport.init();
    if (App.lecture && App.lecture.init) App.lecture.init();
    if (App.calendar && App.calendar.init) App.calendar.init();
    if (App.link && App.link.init) App.link.init();
    if (App.demo && App.demo.init) App.demo.init();
    const dbtn = document.getElementById('btn-demo');
    if (dbtn) dbtn.onclick = function () { App.demo.open(); };

    // 初始化各视图
    switchView('tasks');
    App.tasks.renderAll();
    App.timeline.init();

    // 指南按钮 → 随时打开公告
    document.getElementById('btn-about').onclick = aboutModal;

    // 不再自动弹指南（糊在页面上很烦）：改成首次使用给一条轻提示
    try {
      if (!localStorage.getItem('focusPlan.aboutSeen')) {
        localStorage.setItem('focusPlan.aboutSeen', '1');
        App.ui.toast('👋 第一次用？点右上「📖 指南」有三分钟上手教程', 5000);
      }
    } catch (e) { /* 存储不可用时静默 */ }

    // 每分钟自动兜底保存一次（防意外）
    setInterval(function () { S().save(); }, 60000);

    // 开机自检：本机笔记服务在不在？在 → 亮出「🎙 笔记」入口；不在 → 藏起来
    notesPing(true);
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