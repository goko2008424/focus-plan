/* ============================================================
 * demo.js — 「✨ 快速上手演示」：一步步自动播放核心玩法
 * 给新人看：写任务 → 计时 → 小休 → 小时计划 → 运动 → 时间轴 → 历史
 * ============================================================ */
(function () {
  'use strict';

  const App = (window.App = window.App || {});

  /* 每步的页面片段：会用 .d-mock 容器插入到 stage，配一句说明 */
  const STEPS = [
    {
      icon: '🪙',
      title: '它是学习账本',
      caption: '系统是账本，你是会计。它不替你做决定，只帮你把「时间」和「积分」算清楚。',
      dur: 3200,
      html: function () {
        return '<div class="d-logo">专注计划</div>' +
          '<div class="d-sub">系统是账本，你是会计</div>' +
          '<div class="d-pills"><span>⏱ 时间</span><span>⭐ 积分</span></div>';
      }
    },
    {
      icon: '📝',
      title: '写今天的任务',
      caption: '分成三栏：✅必须（非做不可）/ ⭐理想（状态好就做，得积分）/ 🌱拓展（每天推进一点）。',
      dur: 3000,
      html: function () {
        return '<div class="d-cols">' +
          '<div class="d-col req"><b>✅ 必须</b><i class="d-task done">✓ 背单词</i><i class="d-task">☐ 刷一份卷</i></div>' +
          '<div class="d-col ideal"><b>⭐ 理想</b><i class="d-task">☐ 弹琴 30分</i><i class="d-task">☐ 读一章书</i></div>' +
          '<div class="d-col ext"><b>🌱 拓展</b><i class="d-task">☐ 练字 10分</i></div>' +
          '</div>';
      }
    },
    {
      icon: '⏱',
      title: '点开始计时',
      caption: '每做一件事，提前填「预计内容 + 预计用时」，点 ▶ 开始。完成时对比预计、写一句总结。',
      dur: 3200,
      html: function () {
        return '<div class="d-row"><i class="d-task run">▶ 背单词</i></div>' +
          '<div class="d-float"><b>预计：20分钟</b><b class="d-time">已用 12:35</b><div class="d-bar"><i style="width:60%"></i></div></div>';
      }
    },
    {
      icon: '☕',
      title: '中间就休息',
      caption: '学一会就能点「☕ 小休」——休息单独算、不占学习时长，回来会问你休息时有消耗吗，消耗了会扣分。',
      dur: 3300,
      html: function () {
        return '<div class="d-float"><b>已连续学习 28:xx</b>' +
          '<button class="d-btn">☕ 小休</button><div class="d-bar rest"><i style="width:40%"></i></div></div>';
      }
    },
    {
      icon: '🎯',
      title: '小时计划（专治休息太久）',
      caption: '一段一段定死：几点开始、学多久、达成给多少积分提前写好。到点自动结算，超时补做不算。',
      dur: 3300,
      html: function () {
        return '<div class="d-hp"><b>⏱ 这一小时代</b>' +
          '<div class="d-hp-row"><span>09:00 → 09:30</span><span>奖励 +10分</span></div>' +
          '<div class="d-hp-row"><span>必须20 / 理想6 / 拓展4</span></div>' +
          '<div class="d-bar ok"><i style="width:100%"></i></div></div>';
      }
    },
    {
      icon: '🏃',
      title: '运动也要安排',
      caption: '前一天写好明天的运动（分组+每项设分），今天做完一项点它=+分；没做到结算时扣分，强制养成习惯。',
      dur: 3200,
      html: function () {
        return '<div class="d-hp"><b>🏃 今日运动</b>' +
          '<div class="d-hp-row"><i class="done">✓ 慢跑 20分</i><span>+5</span></div>' +
          '<div class="d-hp-row"><i>⬜ 拉伸 ×3组</i><span>+5</span></div>' +
          '<button class="d-btn">🏁 结算（没做的扣分）</button></div>';
      }
    },
    {
      icon: '🕑',
      title: '时间轴自动记账',
      caption: '每段计时结束自动生成记录。只记「已成过去」的真实时间，不能提前排未来。',
      dur: 3000,
      html: function () {
        return '<div class="d-timeline"><span class="d-block" style="height:22%">09:00 背单词</span>' +
          '<span class="d-block" style="height:14%">☕ 休息</span>' +
          '<span class="d-block" style="height:18%">10:00 刷卷</span>' +
          '<span class="d-block" style="height:10%">🏃 运动</span></div>';
      }
    },
    {
      icon: '📊',
      title: '历史看成长',
      caption: '积分流水、按日记录、本周柱状图、学习趋势——坚持用，每天都能看到自己往前挪。',
      dur: 3000,
      html: function () {
        return '<div class="d-stats"><b>积分 3737</b><b>有效学习 6h12m</b>' +
          '<div class="d-bars"><i style="height:30%"></i><i style="height:50%"></i><i style="height:40%"></i><i style="height:75%"></i></div></div>';
      }
    },
    {
      icon: '🚀',
      title: '现在就开始',
      caption: '不用完美，先记一小段。今天写 3 个任务、开一次计时，账就先记上了。',
      dur: 3200,
      html: function () {
        return '<div class="d-logo">记住：先开始</div><div class="d-start">📍 1. 写任务　▶ 2. 点计时　☕ 3. 累了就小休</div>';
      }
    }
  ];

  let idx = 0, timer = null;

  const ov = function () { return document.getElementById('demo-overlay'); };
  const stage = function () { return document.getElementById('demo-stage'); };
  const cap = function () { return document.getElementById('demo-caption'); };
  const dotsEl = function () { return document.getElementById('demo-dots'); };

  function visible() { const o = ov(); return !!o && !o.classList.contains('hidden'); }
  function stop() { if (timer) { clearTimeout(timer); timer = null; } }

  function updateDots() {
    const d = dotsEl();
    if (!d) return;
    d.innerHTML = STEPS.map(function (_, k) {
      return '<span class="d-dot' + (k === idx ? ' on' : '') + '"></span>';
    }).join('');
  }

  function build(i) {
    const s = STEPS[i];
    const st = stage(), c = cap();
    if (!st || !c) return;
    st.innerHTML = (s.html ? s.html() : '');
    c.innerHTML = '<div class="d-icon">' + s.icon + '</div>' +
      '<div class="d-title">' + s.title + '</div>' +
      '<div class="d-cap">' + s.caption + '</div>';
    // 重放进入动画
    st.classList.remove('d-on'); void st.offsetWidth; st.classList.add('d-on');
    c.classList.remove('d-on'); void c.offsetWidth; c.classList.add('d-on');
    updateDots();
    const p = document.getElementById('demo-prev');
    const n = document.getElementById('demo-next');
    if (p) p.classList.toggle('disabled', i === 0);
    if (n) n.textContent = (i === STEPS.length - 1) ? '✓ 看完啦（点我关闭）' : '下一步 →';
  }

  function play(i) {
    idx = ((i % STEPS.length) + STEPS.length) % STEPS.length;
    build(idx);
    schedule();
  }

  function schedule() {
    stop();
    const s = STEPS[idx];
    if (!s || s.hold) return;
    timer = setTimeout(function () {
      if (visible()) play(idx + 1);
      else stop();
    }, s.dur || 3000);
  }

  function next() {
    if (idx >= STEPS.length - 1) { App.demo.close(); return; } // 最后一步再点 = 关闭，别绕回第一页
    play(idx + 1);
  }
  function prev() { play(idx - 1); }

  function bind() {
    const o = ov();
    if (!o) return;
    const cl = o.querySelector('#demo-close');
    const pv = o.querySelector('#demo-prev');
    const nx = o.querySelector('#demo-next');
    const rs = o.querySelector('#demo-restart');
    const bk = o.querySelector('#demo-backdrop');
    if (cl) cl.onclick = App.demo.close;
    if (pv) pv.onclick = prev;
    if (nx) nx.onclick = next;
    if (rs) rs.onclick = function () { play(0); };
    if (bk) bk.onclick = App.demo.close;
  }

  App.demo = {
    init: bind,
    open: function () {
      const o = ov();
      if (!o) return;
      bind(); // 每次打开都重绑：overlay 的 HTML 在脚本之后，页面加载时的绑定时元素还不存在、按钮会全失灵
      o.classList.remove('hidden');
      idx = 0; build(0); schedule();
    },
    close: function () {
      stop();
      const o = ov();
      if (o) o.classList.add('hidden');
    },
    next: next, prev: prev
  };
})();
