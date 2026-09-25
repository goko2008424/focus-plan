/* ============================================================
 * tasks.js — 任务模块：三栏任务（必须/理想/拓展）
 *            正向计时器 · 奖惩弹窗 · 结束今天 · 明天预填
 * ============================================================ */
(function () {
  'use strict';

  const App = (window.App = window.App || {});
  const S = () => App.store;

  const COLS = [
    { key: 'required', name: '✅ 必须完成任务', desc: '无论如何都要完成的核心任务', style: 'req' },
    { key: 'ideal', name: '⭐ 理想任务（选做）', desc: '状态好、时间够时额外做，完成得积分', style: 'ideal' },
    { key: 'extra', name: '🌱 长期拓展任务', desc: '兴趣/技能类，每天推进一点，完成得积分', style: 'extra' }
  ];
  const COL_NAMES = { required: '必须', ideal: '理想', extra: '拓展' };

  let timer = null;     // 正向计时器（任务）
  let cdTimer = null;   // 倒计时器（小任务限时）
  let tickId = null;
  let activeTab = 'today';
  let srProgressGroupKey = null; // 已完成"进度休息"提醒的组/任务键（避免每 5 分钟小题都提醒）
  // 🔥 连续学习 & ☕ 小休：休息单独算不占学习；休息回来问消耗，结束今天统一扣
  const FOCUS_CUT_PER = 5; // 休息中消耗一次扣的积分
  // 连续学习 = 纯累计制：真在学（任务计时/小题倒计时/小时代段内且没暂停）每秒 +1，
  // 暂停/休息不涨；只有主动 ☕ 小休、小时代一段结束、小时休息结束才清零。
  // 刷新不丢：每 5 秒写一次 localStorage，按天失效。
  const streak = { accMs: 0 };
  let smallRest = null;    // {startAt, durMs}
  let streakSaveCnt = 0;
  // 「进行中任务」已计入小时计划的分钟数（按 taskId+startedAt 防跨段重复计入）
  const liveCredited = {};

  // 小任务开始时随机播一句至理名言
  const QUOTES = [
    '短时专注一块块垒，长时专注一座楼。',
    '别想一整章，只想眼前的这一题。',
    '保持思考连贯，别让暂停打断心流。',
    '限时不是催，是让心不再漂移。',
    '先做最难那一步，后面自然顺。',
    '这一分钟稳住，下一分钟才稳。'
  ];

  /* ---------- 计时器 ---------- */
  function isRunning() { return !!timer && !timer.paused; }

  function elapsedMs() {
    if (!timer) return 0;
    const now = timer.paused && timer.pauseAt ? timer.pauseAt : Date.now(); // 暂停时冻结计时
    let ms = now - timer.startedAt - timer.pausedMs;
    return ms;
  }

  function startTick() {
    if (tickId) return;
    tickId = setInterval(function () { App.tasks.onTick(); }, 1000);
  }
  function stopTick() {
    if (tickId) { clearInterval(tickId); tickId = null; }
  }

  function cdElapsedMs() {
    if (!cdTimer) return 0;
    const now = cdTimer.paused && cdTimer.pauseAt ? cdTimer.pauseAt : Date.now(); // 暂停时冻结倒计时
    let ms = now - cdTimer.startedAt - cdTimer.pausedMs;
    return ms;
  }
  function cdRemainingMs() {
    if (!cdTimer) return 0;
    return Math.max(0, cdTimer.minutes * 60000 - cdElapsedMs());
  }

  function onTick() {
    if (!timer && !cdTimer) { snapAt = 0; return; }
    // 🛟 v107：每 5 秒兜一次快照 —— 万一某个分支忘了写，也不会丢太多（页面被强关也顶多丢 5 秒）
    if (Date.now() - snapAt > 5000) saveTimerSnap();
    const f = floatRoot();
    if (!f || f.classList.contains('hidden')) return;
    // 正向计时区
    if (timer) {
      const usedMs = elapsedMs();
      fx('tf-used').textContent = S().fmtClock(usedMs);
      // ⏱ v102：正计时（默认）= 只有一个往上走的时钟；倒计时才画那条进度条
      const isDown = timer.mode === 'down';
      const prog = fx('tf-progress');
      if (isDown) {
        const planMs = timer.planMinutes * 60000;
        const pct = planMs > 0 ? Math.min(100, (usedMs / planMs) * 100) : 0;
        prog.style.width = pct + '%';
        prog.style.background = pct >= 100
          ? 'linear-gradient(90deg,#e2545d,#f59e0b)'
          : 'linear-gradient(90deg,#3b82f6,#22a06b)';
      } else if (prog) {
        prog.style.width = '0%';
      }
    }
    // 🔥 连续学习累计与小休倒计时都在常驻 tick（hourPlanAutoTick）里，这里不再重复处理
    // 子任务倒计时区（到点继续计时、不自动弹窗，显示超时）
    if (cdTimer) {
      // 任务内小休（强化休息系统）：倒计时展示 + 到点自动恢复原题
      if (cdTimer.microRest) {
        const secs = Math.max(0, Math.ceil((cdTimer.microEndAt - Date.now()) / 1000));
        const leftEl2 = fx('tf-cd-left');
        if (leftEl2) leftEl2.textContent = S().fmtClock(secs * 1000).replace(/^00:/, '');
        const overEl = fx('tf-cd-over');
        if (overEl) overEl.textContent = '☕ 小休中…';
        if (secs <= 0) { resumeCdAfterRest(); App.ui.toast('☕ 小休结束，接着把这题做完吧'); }
        return;
      }
      // ⏱ v102：不限时的小任务 → 正着数（只记花了多久，不提醒、不超时）
      if (!(cdTimer.minutes > 0)) {
        const leftEl0 = fx('tf-cd-left');
        if (leftEl0) { leftEl0.textContent = S().fmtClock(cdElapsedMs()); leftEl0.style.color = ''; }
        const over0 = fx('tf-cd-over');
        if (over0) over0.textContent = '';
        return;
      }
      const elapsed = cdElapsedMs();
      const total = cdTimer.minutes * 60000;
      const over = elapsed - total;
      const leftEl = fx('tf-cd-left');
      if (leftEl) {
        if (over > 0) {
          leftEl.textContent = '+' + S().fmtClock(over).replace(/^00:/, '');
          leftEl.style.color = 'var(--req)';
          fx('tf-cd-over').textContent = '已超时';
        } else {
          leftEl.textContent = S().fmtClock(total - elapsed);
          leftEl.style.color = '';
          fx('tf-cd-over').textContent = '';
        }
      }
      // 系统自动休息提醒已全部砍掉：什么时候休息完全由用户自己决定（点悬浮窗「☕ 小休」）
      const pct = total > 0 ? Math.max(0, Math.min(100, (Math.max(0, total - elapsed) / total) * 100)) : 0;
      const prog2 = fx('tf-cd-progress');
      prog2.style.width = pct + '%';
      prog2.style.background = pct <= 20
        ? 'linear-gradient(90deg,#e2545d,#f59e0b)'
        : 'linear-gradient(90deg,#3b82f6,#22a06b)';
      // 不再自动弹窗：到点继续统计，由用户点「⏹ 结束」手动弹确认
    }
  }

  /* ---------- 悬浮窗：显示 / 隐藏 / 拖动 / 位置记忆 ---------- */
  /** 💡 记住的位置只是个"建议"：不管存了什么（哪怕是坏坐标），
      最后都强制把悬浮窗摁回视口内——否则用户看到的就是"它消失了"（2026-09-15 实测踩到） */
  function applyFloatPos() {
    const f = floatRoot();
    if (!f) return;
    if (inPip()) {                            // 小窗里铺满，不用页内坐标
      f.style.left = ''; f.style.top = ''; f.style.right = ''; f.style.bottom = '';
      return;
    }
    const pos = localStorage.getItem('focusPlan.floatPos');
    if (pos) {
      const p = String(pos).split(',');
      let x = parseFloat(p[0]), y = parseFloat(p[1]);
      if (isFinite(x) && isFinite(y)) {
        setFloatXY(f, x, y);
        return;
      }
    }
    // 没记录 / 记录坏了 → 丢掉，回默认位置（右下角）
    localStorage.removeItem('focusPlan.floatPos');
    f.style.left = 'auto'; f.style.top = 'auto';
    f.style.right = ''; f.style.bottom = '';
  }

  /** 把悬浮窗摆在 (x,y)，并保证它整个落在视口内（留 6px 边） */
  function setFloatXY(f, x, y) {
    const w = f.offsetWidth || 280, h = f.offsetHeight || 120;
    const maxX = Math.max(6, window.innerWidth - w - 6);
    const maxY = Math.max(6, window.innerHeight - h - 6);
    const nx = Math.max(6, Math.min(maxX, x));
    const ny = Math.max(6, Math.min(maxY, y));
    f.style.left = nx + 'px';
    f.style.top = ny + 'px';
    f.style.right = 'auto';
    f.style.bottom = 'auto';
  }

  // 视口变小（转屏/拉窗口）后也别让它留在外面
  window.addEventListener('resize', function () { if (!inPip()) applyFloatPos(); });

  /* ================= 🪟 计时悬浮窗出浏览器（Document Picture-in-Picture） =================
     手机 / 不支持 PiP 的浏览器：自动退回页内悬浮窗（同一个元素，只是留在页面里）。
     小窗里内容就是同一个 #timer-float，所以按钮、状态天然同步，不存在两份。 */
  let pipWin = null;          // 小窗对象；null = 悬浮窗在页内
  let floatTpl = null;        // 启动时留一份悬浮窗的干净模板，掉了能重造
  let floatDragBound = false; // 文档级拖动监听只挂一次
  let pendingNext = null;     // 做完一题后待接的下一题 {taskKey,taskId,groupId,subId,text,minutes}
  let lqTimer = null;         // 🎧 连听"下一节"弹窗的 5 秒倒计时
  let groupDoneInfo = null;   // 整组做完后的提示 {taskText, groupName, taskKey, taskId}
  const PIP_VARS = ['--bg', '--card', '--ink', '--muted', '--line', '--primary', '--req', '--extra', '--ideal', '--long', '--brand'];

  function pipSupported() { return !!(window.documentPictureInPicture); }
  function inPip() { return !!(pipWin && !pipWin.closed); }
  function floatDoc() { return inPip() ? pipWin.document : document; }
  /** 悬浮窗里的元素：可能在主文档，也可能在小窗文档。
      统一按「悬浮窗自己所在的文档」来找，绝不用 document.getElementById 直取。 */
  function fx(id) { const r = floatRoot(); return r ? r.ownerDocument.getElementById(id) : null; }
  /** 取悬浮窗根元素；万一它被小窗一起销毁了，用启动时的模板重造一个（自愈） */
  function floatRoot() {
    if (inPip()) {
      const el = pipWin.document.getElementById('timer-float');
      if (el) return el;
      pipWin = null;      // 小窗还开着但元素没了 → 小窗这条路已废，退回页内重造
    }
    let f = document.getElementById('timer-float');
    if (!f && floatTpl) {
      f = floatTpl.cloneNode(true);
      f.classList.remove('in-pip');
      f.classList.add('hidden');
      f.style.left = ''; f.style.top = ''; f.style.right = ''; f.style.bottom = '';
      document.body.appendChild(f);
      bindFloat(f);
      App.ui.toast('🪟 悬浮窗掉了，已经帮你放回页面里', 3000);
    }
    return f;
  }

  let pipNagShown = false;
  /** explicit=true = 用户主动点了「⇱ 拖出」——只有这时才提示"不支持"，免得每次开计时都弹 */
  function pipOpen(explicit) {
    if (!pipSupported()) {
      if (explicit && !pipNagShown) {
        pipNagShown = true;
        App.ui.toast('这个浏览器不支持「拖出浏览器」（电脑版 Chrome / Edge 可以用），继续用页内悬浮窗就好', 4000);
      }
      return;
    }
    if (S().settings().floatPiP === false) {
      if (explicit) App.ui.toast('「拖出浏览器」在设置里被关掉了');
      return;
    }
    if (inPip()) return;
    // 听课三步进行中也允许拖出去（预习/整理都是倒计时，正需要一直看得见）
    const lecOn = !!(App.lecture && App.lecture.current && App.lecture.current());
    if (!timer && !cdTimer && !lecOn) return;   // 既没计时也没听课，就别开小窗
    window.documentPictureInPicture.requestWindow({ width: 330, height: 350 }).then(function (pw) {
      pipWin = pw;
      const doc = pw.document;
      doc.documentElement.className = 'pip';
      // ① 主题变量
      const cs = getComputedStyle(document.body);
      let vc = ':root{';
      PIP_VARS.forEach(function (v) { const val = cs.getPropertyValue(v).trim(); if (val) vc += v + ':' + val + ';'; });
      vc += '}';
      const st0 = doc.createElement('style'); st0.textContent = vc; doc.head.appendChild(st0);
      // ② 主文档样式（同源可读；跨域的跳过）
      let css = '';
      Array.prototype.forEach.call(document.styleSheets, function (ss) {
        try { Array.prototype.forEach.call(ss.cssRules, function (r) { css += r.cssText + '\n'; }); } catch (e) { /* 跳过 */ }
      });
      const st1 = doc.createElement('style'); st1.textContent = css; doc.head.appendChild(st1);
      // ③ 小窗专属覆盖（写在 index.html 的 #pip-style 里，改样式只改那一处）
      const pst = document.getElementById('pip-style');
      if (pst) { const st2 = doc.createElement('style'); st2.textContent = pst.textContent; doc.head.appendChild(st2); }
      // ④ 把悬浮窗整个搬过去
      const f = document.getElementById('timer-float');
      if (!f) { pipWin = null; return; }
      f.classList.add('in-pip');
      doc.body.appendChild(f);
      // ⑤ 小窗自己跑刷新循环：主页面被浏览器后台节流也不影响走字
      pw.__tick = function () { try { onTick(); } catch (e) { /* 忽略 */ } };
      const sc = doc.createElement('script');
      sc.textContent = 'setInterval(function(){ if (window.__tick) window.__tick(); }, 250);';
      doc.body.appendChild(sc);
      pw.addEventListener('pagehide', function () {
        // 用户用系统关闭按钮关小窗时走这里（点「⇲ 收回」则走 restoreFloat，不依赖这个事件）
        if (pipWin !== pw) return;
        restoreFloat();
      });
      applyFloatPos();
      showTimerBar();
      App.ui.toast('🪟 悬浮窗已经拖出浏览器了，拖到屏幕任意角落都行', 3000);
    }).catch(function (e) {
      // 开窗失败，或者开窗过程中出了别的错：一律退回页内，绝不留烂状态
      window.__pipErr = e;                     // 留个痕迹，方便排查
      restoreFloat();
      App.ui.toast('开小窗没成功，继续用页内悬浮窗');
    });
  }

  /* ================= 🧭 悬浮窗下方的抽屉：本组进度 / 下一题 / 拆解 ================= */
  /** 依当前倒计时（或待接的下一题）推断出任务/任务组/小题清单 */
  function drawerCtx() {
    const ref = cdTimer || pendingNext || groupDoneInfo;   // 整组做完时也要继续显示提示
    if (!ref) return null;
    const day = S().getDay(S().todayKey());
    const task = day.tasks[ref.taskKey] && day.tasks[ref.taskKey].find(function (t) { return t.id === ref.taskId; });
    if (!task) return null;
    let subs = null, group = null, gname = '';
    if (ref.groupId) {
      group = (task.groups || []).find(function (g) { return g.id === ref.groupId; }) || null;
      if (group) { subs = group.subs || []; gname = group.name || '任务组'; }
    }
    if (!subs) subs = task.subs || [];
    if (!subs.length) return null;
    let curIdx = -1;
    for (let i = 0; i < subs.length; i++) if (subs[i].id === ref.subId) curIdx = i;
    return { task: task, group: group, gname: gname, subs: subs, curIdx: curIdx, ref: ref };
  }

  /** 组内下一个还没做的小题（先往后找，再回头找落下的）；excludeIdx=正在做的这题要排掉，
      否则「做完最后一题」会被自己挡住，永远走不到「整组完成」 */
  function nextUndone(subs, curIdx, excludeIdx) {
    for (let i = curIdx + 1; i < subs.length; i++) if (subs[i].done !== true) return i;
    for (let i = 0; i < subs.length; i++) {
      if (i === excludeIdx) continue;
      if (subs[i].done !== true) return i;
    }
    return -1;
  }

  function renderDrawer() {
    const box = fx('tf-drawer');
    if (!box) return;
    const ctx = drawerCtx();
    const pend = pendingBarHTML();
    if (!ctx && !pend) { box.classList.add('hidden'); box.dataset.open = ''; box.innerHTML = ''; return; }
    box.classList.remove('hidden');
    if (!ctx) {
      // 计时全停了，但还有"待办衔接"（休息/接着做、某题没标结果）→ 别让选项消失
      box.innerHTML = '<div class="tf-dw-head"><span class="tf-dw-t">🌙 还没安排下一步</span></div>' + pend;
      bindPendingBar(box);
      return;
    }
    const open = box.dataset.open === '1';
    const doneN = ctx.subs.filter(function (s) { return s.done === true; }).length;
    const cur = ctx.curIdx >= 0 ? ctx.subs[ctx.curIdx] : null;
    let html = '<div class="tf-dw-head" data-dw="toggle">' +
      '<span class="tf-dw-t">' + (ctx.group ? '🎯 ' + S().esc(ctx.gname) : '📋 小任务') + '</span>' +
      '<span class="tf-dw-p">' + doneN + '/' + ctx.subs.length +
      (cur ? ' · 第 ' + (ctx.curIdx + 1) + ' 题' : '') + '</span>' +
      '<span class="tf-dw-a">' + (open ? '▾' : '▸') + '</span></div>' + pend;

    // —— 待接下一题 / 整组完成（收起时也显示，做完一题立刻知道下一步）
    if (pendingNext) {
      html += '<div class="tf-dw-next">' +
        '<button class="btn btn-small btn-primary" data-dw="next">▶ 下一题：' +
        S().esc(pendingNext.text) + '（' + (pendingNext.minutes > 0 ? (pendingNext.minutes + ' 分钟') : '不限时') + '）</button></div>';
    } else if (groupDoneInfo) {
      html += '<div class="tf-dw-done">🎉 ' + S().esc(groupDoneInfo.groupName || '这一组') + ' 全部做完了' +
        '<button class="btn btn-small btn-primary" data-dw="back">📋 回网页安排下一步</button></div>';
    }

    if (open) {
      html += '<div class="tf-dw-list">' + ctx.subs.map(function (s, i) {
        const st = s.done === true ? 'done' : (s.done === false ? 'fail' : 'todo');
        const now = (cdTimer && cdTimer.subId === s.id) ? ' run' : '';
        const mark = s.done === true ? '✅' : (s.done === false ? '⛔' : (cdTimer && cdTimer.subId === s.id ? '⏳' : '·'));
        return '<div class="tf-dw-item ' + st + now + '"><span>' + mark + '</span> ' +
          S().esc(s.text) + ' <span class="tf-dw-min">' + (s.minutes || 0) + '分</span></div>';
      }).join('') + '</div>';
      html += '<div class="tf-dw-acts">' +
        (cdTimer ? '<button class="btn btn-small btn-primary" data-dw="finish">✅ 做完这题</button>' +
                   '<button class="btn btn-small" data-dw="skip">⏭ 跳过这题</button>' +
                   (S().settings().splitEnabled !== false ? '<button class="btn btn-small" data-dw="split">🧭 拆解这道题</button>' : '') : '') +
        ((App.lecture && App.lecture.current && App.lecture.current()) ? '' :
          (ctx.task ? '<button class="btn btn-small" data-dw="lec">🎓 开课' +
            (cdTimer && cdTimer.subId ? '（这题）' : '（这条任务）') + '</button>' : '')) +
        '<button class="btn btn-small" data-dw="back">📋 回网页</button>' +
        '</div>';
    }
    box.innerHTML = html;
    bindPendingBar(box);
    box.onclick = function (e) {
      const t = e.target.closest('[data-dw]');
      if (!t) return;
      const a = t.dataset.dw;
      if (a === 'toggle') { box.dataset.open = open ? '' : '1'; renderDrawer(); return; }
      if (a === 'next') { startNextSub(); return; }
      if (a === 'finish') { quickFinishSub(); return; }
      if (a === 'skip') { quickSkipSub(); return; }
      if (a === 'split') { const c = cdTimer; if (c) openSplit(c.taskKey, c.taskId, c.subId, c.groupId); return; }
      if (a === 'lec') {
        const cx = drawerCtx();
        if (!cx || !cx.task) { App.ui.toast('先开一条小任务的计时，再从这里开课'); return; }
        // 正在做某道小题 → 就给这道小题开课（课程名=题目，听课预算=它的限时）
        if (cdTimer && cdTimer.subId) {
          const f2 = findSubInTask(cx.task, cdTimer.subId);
          if (f2 && f2.sub && App.lecture.startFromSub) {
            App.lecture.startFromSub(cx.task, f2.sub, cdTimer.groupId || null);
            return;
          }
        }
        // 整条任务 → 弹"这次连听哪几节"，比直接开整条清楚
        lecturePickModal((cx.ref && cx.ref.taskKey) || 'required', cx.task.id, false);
        return;
      }
      if (a === 'back') { backToPage(); return; }
    };
  }

  /** 悬浮窗在小窗里时，主页面的弹窗可能被挡在后面 → 先把页面叫到前面，
      否则用户点了「⏹ 结束」会觉得没反应（2026-09-14 自检发现） */
  function bringPageForModal() {
    if (!inPip()) return;
    // ⚠️ 2026-09-21 用户报「点了完成没反应」—— 就是这个场景：
    //    把浮动窗「⇱ 拖出」成小窗后点完成，确认窗要么开在小窗里（放不下）、要么开在网页而他正看小窗。
    //    这个确认窗有大段文字 + 输入框，小窗根本装不下 → 干脆把浮动窗收回主页面，保证他看得见。
    try { pipBack(); } catch (e) { /* 忽略 */ }
    try { window.focus(); } catch (e) { /* 浏览器可能拒绝，忽略 */ }
  }

  /** 🎓 悬浮窗里的听课面板：和任务行下面那个共用同一份状态，只是换了个地方显示 */
  /** 🧊 v106：悬浮窗状态条 —— 一眼看清现在到底谁在跑、谁停了。
      （以前只把按钮文案从「⏸ 暂停」翻成「▶ 继续」，数字停住了也不显眼；
        主计时和小任务倒计时还能同时跑，两个 ⏸ 长得一模一样，很容易停错那个。） */
  function renderFloatState() {
    const el = fx('tf-state');
    if (!el) return;
    const day = S().getDay(S().todayKey());
    const resting = !!(day.activeRest || (App.link && App.link.isPausing && App.link.isPausing()));
    const bits = [];
    if (timer) bits.push(timer.paused ? '⏸ 主计时已暂停（不计时）' : '⏱ 主计时在跑');
    if (cdTimer) bits.push(cdTimer.microRest ? '☕ 小任务小休中（不计时）'
      : (cdTimer.paused ? '⏸ 小任务已暂停（不计时）' : '⏳ 小任务在跑'));
    const both = !!(timer && cdTimer);
    const show = both || resting || (!!timer && timer.paused) || (!!cdTimer && (cdTimer.paused || cdTimer.microRest));
    el.classList.toggle('hidden', !show);
    el.classList.toggle('warn', both);
    el.textContent = resting
      ? ('😴 休息中 · ' + (bits.join(' · ') || '计时已经停了'))
      : (bits.join(' · ') + (both ? '　⚠️ 两个计时同时在跑，暂停时看清停的是哪一个' : ''));
  }

  function renderFloatLec() {
    const box = fx('tf-lec');
    if (!box) return;
    const L = (App.lecture && App.lecture.current) ? App.lecture.current() : null;
    if (!L || !App.lecture.floatPanelHTML) { box.classList.add('hidden'); box.innerHTML = ''; return; }
    box.classList.remove('hidden');
    box.innerHTML = App.lecture.floatPanelHTML();
    if (App.lecture.bindFloatLec) App.lecture.bindFloatLec(box);
  }

  /** 回到网页（小窗不关，方便你两边看） */
  function backToPage() {
    try { window.focus(); } catch (e) { /* 忽略 */ }
    App.ui.toast('👉 已切回网页，看任务页的下一步安排');
  }

  /** 从小窗直接接下一题：不用回网页切换 */
  function startNextSub() {
    const p = pendingNext;
    if (!p) return;
    pendingNext = null;
    groupDoneInfo = null;
    startCdTimer(p.taskKey, p.taskId, p.subId, p.groupId);
  }

  /** 按当前用时算三档奖励（跟 ⏹ 结束的弹窗同一套规则） */
  function subEarn(cd) {
    const elapsed = Date.now() - cd.startedAt - (cd.pausedMs || 0);
    const cap = cd.minutes * 60000;
    let tier, factor;
    if (!(cd.minutes > 0)) { tier = '完成（不限时）'; factor = 1.5; }   // ⏱ v102：不限时按「按时」档
    else if (elapsed <= cap * 0.7) { tier = '提前完成'; factor = 2; }
    else if (elapsed <= cap) { tier = '按时完成'; factor = 1.5; }
    else { tier = '超时完成'; factor = 1; }
    cd.earnTier = tier;
    cd.earnFactor = factor;
    cd.earnPoints = (cd.points || 0) > 0 ? Math.round((cd.points || 0) * factor) : 0;
    return cd;
  }

  /** 小窗上「✅ 做完这题」：不弹窗、直接记录 + 准备下一题 */
  function quickFinishSub() {
    if (!cdTimer) return;
    const cd = subEarn(cdTimer);
    const ctx = drawerCtx();
    const subs = ctx ? ctx.subs : [];
    const curIdx = ctx ? ctx.curIdx : -1;
    const ni = nextUndone(subs, curIdx, curIdx);
    const earned = cd.earnPoints || 0;
    const tier = cd.earnTier;
    // 先把"下一步"准备好，再 markSub（markSub 内部会重绘悬浮窗）
    pendingNext = null; groupDoneInfo = null;
    if (ni >= 0) pendingNext = { taskKey: cd.taskKey, taskId: cd.taskId, groupId: cd.groupId, subId: subs[ni].id, text: subs[ni].text, minutes: subs[ni].minutes };
    else groupDoneInfo = { taskText: cd.taskText, groupName: ctx && ctx.group ? ctx.gname : '', taskKey: cd.taskKey, taskId: cd.taskId, groupId: cd.groupId };
    markSub(cd, true, '');
    App.ui.toast('✅ 这题完成（' + tier + (earned ? ' +' + earned + ' 分' : '') + '）' +
      (pendingNext ? '· 点小窗「▶ 下一题」接着做' : '· 这一组做完了！'), 3200);
    if (groupDoneInfo) groupDonePrompt();
    showTimerBar();
  }

  function quickSkipSub() {
    if (!cdTimer) return;
    const cd = cdTimer;
    const ctx = drawerCtx();
    const subs = ctx ? ctx.subs : [];
    const curIdx = ctx ? ctx.curIdx : -1;
    const ni = nextUndone(subs, curIdx, curIdx);
    pendingNext = null; groupDoneInfo = null;
    if (ni >= 0) pendingNext = { taskKey: cd.taskKey, taskId: cd.taskId, groupId: cd.groupId, subId: subs[ni].id, text: subs[ni].text, minutes: subs[ni].minutes };
    else groupDoneInfo = { taskText: cd.taskText, groupName: ctx && ctx.group ? ctx.gname : '', taskKey: cd.taskKey, taskId: cd.taskId, groupId: cd.groupId };
    markSub(cd, false, '');
    App.ui.toast('⏭ 已跳过这题（不算分）', 2600);
    if (groupDoneInfo) groupDonePrompt();
    showTimerBar();
  }

  /** 整组做完 → 网页上问一句「休息还是继续」 */
  function groupDonePrompt() {
    const info = groupDoneInfo;
    if (!info) return;
    setPendingChoice('group', info.groupName || info.taskText || '');   // ★ 先落库：关掉也不会丢
    renderAll();                                            // ★ 立刻画出来 —— 用户直接用 X 关掉弹窗也不会"没有入口"
    App.ui.openModal('🎉 这一组做完了',
      '<p style="font-size:13.5px">「' + S().esc(info.groupName || info.taskText) + '」整组搞定。</p>' +
      '<p class="hint">接下来怎么安排？（小窗不关，还能接着看时间）<b>先不选也不会丢</b>——任务页顶部和小窗里一直留着这条。</p>',
      '<button class="btn btn-primary" data-act="rest">☕ 去休息</button>' +
      '<button class="btn" data-act="more">▶ 再安排点</button>' +
      '<button class="btn" data-act="later">🕘 先不选（留着）</button>');
    App.ui.bindActions({
      rest: function () {
        App.ui.closeModal(); clearPendingChoice(); groupDoneInfo = null;
        if (smallRest) { App.ui.toast('已经在休息中'); }
        else if (!timer && !cdTimer && !S().getDay(S().todayKey()).activeHourPlan) { App.ui.toast('想休息就先开始一段计时或小时代吧'); }
        else startSmallRest();
        renderAll(); showTimerBar();
      },
      more: function () { App.ui.closeModal(); clearPendingChoice(); groupDoneInfo = null; renderAll(); showTimerBar(); App.ui.toast('回到任务页，点小任务的 ⏱ 就能开下一题'); },
      later: function () {
        App.ui.closeModal();
        renderAll();
        App.ui.toast('好，这条留着 —— 想休息/接着做，任务页顶部或小窗抽屉里就能点', 4200);
      }
    });
  }

  /* ---------- ⏰ 到点系统通知（网页挂后台也能提醒）+ 手机防息屏 ---------- */
  let wakeLock = null;
  function notifyEnabled() { return S().settings().notifyOnEnd !== false; }
  function askNotify() {
    if (!('Notification' in window)) { App.ui.toast('这个浏览器不支持系统通知'); return; }
    try {
      if (Notification.permission === 'granted') { App.ui.toast('系统通知已经是开着的'); return; }
      Notification.requestPermission().then(function (p) {
        App.ui.toast(p === 'granted' ? '✅ 到点会给你发系统通知' : '通知没被允许，就只在悬浮窗上提醒');
      });
    } catch (e) { /* 忽略 */ }
  }
  function notifyNow(title, body, tag) {
    if (!notifyEnabled()) return;
    try {
      if (!('Notification' in window) || Notification.permission !== 'granted') return;
      new Notification(title, { body: body, tag: tag || 'focus-plan-end' });
    } catch (e) { /* 忽略 */ }
  }
  function wakeKeep() {
    try {
      if (!('wakeLock' in navigator) || wakeLock) return;
      navigator.wakeLock.request('screen').then(function (w) {
        wakeLock = w;
        w.addEventListener('release', function () { wakeLock = null; });
      }).catch(function () { /* 不支持/被拒绝就算了 */ });
    } catch (e) { /* 忽略 */ }
  }
  function wakeFree() {
    try { if (wakeLock) { wakeLock.release(); wakeLock = null; } } catch (e) { /* 忽略 */ }
  }

  /** 把悬浮窗搬回主页面：无论现在在不在小窗、元素还在不在，都保证回到能用的状态。
      注意顺序——**先把元素搬回来再关窗**：某些浏览器 close() 不触发 pagehide，
      靠事件回调搬回来会丢元素（2026-09-14 用户实测踩到）。 */
  function restoreFloat() {
    // 收回 = 回到页面：位置也回到默认（右下角）。小窗里拖过、缩放过，
    // 位置记录都可能对不上页面坐标系，直接丢掉最省心（用户也更容易找得到）
    try { localStorage.removeItem('focusPlan.floatPos'); } catch (e) { /* 忽略 */ }
    const oldWin = pipWin;
    let f = null;
    if (oldWin && !oldWin.closed) {
      try { f = oldWin.document.getElementById('timer-float'); } catch (e) { /* 忽略 */ }
    }
    if (!f) f = document.getElementById('timer-float');
    pipWin = null;                                   // 先摘掉，之后所有 fx() 都走主文档
    if (f) {
      f.classList.remove('in-pip');
      if (f.parentNode !== document.body) document.body.appendChild(f);
    }
    if (oldWin && !oldWin.closed) { try { oldWin.close(); } catch (e) { /* 忽略 */ } }
    applyFloatPos();
    showTimerBar();                                  // 这时 floatRoot() 会补上缺的元素
  }
  /** 把悬浮窗收回页面里（关小窗 / 用户手动收） */
  function pipBack() { restoreFloat(); }
  /** 小窗里要弹窗时临时放大一点，关掉再收回去（330px 宽的窗放不下弹窗内容） */
  function pipNeedSpace(on) {
    if (!inPip()) return;
    try {
      if (typeof pipWin.resizeTo === 'function') pipWin.resizeTo(on ? 480 : 330, on ? 640 : 350);
    } catch (e) { /* 浏览器可能不支持，忽略 */ }
  }

  function pipToggle() { if (inPip()) pipBack(); else pipOpen(true); }

  /** 悬浮窗里那 7 个按钮。原来绑在 app.js 启动时，只对"当时那个元素"有效——
      悬浮窗被搬进小窗再自愈重造后按钮就全死了，所以统一收到这里绑。 */
  function bindFloatButtons(f) {
    if (!f) return;
    const set = function (id, fn) { const el = f.querySelector('#' + id); if (el) el.onclick = fn; };
    set('timer-pause', function () { togglePause(); });
    set('timer-rest', function () { startSmallRest(); });
    // ⏹ 完成：以前是 `if (timer) stopTimer()` —— 计时其实已经结束（浮动窗残留 / 计时对象丢了）时
    // 点它**完全没反应**，用户以为坏了（2026-09-21 反馈）。现在兜底说一句并把窗收掉。
    set('timer-stop', function () {
      if (timer) { stopTimer(); return; }
      App.ui.toast('这会儿没有正在计时的任务了 —— 计时窗已收起', 3600);
      hideTimerBar();
    });
    set('cd-pause', function () { toggleCdPause(); });
    set('cd-rest', function () { startSmallRest(); });
    set('cd-split', function () {
      if (!cdTimer) { App.ui.toast('当前没有在拆解的题'); return; }
      if (!cdTimer.fromSplit) { App.ui.toast('这个倒计时不是逐题拆解'); return; }
      openSplit(cdTimer.taskKey, cdTimer.taskId, cdTimer.subId, cdTimer.groupId || null);
    });
    set('cd-stop', function () { cdFinish(); });
  }

  function bindFloat(f) {
    const head = f && f.ownerDocument.getElementById('tf-head');
    if (!f || !head) return;
    bindFloatButtons(f);       // ★ 每次（含自愈重造）都重新绑一遍
    // 悬浮窗里任何点击都记一笔 → 之后弹出的窗口就知道该开在小窗里（用户正在看它）
    f.addEventListener('click', function () { if (App.ui.markFloatAction) App.ui.markFloatAction(); }, true);
    f.addEventListener('touchstart', function () { if (App.ui.markFloatAction) App.ui.markFloatAction(); }, true);
    let dragging = false, dx = 0, dy = 0;
    function down(e) {
      if (inPip()) return;                     // 小窗是独立窗口，拖系统标题栏就行
      if (e.target.closest('button, input, a')) return;
      dragging = true;
      const r = f.getBoundingClientRect();
      const cx = e.touches ? e.touches[0].clientX : e.clientX;
      const cy = e.touches ? e.touches[0].clientY : e.clientY;
      dx = cx - r.left; dy = cy - r.top;
      if (e.touches && e.cancelable) e.preventDefault();
    }
    function move(e) {
      if (!dragging) return;
      const r = f.getBoundingClientRect();
      const cx = e.touches ? e.touches[0].clientX : e.clientX;
      const cy = e.touches ? e.touches[0].clientY : e.clientY;
      const win = f.ownerDocument.defaultView || window;   // 在小窗里就按小窗的尺寸算边界
      let x = cx - dx, y = cy - dy;
      x = Math.max(0, Math.min(win.innerWidth - r.width, x));
      y = Math.max(0, Math.min(win.innerHeight - r.height, y));
      f.style.left = x + 'px'; f.style.top = y + 'px';
      f.style.right = 'auto'; f.style.bottom = 'auto';
      if (e.touches && e.cancelable) e.preventDefault();
    }
    function up() {
      if (!dragging) return;
      dragging = false;
      // ⚠️ 小窗里的坐标和页面坐标系完全不是一回事：在小窗里拖完存下来，
      // 收回页面后按它定位就会把悬浮窗摆到看不见的地方 → 小窗里绝不记录
      if (inPip()) return;
      if (f.style.left) localStorage.setItem('focusPlan.floatPos', f.style.left + ',' + f.style.top);
    }
    const pb = f.ownerDocument.getElementById('tf-pip');
    if (pb) pb.onclick = function (e) { e.stopPropagation(); pipToggle(); };
    head.addEventListener('mousedown', down);
    head.addEventListener('touchstart', down, { passive: false });
    if (floatDragBound) return;      // 文档级监听只挂一次，重造元素时不重复叠加
    floatDragBound = true;
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
    document.addEventListener('touchmove', move, { passive: false });
    document.addEventListener('touchend', up);
  }

  function showTimerBar() {
    const f = floatRoot();
    if (!f) return;
    f.classList.remove('hidden');
    applyFloatPos();
    const pb2 = fx('tf-pip');
    if (pb2) pb2.textContent = inPip() ? '⇲ 收回' : '⇱ 拖出';
    if (timer || cdTimer) wakeKeep();   // 📱 手机：计时中别让屏幕睡过去
    renderFloatLec();
    renderDrawer();
    renderFloatState();
    // 什么都没在进行（连听课也没有）→ 悬浮窗收起来，别留个空窗在屏幕上
    const lecOn = !!(App.lecture && App.lecture.current && App.lecture.current());
    if (!shouldKeepFloat() && !lecOn) {     // 计时/待办/听课都没在进行 → 才收窗
      if (inPip()) { pipWin.close(); } else { f.classList.add('hidden'); }
      return;
    }
    const fwd = fx('tf-forward');
    const cd = fx('tf-cd');
    if (!fwd || !cd) return;            // 元素还没就位就别往下走（不要再抛异常）
    if (timer) {
      const isDown = timer.mode === 'down';
      fwd.classList.remove('hidden');
      fwd.classList.toggle('mode-up', !isDown);     // ⏱ v102：正计时 → 藏掉"预计时间"和进度条
      fx('tf-content').textContent = timer.planContent;
      if (isDown) {
        const leftMs = timer.planMinutes * 60000 - elapsedMs();
        const lab = fx('tf-plan-label');
        if (lab) lab.textContent = leftMs > 0 ? '还剩：' : '已超时：';
        fx('tf-plan').textContent = leftMs > 0 ? S().fmtClock(leftMs) : ('+' + S().fmtClock(-leftMs));
      }
      fx('tf-used').textContent = S().fmtClock(elapsedMs());
      fx('timer-pause').textContent = timer.paused ? '▶ 继续' : '⏸ 暂停';
    } else {
      fwd.classList.add('hidden');
    }
    if (cdTimer) {
      const cdUp = !(cdTimer.minutes > 0);
      cd.classList.remove('hidden');
      cd.classList.toggle('cd-up', cdUp);         // ⏱ v102：不限时 → 藏掉目标和进度条
      fx('tf-cd-text').textContent = cdTimer.text;
      const cdl = fx('tf-cd-label');
      if (cdl) cdl.textContent = cdUp ? '已用：' : '剩余/超时：';
      fx('tf-cd-target').textContent = cdUp ? '' : S().fmtDur(cdTimer.minutes);
      fx('cd-pause').textContent = cdTimer.microRest ? '🔚 结束小休' : (cdTimer.paused ? '▶ 继续' : '⏸ 暂停');
      // 来自逐题拆解的倒计时 → 显示「🧭 回拆解」按钮，方便回到拆解互动界面
      const spEl = fx('cd-split');
      if (spEl) spEl.style.display = cdTimer.fromSplit ? '' : 'none';
    } else {
      cd.classList.add('hidden');
    }
    onTick();
  }
  /** 悬浮窗现在"该不该留着"：计时 / 待办衔接 都算（两处共用，别再各写一套） */
  function shouldKeepFloat() {
    if (timer || cdTimer || pendingNext || groupDoneInfo) return true;
    const d = S().getDay(S().todayKey());
    return !!(d.pendingChoice || (d.pendingSubs || []).length);
  }
  function hideTimerBar() {
    if (shouldKeepFloat()) return;                                            // 计时/待办在 → 别收
    if (App.lecture && App.lecture.current && App.lecture.current()) return;   // 听课进行中 → 悬浮窗留着
    wakeFree();                    // ★ 计时全停了 → 放掉防息屏锁，手机别一直亮着
    // 计时全停了：小窗一起收掉（不留一个空窗在屏幕上）
    if (inPip()) { pipWin.close(); return; }
    const f = floatRoot();
    if (f) f.classList.add('hidden');
  }
  function stopTickIfIdle() {
    if (!timer && !cdTimer) {
      stopTick();
      hideTimerBar();
    }
  }

  /* ---------- 开始计时（弹窗填写计划） ---------- */
  function startTimer(taskKey, taskId) {
    if (timer) { App.ui.toast('已有任务在计时中，请先结束或暂停它'); return; }
    const day = S().getDay(S().todayKey());
    const task = day.tasks[taskKey].find(function (t) { return t.id === taskId; });
    if (!task || task.done) return;

    // ⏱ v102：默认正计时（用户：「以后计时可不可以用正计时」），上次选过就沿用
    let planMode = ((S().settings() || {}).planMode === 'down') ? 'down' : 'up';
    const modal = App.ui.openModal('⏱ 开始计时', '' +
      '<div class="field">' +
      '  <label>计时方式</label>' +
      '  <div class="planmode">' +
      '    <button type="button" class="pm-btn" id="pm-up">⏱ 正计时</button>' +
      '    <button type="button" class="pm-btn" id="pm-down">⏳ 倒计时</button>' +
      '  </div>' +
      '  <p class="hint" id="pm-hint" style="margin:6px 0 0"></p>' +
      '</div>' +
      '<div class="field">' +
      '  <label>这段时间要做什么（写给自己看的）</label>' +
      '  <input type="text" id="plan-content" placeholder="" />' +
      '</div>' +
      '<div class="field" id="plan-dur-wrap">' +
      '  <label>预计用时</label>' +
      '  <div class="field-row">' +
      '    <div class="field"><input type="number" id="plan-h" min="0" max="12" value="0" /><label>小时</label></div>' +
      '    <div class="field"><input type="number" id="plan-m" min="0" max="59" value="40" /><label>分钟</label></div>' +
      '  </div>' +
      '</div>' +
      '<p class="hint" id="plan-error"></p>',
      '<button class="btn btn-primary" data-act="go" id="plan-go">开始计时</button>' +
      '<button class="btn" data-act="cancel">取消</button>');

    const contentInput = modal.querySelector('#plan-content');
    const hInput = modal.querySelector('#plan-h');
    const mInput = modal.querySelector('#plan-m');
    const errEl = modal.querySelector('#plan-error');
    const upBtn = modal.querySelector('#pm-up');
    const downBtn = modal.querySelector('#pm-down');
    const durWrap = modal.querySelector('#plan-dur-wrap');
    const pmHint = modal.querySelector('#pm-hint');

    function paintMode() {
      const up = planMode === 'up';
      if (upBtn) upBtn.classList.toggle('on', up);
      if (downBtn) downBtn.classList.toggle('on', !up);
      if (durWrap) durWrap.style.display = up ? 'none' : '';
      if (pmHint) {
        pmHint.textContent = up
          ? '⏱ 正计时：只有一个往上走的时钟 —— 不设时限、不提醒、也不会「超时」，就老实记录你花了多久。'
          : '⏳ 倒计时：设一个时限，到点会显示「已超时 +多少」，提醒这块别拖太久。';
      }
    }
    if (upBtn) upBtn.onclick = function () { planMode = 'up'; paintMode(); };
    if (downBtn) downBtn.onclick = function () { planMode = 'down'; paintMode(); };
    paintMode();

    function validate() {
      const content = contentInput.value.trim();
      const mins = (+hInput.value || 0) * 60 + (+mInput.value || 0);
      if (!content) { errEl.textContent = '请填写这段时间要做什么'; return false; }
      if (planMode === 'down' && mins <= 0) { errEl.textContent = '倒计时得填一个预计用时（大于 0）'; return false; }
      return true;
    }
    App.ui.bindActions({
      go: function () {
        if (!validate()) return;
        try { const st = S().settings(); if (st) st.planMode = planMode; S().save(); } catch (e) { /* 忽略 */ }
        timer = {
          taskKey: taskKey, taskId: taskId, taskText: task.text,
          planContent: contentInput.value.trim(),
          mode: planMode,                                   // ⏱ v102
          planMinutes: planMode === 'down' ? ((+hInput.value || 0) * 60 + (+mInput.value || 0)) : 0,
          startedAt: Date.now(), pausedMs: 0, paused: false
        };
        saveTimerSnap();     // 🛟 v107：一开计时就落盘 —— 刷新也能接回来
        App.ui.closeModal();
        showTimerBar();
        startTick();
        renderToday();
        pipOpen();          // 🪟 直接弹成独立小窗（用户刚点了按钮，手势合法）
      },
      cancel: App.ui.closeModal
    });
  }

  /* ---------- 暂停 / 继续 ---------- */
  function togglePause() {
    if (!timer) return;
    if (!timer.paused) {
      timer.paused = true;
      timer.pauseAt = Date.now();
    } else {
      timer.pausedMs += Date.now() - timer.pauseAt;
      timer.pauseAt = undefined;
      timer.paused = false;
    }
    saveTimerSnap();             // 🛟 v107：暂停/继续也要落盘（解冻后立刻刷新也能接对）
    showTimerBar();
    renderToday();
  }

  /* ---------- 完成计时（对比确认弹窗 + 总结） ---------- */
  function stopTimer() {
    if (!timer) return;
    bringPageForModal();
    const usedMs = elapsedMs();
    const actualMin = Math.max(1, Math.ceil(usedMs / 60000));
    const planMin = timer.planMinutes;
    const isDown = timer.mode === 'down';      // ⏱ v102：正计时不算"比预计快慢"（本来就没设预计）
    let doneFlag = true;
    let noteVal = '';

    // ✏️ v98：确认窗里能顺便改任务名（用户：「你同样都不支持改名称」）
    let nameVal = timer.taskText || timer.planContent || '';
    const body = function () {
      return '' +
        '<div class="field"><label>任务名称（可以改 —— 比如改成「复习 化学平衡」）</label>' +
        '<input id="stop-name" type="text" value="' + S().esc(nameVal) + '" ' +
        'style="width:100%;border:1px solid #e5e8ec;border-radius:8px;padding:7px 9px;font-size:13.5px" /></div>' +
        '<div class="field"><label>预计完成内容</label><p style="font-size:14px">' + S().esc(timer.planContent) + '</p></div>' +
        (isDown ? '<div class="field"><label>预计用时</label><p style="font-size:14px">' + S().fmtDur(planMin) + '</p></div>' : '') +
        '<div class="field"><label>实际用时</label><p style="font-size:14px">' + S().fmtDur(actualMin) +
        (isDown
          ? (actualMin < planMin ? ' <span style="color:#22a06b">（比预计快，好样的！）</span>' :
             actualMin > planMin * 1.3 ? ' <span style="color:#e2545d">（超出预计较多）</span>' : '')
          : ' <span style="color:#8a919c">（正计时，只管记下来）</span>') + '</p></div>' +
        '<div class="field"><label>这次做完了吗？（提前结束也算，如实选）</label>' +
        '<div class="btn-row">' +
        '<button class="btn btn-small' + (doneFlag ? ' btn-primary' : '') + '" data-act="yes-done">✅ 做完了</button>' +
        '<button class="btn btn-small' + (doneFlag ? '' : ' btn-primary') + '" data-act="not-done">⛔ 没做完</button>' +
        '</div></div>' +
        '<div class="field"><label>总结 / 心得 / 注意事项（可选，写给自己）</label>' +
        '<textarea id="stop-note" style="width:100%;min-height:64px;border:1px solid #e5e8ec;border-radius:8px;padding:8px 10px;font-size:13.5px;resize:vertical">' +
        S().esc(noteVal) + '</textarea>' +
        '</div>';
    };

    const grabName = function (m) {
      const el = m && m.querySelector('#stop-name');
      if (el && el.value.trim()) nameVal = el.value.trim();
    };
    function reopen() {
      const modal = App.ui.openModal('✅ 任务完成确认', body(),
        '<button class="btn btn-primary" data-act="done">确认结束并保存</button>' +
        '<button class="btn" data-act="cont">继续计时</button>' +
        '<button class="btn" data-act="cancel">取消（不保存）</button>');
      App.ui.bindActions({
        'yes-done': function () {
          grabName(modal);
          const n1 = modal.querySelector('#stop-note');
          if (n1 && n1.value.trim()) noteVal = n1.value.trim();
          doneFlag = true; App.ui.closeModal(); reopen();
        },
        'not-done': function () {
          grabName(modal);
          const n2 = modal.querySelector('#stop-note');
          if (n2 && n2.value.trim()) noteVal = n2.value.trim();
          doneFlag = false; App.ui.closeModal(); reopen();
        },
        done: function () {
          grabName(modal);
          const noteEl = modal.querySelector('#stop-note');
          applyTimerRename(nameVal);                     // ✏️ 先改名（任务那条 + 队列/基础任务的源）
          saveSession(actualMin, doneFlag, noteEl ? noteEl.value.trim() : '');
          App.ui.closeModal();
        },
        cont: App.ui.closeModal, // 继续计时：仅关闭确认弹窗
        cancel: function () { App.ui.closeModal(); }
      });
    }
    reopen();
  }

  /** ✏️ v98：把这次计时的任务改名（改到"任务页那条 + 队列项 / 今天的基础任务条目"上） */
  function applyTimerRename(newName) {
    const v = String(newName == null ? '' : newName).trim();
    if (!timer || !v || v === timer.taskText) return false;
    const day = S().getDay(S().dateKey(new Date(timer.startedAt)));
    let task = null;
    ['required', 'ideal', 'extra'].forEach(function (k) {
      (day.tasks[k] || []).forEach(function (t) { if (!task && t.id === timer.taskId) task = t; });
    });
    if (task && App.queue && App.queue.renameByTask) {
      App.queue.renameByTask(task, v);          // 顺带改队列项 / 基础任务条目
    } else if (task) {
      task.text = v; S().save();
    }
    timer.taskText = v;                          // 时间轴 / 会话记录也跟着用新名字
    return true;
  }

  function saveSession(actualMin, doneFlag, noteText) {
    // 会话按「开始计时」的日期归账（跨天也归开始那天）
    const stDate = new Date(timer.startedAt);
    const dayKey = S().dateKey(stDate);
    const day = S().getDay(dayKey);
    const actSec = Math.round((Date.now() - timer.startedAt - (timer.pausedMs || 0)) / 1000);
    const session = {
      id: S().uid(),
      taskId: timer.taskId,
      taskText: timer.taskText,
      planContent: timer.planContent,
      planMinutes: timer.planMinutes,
      actualMinutes: actualMin,
      actualSeconds: actSec,
      startAt: stDate.toISOString(),
      endAt: new Date().toISOString(),
      pausedMs: timer.pausedMs || 0,
      done: doneFlag !== false,
      note: noteText || ''
    };
    day.sessions.push(session);
    // 自动生成时间轴记录（开始/结束 = 计时的现实时间）
    let startMin = stDate.getHours() * 60 + stDate.getMinutes();
    const endDate = new Date();
    let endMin = endDate.getHours() * 60 + endDate.getMinutes();
    if (endMin < startMin) endMin = 1439; // 跨午夜截断到开始日 24:00 前
    const span = endMin - startMin;
    const mins = Math.min(actualMin, span > 0 ? span : actualMin);
    // ✅ v106：把"这段时间里暂停/休息了多少"也写进记录 —— 前端早就写好「（已扣掉暂停 X）」的渲染，
    //        但计时这条路一直没赋值，所以时间轴上从来只看到一个净时长，没法核对（用户："明显对不上"）。
    const pausedMin = Math.max(0, Math.round((timer.pausedMs || 0) / 60000));
    day.timeline.push({
      id: S().uid(),
      start: startMin, end: endMin,
      minutes: mins,
      pausedMin: pausedMin,
      content: timer.planContent,
      category: 'study',
      countAsStudy: true,
      auto: true,
      taskId: timer.taskId,
      taskText: timer.taskText,
      note: noteText || ''
    });
    S().save();
    timer = null;
    saveTimerSnap();             // 🛟 v107：正常结束 → 快照清掉（没有值得恢复的了）
    stopTick();
    hideTimerBar();
    App.ui.toast('已保存：时间轴已自动生成记录（' + S().hhmmOf(startMin) + '–' + S().hhmmOf(endMin) + '），记得打勾 ☑');
    App.tasks.renderAll();
  }

  /* ---------- 子任务（小任务限时倒计时） ---------- */
  function subBlockHTML(task) {
    const subs = task.subs || [];
    if (!subs.length) {
      return '<div class="sub-block"><button class="sub-add" data-act="sub-add" data-task="' + task.id + '">＋ 添加小任务（做题计时 · 可设限时，也可留空正计时）</button></div>';
    }
    return '<div class="sub-block">' +
      subs.map(function (s) {
        const running = cdTimer && cdTimer.subId === s.id;
        const cls = s.done === true ? ' done' : (s.done === false ? ' fail' : (running ? ' running' : ''));
        const stateTxt = s.done === true ? ' ✓完成' : (s.done === false ? ' ✗未完成' : '');
        // 小任务也能开听课三步 → 面板直接长在这一题下面（v47）
        const lecPanel = (App.lecture && App.lecture.inlineHTML) ? App.lecture.inlineHTML(task, s) : '';
        return '<div class="sub-wrap' + (lecPanel ? ' lec-on' : '') + '">' +
          '<div class="sub-item' + cls + '" data-sub="' + s.id + '">' +
          '<span class="sub-text">' + S().esc(s.text) + '</span>' +
          '<span class="sub-meta">' + (s.minutes > 0 ? ('限' + s.minutes + '分钟') : '⏱ 不限时') +
          (s.points > 0 ? ' · +' + s.points + '分' : '') + stateTxt + '</span>' +
          (running
            ? '<span class="sub-meta running-txt">' + (cdTimer.microRest ? '☕ 小休中…' :
                (cdTimer.paused ? '⏸ 已暂停' : (cdTimer.minutes > 0 ? '⏳ 倒计时中…' : '⏱ 计时中…'))) + '</span>'
            : '<button class="btn btn-small sub-start" data-act="cd-start" data-task="' + task.id + '" data-sub="' + s.id + '">▶ 开始</button>') +
          '<button class="task-timer-btn' + (s.summary ? ' noted' : '') + '" data-act="sub-note" data-task="' + task.id + '" data-sub="' + s.id + '" title="写评语 / 补充">' + (s.summary ? '✍️' : '🖋') + '</button>' +
          '<button class="task-timer-btn task-lec-btn" data-act="sub-lecture" data-task="' + task.id + '" data-sub="' + s.id + '" title="🎧 给这题开课（预习→听课→整理，走完自动勾掉它）">🎧</button>' +
          '<button class="task-timer-btn" data-act="sub-split" data-task="' + task.id + '" data-sub="' + s.id + '" title="🧭 逐题拆解（语音/文字引导）">🧭</button>' +
          '<button class="task-timer-btn" data-act="sub-rep" data-task="' + task.id + '" data-sub="' + s.id + '" title="🔁 只把这题安排到另一天重做（带着它所属的任务组）">🔁</button>' +
          '<button class="task-timer-btn" data-act="sub-edit" data-task="' + task.id + '" data-sub="' + s.id + '" title="编辑">✎</button>' +
          '<button class="task-timer-btn" data-act="sub-del" data-task="' + task.id + '" data-sub="' + s.id + '" title="删除">🗑</button>' +
          (s.summary && s.summary.text ? '<span class="sub-meta noted-tag">✍️ 已写评语</span>' : '') +
          (s.splitlog && s.splitlog.length ? '<span class="sub-meta noted-tag">🧭 已拆解</span>' : '') +
          '</div>' + lecPanel + '</div>';
      }).join('') +
      '<button class="sub-add" data-act="sub-add" data-task="' + task.id + '">＋ 添加小任务</button>' +
      '</div>';
  }

  /** 🃏 v117：这条任务能不能"补写设问卡"
   *  用户：「调整补写知识卡功能，使其仅在符合条件的任务类型（如听课任务）下可用；
   *  对于复习任务等不符合条件的任务，应明确提示不可用或说明原因，避免困惑」 */
  function mcWritable(task) {
    if (!task) return { ok: false, why: '这条任务找不到了，刷新一下' };
    // ⚠️ 两种「复习任务」要分开处理，别一刀切：
    //   · 有 mcRef = 卡**已经存在**于某套合集 → 点 🃏 应该是「打开那套卡翻一翻」，不是新建一套
    //     （一刀切地挡住，用户就没法复习了 —— 这不是他要的）
    //   · mode==='review' = 只标了个"复习"、并没有卡 → 这才是该挡的：在这儿补卡会挂错地方
    if (task.mcRef) {
      return { ok: true, openRef: true,
        why: '🃏 这条是「从设问卡排过来的复习」—— 点这里是**打开那套卡翻卡自测**；要加卡/改卡去「🃏 卡片」页。' };
    }
    if (task.mode === 'review') {
      // ⚠️ 但它**已经有自己的卡**时别挡 —— 那会连"翻卡自测"一起挡掉（用户是要复习的）。
      //    挡的只是"给一条复习任务从零新建一套卡"（那套卡会挂错地方：以后翻卡找不到课）。
      const n0 = (App.memcards && App.memcards.countForTask) ? App.memcards.countForTask(task.id) : 0;
      if (n0 > 0) return { ok: true, why: '打开这套卡翻卡自测（它有 ' + n0 + ' 张）' };
      return { ok: false,
        why: '🃏 这条标的是「🔄 复习」—— 复习任务不新建卡。新卡要挂在当初学它的那条（📘 新知识 / 🎧 听课任务）下面，否则以后翻卡时找不到课。' };
    }
    return { ok: true, why: '' };
  }

  function addSubModal(taskKey, taskId, editId, dayKey, groupId) {
    const day = S().getDay(dayKey || S().todayKey());
    const task = day.tasks[taskKey].find(function (t) { return t.id === taskId; });
    if (!task) return;
    const group = groupId ? (task.groups || []).find(function (g) { return g.id === groupId; }) : null;
    const subList = group ? (group.subs || []) : (task.subs || []);
    const existing = editId ? subList.find(function (s) { return s.id === editId; }) : null;
    const inGroup = !!group;
    const modal = App.ui.openModal(existing ? '✎ 编辑小任务' : (inGroup ? '🧩 给「' + S().esc(group.name) + '」加小题' : '🧩 添加小任务'), '' +
      (existing ? '' : ('<p style="font-size:12.5px;color:#8a919c;margin-bottom:10px">' +
        '想给自己一点紧迫感就设个限时；<b>不想被催就留空</b> —— 它会正着计时，只记你花了多久，不提醒也不超时。</p>')) +
      '<div class="field"><label>小任务内容（如：第3题）</label><input type="text" id="sub-text" value="' + (existing ? S().esc(existing.text) : '') + '" placeholder="" /></div>' +
      '<div class="field-row">' +
      '<div class="field"><label>限时（分钟 · 留空 = 正计时）</label>' +
      '<input type="number" id="sub-min" min="0" placeholder="留空就不限时" value="' +
      (existing ? (existing.minutes > 0 ? existing.minutes : '') : 5) + '" /></div>' +
      '<div class="field"><label>完成积分</label><input type="number" id="sub-pts" min="0" value="' + (existing ? (existing.points || 0) : (S().settings().subDefaultPoints || 10)) + '" /></div>' +
      '</div>',
      '<button class="btn btn-primary" data-act="ok">' + (existing ? '保存' : '添加') + '</button><button class="btn" data-act="cancel">取消</button>');
    App.ui.bindActions({
      ok: function () {
        const text = modal.querySelector('#sub-text').value.trim();
        const mins = Math.max(0, +modal.querySelector('#sub-min').value || 0);   // ⏱ v102：0 = 不限时（正计时）
        const pts = Math.max(0, +modal.querySelector('#sub-pts').value || 0);
        if (!text) { App.ui.toast('请填写小任务内容'); return; }
        if (existing) {
          existing.text = text; existing.minutes = mins; existing.points = pts;
        } else {
          if (group) { group.subs = group.subs || []; group.subs.push({ id: S().uid(), text: text, minutes: mins, points: pts, done: null }); }
          else { task.subs = task.subs || []; task.subs.push({ id: S().uid(), text: text, minutes: mins, points: pts, done: null }); }
        }
        pushQ(task);
        S().save();
        App.ui.closeModal();
        App.tasks.renderAll();
      },
      cancel: App.ui.closeModal
    });
  }

  /* ---------- 回收站：误删可恢复（所有删除走「软删除」先进回收站） ---------- */
  /* ---------- 🔗 合并同名任务 ----------
     转移任务时可能出现「同一天同一栏有两条一模一样的任务」，这里给个一键合并的出口。
     也顺带修掉了根源：pasteTasksModal 落地时会先找同名任务,有就并进去,不再新建。 */

  /** 比名字用：去掉所有空白，避免「化学复习 」和「化学复习」被当成两条 */
  function normName(x) { return String(x == null ? '' : x).replace(/\s+/g, ''); }

  /** 同一天、同一栏里「另一条同名任务」（没有就 null） */
  function findDupTask(dayKey, colKey, task) {
    if (!task) return null;
    const mine = normName(task.text);
    if (!mine) return null;
    const list = (S().getDay(dayKey).tasks[colKey] || []);
    return list.find(function (t) { return t.id !== task.id && normName(t.text) === mine; }) || null;
  }

  /** 把 b 并进 a：题目按名字去重、任务组按组名归并。返回「新并进来几道题」 */
  function mergeTaskInto(a, b) {
    if (!a || !b) return 0;
    let added = 0;
    const takeSub = function (arr, src) {
      if (!src || !src.text) return;
      const same = arr.find(function (x) { return normName(x.text) === normName(src.text); });
      if (same) {
        // 重名的题不重复添加，只把「更明确的信息」补过去
        if ((same.done === undefined || same.done === null) && src.done !== undefined && src.done !== null) same.done = src.done;
        if (!same.standard && src.standard) same.standard = src.standard;
        if (!same.summary && src.summary) same.summary = src.summary;
        return;
      }
      arr.push(src);
      added++;
    };
    (b.groups || []).forEach(function (gb) {
      a.groups = a.groups || [];
      let ga = a.groups.find(function (x) { return normName(x.name) === normName(gb.name); });
      if (!ga) { ga = { id: S().uid(), name: gb.name || '任务组', subs: [] }; a.groups.push(ga); }
      ga.subs = ga.subs || [];
      (gb.subs || []).forEach(function (s) { takeSub(ga.subs, s); });
    });
    (b.subs || []).forEach(function (s) {
      a.subs = a.subs || [];
      takeSub(a.subs, s);
    });
    if (a.subs && !a.subs.length) delete a.subs;
    if (a.groups && !a.groups.length) delete a.groups;
    // 任务级字段：a 缺的、b 有的都补过来（积分 / 听课时长 / 标准 / 类型 …）
    Object.keys(b).forEach(function (k) {
      if (k === 'id' || k === 'text' || k === 'done' || k === 'subs' || k === 'groups') return;
      const av = a[k];
      const empty = (av === undefined || av === null || av === '' || (Array.isArray(av) && !av.length));
      if (empty) a[k] = b[k];
    });
    // 两条都完成才算完成 —— 宁可不勾，也别把没做完的标成做完
    a.done = !!(a.done && b.done);
    return added;
  }

  /** 一条任务里一共有几道题 */
  function countSubs(t) {
    return ((t.subs || []).length) + (t.groups || []).reduce(function (n, g) { return n + (g.subs || []).length; }, 0);
  }

  /** 🔗 合并弹窗：确认后把同名的另一条并进来，被合并的那条进回收站（可恢复） */
  function dupMergeModal(dayKey, colKey, taskId) {
    const list = (S().getDay(dayKey).tasks[colKey] || []);
    const a = list.find(function (t) { return t.id === taskId; });
    if (!a) return;
    const b = findDupTask(dayKey, colKey, a);
    if (!b) { App.ui.toast('这一栏里已经找不到同名的另一条任务了'); return; }

    const brief = function (t, isA) {
      const gs = (t.groups || []).map(function (g) {
        return '<li>' + S().esc(g.name || '任务组') + ' —— ' + (g.subs || []).length + ' 道题</li>';
      }).join('');
      const ss = (t.subs || []).length ? '<li>单独小任务 —— ' + t.subs.length + ' 道题</li>' : '';
      return '<div style="flex:1 1 190px;background:rgba(124,92,255,.06);border-radius:9px;padding:9px 11px">' +
        '<b>' + (isA ? '这一条（保留）' : '另一条（并进来）') + '</b>' +
        '<span class="tag" style="margin-left:6px">' + countSubs(t) + ' 道题' + (t.done ? ' · 已完成' : '') + '</span>' +
        '<ul style="margin:5px 0 0 16px;font-size:12.5px">' + (gs + ss || '<li>还没有小任务</li>') + '</ul></div>';
    };

    App.ui.openModal('🔗 合并同名任务 · ' + S().esc(a.text).slice(0, 16),
      '<p style="font-size:12.5px;color:var(--muted);margin-bottom:9px">这一天同一栏里有两条都叫「' +
      S().esc(a.text) + '」。合并后只留一条：<b>题目按名字去重</b>、任务组按组名并到一起，' +
      '没做完的照样没做完，做过的不会被重复要求。</p>' +
      '<div style="display:flex;gap:12px;flex-wrap:wrap">' + brief(a, true) + brief(b, false) + '</div>' +
      '<p class="hint" style="margin-top:11px">并进去的那条会进回收站 —— 万一合错了，🗑 回收站 → ♻ 恢复 就能拿回来。</p>',
      '<button class="btn btn-primary" data-act="ok">🔗 合并成一条</button>' +
      '<button class="btn" data-act="cancel">取消</button>');

    App.ui.bindActions({
      ok: function () {
        const added = mergeTaskInto(a, b);
        const i = list.findIndex(function (t) { return t.id === b.id; });
        if (i >= 0) list.splice(i, 1);
        trashPush({ kind: 'task', dayKey: dayKey, col: colKey, payload: JSON.parse(JSON.stringify(b)) });
        S().save();
        App.ui.closeModal();
        renderAll();
        if (App.calendar && App.calendar.render) App.calendar.render();
        App.ui.toast('🔗 已合并成一条「' + a.text.slice(0, 14) + '」' +
          (added ? '，新并进 ' + added + ' 道题' : '（题目原本就都在，只去掉了重复的那条）') +
          ' · 现在共 ' + countSubs(a) + ' 道题', 3400);
      },
      cancel: App.ui.closeModal
    });
  }

  function trashPush(entry) {
    const t = (S().data().trash = S().data().trash || []);
    entry.id = S().uid();
    entry.at = new Date().toISOString();
    t.push(entry);
  }

  /** 删任务/小题时，如果删掉的正是「正在上的那节课」→ 这节课没法再继续了。
      存档掉、关掉它，并告诉用户；否则会出现「课还在计时，页面上却找不到面板」的怪状态。 */
  function dropLectureIfDeleted(taskId, subId, groupId) {
    const d = S().getDay(S().todayKey());
    // 这次删掉的是不是"某一节"（小题 / 整个组 / 整条任务都算）
    function isTarget(x) {
      if (!x) return false;
      if (subId) return x.subId === subId;
      if (groupId) return x.taskId === taskId && x.groupId === groupId;
      return x.taskId === taskId;
    }
    // —— ① 连听队列无条件同步剔掉被删的节（删的时候可能并没有在听课）
    let qChanged = false, droppedCurrent = false;
    const q = d.lectureQueue;
    if (q && q.items && q.items.length) {
      const cur = q.idx || 0;
      const kept = [];
      let newCur = -1;          // 当前那节在新数组里的位置
      let nextAfterCur = -1;    // "当前那节之后还剩下的第一节"在新数组里的位置
      q.items.forEach(function (x, i) {
        if (isTarget(x)) { if (i === cur) droppedCurrent = true; return; }
        if (i === cur) newCur = kept.length;
        if (nextAfterCur < 0 && i > cur) nextAfterCur = kept.length;
        kept.push(x);
      });
      if (kept.length !== q.items.length) {
        qChanged = true;
        if (!kept.length) { d.lectureQueue = null; }
        else {
          q.items = kept;
          // 当前那节还在 → 指回它；被删了 → 指到"它后面那节的前一格"，这样 idx+1 正好接上下一节（不跳节）
          q.idx = (newCur >= 0) ? newCur : ((nextAfterCur >= 0) ? (nextAfterCur - 1) : (kept.length - 1));
        }
      }
    }
    // —— ② 正在听的那节被删了 → 按"已取消"存档（已计时间留着）
    const L = d.activeLecture;
    const hit = !!L && isTarget({ taskId: L.taskId, groupId: L.groupId, subId: L.subId });
    if (hit) {
      L.abandoned = true;
      L.droppedByDelete = true;
      L.endAt = Date.now();
      if (L.phase === 'preview' && L.previewEndAt == null) L.previewEndAt = Date.now();
      if (L.phase === 'attend' && L.attendEndAt == null) L.attendEndAt = Date.now();
      if (L.phase === 'consolidate' && L.consEndAt == null) L.consEndAt = Date.now();
      d.lectures = d.lectures || [];
      d.lectures.push(L);
      (d.timeline || []).forEach(function (r) {
        if (r.lectureId === L.id) r.content = r.content.replace(' · 进行中', ' · 已取消');
      });
      d.activeLecture = null;
    }
    if (!hit && !qChanged) return false;
    S().save();
    if (App.lecture && App.lecture.refresh) App.lecture.refresh();
    // ★ v58：正在连听的那节被删 → 顶部留一条「▶ 下一节」，别让用户自己找
    if (hit && d.lectureQueue && droppedCurrent) {
      const nx = d.lectureQueue.items[d.lectureQueue.idx] || {};
      setPendingChoice('queue', nx.text || '');
    }
    // ★ v58：立刻重绘 + 处理悬浮窗（以前这里漏了，顶部那一条要等"下一次刷新"才出现）
    App.tasks.renderAll();
    showTimerBar();
    if (hit) {
      App.ui.toast(droppedCurrent
        ? '正在上的「' + L.course + '」被删掉了 —— 连听剩下的还在，顶部点「▶ 下一节」接着上'
        : '正在上的「' + L.course + '」跟着一起取消了（已计时间已存档）', 3800);
    }
    return hit;
  }


  function pushQ(task) {
    // 🧩 v93：队列副本上的增删改要回写队列项，否则下一次实体化会盖回来
    try {
      if (task && task.fromQueue && App.queue && App.queue.pushConfigFromCopy) {
        App.queue.pushConfigFromCopy(task.id);
      }
    } catch (e) { /* 忽略 */ }
  }
  function delSub(taskKey, taskId, subId, dayKey) {
    const day = S().getDay(dayKey || S().todayKey());
    const task = day.tasks[taskKey].find(function (t) { return t.id === taskId; });
    const subs = task ? (task.subs || []) : [];
    const sub = subs.find(function (s) { return s.id === subId; });
    if (!sub) return;
    App.ui.confirm('删除小任务「' + sub.text + '」？', '删除', function () {
      trashPush({ kind: 'sub', dayKey: dayKey || S().todayKey(), col: taskKey, taskId: taskId, payload: JSON.parse(JSON.stringify(sub)) });
      const idx = subs.findIndex(function (s) { return s.id === subId; });
      if (idx >= 0) subs.splice(idx, 1);
      pushQ(task);
      if (cdTimer && cdTimer.subId === subId) {
        cdTimer = null;
        stopTickIfIdle();
        showTimerBar();
      }
      S().save();
      App.ui.toast('已删除 · 可到回收站恢复');
      App.tasks.renderAll();
      dropLectureIfDeleted(taskId, subId, null);
    });
  }

  /* ---------- 题评语：随时补充 / 修改（每道小题） ---------- */
  function editSubSummary(taskKey, taskId, subId, dayKey, groupId) {
    const task = S().getDay(dayKey || S().todayKey()).tasks[taskKey].find(function (t) { return t.id === taskId; });
    const found = findSubInTask(task, subId);
    const sub = found && found.sub;
    if (!sub) return;
    const m = App.ui.openModal('✍️ 题评语 / 复盘', '' +
      '<p class="hint">写给这一题的评语（心得 / 错在哪 / 下次注意）。以后随时可以点回来补充修改，方便一天结束统一复盘。</p>' +
      '<div class="field"><label>' + S().esc(sub.text) + '</label>' +
      '<textarea id="note-text" style="width:100%;min-height:72px;border:1px solid #e5e8ec;border-radius:8px;padding:8px;font-size:13.5px;resize:vertical">' + S().esc(sub.summary || '') + '</textarea></div>',
      '<button class="btn btn-primary" data-act="ok">保存评语</button>' +
      '<button class="btn" data-act="clear">清空</button>' +
      '<button class="btn" data-act="cancel">取消</button>');
    App.ui.bindActions({
      ok: function () {
        const t = m.querySelector('#note-text').value.trim();
        sub.summary = t ? t : null;
        S().save(); App.ui.closeModal(); App.tasks.renderAll();
      },
      clear: function () {
        sub.summary = null;
        S().save(); App.ui.closeModal(); App.tasks.renderAll();
        App.ui.toast('已清空这题的评语');
      },
      cancel: App.ui.closeModal
    });
  }

  /* ---------- 任务组（SmartGoal）：把几个小题打包，整组做完奖励一段休息） ---------- */
  function findSubInTask(task, subId) {
    if (!task) return null;
    const direct = (task.subs || []).find(function (s) { return s.id === subId; });
    if (direct) return { sub: direct, group: null };
    let g = null;
    (task.groups || []).forEach(function (gr) {
      if ((gr.subs || []).some(function (s) { return s.id === subId; })) g = gr;
    });
    if (g) return { sub: g.subs.find(function (s) { return s.id === subId; }), group: g };
    return null;
  }

  /** 🎁 某个任务组的"整组做完"奖励积分（组上单独设过就用组自己的，否则用设置里的默认值） */
  function groupRewardOf(g) {
    const v = g.rewardPoints != null ? g.rewardPoints : S().settings().groupRewardPoints;
    return Math.max(0, +v || 0);
  }
  /** 🎁 整组都做完了 → 发一次整体奖励积分（发过就记 awarded，绝不重复发，防止反复勾选刷分） */
  function groupRewardCheck(task, group, dayKey) {
    if (!task || !group) return 0;
    const subs = group.subs || [];
    if (!subs.length || !subs.every(function (s) { return s.done === true; })) return 0;
    if (group.awarded) return 0;
    const pts = groupRewardOf(group);
    if (pts <= 0) return 0;
    App.store.addLedger(dayKey || S().todayKey(), 'group-reward', {
      points: pts,
      note: '🎯 整组做完奖励：' + group.name + '（' + subs.length + ' 题全完成）· +' + pts + ' 分',
      taskId: task.id
    });
    group.awarded = pts;
    S().save();
    App.ui.floatAt(document.getElementById('stat-points'), '+' + pts + '分');
    App.ui.toast('🎯 「' + group.name + '」整组做完，额外 +' + pts + ' 分');
    return pts;
  }

  function groupBlockHTML(task) {
    const groups = task.groups || [];
    const body = groups.map(function (g) {
      const subs = g.subs || [];
      const doneN = subs.filter(function (s) { return s.done === true; }).length;
      const prog = subs.length ? (doneN + '/' + subs.length) : '空组';
      const gPlanned = subs.reduce(function (a, s) { return a + (s.minutes || 0); }, 0);
      const gSess = ((S().getDay(S().todayKey()).sessions) || []).filter(function (se) { return se.taskId === task.id; });
      const gActual = gSess.reduce(function (a, se) { return subs.some(function (s) { return s.text === se.planContent; }) ? a + (se.actualMinutes || 0) : a; }, 0);
      // 连续工作 = 正在做本组当前小题的"未歇"时长（暂停/小休不计入）
      const gCont = (cdTimer && cdTimer.taskId === task.id && cdTimer.groupId === g.id) ? Math.max(0, (cdElapsedMs() || 0) / 60000) : 0;
      const allDone = subs.length > 0 && subs.every(function (s) { return s.done === true; });
      const items = subs.map(function (s) {
        const running = cdTimer && cdTimer.groupId === g.id && cdTimer.subId === s.id;
        const cls = s.done === true ? ' done' : (s.done === false ? ' fail' : (running ? ' running' : ''));
        const stateTxt = s.done === true ? ' ✓完成' : (s.done === false ? ' ✗未完成' : '');
        // 组里的每一题也能开听课三步（v47）
        const lecPanel = (App.lecture && App.lecture.inlineHTML) ? App.lecture.inlineHTML(task, s) : '';
        return '<div class="sub-wrap' + (lecPanel ? ' lec-on' : '') + '">' +
          '<div class="sub-item' + cls + '" data-sub="' + s.id + '">' +
          '<span class="sub-text">' + S().esc(s.text) + '</span>' +
          '<span class="sub-meta">' + (s.minutes > 0 ? ('限' + s.minutes + '分钟') : '⏱ 不限时') +
          (s.points > 0 ? ' · +' + s.points + '分' : '') + stateTxt + '</span>' +
          (running
            ? '<span class="sub-meta running-txt">' + (cdTimer.microRest ? '☕ 小休中…' :
                (cdTimer.paused ? '⏸ 已暂停' : (cdTimer.minutes > 0 ? '⏳ 倒计时中…' : '⏱ 计时中…'))) + '</span>'
            : '<button class="btn btn-small sub-start" data-act="g-cd-start" data-task="' + task.id + '" data-group="' + g.id + '" data-sub="' + s.id + '">▶ 开始</button>') +
          '<button class="task-timer-btn' + (s.summary ? ' noted' : '') + '" data-act="g-sub-note" data-task="' + task.id + '" data-group="' + g.id + '" data-sub="' + s.id + '" title="写评语 / 补充">' + (s.summary ? '✍️' : '🖋') + '</button>' +
          '<button class="task-timer-btn task-lec-btn" data-act="g-sub-lecture" data-task="' + task.id + '" data-group="' + g.id + '" data-sub="' + s.id + '" title="🎧 给这题开课（预习→听课→整理，走完自动勾掉它）">🎧</button>' +
          '<button class="task-timer-btn" data-act="g-sub-split" data-task="' + task.id + '" data-group="' + g.id + '" data-sub="' + s.id + '" title="🧭 逐题拆解（语音/文字引导）">🧭</button>' +
          '<button class="task-timer-btn" data-act="g-sub-rep" data-task="' + task.id + '" data-group="' + g.id + '" data-sub="' + s.id + '" title="🔁 只把这题安排到另一天重做（带着它所属的任务组）">🔁</button>' +
          '<button class="task-timer-btn" data-act="g-sub-edit" data-task="' + task.id + '" data-group="' + g.id + '" data-sub="' + s.id + '" title="编辑">✎</button>' +
          '<button class="task-timer-btn" data-act="g-sub-del" data-task="' + task.id + '" data-group="' + g.id + '" data-sub="' + s.id + '" title="删除">🗑</button>' +
          (s.summary && s.summary.text ? '<span class="sub-meta noted-tag">✍️ 已写评语</span>' : '') +
          (s.splitlog && s.splitlog.length ? '<span class="sub-meta noted-tag">🧭 已拆解</span>' : '') +
          '</div>' + lecPanel + '</div>';
      }).join('');
      const gRw = groupRewardOf(g);
      const rewardTxt = allDone
        ? '<span class="group-reward done">✅ 全部做完' + (g.awarded ? ' · 🎁 已领 +' + g.awarded + ' 分' : '') + '</span>'
        : (gRw > 0
          ? '<span class="group-reward">🏁 整组做完额外 +' + gRw + ' 分</span>'
          : '<span class="group-reward">整组做完 · 再对答案收尾</span>');
      return '<div class="group-card" data-group="' + g.id + '">' +
        '<div class="group-head"><span class="group-name">🎯 ' + S().esc(g.name) + '</span>' +
        '<span class="group-time">本组 ' + subs.length + ' 题 · 预计 <b>' + S().fmtDur(gPlanned) + '</b> · 实际 <b>' + S().fmtDur(gActual) + '</b>' + (gCont > 0 ? ' · 连续 <b>' + S().fmtDur(gCont) + '</b>' : '') + '</span>' +
        '<span class="group-progress">' + prog + '</span>' +
        rewardTxt +
        '<button class="task-timer-btn" data-act="g-sub-add" data-task="' + task.id + '" data-group="' + g.id + '" title="加小题">＋</button>' +
        '<button class="task-timer-btn" data-act="g-edit" data-task="' + task.id + '" data-group="' + g.id + '" title="改组名/奖励">✎</button>' +
        '<button class="task-timer-btn" data-act="g-del" data-task="' + task.id + '" data-group="' + g.id + '" title="删组">🗑</button>' +
        '</div>' +
        '<div class="group-subs">' + items + '</div>' +
        '<div class="extra-append"><button class="btn btn-small" data-act="g-sub-add" data-task="' + task.id + '" data-group="' + g.id + '">＋ 给本组加小题</button></div>' +
        '</div>';
    }).join('');
    return '<div class="group-block">' + body +
      '<div class="extra-append"><button class="btn btn-small btn-primary" data-act="group-new" data-task="' + task.id + '">🎯 建一个任务组（打包小题，整组做完就收尾对答案）</button></div>' +
      '</div>';
  }

  function addGroupModal(taskKey, taskId, dayKey) {
    const task = S().getDay(dayKey || S().todayKey()).tasks[taskKey].find(function (t) { return t.id === taskId; });
    if (!task) return;
    const m = App.ui.openModal('🎯 新建任务组', '' +
      '<p style="font-size:12.5px;color:#8a919c;margin-bottom:10px">把几个关联的小题打包成一组，整组都做完就算完成，专治“大任务太沉、开不了头”</p>' +
      '<div class="field"><label>任务组名称</label><input type="text" id="g-name" placeholder="如：搞定第三章" /></div>' +
      '<div class="field"><label>🏁 整组做完的整体奖励积分（全组题目都完成时，额外发一次）</label>' +
      '<input type="number" id="g-reward" min="0" value="' + (S().settings().groupRewardPoints || 0) + '" /></div>' +
      '<p class="hint">填 0 = 这一组不要整组奖励。奖励只在**第一次**全组做完时发，之后不会重复发。</p>',
      '<button class="btn btn-primary" data-act="ok">创建</button><button class="btn" data-act="cancel">取消</button>');
    App.ui.bindActions({
      ok: function () {
        const name = m.querySelector('#g-name').value.trim();
        if (!name) { App.ui.toast('请填写组名称'); return; }
        task.groups = task.groups || [];
        const rwIn = m.querySelector('#g-reward');
        task.groups.push({ id: S().uid(), name: name, subs: [], rewardPoints: Math.max(0, +(rwIn ? rwIn.value : 0) || 0) });
        pushQ(task);
        S().save(); App.ui.closeModal(); App.tasks.renderAll();
      },
      cancel: App.ui.closeModal
    });
  }

  function editGroupModal(taskKey, taskId, groupId, dayKey) {
    const task = S().getDay(dayKey || S().todayKey()).tasks[taskKey].find(function (t) { return t.id === taskId; });
    const g = task && (task.groups || []).find(function (x) { return x.id === groupId; });
    if (!g) return;
    const m = App.ui.openModal('✎ 任务组', '' +
      '<div class="field"><label>组名称</label><input type="text" id="g-name" value="' + S().esc(g.name) + '" /></div>' +
      '<div class="field"><label>🏁 整组做完的整体奖励积分（0 = 不要这个奖励）</label>' +
      '<input type="number" id="g-reward" min="0" value="' + groupRewardOf(g) + '" /></div>',
      '<button class="btn btn-primary" data-act="ok">保存</button><button class="btn" data-act="cancel">取消</button>');
    App.ui.bindActions({
      ok: function () {
        g.name = m.querySelector('#g-name').value.trim() || g.name;
        const rwIn2 = m.querySelector('#g-reward');
        if (rwIn2) g.rewardPoints = Math.max(0, +rwIn2.value || 0);
        pushQ(task);
        // ⚠️ 这里过去会 delete g.awarded（"已领过奖励"的标记）——
        //    结果改个组名就把标记清了 → 整组奖励会被重复发。v63 起不再清。
        S().save(); App.ui.closeModal(); App.tasks.renderAll();
      },
      cancel: App.ui.closeModal
    });
  }

  function delGroup(taskKey, taskId, groupId, dayKey) {
    const task = S().getDay(dayKey || S().todayKey()).tasks[taskKey].find(function (t) { return t.id === taskId; });
    const g = task && (task.groups || []).find(function (x) { return x.id === groupId; });
    if (!g) return;
    App.ui.confirm('删除任务组「' + g.name + '」及其所有小题？', '删除', function () {
      trashPush({ kind: 'group', dayKey: dayKey || S().todayKey(), col: taskKey, taskId: taskId, payload: JSON.parse(JSON.stringify(g)) });
      const idx = task.groups.findIndex(function (x) { return x.id === groupId; });
      task.groups.splice(idx, 1);
      pushQ(task);
      if (cdTimer && cdTimer.groupId === groupId) { cdTimer = null; stopTickIfIdle(); showTimerBar(); }
      S().save(); App.ui.toast('已删除 · 可到回收站恢复'); App.tasks.renderAll();
      dropLectureIfDeleted(taskId, null, groupId);
    });
  }

  function delGroupSub(taskKey, taskId, groupId, subId, dayKey) {
    const task = S().getDay(dayKey || S().todayKey()).tasks[taskKey].find(function (t) { return t.id === taskId; });
    const g = task && (task.groups || []).find(function (x) { return x.id === groupId; });
    const subs = g ? (g.subs || []) : [];
    const sub = subs.find(function (s) { return s.id === subId; });
    if (!sub) return;
    App.ui.confirm('删除小题「' + sub.text + '」？', '删除', function () {
      trashPush({ kind: 'sub', dayKey: dayKey || S().todayKey(), col: taskKey, taskId: taskId, groupId: groupId, payload: JSON.parse(JSON.stringify(sub)) });
      const idx = subs.findIndex(function (s) { return s.id === subId; });
      subs.splice(idx, 1);
      pushQ(task);
      if (cdTimer && cdTimer.groupId === groupId && cdTimer.subId === subId) { cdTimer = null; stopTickIfIdle(); showTimerBar(); }
      S().save(); App.ui.toast('已删除 · 可到回收站恢复'); App.tasks.renderAll();
      dropLectureIfDeleted(taskId, subId, null);
    });
  }



  /* ---------- 强化休息系统：任务内高频短休 ---------- */
  function isStrongMode() { return S().settings().recordMode === 'strong'; }

  // 计算当前所在「整组/整任务」的累计进度（%），用于进度休息提醒——按整个任务组算，不是每道 5 分钟小题
  function groupProgress(cd) {
    const day = S().getDay(S().todayKey());
    const task = (day.tasks[cd.taskKey] || []).find(function (t) { return t.id === cd.taskId; });
    if (!task) return null;
    let planned = 0, used = 0, key = 't' + cd.taskId;
    if (cd.groupId) {
      const g = (task.groups || []).find(function (g2) { return g2.id === cd.groupId; });
      if (!g) return null;
      key = 'g' + cd.groupId;
      planned = (g.subs || []).reduce(function (a, s) { return a + (s.minutes || 0); }, 0);
      (day.sessions || []).forEach(function (se) {
        if (se.taskId === cd.taskId && g.subs.some(function (s) { return s.text === se.planContent; })) used += se.actualMinutes || 0;
      });
    } else {
      planned = (task.subs || []).reduce(function (a, s) { return a + (s.minutes || 0); }, 0);
      (day.sessions || []).forEach(function (se) {
        if (se.taskId === cd.taskId && task.subs.some(function (s) { return s.text === se.planContent; })) used += se.actualMinutes || 0;
      });
    }
    if (!planned) return null;
    used += Math.min(cd.minutes || 0, Math.max(0, (Date.now() - cd.startedAt - cd.pausedMs) / 60000)); // 加上正在做这题的时间
    return { pct: Math.min(100, (used / planned) * 100), key: key };
  }
  function startMicroRest() {
    if (!cdTimer) { App.ui.toast('先开始一个小题/任务的倒计时，才能小休'); return; }
    if (cdTimer.microRest) { App.ui.toast('正在小休中…'); return; }
    const secs = Math.max(60, (S().settings().srRestMin || 2) * 60);
    cdTimer.paused = true;                      // 原题倒计时暂停（休息不计入用时）
    cdTimer.pauseAt = cdTimer.pauseAt == null ? Date.now() : cdTimer.pauseAt;
    cdTimer.microRest = true;
    cdTimer.microEndAt = Date.now() + secs * 1000;
    cdTimer.srRested = true;                    // 已休息过 → 定时提醒不再触发
    cdTimer.srLastPromptAt = Date.now();        // 重置提醒冷却，避免刚休息完又连推
    showTimerBar();
    App.tasks.renderAll();
    App.ui.toast('☕ 小休 ' + (secs / 60) + ' 分钟，放空 / 闭眼…回来接着把这题做完');
  }
  function cancelMicroRest() {
    if (!cdTimer) return;
    cdTimer.microRest = false;
    cdTimer.microEndAt = 0;
    if (cdTimer.paused) {
      cdTimer.pausedMs += Date.now() - cdTimer.pauseAt;
      cdTimer.pauseAt = undefined;
      cdTimer.paused = false;
    }
    showTimerBar();
    App.tasks.renderAll();
    App.ui.toast('小休结束，接着把这题做完吧');
  }
  function resumeCdAfterRest() {
    if (!cdTimer) return;
    cdTimer.microRest = false;
    cdTimer.microEndAt = 0;
    if (cdTimer.paused) {
      cdTimer.pausedMs += Date.now() - cdTimer.pauseAt;
      cdTimer.pauseAt = undefined;
      cdTimer.paused = false;
    }
    showTimerBar();
    App.tasks.renderAll();
  }
  function srPrompt70(pct) {
    const s = S().settings();
    const m = App.ui.openModal('☕ 这一组已完成 ' + (pct == null ? Math.round(s.srRestAt || 70) : Math.round(pct)) + '%',
      '<p class="hint">整个任务组做到预计的 ' + (s.srRestAt || 70) + '% 了。提前、短时休息比累坏了再休更有效，放空一下回来接着做，状态不会断。</p>',
      '<button class="btn btn-primary" data-act="do">☕ 小休 ' + s.srRestMin + ' 分钟</button><button class="btn" data-act="later">我还不累，继续</button>');
    App.ui.bindActions({
      do: function () { App.ui.closeModal(); startMicroRest(); },
      later: App.ui.closeModal
    });
  }
  function srForceRest() {
    const s = S().settings();
    const runMin = Math.max(1, Math.round((Date.now() - cdTimer.startedAt - cdTimer.pausedMs) / 60000));
    const m = App.ui.openModal('💪 强制休息提醒',
      '<p class="hint">你已连续做 ' + runMin + ' 分钟没休息。高强度用脑不是休息，放空才是。先小休 ' + s.srRestMin + ' 分钟，再回来接着做，状态更稳。</p>',
      '<button class="btn btn-primary" data-act="do">☕ 好，小休 ' + s.srRestMin + ' 分钟</button><button class="btn" data-act="later">再坚持会儿</button>');
    App.ui.bindActions({
      do: function () { App.ui.closeModal(); startMicroRest(); },
      later: App.ui.closeModal
    });
  }

  function startCdTimer(taskKey, taskId, subId, groupId) {
    const day = S().getDay(S().todayKey());
    const task = day.tasks[taskKey] && day.tasks[taskKey].find(function (t) { return t.id === taskId; });
    const found = findSubInTask(task, subId);
    const sub = found && found.sub;
    if (!sub) return;
    if (task.done) { App.ui.toast('这个任务已完成，结束它或重新开始再计时'); return; }
    // 已有倒计时在跑：直接切换（旧的不受影响）
    cdTimer = {
      taskKey: taskKey, taskId: taskId, subId: subId, groupId: groupId || null,
      taskText: task.text, text: sub.text,
      minutes: Math.max(0, sub.minutes || 0), points: sub.points || 0,   // ⏱ v102：0 = 正计时
      startedAt: Date.now(), pausedMs: 0, paused: false, finished: false,
      microRest: false, microEndAt: 0, srRested: false, srReminded70: false, srForced: false,
      srLastPromptAt: 0
    };
    saveTimerSnap();             // 🛟 v107
    startTick();
    showTimerBar();
    App.tasks.renderAll();
    pipOpen();          // 🪟 小任务也一样，直接弹成独立小窗
    App.ui.toast((cdTimer.minutes > 0
      ? ('⏳「' + sub.text + '」限时 ' + cdTimer.minutes + ' 分钟 · ')
      : ('⏱「' + sub.text + '」开始正计时（不限时） · ')) + QUOTES[Math.floor(Math.random() * QUOTES.length)]);
  }

  function toggleCdPause() {
    if (!cdTimer) return;
    if (cdTimer.microRest) { cancelMicroRest(); return; }
    if (!cdTimer.paused) {
      cdTimer.paused = true;
      cdTimer.pauseAt = Date.now();
    } else {
      cdTimer.pausedMs += Date.now() - cdTimer.pauseAt;
      cdTimer.pauseAt = undefined;
      cdTimer.paused = false;
    }
    saveTimerSnap();             // 🛟 v107
    showTimerBar();
    App.tasks.renderAll();
  }

  /* 手动结束 / 到点后结束 → 完成确认弹窗（用时对比 + 小总结） */
  function cdFinish() {
    if (!cdTimer) return;
    bringPageForModal();
    const cd = cdTimer;
    const elapsed = Date.now() - cd.startedAt - cd.pausedMs;
    const over = cd.minutes > 0 ? (elapsed - cd.minutes * 60000) : -1;   // ⏱ v102：不限时不算超时
    // 奖励三档（只奖提前/按时，不罚超时）：提前≤70%用时×2 · 按时×1.5 · 超时×1
    let earnTier = '超时完成';
    let factor = 1;
    if (over > 0) {
      earnTier = '超时完成';
      factor = 1;
    } else if (elapsed <= cd.minutes * 60000 * 0.7) {
      earnTier = '提前完成';
      factor = 2;
    } else {
      earnTier = '按时完成';
      factor = 1.5;
    }
    const earn = (cd.points || 0) > 0 ? Math.round((cd.points || 0) * factor) : 0;
    cd.earnPoints = earn;
    cd.earnTier = earnTier;
    cd.earnFactor = factor;
    const timeLine = '实际用时 ' + S().fmtClock(elapsed) +
      (cd.minutes > 0
        ? (' / 目标 ' + S().fmtDur(cd.minutes) +
           (over > 0 ? '  <span style="color:#e2545d">（超时 ' + S().fmtClock(over).replace(/^00:/, '') + '）</span>'
                     : '  <span style="color:#22a06b">（在目标内）</span>'))
        : '  <span style="color:#8a919c">（不限时 · 正计时）</span>');
    const noteEl = '<div class="field"><label>小总结（超时可写一句为什么超时）</label>' +
      '<textarea id="cd-note" style="width:100%;min-height:56px;border:1px solid #e5e8ec;border-radius:8px;padding:8px 10px;font-size:13px;resize:vertical"></textarea></div>';
    settleCdNow(cd);       // ★ v56：先把时间结算掉（进时间轴 + 今日用时），再弹提示
    const modal = App.ui.openModal(cd.minutes > 0 ? '⏰ 时间到！' : '⏱ 这一题做完了？', '' +
      '<div class="field"><label>小任务</label><p style="font-size:14px;font-weight:700">' + S().esc(cd.text) + '</p></div>' +
      '<p style="font-size:12.5px;color:#8a919c;margin-bottom:8px">所属任务：' + S().esc(cd.taskText) + '</p>' +
      '<div class="field"><label>用时对比</label><p style="font-size:13px">' + timeLine + '</p></div>' +
      (cd.points > 0
        ? '<div class="field"><label>完成可得' + (cd.minutes > 0 ? '（按用时三档）' : '') + '</label><p style="font-weight:700;color:' + (cd.earnFactor === 2 ? '#22a06b' : cd.earnFactor === 1.5 ? '#f59e0b' : '#8a919c') + '">+' + earn + ' 分 ' + (cd.earnFactor > 1 ? '（' + cd.earnTier + '，×' + cd.earnFactor + ' 加成）' : '（' + cd.earnTier + '）') + '</p></div>'
        : '') +
      noteEl,
      '<button class="btn btn-primary" data-act="sub-done">✅ 完成了，领取积分</button>' +
      '<button class="btn" data-act="sub-fail">❌ 没完成</button>' +
      '<button class="btn" data-act="sub-retry">🔁 再来一轮</button>' +
      '<button class="btn" data-act="sub-later">🕘 先不选（留着，不会丢）</button>');
    App.ui.bindActions({
      'sub-done': function () { finishCdResult(cd, true, modal.querySelector('#cd-note').value.trim()); },
      'sub-fail': function () { finishCdResult(cd, false, modal.querySelector('#cd-note').value.trim()); },
      'sub-retry': function () {
        App.ui.closeModal();
        const d2 = S().getDay(S().todayKey());
        d2.pendingSubs = (d2.pendingSubs || []).filter(function (x) { return x.subId !== cd.subId; });
        S().save();
        App.ui.toast('再来一轮 —— 刚才那轮的时间已经记下了');
        startCdTimer(cd.taskKey, cd.taskId, cd.subId, cd.groupId || null);
      },
      'sub-later': function () {
        // ★ v56：时间已经结算过了，这里只是"暂时不标结果"，不丢
        App.ui.closeModal();
        renderDrawer();
        App.ui.toast('时间已经记下了。这题先留着 —— 任务页顶部或小窗抽屉里点「✅ 完成 / ❌ 没完成」就行', 4200);
      }
    });
  }

  /* ================= 🎧 连听（v57）：一次勾好几节，上完一节自动接下一节 ================= */
  /** 把一条任务下所有"能听课"的条目摊平（任务组里的每一题 + 单独小任务） */
  function lectureItemsOf(task) {
    const items = [];
    (task.groups || []).forEach(function (g, gi) {
      (g.subs || []).forEach(function (s) {
        items.push({ taskId: task.id, groupId: g.id, subId: s.id, text: s.text,
          groupName: g.name || ('任务组 ' + (gi + 1)), minutes: s.minutes || 0,
          points: s.points || 0, done: s.done === true });
      });
    });
    (task.subs || []).forEach(function (s) {
      items.push({ taskId: task.id, groupId: null, subId: s.id, text: s.text,
        groupName: '', minutes: s.minutes || 0, points: s.points || 0, done: s.done === true });
    });
    return items;
  }

  /** 🎧 选课弹窗：勾上这次要一起听的几节（默认只勾没听完的） */
  function lecturePickModal(listKey, taskId, fromTomorrow) {
    const day = S().getDay(fromTomorrow ? S().tomorrowKey() : S().todayKey());
    const task = day.tasks[listKey] && day.tasks[listKey].find(function (t) { return t.id === taskId; });
    if (!task) return;
    const items = lectureItemsOf(task);
    if (!items.length) { startLectureFromTask(listKey, taskId); return; }   // 没有小题 → 还是直接开整条
    if (day.activeLecture) {                       // 已有课在计时 → 先问清楚，别再"点了没反应"
      askSwitchLecture(task.text, function () {
        if (App.lecture && App.lecture.abandonActive) App.lecture.abandonActive();  // 旧课存档，别又弹一次确认
        lecturePickModal(listKey, taskId, fromTomorrow);
      });
      return;
    }
    let rows = '', lastG = '\u0000';
    items.forEach(function (it, i) {
      if (it.groupName !== lastG) {
        lastG = it.groupName;
        rows += '<div class="lp-g">' + (it.groupName ? '📁 ' + S().esc(it.groupName) : '📋 单独的小任务') + '</div>';
      }
      rows += '<label class="lp-row' + (it.done ? ' done' : '') + '">' +
        '<input type="checkbox" class="lp-cb" data-i="' + i + '"' + (it.done ? '' : ' checked') + ' />' +
        '<span class="lp-t">' + S().esc(it.text) + '</span>' +
        '<span class="lp-m">' + it.minutes + ' 分钟' + (it.points ? ' · +' + it.points + ' 分' : '') + '</span>' +
        (it.done ? '<span class="lp-d">✓ 完成过</span>' : '') + '</label>';
    });
    const html =
      '<p style="font-size:12.5px;color:#8a919c;margin-bottom:6px">勾上这次要<b>连着听</b>的几节 —— '
      + '上完一节会自动接下一节，不用来回挑。'
      + (fromTomorrow ? '（记在今天的时间轴，走完勾掉「明天」那几条）' : '') + '</p>'
      + '<div class="lp-quick">'
      + '<button class="btn btn-small" data-q="undone">只留没听完的</button>'
      + '<button class="btn btn-small" data-q="all">全选</button>'
      + '<button class="btn btn-small" data-q="none">全不选</button>'
      + '<span class="lp-sum" id="lp-sum"></span></div>'
      + '<div class="lp-list">' + rows + '</div>';
    const modal = App.ui.openModal('🎧 这次要连着听哪几节？', html,
      '<button class="btn btn-primary" data-act="ok">▶ 开始连听</button>' +
      '<button class="btn" data-act="cancel">取消</button>');
    const boxes = function () { return [].slice.call(modal.querySelectorAll('.lp-cb')); };
    const sum = function () {
      const on = boxes().filter(function (b) { return b.checked; });
      const mins = on.reduce(function (a, b) { return a + (items[+b.dataset.i].minutes || 0); }, 0);
      const el = modal.querySelector('#lp-sum');
      if (el) el.textContent = '已选 ' + on.length + ' 节 · 预计 ' + mins + ' 分钟';
    };
    boxes().forEach(function (b) { b.onchange = sum; });
    modal.querySelectorAll('[data-q]').forEach(function (b) {
      b.onclick = function () {
        const k = b.dataset.q;
        boxes().forEach(function (x) {
          const it = items[+x.dataset.i];
          x.checked = (k === 'all') ? true : ((k === 'none') ? false : !it.done);
        });
        sum();
      };
    });
    sum();
    App.ui.bindActions({
      ok: function () {
        const picked = boxes().filter(function (b) { return b.checked; })
          .map(function (b) { return items[+b.dataset.i]; });
        if (!picked.length) { App.ui.toast('先勾上至少一节'); return; }
        App.ui.closeModal();
        startQueue(picked, listKey, fromTomorrow);
      },
      cancel: function () { App.ui.closeModal(); }
    });
  }

  function startQueue(items, listKey, fromTomorrow) {
    if (!items || !items.length) return;
    const day = S().getDay(S().todayKey());
    day.lectureQueue = { id: S().uid(), listKey: listKey || 'required', idx: 0,
      fromTomorrow: !!fromTomorrow, items: items.slice(), startedAt: Date.now() };
    S().save();
    playQueueItem(0);
  }
  /** 给 lecture.js 的徽标用：连听 3/12 */
  function queueInfo() {
    const q = S().getDay(S().todayKey()).lectureQueue;
    if (!q || !(q.items || []).length) return null;
    return { idx: Math.min(Math.max(1, (q.idx || 0) + 1), q.items.length), total: q.items.length,
      cur: q.items[Math.max(0, q.idx || 0)] || null };
  }
  function playQueueItem(i, depth) {
    const day = S().getDay(S().todayKey());
    const q = day.lectureQueue;
    if (!q || !q.items[i]) { endQueue('🎬 连听队列走完了'); return; }
    q.idx = i;
    S().save();
    const it = q.items[i];
    startLectureFromSub(q.listKey || 'required', it.taskId, it.subId, it.groupId, !!q.fromTomorrow);
    if (!day.activeLecture) {
      // ★ v58：这一节已经不在了（被删/改过）→ 跳过它接着找下一节能上的
      if ((depth || 0) < 30 && i + 1 < q.items.length) { playQueueItem(i + 1, (depth || 0) + 1); return; }
      endQueue('这几节都不在了（可能被删了），连听结束');
      return;
    }
    renderAll(); showTimerBar();
  }
  function endQueue(msg) {
    const day = S().getDay(S().todayKey());
    day.lectureQueue = null;
    clearPendingChoice();
    S().save(); renderAll();
    if (msg) App.ui.toast(msg, 3600);
  }
  /** 一节上完（完成 / 跳过 / 放弃）→ 弹窗自动衔接下一节 */
  function afterLecture(L, how) {
    const day = S().getDay(S().todayKey());
    const q = day.lectureQueue;
    if (!q) return;
    const next = (q.idx || 0) + 1;
    if (next >= q.items.length) { endQueue('🎉 这 ' + q.items.length + ' 节都上完了，连听结束'); return; }
    queuePrompt(next);
  }
  function queuePrompt(next) {
    const day = S().getDay(S().todayKey());
    const q = day.lectureQueue;
    if (!q) return;
    const total = q.items.length;
    if (next >= total) { endQueue('🎉 全部上完了'); return; }
    const it = q.items[next];
    setPendingChoice('queue', it.text);      // ★ 先落库：关掉弹窗也不丢
    renderAll();
    App.ui.openModal('🎧 连听 ' + (next + 1) + '/' + total,
      '<p style="font-size:13.5px">刚那节搞定了 ✅　下一节：<b>' + S().esc(it.text) + '</b>（' + it.minutes + ' 分钟）</p>' +
      '<p class="hint">不用回列表挑 —— 点「马上开始」，或者什么都不点，5 秒后自动接着上。</p>',
      '<button class="btn btn-primary" data-act="go">▶ 马上开始（<span id="lq-n">5</span>）</button>' +
      '<button class="btn" data-act="pause">🕘 停一下（留着）</button>' +
      '<button class="btn" data-act="stop">⏹ 结束连听</button>');
    let n = 5;
    if (lqTimer) { clearInterval(lqTimer); lqTimer = null; }
    lqTimer = setInterval(function () {
      const el = App.ui.query ? App.ui.query('#lq-n') : document.getElementById('lq-n');
      if (!el) { stopTimer(); return; }   // ★ v58：弹窗被 X/ESC 关掉了 → 停掉倒计时，别再自动开下一节（也别误关别人的弹窗）
      n--;
      el.textContent = String(Math.max(0, n));
      if (n <= 0) go();
    }, 1000);
    function stopTimer() { if (lqTimer) { clearInterval(lqTimer); lqTimer = null; } }
    function go() {
      stopTimer();
      App.ui.closeModal();
      clearPendingChoice();
      playQueueItem(next);
    }
    App.ui.bindActions({
      go: go,
      pause: function () { stopTimer(); App.ui.closeModal(); renderAll();
        App.ui.toast('好，留着 —— 任务页顶部或小窗里点「▶ 下一节」随时接着上', 4000); },
      stop: function () { stopTimer(); App.ui.closeModal(); endQueue('⏹ 已结束连听（上过的都记着）'); }
    });
  }
  /** 已有课在计时中，用户又点了别的 🎧 → 明确问一句 */
  function askSwitchLecture(newName, retry) {
    const day = S().getDay(S().todayKey());
    const cur = day.activeLecture;
    if (!cur) { if (retry) retry(); return; }
    App.ui.openModal('⚠️ 现在正在上「' + S().esc(cur.course) + '」',
      '<p style="font-size:13.5px">你要开的是「<b>' + S().esc(newName || '新的') + '</b>」。</p>' +
      '<p class="hint">直接换的话，当前这节按「放弃」存档（已听的时间照样记进时间轴，只是不发大奖）。</p>',
      '<button class="btn btn-primary" data-act="ok">🔄 换成新选的</button>' +
      '<button class="btn" data-act="cancel">↩ 先上完当前这节</button>');
    App.ui.bindActions({
      ok: function () { App.ui.closeModal(); if (retry) retry(); renderAll(); },
      cancel: function () { App.ui.closeModal(); App.ui.toast('好，继续上「' + cur.course + '」'); }
    });
  }

  /* ================= 🌙 待办衔接条（v56）=================
     用户实测：小任务到点弹出提示，关掉之后"去休息 / 接着做"的选项就没了，之后也开不了新任务。
     现在：① 到点立刻把时间结算掉（不等用户选）② 没做选择就留一条常驻的"待办衔接"，
     网页任务页顶部和小窗抽屉里都能点，随时能接着处理。 */
  function pendingOf() {
    const day = S().getDay(S().todayKey());
    return { choice: day.pendingChoice || null, subs: day.pendingSubs || [] };
  }
  /** 还没标"完成/没完成"的小任务（可能不止一条：没标就开下一个，上一条也不会被顶掉） */
  function pendingSubsList() {
    const day = S().getDay(S().todayKey());
    day.pendingSubs = day.pendingSubs || [];
    return day.pendingSubs;
  }
  function dropPendingSub(pid) {
    const day = S().getDay(S().todayKey());
    day.pendingSubs = (day.pendingSubs || []).filter(function (x) { return x.id !== pid; });
    S().save();
  }
  function setPendingChoice(kind, text) {
    const day = S().getDay(S().todayKey());
    day.pendingChoice = { id: S().uid(), kind: kind, text: text || '', at: Date.now() };
    S().save();
  }
  function clearPendingChoice() {
    const day = S().getDay(S().todayKey());
    if (!day.pendingChoice) return;
    day.pendingChoice = null;
    S().save();
  }
  function pendingChoiceText(c) {
    if (!c) return '';
    if (c.kind === 'plan') return '⏸ 这一段结束了 —— 接下来？';
    if (c.kind === 'queue') return '🎧 连听中 · 下一节：' + (c.text || '');
    return '🎉 「' + (c.text || '这一组') + '」做完了 —— 接下来？';
  }
  /** 待办衔接条：网页任务页 + 悬浮窗抽屉共用同一份 HTML */
  function pendingBarHTML() {
    const P = pendingOf();
    if (!P.choice && !P.subs.length) return '';
    let h = '<div class="pend-bar">';
    P.subs.forEach(function (s) {
      const tag = ' <span style="color:#8a919c">（' + (s.minutes > 0 ? ((s.minutes || 1) + ' 分钟已记') : '已记时') + '）</span>';
      h += '<div class="pend-row"><span class="pend-t">⏱ 「' + S().esc(s.text) + '」已经停了，'
        + '时间也记好了' + tag + ' —— 这题算完成吗？</span>'
        + '<button class="btn btn-small btn-primary" data-pend="subdone" data-pid="' + s.id + '">✅ 完成</button>'
        + '<button class="btn btn-small" data-pend="subfail" data-pid="' + s.id + '">❌ 没完成</button>'
        + '<button class="btn btn-small" data-pend="subskip" data-pid="' + s.id + '">✕ 不用记</button></div>';
    });
    if (P.choice) {
      h += '<div class="pend-row"><span class="pend-t">' + S().esc(pendingChoiceText(P.choice)) + '</span>'
        + (P.choice.kind === 'plan'
          ? '<button class="btn btn-small btn-primary" data-pend="work">📚 继续做任务</button>'
            + '<button class="btn btn-small" data-pend="rest">☕ 去休息</button>'
          : (P.choice.kind === 'queue'
            ? '<button class="btn btn-small btn-primary" data-pend="qnext">▶ 下一节</button>'
              + '<button class="btn btn-small" data-pend="qstop">⏹ 结束连听</button>'
            : '<button class="btn btn-small btn-primary" data-pend="next">▶ 接着做（下一题）</button>'
              + '<button class="btn btn-small" data-pend="rest">☕ 去休息</button>'))
        + '<button class="btn btn-small" data-pend="later">✕ 先不管</button></div>';
    }
    return h + '</div>';
  }
  function bindPendingBar(scope) {
    if (!scope || !scope.querySelectorAll) return;
    scope.querySelectorAll('[data-pend]').forEach(function (b) {
      b.onclick = function (e) {
        if (e && e.stopPropagation) e.stopPropagation();
        if (e && e.preventDefault) e.preventDefault();
        doPendingAction(b.dataset.pend, b.dataset.pid || '');
      };
    });
  }
  function doPendingAction(a, pid) {
    const day = S().getDay(S().todayKey());
    if (a === 'subdone' || a === 'subfail') { resolvePendingSub(pid, a === 'subdone'); return; }
    if (a === 'subskip') {
      dropPendingSub(pid); renderAll(); showTimerBar();
      App.ui.toast('好，这题就不标了（时间已经记下）');
      return;
    }
    if (a === 'later') {
      // 只把这条收起来，不代表做了选择 —— 之后还能在任务页顶部重新选？不，这条就是"先不管"
      clearPendingChoice(); groupDoneInfo = null; pendingNext = null;
      renderAll(); showTimerBar();
      App.ui.toast('好，先不管。想休息/继续随时在任务页重新开始一段就行');
      return;
    }
    if (a === 'qnext' || a === 'qstop') {
      const q = S().getDay(S().todayKey()).lectureQueue;
      clearPendingChoice();
      if (a === 'qstop' || !q) { endQueue('⏹ 已结束连听'); return; }
      renderAll();
      playQueueItem((q.idx || 0) + 1);
      return;
    }
    const kind = day.pendingChoice ? day.pendingChoice.kind : '';
    clearPendingChoice();
    groupDoneInfo = null; pendingNext = null;
    renderAll();
    if (a === 'work') { startHourPlanModal(); return; }
    if (a === 'rest') {
      if (smallRest) { App.ui.toast('已经在休息中'); return; }
      if (kind === 'plan') startRestModal(); else startSmallRest();
      return;
    }
    if (a === 'next') {
      if (pendingNext) startNextSub();
      else App.ui.toast('回到任务页，点小任务的 ⏱ 就能开下一题');
      return;
    }
  }
  /** 待办的小任务：标完成 / 没完成（时间早在到点时就结算过了，这里只补结果和积分） */
  function resolvePendingSub(pid, doneFlag) {
    const day = S().getDay(S().todayKey());
    const p = (day.pendingSubs || []).find(function (x) { return x.id === pid; });
    if (!p) return;
    const task = day.tasks[p.taskKey] && day.tasks[p.taskKey].find(function (t) { return t.id === p.taskId; });
    const found = task ? findSubInTask(task, p.subId) : null;
    if (found && found.sub) found.sub.done = doneFlag;
    const pts = doneFlag ? (p.earnPoints || 0) : 0;
    if (pts > 0) {
      S().addLedger(S().todayKey(), 'earn-sub', { points: pts,
        note: '小任务：' + p.text + '（' + (p.taskText || '') + '）·' + (p.earnTier || ''), taskId: p.taskId });
      App.ui.floatAt(document.getElementById('stat-points'), '+' + pts + '分');
    }
    const rec = (day.timeline || []).find(function (r) { return r.id === p.recId; });
    if (rec) delete rec.waitMark;
    const sess = (day.sessions || []).find(function (s) { return s.id === p.sessId; });
    if (sess) sess.done = doneFlag;
    dropPendingSub(pid);
    renderAll(); showTimerBar();
    App.ui.toast(doneFlag ? ('✅ 记上了' + (pts ? ' +' + pts + ' 分' : '')) : '⛔ 记作没完成（时间已经记下）');
  }
  /** ★ 到点立刻结算：写时间轴 + 今日用时，并把计时器清掉（不等用户选"完成/没完成"） */
  function settleCdNow(cd) {
    const day = S().getDay(S().todayKey());
    const stDate = new Date(cd.startedAt);
    const endDate = new Date();
    let sMin = stDate.getHours() * 60 + stDate.getMinutes();
    let eMin = endDate.getHours() * 60 + endDate.getMinutes();
    if (eMin < sMin) eMin = 1439;
    const span = Math.max(0, eMin - sMin);
    const elapsedMin = Math.max(1, Math.round((Date.now() - cd.startedAt - (cd.pausedMs || 0)) / 60000));
    const mins = Math.max(1, Math.min(elapsedMin, span > 0 ? span : elapsedMin));
    const rec = {
      id: S().uid(), start: sMin, end: eMin, minutes: mins, content: cd.text,
      category: 'study', countAsStudy: true, auto: true, sub: true,
      taskId: cd.taskId, taskText: cd.taskText, note: '', waitMark: true
    };
    day.timeline.push(rec);
    const sess = {
      id: S().uid(), taskId: cd.taskId, taskText: cd.taskText,
      planContent: cd.text, planMinutes: cd.minutes, actualMinutes: mins,
      actualSeconds: Math.round((Date.now() - cd.startedAt - (cd.pausedMs || 0)) / 1000),
      sub: true, done: null, note: '', startAt: stDate.toISOString(), endAt: endDate.toISOString(),
      pausedMs: cd.pausedMs || 0
    };
    day.sessions.push(sess);
    cd.recId = rec.id;
    cd.sessId = sess.id;
    pendingSubsList().push({
      id: S().uid(), taskKey: cd.taskKey, taskId: cd.taskId, groupId: cd.groupId || null, subId: cd.subId,
      text: cd.text, taskText: cd.taskText, minutes: mins,
      points: cd.points || 0, earnPoints: cd.earnPoints || 0, earnTier: cd.earnTier || '',
      recId: rec.id, sessId: sess.id, at: Date.now()
    });
    cdTimer = null;                 // ★ 关键：计时器清掉 → 用户可以立刻开新任务
    saveTimerSnap();                // 🛟 v107
    stopTickIfIdle();
    showTimerBar();
    App.tasks.renderAll();
    S().save();
  }
  /** 用户在弹窗里选了"完成 / 没完成" → 补结果 + 发积分（时间已经结算过） */
  function finishCdResult(cd, doneFlag, summary) {
    const day = S().getDay(S().todayKey());
    const task = day.tasks[cd.taskKey] && day.tasks[cd.taskKey].find(function (t) { return t.id === cd.taskId; });
    const found = task ? findSubInTask(task, cd.subId) : null;
    if (found && found.sub) {
      found.sub.done = doneFlag;
      if (summary) found.sub.summary = summary;
    }
    const pts = (cd.earnPoints != null ? cd.earnPoints : cd.points) || 0;
    if (doneFlag && pts > 0) {
      const tierMark = cd.earnFactor > 1 ? cd.earnTier + '，×' + cd.earnFactor : cd.earnTier;
      S().addLedger(S().todayKey(), 'earn-sub', { points: pts,
        note: '小任务：' + cd.text + '（' + cd.taskText + '）·' + tierMark, taskId: cd.taskId });
      App.ui.floatAt(document.getElementById('stat-points'), '+' + pts + '分');
    }
    const rec = (day.timeline || []).find(function (r) { return r.id === cd.recId; });
    if (rec) { rec.note = summary || ''; delete rec.waitMark; }
    const sess = (day.sessions || []).find(function (s) { return s.id === cd.sessId; });
    if (sess) { sess.done = doneFlag; sess.note = summary || ''; }
    const mine = (day.pendingSubs || []).find(function (x) { return x.recId === cd.recId; });
    if (mine) dropPendingSub(mine.id); else { day.pendingSubs = []; S().save(); }
    App.ui.closeModal();
    S().save(); renderAll(); showTimerBar();
    // 🎯 v63：这条路径（v56 的「先结算再问完成没」）不经过 markSub，
    //    这里也得看一眼整组是不是全做完了 —— 否则从弹窗里点完成就拿不到整组奖励
    if (doneFlag) groupRewardCheck(task, found && found.group, S().todayKey());
  }

  function markSub(cd, doneFlag, summary) {
    const day = S().getDay(S().todayKey());
    const task = day.tasks[cd.taskKey] && day.tasks[cd.taskKey].find(function (t) { return t.id === cd.taskId; });
    const found = findSubInTask(task, cd.subId);
    const sub = found && found.sub;
    const group = found && found.group;
    // 本次实际用时（小任务时长也计入今日总时长 + 时间轴，学习性质）
    const stDate = new Date(cd.startedAt);
    const endDate = new Date();
    let sMin = stDate.getHours() * 60 + stDate.getMinutes();
    let eMin = endDate.getHours() * 60 + endDate.getMinutes();
    if (eMin < sMin) eMin = 1439;
    const span = Math.max(0, eMin - sMin);
    const elapsedMin = Math.max(1, Math.round((Date.now() - cd.startedAt - cd.pausedMs) / 60000));
    const mins = Math.max(1, Math.min(elapsedMin, span > 0 ? span : elapsedMin));
    if (sub) {
      sub.done = doneFlag;
      if (summary) sub.summary = summary;
      const pts = (cd.earnPoints != null ? cd.earnPoints : cd.points) || 0;
      if (doneFlag && pts > 0) {
        const tierMark = cd.earnFactor > 1 ? cd.earnTier + '，×' + cd.earnFactor : cd.earnTier;
        S().addLedger(S().todayKey(), 'earn-sub', { points: pts, note: '小任务：' + cd.text + '（' + task.text + '）·' + tierMark, taskId: cd.taskId });
        App.ui.floatAt(document.getElementById('stat-points'), '+' + pts + '分');
      }
    }
    // 时间轴记录
    day.timeline.push({
      id: S().uid(), start: sMin, end: eMin, minutes: mins,
      content: cd.text, category: 'study', countAsStudy: true,
      auto: true, sub: true, taskId: cd.taskId, taskText: cd.taskText,
      note: summary || ''
    });
    // 累计「今日任务实际用时」
    day.sessions.push({
      id: S().uid(), taskId: cd.taskId, taskText: cd.taskText,
      planContent: cd.text, planMinutes: cd.minutes,
      actualMinutes: mins,
      actualSeconds: Math.round((Date.now() - cd.startedAt - (cd.pausedMs || 0)) / 1000),
      sub: true, done: doneFlag, note: summary || '',
      startAt: stDate.toISOString(), endAt: endDate.toISOString(), pausedMs: cd.pausedMs || 0
    });
    cdTimer = null;
    saveTimerSnap();                // 🛟 v107
    stopTickIfIdle();
    showTimerBar();
    S().save();
    // 🎯 这道小题做完后，整组是不是全做完了？是就发整组奖励
    if (doneFlag && group) groupRewardCheck(task, group, S().todayKey());
    App.tasks.renderAll();
  }

  /* ---------- 任务总结（勾选完成时填写）+ 🔁 间隔重做安排 ---------- */
  function summaryTaskModal(listKey, taskId, taskText, onDone) {
    let doneFlag = true;
    let repDays = 0;        // 0=不安排, 1/3/7=N天后, -1=自选日期
    let repStandard = '';   // 重做的标准
    const body = function () {
      return '<div class="field"><label>任务</label><p style="font-size:14px;font-weight:700">' + S().esc(taskText) + '</p></div>' +
        '<div class="field"><label>这次做完了吗？</label><div class="btn-row">' +
        '<button class="btn btn-small' + (doneFlag ? ' btn-primary' : '') + '" data-act="sum-done">✅ 做完了</button>' +
        '<button class="btn btn-small' + (doneFlag ? '' : ' btn-primary') + '" data-act="sum-part">⛔ 没做完</button>' +
        '</div></div>' +
        '<div class="field"><label>总结 / 心得 / 注意事项</label>' +
        '<textarea id="sum-note" style="width:100%;min-height:56px;border:1px solid #e5e8ec;border-radius:8px;padding:8px;font-size:13px;resize:vertical"></textarea></div>' +
        '<div class="field"><label>🔁 间隔重做（选填）：这道题过几天再来一次？</label><div class="btn-row" id="rep-chips">' +
        '<button class="btn btn-small' + (repDays === 0 ? ' btn-primary' : '') + '" data-days="0">不安排</button>' +
        '<button class="btn btn-small' + (repDays === 1 ? ' btn-primary' : '') + '" data-days="1" style="margin-left:4px">明天</button>' +
        '<button class="btn btn-small' + (repDays === 3 ? ' btn-primary' : '') + '" data-days="3" style="margin-left:4px">3天后</button>' +
        '<button class="btn btn-small' + (repDays === 7 ? ' btn-primary' : '') + '" data-days="7" style="margin-left:4px">7天后</button>' +
        '<button class="btn btn-small' + (repDays === -1 ? ' btn-primary' : '') + '" data-days="-1" style="margin-left:4px">自选…</button>' +
        '</div>' +
        '<input type="date" id="rep-date" value="' + S().dateKey(new Date(Date.now() + 3 * 86400000)) + '" style="display:' + (repDays === -1 ? 'block' : 'none') + ';margin-top:6px" />' +
        '<input type="text" id="rep-standard" value="' + S().esc(repStandard) + '" placeholder="标准：要做到什么程度（选填，如：全对 / 8分钟内解出）" style="width:100%;margin-top:6px" />' +
        '</div>';
    };
    function reopen() {
      const modal = App.ui.openModal('📝 写个任务总结', body(),
        '<button class="btn btn-primary" data-act="sum-save">保存总结</button>');
      const ta = modal.querySelector('#sum-note');
      ta.value = noteText;
      modal.querySelectorAll('#rep-chips [data-days]').forEach(function (b) {
        b.onclick = function () {
          repDays = +b.dataset.days;
          modal.querySelectorAll('#rep-chips [data-days]').forEach(function (x) { x.classList.remove('btn-primary'); });
          b.classList.add('btn-primary');
          modal.querySelector('#rep-date').style.display = repDays === -1 ? 'block' : 'none';
        };
      });
      const stdEl = modal.querySelector('#rep-standard');
      stdEl.oninput = function () { repStandard = stdEl.value; };
      App.ui.bindActions({
        'sum-done': function () { doneFlag = true; noteText = ta.value; App.ui.closeModal(); reopen(); },
        'sum-part': function () { doneFlag = false; noteText = ta.value; App.ui.closeModal(); reopen(); },
        'sum-save': function () {
          const day = S().getDay(S().todayKey());
          const task = day.tasks[listKey].find(function (t) { return t.id === taskId; });
          if (task) task.summary = { done: doneFlag, text: ta.value.trim(), at: new Date().toISOString() };
          S().save();
          // 🔁 间隔重做：安排到目标日（带小任务/任务组一起复制，标准写进任务）
          const std = (modal.querySelector('#rep-standard').value || '').trim();
          let target = null;
          if (repDays > 0) target = S().dateKey(new Date(Date.now() + repDays * 86400000));
          if (repDays === -1) target = modal.querySelector('#rep-date').value;
          if (target && task) {
            const ok = App.calendar.copyTaskToDay(task, listKey, target, std);
            App.ui.toast(ok
              ? '🔁 已安排 ' + S().shortDateCN(target) + ' 重做（日历页可改）'
              : '目标日期已有同名任务，未重复安排');
          }
          App.ui.closeModal();
          App.tasks.renderAll();
          if (typeof onDone === 'function') onDone();
        }
      });
    }
    let noteText = '';
    reopen();
  }

  /* ============================================================
   * 🧭 逐题拆解：语音/文字引导式步骤，复用小题倒计时与三档积分
   * （独立小工具，跟三种记录模式互不干扰；浏览器没语音则自动降级为手打）
   * ============================================================ */
  let splitLiveTimer = null; // 🧭 拆解弹窗内倒计时实时刷新
  function splitVoiceSupported() {
    return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
  }
  function splitListen(onFinalText, onState, onInterim) {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { if (onState) onState('unsupported'); return null; }
    const rec = new SR();
    rec.lang = 'zh-CN';
    rec.continuous = true;   // 持续识别：说一句话停顿后不自动结束，可连着录一整段
    rec.interimResults = true; // 实时出字，语音一边说一边上屏
    rec.maxAlternatives = 1;
    let final = '';
    rec.onresult = function (e) {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) final = (final ? final + ' ' : '') + r[0].transcript;
        else if (onInterim) onInterim(r[0].transcript); // 未说完的实时预览
      }
    };
    rec.onerror = function (e) { if (onState) onState('error:' + (e && e.error)); };
    rec.onend = function () { if (onFinalText) onFinalText(final); };
    rec.start();
    if (onState) onState('listening');
    return function () { try { rec.stop(); } catch (e) {} };
  }

  function openSplit(taskKey, taskId, subId, groupId) {
    if (S().settings().splitEnabled === false) { App.ui.toast('🧭 逐题拆解没开，去 设置 → 🧭 打开'); return; }
    bringPageForModal();
    // 同一题已在倒计时中（如从计时悬浮窗「🧭 回拆解」进来）→ 不重置计时，直接回到拆解界面
    const sameCd = cdTimer && cdTimer.taskId === taskId && cdTimer.subId === subId;
    if (!sameCd) startCdTimer(taskKey, taskId, subId, groupId); // 复用同一套倒计时 + 三档积分
    if (cdTimer) cdTimer.fromSplit = true; // 标记：这个倒计时来自逐题拆解，悬浮窗就显示「🧭 回拆解」
    const day = S().getDay(S().todayKey());
    const task = day.tasks[taskKey] && day.tasks[taskKey].find(function (t) { return t.id === taskId; });
    const found = findSubInTask(task, subId);
    const sub = found && found.sub;
    if (!sub) return;
    if (!sub.splitlog) sub.splitlog = [];
    if (splitLiveTimer) clearInterval(splitLiveTimer);

    let path = null;                    // 'A' 明确 / 'B' 不明确
    let stopRec = null;                 // 当前录音的停止函数
    const voice = splitVoiceSupported();
    const metaMain = '<p style="font-size:12.5px;color:#8a919c;margin-bottom:6px">正在拆解：<b>' + S().esc(sub.text) + '</b> · ' +
      (sub.minutes > 0 ? ('限时 ' + sub.minutes + ' 分钟 · 完成按三档给分（提前×2 / 按时×1.5 / 超时×1）')
                       : '⏱ 不限时 · 完成按「按时」档给分') + '</p>';

    function logTxt(stepName, t) {
      if (t && t.trim()) { sub.splitlog.push({ step: stepName, text: t.trim(), at: new Date().toISOString() }); S().save(); }
    }
    // 单一委托：所有步骤的按钮都由这里按 id 分发（避免监听叠加）
    function renderStage(bodyHtml, handlers) {
      const body = App.ui.query ? App.ui.query('#split-body') : document.querySelector('#split-body');
      if (body) body.innerHTML = metaMain + bodyHtml;
      window._splitHandlers = handlers;
      renderLive();
    }
    function recOn() {
      if (stopRec) { stopRec(); stopRec = null; return; }
      const ta = (App.ui.query ? App.ui.query('#split-txt') : document.getElementById('split-txt'));
      if (!ta) return;
      let done = ta.value ? ta.value.trim() : '';  // 已确认的文本（含之前手打的）
      let live = '';                               // 实时预览片段
      function paint() {
        const v = live.trim() ? (done && done.trim() ? done.trim() + '\n' : '') + live.trim() : done;
        ta.value = v;
      }
      stopRec = splitListen(function (finalTxt) {
        // 一句话说完 → 固化进 done，继续监听下一句（continuous）
        if (finalTxt && finalTxt.trim()) done = (done && done.trim() ? done.trim() + '\n' : '') + finalTxt.trim();
        live = '';
        paint();
        stopRec = null;
        const b = (App.ui.query ? App.ui.query('#split-rec') : document.getElementById('split-rec'));
        if (b) b.textContent = '🎙 开始录音';
      }, function (st) {
        if (st === 'unsupported' && ta) ta.placeholder = '浏览器不支持语音，改用手打';
      }, function (interim) {
        live = interim || '';
        paint();
      });
    }
    // —— 通用：可录音/输入的步骤 ——
    function stepRecord(stepName, label, desc, nextLabel, nextFn) {
      const recordArea = voice
        ? '<button class="btn btn-small" id="split-rec" style="margin-right:6px">' + (stopRec ? '⏹ 停止录音' : '🎙 开始录音') + '</button>' +
          '<button class="btn btn-small" id="split-clear">🧹 重来/清空</button>' +
          '<textarea id="split-txt" style="width:100%;min-height:60px;margin:8px 0;border:1px solid #e5e8ec;border-radius:8px;padding:8px;font-size:13px;resize:vertical" placeholder="语音会实时转成文字出现在这里，也可直接手打"></textarea>'
        : '<textarea id="split-txt" style="width:100%;min-height:60px;margin:8px 0;border:1px solid #e5e8ec;border-radius:8px;padding:8px;font-size:13px;resize:vertical" placeholder="你的浏览器不支持语音，改用手打（其它浏览器照常能用）"></textarea>';
      renderStage(
        '<h4 style="margin:6px 0 4px">' + label + '</h4><p class="hint">' + desc + '</p>' +
        recordArea +
        '<div><button class="btn btn-primary" id="split-next">' + nextLabel + '</button>' +
        '<button class="btn" id="split-close">结束拆解</button></div>',
        {
          'split-rec': function () { recOn(); (App.ui.query ? App.ui.query('#split-rec') : document.getElementById('split-rec')).textContent = stopRec ? '⏹ 停止录音' : '🎙 开始录音'; },
          'split-clear': function () { if (stopRec) { stopRec(); stopRec = null; } const t = (App.ui.query ? App.ui.query('#split-txt') : document.getElementById('split-txt')); if (t) t.value = ''; },
          'split-next': function () { logTxt(stepName, (App.ui.query ? App.ui.query('#split-txt') : document.getElementById('split-txt')).value); nextFn(); },
          'split-close': closeSplit
        });
    }
    // —— 判定门 ——
    function stepGate() {
      renderStage(
        '<p class="hint">第一步你的思路已经记下来了。现在判断：这道题你搭得出完整框架吗？</p>' +
        '<div><button class="btn btn-primary" id="split-a">✅ 思路明确，自己写步骤</button>' +
        '<button class="btn" id="split-b">❌ 搭不出，先看答案</button>' +
        '<button class="btn" id="split-close">结束拆解</button></div>',
        {
          'split-a': function () { path = 'A'; stepRecord('自己写步骤', '② 自己写步骤', '把式子列出来（数字摆好），具体计算按需。写完点下一步。', '✅ 写好了，对答案', stepCheck); },
          'split-b': function () { path = 'B'; stepRead(); },
          'split-close': closeSplit
        });
    }
    function stepCheck() { stepRecord('对答案', '③ 对答案', '对着答案核对这题。看完点下一步结束整题。', '✅ 对完答案，结束整题', finishA); }
    function stepRead() {
      renderStage(
        '<h4 style="margin:6px 0 4px">② 看答案速览</h4><p class="hint">直接花一分钟看整题答案，读懂它的完整思路。</p>' +
        '<button class="btn btn-primary" id="split-next">✅ 看完答案，录音复述</button><button class="btn" id="split-close">结束拆解</button>',
        { 'split-next': function () { stepRecord('复述', '③ 复述答案', '用自己的话把答案思路复述一遍（可语音/手打），说到你能讲顺为止。', '✅ 复述完了，检验', stepRecall); }, 'split-close': closeSplit });
    }
    function stepRecall() { stepRecord('回忆检验', '④ 回忆串通', '在脑海里过一遍整题思路（可在本子上顺手写点演算），确保自己能讲通。', '✅ 串通了，结束整题', finishB); }
    function logFinal(tipMsg) {
      sub.splitlog.push({ step: '完成', text: tipMsg, at: new Date().toISOString() });
      S().save();
      renderStage(
        '<p style="color:#22a06b;font-weight:700">🎉 整题拆解完成！</p>' +
        '<p class="hint">你每一步的思考/复述已存进这题的「🧭 拆解记录」。现在点计时悬浮窗的「结束」，就会按三档给这题积分。</p>' +
        '<button class="btn btn-primary" id="split-done">好的，去领积分</button>',
        { 'split-done': closeSplit });
    }
    function finishA() { logFinal('已按「思路明确」路径完成整题拆解'); }
    function finishB() { logFinal('已按「看答案复述」路径完成整题拆解'); }
    function renderLive() {
      const el = App.ui.query ? App.ui.query('#split-cd') : document.querySelector('#split-cd');
      if (!el || !cdTimer) return;
      const ms = Math.max(0, cdElapsedMs());
      // ⏱ v102：不限时（minutes = 0）→ 只显示已用，不判超时
      const hasTarget = cdTimer.minutes > 0;
      const over = hasTarget ? (ms - cdTimer.minutes * 60000) : 0;
      let line = '🕑 已用 <b>' + S().fmtClock(ms) + '</b>' +
        (hasTarget ? (' / 目标 <b>' + S().fmtDur(cdTimer.minutes) + '</b>') : ' <span style="color:#8a919c">（不限时）</span>');
      line += !hasTarget ? '' : (over > 0
        ? ' <span style="color:#e2545d">（超时）</span>'
        : ' <span style="color:#8a919c">（还剩 ' + S().fmtClock(Math.max(0, cdTimer.minutes * 60000 - ms)) + '）</span>');
      el.innerHTML = line;
    }
    function closeSplit() {
      if (stopRec) { try { stopRec(); } catch (e) {} stopRec = null; }
      if (splitLiveTimer) { clearInterval(splitLiveTimer); splitLiveTimer = null; }
      App.ui.closeModal();
      App.tasks.renderAll();
    }

    App.ui.openModal('🧭 逐题拆解',
      '<div id="split-stage">' +
        '<p id="split-cd" style="font-size:13px;font-weight:700;color:#2d3a4a;margin-bottom:6px"></p>' +
        '<div id="split-body"></div>' +
        '</div>',
      '<button class="btn" data-act="close">关闭</button>', { wide: true });
    const box = App.ui.query ? App.ui.query('#split-stage') : document.querySelector('#split-stage');
    if (!box) return;
    box.addEventListener('click', function (e) {
      const t = e.target && e.target.closest && e.target.closest('[id]');
      const id = t && t.id;
      if (!id) return;
      const h = window._splitHandlers || {};
      if (h[id]) h[id]();
      else if (id === 'split-close') closeSplit();
    });
    App.ui.bindActions({ close: closeSplit });
    renderStageStep1();
    function renderStageStep1() {
      stepRecord('出声思考', '① 出声思考思路', '只看题目，一边想一边说你大概的思路，不用写不用算。说错/不满意可以重来。', '✅ 思路记下了', stepGate);
    }
    splitLiveTimer = setInterval(function () { renderLive(); }, 1000);
  }

  /* ---------- 打勾 / 取消打勾（含积分记账与奖励触发） ---------- */
  function toggleTask(listKey, taskId) {
    const dayKey = S().todayKey();
    const day = S().getDay(dayKey);
    const task = day.tasks[listKey].find(function (t) { return t.id === taskId; });
    if (!task) return;
    if (timer && timer.taskId === taskId) {
      App.ui.toast('这个任务正在计时中，先结束计时再打勾');
      return;
    }
    task.done = !task.done;
    const settings = S().settings();

    if (task.done) {
      // ★ v66：勾了「当天没做完、已移到明天」的原任务 → 等于说其实做完了，把明天那条副本撤回来
      if (listKey === 'extra' && task.movedOut && task.carried !== true) {
        const nk = nextDayKeyOf(dayKey);
        const nd = (S().peekDay ? S().peekDay(nk) : S().data().days[nk]);
        if (nd && nd.tasks && nd.tasks.extra) {
          const txt0 = String(task.text || '').trim();
          const before0 = nd.tasks.extra.length;
          nd.tasks.extra = nd.tasks.extra.filter(function (x) {
            return !(x.carried && x.done !== true && String(x.text || '').trim() === txt0);
          });
          if (nd.tasks.extra.length !== before0) {
            task.movedOut = false;
            task.carriedFailed = false;
            S().save();
            App.ui.toast('明天那条同名的已撤掉（今天做完了）', 3600);
          }
        }
      }
      // 完成 → 赚积分（仅理想/拓展，每条任务单独定价）
      if (listKey === 'ideal' || listKey === 'extra') {
        const p = taskPoints(task, listKey) || 0;
        if (p > 0) {
          S().addLedger(dayKey, listKey === 'ideal' ? 'earn-ideal' : 'earn-extra', { points: p, note: (listKey === 'ideal' ? '理想任务：' : '拓展任务：') + task.text, taskId: taskId });
          App.ui.floatAt(document.getElementById('stat-points'), '+' + p + '分');
        }
      }
      // 🌱 v70：新知识任务 → 按遗忘曲线排当天复习（真正的弹窗等总结窗关掉后再来）
      if (srOn() && task.mode === SR_MODE_NEW && !task.sp) {
        srAfterTaskDone(task, listKey, dayKey);
      } else if (srOn() && !task.sp) {
        // 🌱 v93：没标「新知识」的任务不排复习时，**明确说一句**，别让用户以为是漏了
        const mm = task.mode === 'review' ? '🔄 复习（只作标记）' : '⚪ 普通（不排复习）';
        App.ui.toast('🌱 这条标的是「' + mm + '」，所以今天不排复习 —— 想排就点它的属性改成 📘 新知识', 4800);
      }
      // 📋 v82：这是队列实体化的副本 → 完成队列项、发队列分（下一条顶上等总结窗关掉）
      if (task.fromQueue && App.queue && App.queue.onTaskDone) {
        try { App.queue.onTaskDone(task); } catch (e) { /* 忽略 */ }
      }
      // 📌 v96：这是「今天的基础任务」的副本 → 那条也一起勾上
      if (task.fromDaily && App.queue && App.queue.onDailyDone) {
        try { App.queue.onDailyDone(task); } catch (e) { /* 忽略 */ }
      }
    } else {
      // 取消完成 → 撤销对应积分
      const type = listKey === 'ideal' ? 'earn-ideal' : listKey === 'extra' ? 'earn-extra' : null;
      if (type) {
        const ledger = S().ledger();
        for (let i = ledger.length - 1; i >= 0; i--) {
          if (ledger[i].type === type && ledger[i].taskId === taskId) {
            S().undoLastLedger(ledger[i].id);
            break;
          }
        }
      }
    }
    S().save();
    App.tasks.renderAll();

    // 勾选完成：先填任务总结，确认后再触发奖励检查
    if (task.done) {
      summaryTaskModal(listKey, taskId, task.text, function () {
        const allDone = function (k) { return day.tasks[k].length > 0 && day.tasks[k].every(function (t) { return t.done; }); };
        if (allDone('required') && !day.rewards.some(function (r) { return r.kind === 'base'; })) {
          baseRewardModal();
        } else if (['required', 'ideal', 'extra'].every(allDone) && !day.rewards.some(function (r) { return r.kind === 'perfect'; })) {
          perfectRewardModal();
        }
        // 🌱 总结窗关掉之后再弹「排不满 / 设知识点」，免得两个弹窗打架
        // 📋 v82：队列的「下一条顶上 + 这条以后怎么处理」也排在总结窗之后（和 sr 串行，不抢弹窗）
        setTimeout(function () {
          srRunPending();
          if (App.queue && App.queue.runPending) App.queue.runPending();
        }, 300);
      });
    }
  }

  /* ---------- 保底奖励弹窗（必须任务全部完成；只奖积分，数量自选） ---------- */
  function baseRewardModal() {
    const dayKey = S().todayKey();
    const day = S().getDay(dayKey);
    const settings = S().settings();
    let granted = null; // {ledgerId, points}

    const body = function () {
      return '' +
        '<p style="font-size:14px">必须完成的任务全部完成！</p>' +
        '<div class="field"><label>当前积分累计</label><p style="font-weight:700;color:#22a06b">' + S().pointsTotal() + ' 分</p></div>' +
        (granted
          ? '<div class="field"><label>已领取奖励</label><p>⭐ 积分 +' + granted.points + '分</p></div>'
          : '<div class="field"><label>本次奖励积分（可自定义）</label>' +
            '<input type="number" id="rw-pts" min="0" value="' + settings.baseRewardPoints + '" style="width:100%;padding:8px" />' +
            '<div class="btn-row" style="margin-top:8px">' +
            '<button class="btn btn-primary" data-act="rw-grant">🎁 确认领取</button>' +
            '</div></div>') +
        '<div class="field"><label>接下来你想</label>' +
        '<div class="btn-row">' +
        '<button class="btn btn-primary" data-act="next-ideal"' + (granted ? '' : ' disabled') + '>继续完成理想任务</button>' +
        '<button class="btn btn-primary" data-act="next-extra"' + (granted ? '' : ' disabled') + '>进入长期拓展任务</button>' +
        '<button class="btn" data-act="next-end"' + (granted ? '' : ' disabled') + '>直接结束今天</button>' +
        '</div></div>';
    };

    function reopen() {
      const m = App.ui.openModal('🎉 保底完成！', body(), '', { rechoose: true, lock: false });
      App.ui.bindActions({
        'rw-grant': function () {
          const pv = Math.max(0, +m.querySelector('#rw-pts').value || 0);
          if (pv <= 0) { App.ui.toast('填一个大于 0 的积分奖励'); return; }
          if (granted) { App.store.undoLastLedger(granted.ledgerId); }
          const idx = day.rewards.findIndex(function (r) { return r.kind === 'base'; });
          if (idx >= 0) day.rewards.splice(idx, 1);
          const lId = S().uid();
          S().data().ledger.push({ id: lId, date: dayKey, type: 'reward-base', points: pv, note: '保底奖励：积分+' + pv + '分', at: new Date().toISOString() });
          day.rewards.push({ kind: 'base', points: pv, at: new Date().toISOString() });
          S().save();
          granted = { ledgerId: lId, points: pv };
          App.ui.closeModal(); reopen();
          App.app.refreshStats();
        },
        'next-ideal': function () { App.ui.closeModal(); },
        'next-extra': function () { App.ui.closeModal(); },
        'next-end': function () { App.ui.closeModal(); App.tasks.endDay(); },
        rechoose: function () {
          if (granted) {
            App.store.undoLastLedger(granted.ledgerId);
            const idx = day.rewards.findIndex(function (r) { return r.kind === 'base'; });
            if (idx >= 0) day.rewards.splice(idx, 1);
            S().save();
            granted = null;
            App.app.refreshStats();
          }
          App.ui.closeModal(); reopen();
        }
      });
    }
    reopen();
  }

  /* ---------- 完美奖励弹窗（三类全部完成；只奖积分） ---------- */
  function perfectRewardModal() {
    const dayKey = S().todayKey();
    const day = S().getDay(dayKey);
    const settings = S().settings();
    let granted = null;

    const body = function () {
      return '' +
        '<p style="font-size:14px">必须 + 理想 + 拓展全部完成，完美的一天！</p>' +
        (granted
          ? '<div class="field"><label>已领取额外奖励</label><p>⭐ 积分 +' + granted.points + '分</p></div>'
          : '<div class="field"><label>额外奖励积分（可自定义）</label>' +
            '<input type="number" id="pf-pts" min="0" value="' + settings.perfectRewardPoints + '" style="width:100%;padding:8px" />' +
            '<div class="btn-row" style="margin-top:8px">' +
            '<button class="btn btn-primary" data-act="pf-grant">🎁 确认领取</button>' +
            '</div></div>');
    };

    function reopen() {
      const m = App.ui.openModal('🏆 完美！今日全部任务完成！', body(), '', { rechoose: true });
      App.ui.bindActions({
        'pf-grant': function () {
          const pv = Math.max(0, +m.querySelector('#pf-pts').value || 0);
          if (pv <= 0) { App.ui.toast('填一个大于 0 的积分奖励'); return; }
          if (granted) { App.store.undoLastLedger(granted.ledgerId); }
          const idx = day.rewards.findIndex(function (r) { return r.kind === 'perfect'; });
          if (idx >= 0) day.rewards.splice(idx, 1);
          const lId = S().uid();
          S().data().ledger.push({ id: lId, date: dayKey, type: 'reward-perfect', points: pv, note: '100%额外奖励：积分+' + pv + '分', at: new Date().toISOString() });
          day.rewards.push({ kind: 'perfect', points: pv, at: new Date().toISOString() });
          S().save();
          granted = { ledgerId: lId, points: pv };
          App.ui.closeModal(); reopen();
          App.app.refreshStats();
        },
        rechoose: function () {
          if (granted) {
            App.store.undoLastLedger(granted.ledgerId);
            const idx = day.rewards.findIndex(function (r) { return r.kind === 'perfect'; });
            if (idx >= 0) day.rewards.splice(idx, 1);
            S().save();
            granted = null;
            App.app.refreshStats();
          }
          App.ui.closeModal(); reopen();
        }
      });
    }
    reopen();
  }

  /* ---------- 🌱 拓展欠账清算：挂账的任务，下次结算时给最后一次补勾机会 ---------- */
  /** 🌱 拓展欠账"到期没补完"的扣分倍数（0 = 只记账不扣分）；可在设置里改 */
  function extDebtRate() {
    const r = S().settings().extDebtRate;
    return r == null ? 1 : Math.max(0, +r || 0);
  }
  function pendingExtDebts() {
    const out = [];
    const days = S().data().days;
    Object.keys(days).forEach(function (k) {
      const d = days[k];
      if (d.extDebt && !d.extDebt.settled) {
        (d.extDebt.items || []).forEach(function (it) { out.push({ dayKey: k, debt: d.extDebt, it: it }); });
      }
    });
    return out;
  }

  function settleExtDebts(done) {
    const items = pendingExtDebts();
    if (!items.length) { done(); return; }
    const rate = extDebtRate();
    const rows = items.map(function (x, i) {
      const cut = Math.round(x.it.points * rate);
      return '<label style="display:flex;gap:8px;align-items:center;padding:4px 0;font-size:13.5px;color:#374151">' +
        '<input type="checkbox" data-debt="' + i + '" /> <span>[' + S().shortDateCN(x.dayKey) + '] ' +
        S().esc(x.it.text) + ' <b style="color:#e2545d">(没补完扣 ' + cut + ' 分 · 补完了得 +' + x.it.points + ' 分)</b></span></label>';
    }).join('');
    const modal = App.ui.openModal('🌱 拓展欠账清算（宽限到期）',
      '<p style="font-size:13px">之前挂账的长期拓展到了最后期限：<b>确实做完的勾上（划掉，还照样发 +积分）</b>，没勾的现在真扣：</p>' +
      (rate !== 1 ? '<p class="hint">当前扣分倍数：<b>' + rate + ' 倍</b>（可在设置页「积分规则」里改）</p>' : '') +
      '<div style="max-height:220px;overflow-y:auto;border:1px solid #e5e8ec;border-radius:8px;padding:6px 10px">' + rows + '</div>',
      '<button class="btn btn-primary" data-act="ok">确认清算</button>');
    App.ui.bindActions({
      ok: function () {
        const ticked = {};
        modal.querySelectorAll('[data-debt]:checked').forEach(function (c) { ticked[c.dataset.debt] = true; });
        const perDay = {};
        let earnN = 0;
        items.forEach(function (x, i) {
          const day = S().getDay(x.dayKey);
          if (ticked[i]) {
            const t = (day.tasks[x.it.col] || []).find(function (t2) { return t2.id === x.it.id; });
            if (t && !t.done) {
              t.done = true;
              t.summary = { done: true, text: '（宽限期内补完）', at: new Date().toISOString() };
              // v63：补完 = 真做完了，照样发这条拓展任务的积分（"后一天补完也有积分"）
              if (x.it.points > 0) {
                App.store.addLedger(x.dayKey, 'earn-extra', {
                  points: x.it.points,
                  note: '🌱 长期拓展补完（宽限期内）：' + x.it.text + ' · +' + x.it.points + ' 分',
                  taskId: x.it.id
                });
                earnN += x.it.points;
              }
            }
          } else if (x.it.points > 0) {
            perDay[x.dayKey] = (perDay[x.dayKey] || 0) + Math.round(x.it.points * rate);
          }
          x.debt.settled = true;
        });
        Object.keys(perDay).forEach(function (k) {
          if (perDay[k] > 0) App.store.addLedger(k, 'ext-penalty', { points: -perDay[k], note: '🌱 拓展欠账清算：宽限期内没补完，扣 ' + perDay[k] + ' 分（' + rate + ' 倍）' });
        });
        S().save();
        App.ui.closeModal();
        if (earnN > 0) App.ui.floatAt(document.getElementById('stat-points'), '+' + earnN + '分');
        if (items.length) App.ui.toast('🌱 拓展欠账已清算' + (earnN > 0 ? ' · 补完的拿回 +' + earnN + ' 分' : ''));
        done();
      }
    });
  }

  /* ---------- 结束今天 ---------- */
  function endDay() {
    // 若正在休息/杂事/娱乐，先提醒收回来
    if (typeof App.link !== 'undefined' && App.link.isPausing && App.link.isPausing()) {
      App.link.endDayGuard();
      return;
    }
    // 🌱 先清算之前的拓展欠账（宽限到期：补勾=不扣，没补勾=真扣），清完再继续结算
    settleExtDebts(function () {
      endDayStep2();
    });
  }

  /** ⚠️ 结算某一天时，任务要顺延到"那一天的第二天"，不是"真实明天"。
      反例（v65 修）：早上结算昨天时用 tomorrowKey() 会直接跳过今天 ——
      没做完的任务被搬到后天，用户在今天的任务栏里根本看不到它。 */
  function nextDayKeyOf(k) {
    const d = S().keyToDate(k);
    d.setDate(d.getDate() + 1);
    return S().dateKey(d);
  }

  function isEmptyDay(d) {
    if (!d) return true;
    const noTasks = !['required', 'ideal', 'extra'].some(function (k) {
      return (d.tasks[k] || []).some(function (t) { return t.text; });
    });
    return noTasks && !(d.sessions || []).length && !(d.timeline || []).length;
  }

  /** 智能结算目标：正常=今天；今天已结束/今天还是空的 → 往前找最近一个没结算的日子（最多回看7天） */
  function pickSettleKey() {
    const today = S().todayKey();
    const tDay = S().data().days[today];
    if (tDay && !tDay.ended && !isEmptyDay(tDay)) return today;
    for (let i = 1; i <= 7; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const k = S().dateKey(d);
      const pd = S().data().days[k];
      if (pd && !pd.ended && !isEmptyDay(pd)) return k;
    }
    return today;
  }

  /* ============================================================
   * 🧮 结算核心（v66）：手动「结束今天」和到点自动结算**共用这一套**
   *   —— 以前结算逻辑写在弹窗的 ok 回调里，自动结算没法复用（会分叉成两套规则）
   *   参数：settleDayCore(day, dayKey, {review, doneFix:[{col,id}], rollIds:[], rollAll:true})
   *   返回：{fixEarn, moved, cut, rolled}
   * ============================================================ */
  function settleDayCore(day, dayKey, o) {
    o = o || {};
    const settings = S().settings();
    const extPointsOf = function (t) { return t.points != null ? t.points : (settings.extPoints || 0); };
    // 📋 v82：队列副本不参与结算 —— 未完成的静默收回队列（不进补记弹窗、不扣分、不顺延），
    //    队列项天然「还在队列里」，之后哪天做都行；正在做的那条明天会重新实体化回来
    try {
      if (App.queue && App.queue.settleSweep) App.queue.settleSweep(day);
    } catch (e) { /* 忽略 */ }
    const undoneAll = [];
    ['required', 'ideal', 'extra'].forEach(function (k) {
      // 🧲 v105：副本（队列当前条 / 今天的基础任务）不算「今天没做完的任务」
      (day.tasks[k] || []).filter(function (t) { return !t.done && !t.fromQueue && !t.fromDaily; })
        .forEach(function (t) { undoneAll.push({ k: k, task: t }); });
    });
    const undone = settings.extStrict ? undoneAll.filter(function (u) { return u.k !== 'extra'; }) : undoneAll.slice();
    const extItems = settings.extStrict ? undoneAll.filter(function (u) { return u.k === 'extra'; }) : [];
    const out = { fixEarn: 0, moved: 0, cut: 0, rolled: 0 };

    // 🌱 v70：没做完的间隔复习轮次标成「未做」—— 只作记录，**不扣分**
    //    （第一天的多轮复习是红利、不是义务；拖到第二天问题也不大）
    ['required', 'ideal', 'extra'].forEach(function (k) {
      (day.tasks[k] || []).forEach(function (t) {
        // 🌱 v115：只把**已经到点**的没做轮次记成「未做」；排在后面的跨天轮次保持"待做"，
        //   不然第二天结算一过它就没了（复习计划本来就是跨天的）
        srPlan(t).forEach(function (r) { if (r.done === null && r.due <= Date.now()) r.done = false; });
      });
    });

    // ① 复盘
    if (o.review && String(o.review).trim()) day.review = { text: String(o.review).trim(), at: new Date().toISOString() };

    // ② ☑ 补记：勾了"实际做完了"的 → 划掉 + 理想/拓展照发积分
    (o.doneFix || []).forEach(function (f) {
      const t = (day.tasks[f.col] || []).find(function (x) { return x.id === f.id; });
      if (!t || t.done) return;
      t.done = true;
      t.summary = { done: true, text: '（结算时补记完成）', at: new Date().toISOString() };
      if (f.col === 'ideal' || f.col === 'extra') {
        const p = taskPoints(t, f.col) || 0;
        if (p > 0) {
          App.store.addLedger(dayKey, f.col === 'ideal' ? 'earn-ideal' : 'earn-extra', {
            points: p,
            note: (f.col === 'ideal' ? '\u2B50 理想任务补记完成：' : '\u{1F331} 长期拓展补记完成：') + t.text + ' \u00b7 +' + p + ' 分',
            taskId: t.id
          });
          out.fixEarn += p;
        }
      }
    });
    if (out.fixEarn > 0) App.ui.floatAt(document.getElementById('stat-points'), '+' + out.fixEarn + '分');

    // ③ 🌱 长期拓展：没做完的**复制**到第二天拓展栏（原任务留在当天、标 movedOut）
    //    搬来的第二天还做不完 → 当场扣分，且不再往后搬
    if (settings.extStrict && extItems.length > 0) {
      const rate = extDebtRate();
      const tmKey = nextDayKeyOf(dayKey);
      const tmDay = S().getDay(tmKey);
      const toCarry = [];
      extItems.forEach(function (u) {
        if (u.task.done) return;                      // 上面补记勾上的不算
        if (u.task.carried) {                         // 昨天搬来的，今天还是没做完 → 扣
          if (!u.task.carriedFailed) {
            u.task.carriedFailed = true;
            out.cut += Math.round(extPointsOf(u.task) * rate);
          }
          u.task.movedOut = true;                     // 它也不再往后搬了
        } else {
          toCarry.push(u);
        }
      });
      if (out.cut > 0) {
        App.store.addLedger(dayKey, 'ext-penalty', {
          points: -out.cut,
          note: '\u{1F331} 长期拓展拖过宽限期还没做完，扣 ' + out.cut + ' 分' + (rate !== 1 ? '（' + rate + ' 倍）' : '')
        });
        App.ui.floatAt(document.getElementById('stat-points'), '-' + out.cut + '分', 'neg');
      }
      toCarry.forEach(function (u) {
        const txt = String(u.task.text || '').trim();
        if (!txt) return;
        const dup = tmDay.tasks.extra.some(function (x) { return String(x.text || '').trim() === txt; });
        if (dup) { u.task.movedOut = true; return; }   // 明天已有同名，不重复搬，但照样标"已移过去"
        const nt = { id: S().uid(), text: u.task.text, carried: true };   // \u21A9 副本：从昨天移过来的
        if (u.task.points != null) nt.points = u.task.points;             // 保留单独定价
        tmDay.tasks.extra.push(nt);
        u.task.movedOut = true;        // ★ 原任务留在当天，只打一个"已移到明天"的标记
        out.moved++;
      });
    }

    // ④ 其余任务顺延（手动＝按勾选；auto＝o.rollAll 全搬）
    if (settings.rollover && undone.length > 0) {
      const ids = o.rollAll ? undone.map(function (u) { return u.task.id; }) : (o.rollIds || []);
      ids.forEach(function (id) {
        const u = undone.find(function (x) { return x.task.id === id; });
        if (!u) return;
        // ↩ v74：带上 rolled 标记 —— 以前只有 {id,text}，搬过来的任务和今天定的长得一模一样，
        //    用户完全分不清哪些是今天该做的、哪些是昨天剩的（这是他「事情越堆越多」的来源之一）
        const t = { id: S().uid(), text: u.task.text, rolled: true };
        if (u.task.points != null) t.points = u.task.points;
        S().getDay(nextDayKeyOf(dayKey)).tasks[u.k].push(t);
        out.rolled++;
      });
    }

    // ⑤ 🔥 学习休息中的消耗
    const cutN = day.focusCut || 0;
    if (cutN > 0) {
      App.store.addLedger(dayKey, 'focus-cut', { points: -cutN * FOCUS_CUT_PER, note: '学习休息时消耗 ' + cutN + ' 次，扣 ' + (cutN * FOCUS_CUT_PER) + ' 分' });
    }

    day.ended = true;
    S().save();
    // 💾 v113：一天结束（手动结算 / 到点自动结算都走这里）→ 立刻存一份当天的备份
    try { if (App.backup && App.backup.snap) App.backup.snap('daily', dayKey); } catch (e) { /* 忽略 */ }
    return out;
  }

  /* ============================================================
   * ⏰ 到点自动结算（v66）
   *   用户：不想每天手动点「结束今天」，到点自己结掉，省的忘
   * ============================================================ */
  let autoEndBusy = false;
  let autoEndPendingToasted = false;

  /** 现在该结算哪一天？（结算点设在凌晨时，比如 01:30 → 它算"前一天的收工点"） */
  function autoSettleKey() {
    const st = S().settings();
    if (!st.autoEndDay) return null;
    const at = S().minOfDay(st.autoEndDayAt || '23:59');
    const now = new Date();
    const nowMin = now.getHours() * 60 + now.getMinutes();

    // ① v68：先补结算「以前遗留、忘了结算」的日子（回看最多 7 天，从最早那天开始）
    //    ⚠️ 旧版只看「今天到点没」—— 所以昨天忘了点「结束今天」的话，
    //       昨天就永远卡着不结，那天没做完的拓展也就永远不会搬到今天来。
    //       （用户 2026-09-16 报的「昨天没做完的拓展没来今天」就是这个）
    for (let back = 7; back >= 1; back--) {
      const dd = new Date();
      dd.setDate(dd.getDate() - back);
      const kk = S().dateKey(dd);
      const pd = (S().peekDay ? S().peekDay(kk) : S().data().days[kk]);
      if (!pd || pd.ended || isEmptyDay(pd)) continue;
      return kk;
    }

    // ② 没有遗留的，再看「今天这一场」到点了没
    const d = new Date();
    if (at < 6 * 60) {          // 结算点在凌晨（0:00-5:59）：它属于"前一天"
      if (nowMin < at && nowMin < 6 * 60) return null;   // 还没到点
      d.setDate(d.getDate() - 1);                        // 凌晨过点 or 白天补判 → 结昨天
    } else {
      if (nowMin < at) return null;                      // 还没到今天的结算点
    }
    return S().dateKey(d);
  }

  function autoEndDayTick() {
    const st = S().settings();
    if (!st.autoEndDay || autoEndBusy) return false;
    if (!autoSettleKey()) return false;            // 没账可结
    if (timer || cdTimer) {                        // 还有任务在计时 → 不打断，等停下来再结
      if (!autoEndPendingToasted) {
        autoEndPendingToasted = true;
        App.ui.toast('⏰ 到结算点了，但还有任务正在计时 —— 停下来就自动结算', 4500);
      }
      return false;
    }
    autoEndBusy = true;
    const doneKeys = [];
    let moved = 0, cut = 0, rolled = 0;
    try {
      // v68：一次把「遗留的 + 今天到点的」都补完 ——
      // 每结完一天它就被标 ended，autoSettleKey() 下次自然返回下一个，循环天然收敛。
      for (let guard = 0; guard < 8; guard++) {
        const key = autoSettleKey();
        if (!key) break;
        const day = (S().peekDay ? S().peekDay(key) : S().data().days[key]);
        if (!day || day.ended || isEmptyDay(day)) break;
        const r = settleDayCore(day, key, { rollAll: true });
        doneKeys.push(key);
        moved += r.moved || 0;
        cut += r.cut || 0;
        rolled += r.rolled || 0;
      }
    } catch (e) {
      autoEndBusy = false;
      App.ui.toast('自动结算出错：' + (e && e.message ? e.message : e));
      return false;
    }
    autoEndBusy = false;
    if (!doneKeys.length) return false;
    autoEndPendingToasted = false;
    const lastKey = doneKeys[doneKeys.length - 1];
    const nk = nextDayKeyOf(lastKey);
    const span = doneKeys.length > 1
      ? S().shortDateCN(doneKeys[0]) + '–' + S().shortDateCN(lastKey)
      : S().shortDateCN(lastKey);
    App.ui.toast('⏰ ' + span + ' 已自动结算' +
      (doneKeys.length > 1 ? '（补结 ' + doneKeys.length + ' 天）' : '') +
      (moved ? ' · 拓展 ' + moved + ' 条已移到 ' + S().shortDateCN(nk) : '') +
      (cut ? ' · 扣 ' + cut + ' 分' : '') +
      (rolled ? ' · ' + rolled + ' 条顺延' : ''), 5600);
    try {
      if (st.notifyOnEnd) notifyNow('⏰ ' + span + ' 已自动结算',
        '收工' + (cut ? '，扣 ' + cut + ' 分' : '') + (moved ? '，' + moved + ' 条拓展移到明天' : ''));
    } catch (e) { /* 通知失败不影响结算 */ }
    renderAll();
    return true;
  }

  function endDayStep2() {
    const dayKey = pickSettleKey();
    const day = S().getDay(dayKey);
    const settings = S().settings();

    if (timer) { // 有计时进行：先提示
      App.ui.confirm('还有任务正在计时中，确定要结束今天吗？（计时将丢弃）', '结束今天', function () {
        timer = null; stopTick(); hideTimerBar();
        doEndDay();
      });
      return;
    }
    doEndDay();

    function doEndDay() {
      if (day.ended) {
        App.ui.toast('今天已经结束过了');
        return;
      }
      const reqD = day.tasks.required;
      const sessions = day.sessions;
      const focusMin = sessions.reduce(function (s, x) { return s + (x.actualMinutes || 0); }, 0);
      const restMin = Math.round(sessions.reduce(function (s, x) { return s + (x.pausedMs || 0); }, 0) / 60000);

      const undoneAll = [];
      ['required', 'ideal', 'extra'].forEach(function (k) {
        // 🧲 v105：副本不算「今天没做完的任务」
        day.tasks[k].filter(function (t) { return !t.done && !t.fromQueue && !t.fromDaily; })
          .forEach(function (t) { undoneAll.push({ k: k, task: t }); });
      });
      // 🌱 严格模式：拓展不顺延（不进顺延名单），改挂账宽限
      const undone = settings.extStrict ? undoneAll.filter(function (u) { return u.k !== 'extra'; }) : undoneAll.slice();
      const extItems = settings.extStrict ? undoneAll.filter(function (u) { return u.k === 'extra'; }) : [];
      const extPointsOf = function (t) { return t.points != null ? t.points : (settings.extPoints || 0); };
      const extDebtSum = extItems.reduce(function (s, u) { return s + extPointsOf(u.task); }, 0);

      let body = '' +
        '<div class="field"><label>今日完成</label><p>' +
        '必须 ' + day.tasks.required.filter(function (t) { return t.done; }).length + '/' + day.tasks.required.length +
        ' · 理想 ' + day.tasks.ideal.filter(function (t) { return t.done; }).length + '/' + day.tasks.ideal.length +
        ' · 拓展 ' + day.tasks.extra.filter(function (t) { return t.done; }).length + '/' + day.tasks.extra.length +
        '</p></div>' +
        '<div class="field"><label>今日专注</label><p>' + S().fmtDur(focusMin) + (restMin > 0 ? '（期间休息 ' + S().fmtDur(restMin) + '）' : '') + '</p></div>';

      const extRate = extDebtRate();
      // 🌱 v65：拓展分成两种情形，分别讲清楚（今天新没做完的 = 搬；昨天搬来的 = 扣）
      const extCarried = extItems.filter(function (u) { return u.task.carried && !u.task.done; });
      const extFresh = extItems.filter(function (u) { return !u.task.carried && !u.task.done; });
      if (settings.extStrict && extItems.length > 0) {
        const extCutSum = extCarried.reduce(function (a, u) { return a + Math.round(extPointsOf(u.task) * extRate); }, 0);
        body += '<div class="field"><label>🌱 长期拓展</label>' +
          (extFresh.length
            ? '<p>' + extFresh.length + ' 条没做完 → <b>会自动搬到明天的拓展栏</b>（明天照样能打勾、能开计时），明天做完就不扣分。</p>'
            : '') +
          (extCarried.length
            ? '<p style="color:#e2545d;font-weight:700">↩ ' + extCarried.length + ' 条是<b>昨天搬过来的</b>，今天还是没做完 → 现在扣 ' + extCutSum +
              ' 分，并且不再往后搬了。</p>'
            : '') +
          '<p class="hint">上面「☑ 补记」里勾上的会直接划掉、<b>积分照发</b>，不算没做完。' +
          '扣分倍数：<b>' + extRate + ' 倍</b>（设置里可改，0 = 只记账不扣分）。</p></div>';
      }

      if (undoneAll.length > 0) {
        body += '<div class="field"><label>☑ 补记：下面没勾完的任务里，有实际已经做完的？（勾上就划掉，拓展的能免扣）</label>' +
          '<div style="max-height:180px;overflow-y:auto;border:1px solid #e5e8ec;border-radius:8px;padding:6px 10px">' +
          undoneAll.map(function (u) {
            return '<label style="display:flex;gap:8px;align-items:center;padding:4px 0;font-size:13.5px;color:#374151">' +
              '<input type="checkbox" data-donefix="' + u.task.id + '" data-col="' + u.k + '" /> <span>[' + COL_NAMES[u.k] + '] ' + S().esc(u.task.text) + '</span></label>';
          }).join('') + '</div></div>';
      } else if (undoneAll.length === 0) {
        body += '<p style="color:#22a06b;font-weight:600">🎉 今天任务全部完成，提前收工吧！</p>';
      }

      if (settings.rollover && undone.length > 0) {
        body += '<div class="field"><label>未完成任务，勾选顺延到明天（无惩罚）</label>' +
          '<div style="max-height:180px;overflow-y:auto;border:1px solid #e5e8ec;border-radius:8px;padding:6px 10px">' +
          undone.map(function (u) {
            return '<label style="display:flex;gap:8px;align-items:center;padding:4px 0;font-size:13.5px;color:#374151">' +
              '<input type="checkbox" data-roll="' + u.task.id + '" checked /> <span>[' + COL_NAMES[u.k] + '] ' + S().esc(u.task.text) + '</span></label>';
          }).join('') + '</div></div>';
      }

      // 结束时的复盘（可选，写给自己；边打边自动保存）
      body += '<div class="field"><label>📝 今日复盘（可选，边打边自动保存）</label>' +
        '<textarea id="end-review" style="width:100%;min-height:64px;border:1px solid #e5e8ec;border-radius:8px;padding:8px 10px;font-size:13.5px;resize:vertical">' +
        S().esc((day.review && day.review.text) || '') + '</textarea></div>';

      const modal = App.ui.openModal(dayKey === S().todayKey() ? '🏁 结束今天' : '🏁 结算 ' + S().shortDateCN(dayKey) + '（昨天还没结算，先结昨天）', body,
        '<button class="btn btn-primary" data-act="ok">确认结束</button><button class="btn" data-act="cancel">取消</button>');
      autoSave(modal.querySelector('#end-review'), function (v) {
        if (v.trim()) { day.review = { text: v, at: new Date().toISOString() }; }
      });
      App.ui.bindActions({
        ok: function () {
          const revTa = modal.querySelector('#end-review');
          const rollIds = [];
          modal.querySelectorAll('[data-roll]:checked').forEach(function (c) { rollIds.push(c.dataset.roll); });
          const doneFix = [];
          modal.querySelectorAll('[data-donefix]:checked').forEach(function (c) { doneFix.push({ col: c.dataset.col, id: c.dataset.donefix }); });
          // ★ v66：实际结算交给 settleDayCore（和「到点自动结算」同一套逻辑）
          const r = settleDayCore(day, dayKey, { review: revTa ? revTa.value : '', rollIds: rollIds, doneFix: doneFix });
          App.ui.closeModal();
          App.ui.toast('今天已结束，数据已保存。去明天填任务吧！' +
            (r.moved ? ' \u00b7 拓展 ' + r.moved + ' 条已移到明天' : ''), 4200);
          App.tasks.renderAll();
        },
        cancel: App.ui.closeModal
      });
    }
  }

  /* ---------- 🔥 连续学习 & 小休（学习时可休息，休息单独算，回来问消耗） ---------- */
  // 现在算不算"真在学"：任务计时/小题倒计时在跑，或小时代段内（没开任何计时器、段在进行）
  function isLearningNow() {
    if (smallRest) return false;
    const day = S().getDay(S().todayKey());
    if (day.activeRest) return false; // 小时代休息中：不算学习
    if (timer && !timer.paused) return true;
    if (cdTimer && !cdTimer.paused && !cdTimer.microRest) return true;
    if (!timer && !cdTimer) {
      if (day.activeHourPlan) return true; // 只开小时代没开任务计时，也算在学
    }
    return false;
  }
  function streakLiveMs() { return streak.accMs; }
  function streakSave() {
    try { localStorage.setItem('focusPlan.streak', JSON.stringify({ d: S().todayKey(), ms: streak.accMs })); } catch (e) { /* 存储不可用就算了 */ }
  }
  function streakReset() {
    streak.accMs = 0;
    streakSave();
    renderStreakBar();
  }
  function streakRestore() {
    try {
      const v = JSON.parse(localStorage.getItem('focusPlan.streak') || 'null');
      streak.accMs = (v && v.d === S().todayKey() && v.ms > 0 && v.ms < 86400000 * 2) ? v.ms : 0; // 超过2天视为残留，清零
    } catch (e) { streak.accMs = 0; }
  }
  // 常驻每秒调用：真在学就累计并刷新顶栏（在 hourPlanAutoTick 里驱动，任何视图都生效）
  function streakTick() {
    if (!isLearningNow()) return;
    streak.accMs += 1000;
    if (++streakSaveCnt % 5 === 0) streakSave(); // 每5秒存一次，刷新不丢
    renderStreakBar();
  }
  function renderStreakBar() {
    const bar = document.getElementById('streak-bar');
    if (!bar) return;
    if (smallRest) {
      const leftSec = Math.max(0, Math.ceil((smallRest.startAt + smallRest.durMs - Date.now()) / 1000));
      bar.innerHTML = '<div class="card streak-card resting">☕ <b>小休中</b> · 剩余 ' +
        S().fmtClock(leftSec * 1000).replace(/^00:/, '') + ' · 休息不占学习 <button class="btn btn-small" id="sr-end" style="margin-left:6px">🔚 结束小休</button></div>';
      const e = bar.querySelector('#sr-end');
      if (e) e.onclick = function () { endSmallRest(); };
      return;
    }
    const live = streakLiveMs();
    const running = isLearningNow();
    const canRest = !!(timer || cdTimer || S().getDay(S().todayKey()).activeHourPlan);
    bar.innerHTML = '<div class="card streak-card">🔥 ' +
      (running ? '已连续学习 <b>' + S().fmtClock(live).replace(/^00:/, '') + '</b>'
        : '连续学习 <b>' + S().fmtClock(live).replace(/^00:/, '') + '</b>（上次休息后）') +
      (canRest ? '<button class="btn btn-small" id="sr-rest" style="margin-left:6px">☕ 小休一下</button>' : '') +
      '</div>';
    const r = bar.querySelector('#sr-rest');
    if (r) r.onclick = startSmallRest;
  }
  function startSmallRest() {
    if (smallRest) return;
    const hasTimer = !!timer, hasCd = !!cdTimer;
    const hasPlan = !!S().getDay(S().todayKey()).activeHourPlan;
    if (!hasTimer && !hasCd && !hasPlan) return; // 没在计时/倒计时/小时代段内，不能小休
    smallRest = { startAt: Date.now(), durMs: 300000 }; // 默认小休 5 分钟，休息单独算
    // 小休期间小时代的倒计时同步暂停（休多久这一段顺延多久），见 hpEffectiveEndMs
    if (hasTimer && !timer.paused) togglePause(); // 正向计时暂停，休息不占学习
    else if (hasCd && !cdTimer.paused) toggleCdPause(); // 做题倒计时暂停
    renderStreakBar();
    App.ui.toast('☕ 小休开始，休息不占学习，这一段的倒计时也暂停了。');
  }
  function endSmallRest() {
    if (!smallRest) return;
    const restElapsed = Date.now() - smallRest.startAt;
    smallRest = null;
    const day = S().getDay(S().todayKey());
    // 小休结束：把暂停的时长记到这一段账上，到点时间相应顺延
    if (day.activeHourPlan) {
      day.activeHourPlan.restMs = (day.activeHourPlan.restMs || 0) + restElapsed;
      S().save();
    }
    App.ui.openModal('🛋 小休结束 · 自查一下', '' +
      '<p style="font-size:13px">这一段休息，中途有没有去干<b>消耗性的事</b>（刷手机 / 刷视频 / 分神）？</p>' +
      '<p style="font-size:12px;color:#8a919c">如实选：没有 → 干净休息；有 → 记一次消耗（结束今天的运动/任务时会统一扣 ' + FOCUS_CUT_PER + ' 分）。</p>',
      '<button class="btn btn-primary" data-act="clean">✅ 没有，休息得很好</button>' +
      '<button class="btn" style="background:#e2545d;border-color:#e2545d;color:#fff" data-act="cut">⚠️ 有，我消耗了</button>');
    App.ui.bindActions({
      clean: function () { App.ui.closeModal(); finishRest(false); },
      cut: function () {
        day.focusCut = (day.focusCut || 0) + 1;
        S().save();
        App.ui.closeModal(); finishRest(true);
      }
    });
  }
  function finishRest(distracted) {
    streakReset(); // 休息后连续学习归零重新算
    if (timer && timer.paused) togglePause(); // 自动恢复正向计时
    else if (cdTimer && cdTimer.paused) toggleCdPause(); // 自动恢复做题倒计时
    renderStreakBar();
    App.ui.toast(distracted ? '⚠️ 记了一次消耗，结束今天的运动/任务时会扣 ' + FOCUS_CUT_PER + ' 分' : '✅ 休息结束，接着学吧');
  }

  /* ---------- 🛟 v107：刷新 / 关页面后，计时不再凭空消失 ----------
     用户：「我有时候计时，然后点了下网页的刷新的按钮，然后发现它的计时没了艾，时间轴上面也没有」。
     真凶：timer / cdTimer 是**纯内存变量**（模块级 let），刷新一下就没了 —— 而只有"点⏹完成"才会写时间轴，
     所以刷新 = 这段时间**彻底蒸发**（连记录都没有）。

     做法：状态一变就把快照写进 localStorage（＋每 5 秒兜一次 ＋页面隐藏/卸载再写一次）。
     下次打开时按"能不能安全接上"分三种：
       · 快照是**暂停中** → 直接接回来（暂停的空档本来就不算，怎么都不会多算）
       · 是**在跑**且离最后一次心跳 ≤ 8 分钟 → 直接接着算（刷新这种小空档不影响）
       · 空档更大 / 那条任务已经不在了 / 那天已结算 → 弹窗让用户自己选：
         「接着算」/「只记到刷新前（净 Y 分钟）」/「不要了」
     ⚠️ 关键取舍：空档大时**绝不默认接着算** —— 那会把"关掉页面的两小时"算成学习，
        跟 v106 修的是同一类错（系统只该为"你真的在学"记账）。 */
  const SNAP_KEY = 'focusPlan.timer.v1';
  const SNAP_GAP = 8 * 60000;    // 心跳空档小于这个数才敢直接接着算
  let snapAt = 0;                // 上次写快照的时间（心跳节流用）

  function saveTimerSnap() {
    try {
      if (!timer && !cdTimer) { localStorage.removeItem(SNAP_KEY); snapAt = 0; return; }
      localStorage.setItem(SNAP_KEY, JSON.stringify({ t: timer, cd: cdTimer, at: Date.now() }));
      snapAt = Date.now();
    } catch (e) { /* 存储不可用就算了，不能让计时本身崩掉 */ }
  }
  function readTimerSnap() {
    try {
      const v = JSON.parse(localStorage.getItem(SNAP_KEY) || 'null');
      return (v && (v.t || v.cd)) ? v : null;
    } catch (e) { return null; }
  }
  function clearTimerSnap() { try { localStorage.removeItem(SNAP_KEY); snapAt = 0; } catch (e) { /* 忽略 */ } }

  /** 快照里那条任务现在还在不在（同一天、那条任务还在、那天还没结算）*/
  function snapTaskAlive(s) {
    if (!s || !s.taskId) return false;
    try {
      const d = S().getDay(S().dateKey(new Date(s.startedAt)));
      if (!d || d.ended) return false;
      return (d.tasks[s.taskKey] || []).some(function (t) { return t.id === s.taskId; });
    } catch (e) { return false; }
  }
  /** 小任务快照：它挂的那道小题还在不在 */
  function snapSubAlive(s) {
    if (!s || !s.taskId || !s.subId) return false;
    try {
      const d = S().getDay(S().dateKey(new Date(s.startedAt)));
      const task = (d.tasks[s.taskKey] || []).filter(function (t) { return t.id === s.taskId; })[0];
      if (!task) return false;
      const pool = s.groupId ? (((task.groups || []).filter(function (g) { return g.id === s.groupId; })[0] || {}).subs || []) : (task.subs || []);
      return pool.some(function (x) { return x.id === s.subId; });
    } catch (e) { return false; }
  }
  /** 快照的净分钟数：只算到最后一次心跳（暂停中的算到暂停那一刻）—— 关页面之后的空档不算 */
  function snapNetMin(s) {
    const end = s.at || Date.now();
    const stop = (s.paused && s.pauseAt) ? Math.min(s.pauseAt, end) : end;
    return Math.max(1, Math.ceil((stop - s.startedAt - (s.pausedMs || 0)) / 60000));
  }
  /** 把一份快照补记进时间轴（只到最后心跳那一刻） */
  function snapToTimeline(s, tag) {
    const day = S().getDay(S().dateKey(new Date(s.startedAt)));
    const st = new Date(s.startedAt), en = new Date(s.at || Date.now());
    const sMin = st.getHours() * 60 + st.getMinutes();
    let eMin = en.getHours() * 60 + en.getMinutes();
    if (eMin < sMin) eMin = 1439;
    const mins = Math.max(1, Math.min(snapNetMin(s), Math.max(1, eMin - sMin)));
    day.timeline = day.timeline || [];
    day.timeline.push({
      id: S().uid(), start: sMin, end: eMin, minutes: mins,
      pausedMin: Math.max(0, Math.round((s.pausedMs || 0) / 60000)),
      content: s.planContent || s.text || s.taskText || '（当时没写内容）',
      category: 'study', countAsStudy: true, auto: true,
      taskId: s.taskId || null, taskText: s.taskText || '',
      note: ((s.note || '') + ' ' + (tag || '')).trim()
    });
    S().save();
    return mins;
  }

  function restoreTimerSnap() {
    const snap = readTimerSnap();
    if (!snap) return;
    const t0 = snap.t || null, c0 = snap.cd || null;
    const gapMin = Math.max(0, (Date.now() - (snap.at || 0)) / 60000);
    const aliveT = t0 ? snapTaskAlive(t0) : false;
    const aliveC = c0 ? (snapSubAlive(c0) && snapTaskAlive(c0)) : false;
    const paused = (t0 && t0.paused) || (c0 && (c0.paused || c0.microRest));
    const sameDay = function (s) { return s && S().dateKey(new Date(s.startedAt)) === S().todayKey(); };

    function attach(msg) {
      if (t0 && aliveT) timer = JSON.parse(JSON.stringify(t0));
      if (c0 && aliveC) cdTimer = JSON.parse(JSON.stringify(c0));
      if (!timer && !cdTimer) return false;
      startTick();
      showTimerBar();
      try { renderAll(); } catch (e) { /* 忽略 */ }
      App.ui.toast(msg, 4600);
      saveTimerSnap();
      return true;
    }

    // ① 暂停中 → 直接接回（不会多算）
    if (paused && (aliveT || aliveC)) {
      if (attach('⏸ 刷新前那个计时还停着，已经接回来了（暂停期间不算时间）')) return;
    }
    // ② 在跑 + 空档很小 → 直接接着算
    if (!paused && gapMin * 60000 <= SNAP_GAP && (aliveT || aliveC)
        && (!t0 || aliveT) && (!c0 || aliveC)) {
      if (attach('⏱ 刷新前那个计时还在跑，已经接上了（' + S().fmtDur(snapNetMin(t0 || c0)) + '）')) return;
    }
    // ③ 空档大 / 任务被删 / 那天结算了 → 让用户自己定，绝不静默丢
    const lines = [];
    const at0 = function (s) { const d = new Date(s.startedAt); return S().hhmmOf(d.getHours() * 60 + d.getMinutes()); };
    if (t0) lines.push('⏱ <b>主计时</b>：' + S().esc(t0.planContent || t0.taskText || '（没写内容）') +
      '（' + at0(t0) + ' 开始，净 ' + S().fmtDur(snapNetMin(t0)) + '）' +
      (aliveT ? '' : ' <span style="color:#e2545d">· 这条任务已经不在了</span>'));
    if (c0) lines.push('⏳ <b>小任务</b>：' + S().esc(c0.text || '') +
      '（' + at0(c0) + ' 开始，净 ' + S().fmtDur(snapNetMin(c0)) + '）' +
      (aliveC ? '' : ' <span style="color:#e2545d">· 这道题已经不在了</span>'));
    const canKeep = (aliveT || aliveC) && (sameDay(t0 || c0)) && gapMin <= 360;
    const btns = [];
    if (canKeep) btns.push('<button class="btn" data-act="snap-keep">⏱ 接着算（空档也算进去）</button>');
    btns.push('<button class="btn btn-primary" data-act="snap-log">🧾 只记到刷新前</button>');
    btns.push('<button class="btn" data-act="snap-drop">🗑 不要了</button>');
    App.ui.openModal('🛟 上次那个计时还在',
      '<p class="hint" style="margin-top:0">刷新 / 关页面把计时打断了 —— 这段时间<b>不会自己消失</b>，你说怎么算：</p>' +
      '<div style="font-size:13.5px;line-height:1.9">' + lines.join('<br/>') + '</div>' +
      '<p class="hint">距上次记到的时间：约 ' + Math.round(gapMin) + ' 分钟' +
      (canKeep ? '。<b>接着算</b>会把这 ' + Math.round(gapMin) + ' 分钟也算进去（你确实一直在学才这么选）。' :
        '。空档比较大，或者那条任务已经不在了，所以只能把它记进时间轴（只记到刷新前那一刻）。') + '</p>',
      btns.join(''));
    App.ui.bindActions({
      'snap-keep': function () {
        App.ui.closeModal();
        if (!attach('⏱ 已接上，接着算')) clearTimerSnap();
      },
      'snap-log': function () {
        App.ui.closeModal();
        let n = 0;
        try {
          if (t0) n += snapToTimeline(t0, '（刷新后补记）');
          if (c0) n += snapToTimeline(c0, '（刷新后补记）');
        } catch (e) { /* 忽略 */ }
        clearTimerSnap();
        try { if (App.timeline && App.timeline.render) App.timeline.render(); } catch (e) { /* 忽略 */ }
        App.ui.toast(n ? ('🧾 已补记进时间轴：共 ' + S().fmtDur(n) + '（在 ' + S().shortDateCN(S().dateKey(new Date((t0 || c0).startedAt))) + ' 那栏）') : '这段太短了，就不记了', 5200);
      },
      'snap-drop': function () {
        App.ui.closeModal();
        clearTimerSnap();
        App.ui.toast('🗑 这段不要了');
      }
    });
  }

  /* ---------- 🧊 v106：休息期间不让计时继续跑 ----------
     用户：「啊？这个你暂停的时间也给我算进去了，明显对不上。我当时暂停了好久。」
     实测确认：两条休息路径开始后，主计时**根本没停**（休息 2.5 秒，用时涨了 2.5 秒）——
       ① 「☕ 定一段休息」（day.activeRest）
       ② 底部「🔄 一段做完了（休息/杂事/娱乐）」（link.js 的 pause 段，独立模块，够不着计时器）
     两边一起接上：休息开始把**正在跑**的计时冻上（跟 ☕ 小休 用同一套 togglePause），
     结束时只恢复"本来就是它在跑"的那几个 —— 用户自己停掉的不动。 */
  let restFroze = null;       // {timer:bool, cd:bool}：这次休息冻住了谁
  function pauseForRest() {
    if (restFroze) return restFroze;                 // 已经冻着，别重复
    const f = { timer: false, cd: false };
    if (timer && !timer.paused) { togglePause(); f.timer = true; }
    if (cdTimer && !cdTimer.paused && !cdTimer.microRest) { toggleCdPause(); f.cd = true; }
    restFroze = f;
    if (f.timer || f.cd) App.ui.toast('⏸ 顺手把计时停了 —— 休息这段不算进学习时间', 4200);
    return f;
  }
  function resumeAfterRest() {
    const f = restFroze;
    restFroze = null;
    if (!f) return;
    if (f.timer && timer && timer.paused) togglePause();
    if (f.cd && cdTimer && cdTimer.paused && !cdTimer.microRest) toggleCdPause();
  }

  /* ---------- 渲染 ---------- */
  const DEFAULT_POINTS = { ideal: 10, extra: 5 };

  function taskPoints(task, listKey) {
    if (listKey !== 'ideal' && listKey !== 'extra') return null;
    const d = S().settings(); // 默认值兜底
    return task.points != null ? task.points
      : (listKey === 'ideal' ? (d.idealPoints == null ? DEFAULT_POINTS.ideal : d.idealPoints)
        : (d.extPoints == null ? DEFAULT_POINTS.extra : d.extPoints));
  }

  /** ↩ 任务来源标签（v66）：两种标签长得不一样，一眼分清"原任务"和"移过来的"
      · carried   → 从昨天移过来的（副本，今天该做它）
      · movedOut  → 当天没做完、已经移到明天的原任务（留在当天只作记录） */
  function carryTagHTML(t) {
    if (!t) return '';
    // 📋 v82：队列实体化的副本 —— 顶上一条「来自队列」；完成率统计里不算它
    if (t.fromQueue) {
      return '<span class="fromqueue-tag" title="这条来自队列 —— 是当前正在做的那条。它不进「必须 0/x」的统计，做完会自动完成队列项、下一条顶上">📋 来自队列</span>';
    }
    // 📌 v96：从「今天的基础任务」点 ▶ 开始做时生成的副本
    if (t.fromDaily) {
      return '<span class="fromqueue-tag" title="这条来自「今天的基础任务」—— 是你在队列页点 ▶ 开始做的那条。它不进「必须 0/x」的统计，做完会自动把基础任务勾上">📌 来自今天的基础</span>';
    }
    if (t.carried) {
      return '<span class="carry-tag" title="昨天没做完，自动移到今天来的 \u2014\u2014 今天做完就不扣分">\u21A9 昨天移过来' +
        (t.carriedFailed ? ' \u00b7 已扣分' : '') + '</span>';
    }
    // ↩ v74：必须/理想栏昨天没做完顺延过来的（原来没有任何标记，混在今天的清单里认不出来）
    if (t.rolled) {
      return '<span class="rolled-tag" title="昨天没做完，自动顺延到今天的 —— 想做就直接做，不想做可以在清单顶上「一键清掉」">\u21A9 昨天没做完</span>';
    }
    if (t.movedOut) {
      return '<span class="carry-out-tag" title="当天没做完，已经移到第二天的拓展栏了（这条留在这里只作记录）">\u2717 未完成 \u00b7 已移到明天</span>';
    }
    return '';
  }

  function taskRowHTML(listKey, task) {
    const locked = timer && timer.taskId !== task.id;
    const isThis = timer && timer.taskId === task.id;
    let btn;
    if (isThis) {
      btn = '<button class="task-timer-btn running" data-act="pause" title="暂停/继续">' + (timer.paused ? '▶ 继续' : '⏸ 暂停') + '</button>' +
        '<button class="task-timer-btn running" data-act="stop" title="完成计时">⏹ 完成</button>';
    } else {
      btn = '<button class="task-timer-btn' + (locked ? ' locked' : '') + '" data-act="start" title="' + (locked ? '已有任务在计时' : '开始计时') + '">▶ 开始计时</button>';
    }
    // 理想/拓展任务：每条单独定价积分（完成可得，任务后面直接改）
    const pts = taskPoints(task, listKey);
    const ptsInput = pts != null
      ? '<span class="task-pts-wrap" title="完成此任务可得积分（每条可单独定价）">' +
        '<input type="number" class="task-points" data-act="points" min="0" value="' + pts + '"' + (task.done || isThis ? ' disabled' : '') + ' />' +
        '<span class="pts-unit">分</span></span>'
      : '';
    // 直接小题（不在任务组里）的预计 / 实际统计；任务组各自的统计在组卡片里
    let statLine = '';
    if (task.subs && task.subs.length > 0) {
      const planned = task.subs.reduce(function (a, s) { return a + (s.minutes || 0); }, 0);
      const sess = ((S().getDay(S().todayKey()).sessions) || []).filter(function (se) { return se.taskId === task.id; });
      const actual = sess.reduce(function (a, se) { return task.subs.some(function (s) { return s.text === se.planContent; }) ? a + (se.actualMinutes || 0) : a; }, 0);
      const pct = planned > 0 ? Math.min(100, Math.round((actual / planned) * 100)) : 0;
      // 连续工作 = 正在做这道任务当前小题的"未歇"时长（暂停/小休不计入，小休后会重置）
      const cont = (cdTimer && cdTimer.taskId === task.id) ? Math.max(0, (cdElapsedMs() || 0) / 60000) : 0;
      statLine = '<div class="task-stat" title="预计=你设的总时长；实际=今天真花了多少；连续=上次休息后一直没歇的工作时长">' +
        '🕑 预计 <b>' + S().fmtDur(planned) + '</b> ｜ 实际 <b>' + S().fmtDur(actual) + '</b>' +
        (cont > 0 ? ' ｜ 连续 <b>' + S().fmtDur(cont) + '</b>' : '') +
        (planned ? ' ｜ 进度 <b style="color:' + (pct >= 100 ? 'var(--req)' : '#22a06b') + '">' + pct + '%</b>' : '') +
        '</div>';
    }
    const lecBtn = '<button class="task-timer-btn task-lec-btn" data-act="lecture" title="🎧 听课三步：预习 → 听课 → 整理，三步齐了发大奖">🎧</button>';
    // 🃏 v90：这条任务有设问卡时才出现 —— 翻卡自测 / 补加
    // 📅 v101：从卡片排过来的「复习任务」（带 mcRef）也显示，点它直接进那几张卡
    const mcN = (App.memcards && App.memcards.countForTask) ? App.memcards.countForTask(task.id) : 0;
    const mcRefN = (task.mcRef && task.mcRef.n) ? task.mcRef.n : 0;
    const mcNum = mcN || mcRefN;
    const mcBtn = (mcN || task.mcRef)
      ? '<button class="task-timer-btn" data-act="memcards" title="🃏 ' +
        (task.mcRef ? '这套卡（' + mcRefN + ' 张）排到今天复习的 —— 点开翻卡自测' : '这套设问卡（' + mcN + ' 张）：翻卡自测、补加卡片') +
        '">🃏' + (mcNum > 1 ? mcNum : '') + '</button>'
      : '';
    // 🔗 只有这一栏里真的存在「同名的另一条」时才出现，平时不占地方
    const dupBtn = findDupTask(S().todayKey(), listKey, task)
      ? '<button class="task-timer-btn task-merge-btn" data-act="dup-merge" title="这一栏有两条同名的「' + S().esc(task.text) + '」，点这里合并成一条">🔗</button>'
      : '';
    // 🌱 v115：复习计划 —— 新知识/旧知识/普通任务都能自己排（排过了按钮变实心）
    const srBtn = '<button class="task-timer-btn task-sr-btn' + (srPlan(task).length ? ' on' : '') +
      '" data-act="sr-plan" title="🌱 复习计划：自己定三轮各隔多久、一天过几遍' +
      (srPlan(task).length ? '（这条已经排了）' : '') + '">🌱</button>';
    // 🗑 v117：今天这三栏以前**没有删除入口**（只能点文字进编辑窗里删）——
    //   用户：「为已添加的任务提供删除选项，让用户能够直接移除任意已添加的任务」
    const delBtn = '<button class="task-timer-btn task-del-btn" data-act="del" title="删掉这条（先进回收站，能恢复）">🗑</button>';
    const lecPanel = (App.lecture && App.lecture.inlineHTML) ? App.lecture.inlineHTML(task) : '';
    return '<div class="task-row' + (task.done ? ' done' : '') + (lecPanel ? ' lec-running' : '') + '" data-list="' + listKey + '" data-id="' + task.id + '">' +
      '<span class="task-check' + (task.done ? ' checked' : '') + '" data-act="check">✓</span>' +
      '<span class="task-text" data-act="edit">' + S().esc(task.text) + '</span>' +
      carryTagHTML(task) +
      modeTagHTML(task) +
      lecTagHTML(task) +
      ptsInput +
      lecBtn +
      srBtn +
      mcBtn +
      dupBtn +
      btn +
      delBtn +
      '</div>' +
      lecPanel +
      statLine +      subBlockHTML(task) +
      groupBlockHTML(task);
  }

  function renderToday() {
    const dayKey = S().todayKey();
    const day = S().getDay(dayKey);
    const box = document.getElementById('task-columns');
    // 日期显示
    document.getElementById('today-date').textContent = '📅 今天：' + S().fmtDateCN(dayKey);
    box.innerHTML = '<div class="day-toolbar">' +
      '<button class="btn btn-small" data-act="quick-add">⚡ 快速添加</button>' +
      '<button class="btn btn-small" data-act="paste">📋 从往日粘贴任务</button>' +
      '<button class="btn btn-small" data-act="trash">🗑 回收站（误删恢复）</button>' +
      '<button class="btn btn-small" data-act="export-img" title="把今天的任务清单导出成一张长图，可以直接发给别人看">🖼 导出长图</button>' +
      '<span class="day-toolbar-hint">⚡ 整句快速加任务 / 粘贴往日 / 找回误删 / 导出长图发人看<br>' +
      '这三栏是<b>今天要做的事</b>，<b>不排队</b>（哪条都能随时开）；想<b>按顺序做</b>就把任务送进 <b>📋 队列</b>。</span></div>' +
      pendingBarHTML() +                     // ★ v56：待办衔接（某题没标结果 / 接着做还是休息）
      COLS.map(function (col) {
      // 🧲 v85：队列实体化的副本不在三栏里渲染 —— 它住在队列页（那边有全套按钮）
      // 🧲 v105：基础任务点 ▶ 之后的副本也一样 —— 它在「今天的基础任务」那一栏**原地**变成长任务行，
      //         不借住必须栏（用户 v85 那句「都以此为主了，为什么还要排到必须完成的任务里，很别扭」）。
      const list = day.tasks[col.key].filter(function (t) { return !t.fromQueue && !t.fromDaily; });
      const doneN = list.filter(function (t) { return t.done; }).length;
      const rows = list.map(function (t) { return taskRowHTML(col.key, t); }).join('');
      // 每栏底部"＋ 添加任务"（当天临时加任务；拓展栏受"可追加"开关控制）
      let addBtn = '';
      if (col.key !== 'extra' || S().settings().extAppendable) {
        addBtn = '<div class="extra-append"><button class="btn btn-small" data-act="add">＋ 添加任务（临时）</button></div>';
      }
      // 🧲 v83：队列优先模式 + 这一栏一条任务都没有 → 收起成一行提示（不再给"今天要完成几条"的空壳）
      if (S().settings().queueFirst && list.length === 0) {
        return '<div class="task-col ' + col.style + ' qf-collapsed" data-col="' + col.key + '">' +
          '<div class="task-col-head"><h3>' + col.name + '</h3>' +
          '<span class="badge">0/0</span></div>' +
          '<p class="hint" style="margin:2px 0 8px">空着 —— 队列优先模式下不在这里定任务，想做的事进 <b>📋 队列</b> 按顺序做。</p>' +
          addBtn +
          '</div>';
      }
      return '<div class="task-col ' + col.style + '" data-col="' + col.key + '">' +
        '<div class="task-col-head"><h3>' + col.name + '</h3>' +
        '<span class="badge">' + doneN + '/' + list.length + '</span></div>' +
        '<div class="task-col-head"><span class="desc">' + col.desc + '</span></div>' +
        rows + addBtn +
        '</div>';
    }).join('');
    bindTodayEvents();
    bindPendingBar(box);
    renderStreakBar();
    renderSettleBar();
    bindSettleBar();
    renderSlotBar();
    renderRollBar();
    renderReviewBanner();
    bindReviewBanner();
    bindRollBar();
    renderReview(dayKey);
    renderHourPlan(dayKey);
    // 🧲 v85：用户正看着队列页时，嵌在里面的任务行也要跟手（计时/打勾/完成状态）
    try {
      if (App.queue && App.queue.render && App.app && App.app.currentView() === 'queue') App.queue.render();
    } catch (e) { /* 忽略 */ }
  }

  /* ---------- 复盘/总结类 textarea 的自动保存（边打边存，关窗不丢） ---------- */
  function autoSave(ta, apply) {
    if (!ta) return;
    let timer = null;
    ta.addEventListener('input', function () {
      if (timer) clearTimeout(timer);
      timer = setTimeout(function () {
        timer = null;
        apply(ta.value);
        S().save();
      }, 600);
    });
  }

  /* ---------- 今日复盘（随时可写，结束今天时也能写） ---------- */
  function renderReview(dayKey) {
    const day = S().getDay(dayKey);
    const card = document.getElementById('review-card');
    if (!card) return;
    const text = (day.review && day.review.text) || '';
    card.innerHTML = '<h3>📝 今日复盘</h3>' +
      '<textarea id="review-text" style="width:100%;min-height:64px;border:1px solid #e5e8ec;border-radius:8px;padding:8px 10px;font-size:14px;resize:vertical">' +
      S().esc(text) + '</textarea>' +
      '<div class="btn-row" style="margin-top:8px;align-items:center">' +
      '<button class="btn btn-small btn-primary" data-act="review-save">保存复盘</button>' +
      '<span id="review-autosave" style="font-size:11.5px;color:#8a919c">（边打边自动保存，关页面也不丢）</span>' +
      (text ? '<span class="review-meta">已保存' + (day.review.at ? ' · ' + new Date(day.review.at).toLocaleString('zh-CN') : '') + '</span>' : '') +
      '</div>';
    const ta = card.querySelector('#review-text');
    if (ta && !text) ta.placeholder = '自由写下今天的感想与反思';
    autoSave(ta, function (v) {
      if (v.trim()) { day.review = { text: v, at: new Date().toISOString() }; }
    });
    card.onclick = function (e) {
      if (!e.target.closest('[data-act="review-save"]')) return;
      const txt = ta.value.trim();
      day.review = { text: txt, at: new Date().toISOString() };
      S().save();
      App.ui.toast('复盘已保存');
      renderReview(dayKey);
    };
  }

  /* ============================================================
   * ⏱ 小时计划：手动起止一段"小时"窗口，给 必须/理想/拓展 三类
   *   分别定目标学习分钟；用任务计时器正常执行，实际用时自动累计；
   *   结束结算看是否达到总目标，达标自填奖励积分（入账本）。
   * ============================================================ */
  const HOUR_COLS = [
    { k: 'required', n: '✅ 必须' },
    { k: 'ideal', n: '⭐ 理想' },
    { k: 'extra', n: '🌱 拓展' }
  ];
  // 任务 id → 所属栏（必须/理想/拓展）
  function hourPlanBucket(taskId) {
    const day = S().getDay(S().todayKey());
    for (let i = 0; i < HOUR_COLS.length; i++) {
      const c = HOUR_COLS[i];
      if ((day.tasks[c.k] || []).some(function (t) { return t.id === taskId; })) return c.k;
    }
    return null;
  }
  // 统计当前小时计划某类（或全部）已完成的实际分钟
  // 这一段的"到点时刻"：开始 + 时长 + 小休累计顺延（小休中：到点同步冻结，等于倒计时暂停）
  function hpEffectiveEndMs(plan) {
    if (!plan || !plan.startAt) return Date.now();
    let end = new Date(plan.startAt).getTime() + (plan.duration || 30) * 60000 + (plan.restMs || 0);
    if (smallRest) end += Date.now() - smallRest.startAt; // 进行中的小休也顺延
    return end;
  }
  // 统计某类(或全部)实际分钟；upper 缺省=现在。到点结算时传"到点时刻"，超时补做不再计入
  function hourPlanActual(plan, colKey, upper) {
    if (!plan || !plan.startAt) return 0;
    const day = S().getDay(S().todayKey());
    const start = new Date(plan.startAt).getTime();
    const up = upper ? upper.getTime() : Date.now();
    let ms = 0;
    (day.sessions || []).forEach(function (s) {
      if (!s.startAt) return;
      const t = new Date(s.startAt).getTime();
      if (t < start || t > up) return; // 只计 [start, upper] 窗口内开始的任务
      if (colKey && hourPlanBucket(s.taskId) !== colKey) return;
      ms += (s.actualSeconds != null ? s.actualSeconds / 60 : (s.actualMinutes || 0)); // 秒级精确累加，不丢时间
    });
    // 🎓 听课三步走的是「时间轴」，不写 sessions —— 所以必须单独补进来，
    // 否则「听了一小时课，小时代显示实际 0 分钟 · 未达标」（2026-09-15 用户实测踩到）
    // ★ v55：按"记录与本段窗口的重叠分钟"计，而不是"起点必须落在窗口内"。
    //    原来课是从上一段就开始听的 → 起点在窗口外 → 整条被丢掉（用户报"时间少算"）
    const sd = new Date(plan.startAt);
    const startMin = sd.getHours() * 60 + sd.getMinutes();
    const ud = new Date(up);
    let upMin = ud.getHours() * 60 + ud.getMinutes();
    if (upMin < startMin) upMin = 1439;
    (day.timeline || []).forEach(function (r) {
      if (!r.lectureId) return;                    // 只认听课记录（小时代自身那条没有 lectureId）
      const bk = r.taskId ? (hourPlanBucket(r.taskId) || 'required') : 'required';
      if (colKey && bk !== colKey) return;
      const rS = r.start || 0, rE = (r.end == null ? rS : r.end);
      const ov = Math.max(0, Math.min(rE, upMin) - Math.max(rS, startMin));
      if (ov <= 0) return;
      ms += Math.min(ov, r.minutes || ov);         // 重叠分钟，但不超记录自身时长
    });
    return ms;
  }
  // 进行中（还没点结算）的任务计时：也算进这一段——到点自动结算不再漏掉正做着的时间。
  // 每段只计自己窗口内的部分（跨段不重复），liveCredited 记录已计入的总量。
  function hourPlanSummary(plan, upper, record) {
    const tg = (plan && plan.targets) || {};
    const req = tg.required || 0, ide = tg.ideal || 0, ext = tg.extra || 0;
    const ar = hourPlanActual(plan, 'required', upper), ai = hourPlanActual(plan, 'ideal', upper), ae = hourPlanActual(plan, 'extra', upper);
    const live = { required: 0, ideal: 0, extra: 0, total: 0 };
    if (plan && plan.startAt) {
      const start = new Date(plan.startAt).getTime();
      const up = upper ? upper.getTime() : Date.now();
      [timer, cdTimer].forEach(function (t) {
        if (!t || !t.startedAt) return;
        const bk = hourPlanBucket(t.taskId);
        if (!bk) return;
        const st = new Date(t.startedAt).getTime();
        if (st > up) return;
        const frozen = (t.paused && t.pauseAt) ? new Date(t.pauseAt).getTime() : Date.now();
        const liveMs = Math.max(0, frozen - st - (t.pausedMs || 0)); // 真实跑了多久（暂停不吃）
        const roomMs = Math.max(0, up - Math.max(st, start));          // 最多只能算窗口内的时间
        const total = Math.min(liveMs, roomMs);
        const key = t.taskId + '|' + t.startedAt;
        const cred = Math.max(0, total - (liveCredited[key] || 0));   // 这一段实际新计入的
        if (cred <= 0) return;
        if (record) liveCredited[key] = total; // 结算时记账，下一段不再重复算这部分
        live[bk] += cred / 60000;
        live.total += cred / 60000;
      });
      // 🎓 正在上的那节课也算"进行中"（同样不写 sessions），否则到点自动结算时
      // 这一段会显示"没学到东西"。暂停/小休的时间不算（activeSeconds 已扣过）
      if (App.lecture && App.lecture.activeSeconds) {
        const L2 = S().getDay(S().todayKey()).activeLecture;
        const sec = L2 ? App.lecture.activeSeconds() : 0;
        if (L2 && sec > 0) {
          const stMs = L2.previewStartAt || Date.now();
          if (stMs <= up) {
            const roomMs = Math.max(0, up - Math.max(stMs, start));
            const mins = Math.min(sec * 1000, roomMs) / 60000;
            const key = 'lec|' + L2.id;
            const cred2 = Math.max(0, mins - (liveCredited[key] || 0));
            if (cred2 > 0) {
              if (record) liveCredited[key] = mins;
              const bk2 = L2.taskId ? (hourPlanBucket(L2.taskId) || 'required') : 'required';
              live[bk2] += cred2;
              live.total += cred2;
            }
          }
        }
      }
    }
    return {
      targets: { required: req, ideal: ide, extra: ext },
      actual: { required: ar + live.required, ideal: ai + live.ideal, extra: ae + live.extra },
      tTotal: req + ide + ext,
      aTotal: ar + ai + ae + live.total,
      liveMin: live.total
    };
  }
  // 开始一个小时代：标起点 + 定这一段多长 + 在时长内分配三类
  function startHourPlanModal() {
    const day = S().getDay(S().todayKey());
    if (day.activeHourPlan) { App.ui.toast('已有一个小时计划在进行中，先「⏹ 结束」结算'); return; }
    if (day.activeRest) { App.ui.toast('正在休息中，先结束休息再开新的一段'); return; }
    const dflt = S().settings().hourPlanDefaultMin || 30;
    const now = new Date();
    const hhmm = S().pad2(now.getHours()) + ':' + S().pad2(now.getMinutes());
    const req0 = Math.round(dflt * 0.5), ide0 = Math.round(dflt * 0.3), ext0 = Math.max(1, dflt - req0 - ide0);
    let taskOpts = '<option value="">（不关联具体任务）</option>';
    ['required', 'ideal', 'extra'].forEach(function (lk) {
      (day.tasks[lk] || []).forEach(function (t) {
        taskOpts += '<option value="' + lk + ':' + t.id + '">[' + COL_NAMES[lk] + '] ' + S().esc(t.text) + '</option>';
      });
    });
    const modal = App.ui.openModal('⏱ 开始这个小时代',
      '<p style="font-size:12.5px;color:#8a919c;margin-bottom:10px">先标注这一段从几点开始、一共多长，再分配 必须/理想/拓展 各学多久。执行时用任务计时器正常计时，实际用时自动统计。</p>' +
      '<div class="field-row">' +
      '<div class="field"><label>开始时间（几点）</label><input type="time" id="hp-start" value="' + hhmm + '" /></div>' +
      '<div class="field"><label>这一段多长（分钟）</label><input type="number" id="hp-dur" min="1" value="' + dflt + '" /></div>' +
      '</div>' +
      '<div class="field"><label>✅ 必须任务（分钟）</label><input type="number" id="hp-req" min="0" value="' + req0 + '" /></div>' +
      '<div class="field"><label>⭐ 理想任务（分钟）</label><input type="number" id="hp-ide" min="0" value="' + ide0 + '" /></div>' +
      '<div class="field"><label>🌱 拓展任务（分钟）</label><input type="number" id="hp-ext" min="0" value="' + ext0 + '" /></div>' +
      '<div class="field"><label>🎁 这一段完成奖励积分（提前定好，达标就发）</label><input type="number" id="hp-pts" min="0" value="10" /></div>' +
      '<div class="field"><label>🔗 关联任务（本段主要做哪一项，可选）</label><select id="hp-task">' + taskOpts + '</select></div>' +
      '<p class="hint">三类合计建议约等于这一段时长（' + dflt + ' 分钟）；达标后这段的奖励积分自动入账。</p>',
      '<button class="btn btn-primary" data-act="ok">🎯 开始</button><button class="btn" data-act="cancel">取消</button>');
    const dEl = modal.querySelector('#hp-dur');
    if (dEl) dEl.onchange = function () {
      const d = Math.max(1, +dEl.value || dflt);
      modal.querySelector('#hp-req').value = Math.round(d * 0.5);
      modal.querySelector('#hp-ide').value = Math.round(d * 0.3);
      modal.querySelector('#hp-ext').value = Math.max(1, d - Math.round(d * 0.5) - Math.round(d * 0.3));
    };
    App.ui.bindActions({
      ok: function () {
        const req = Math.max(0, +modal.querySelector('#hp-req').value || 0);
        const ide = Math.max(0, +modal.querySelector('#hp-ide').value || 0);
        const ext = Math.max(0, +modal.querySelector('#hp-ext').value || 0);
        const dur = Math.max(1, +modal.querySelector('#hp-dur').value || dflt);
        if (!req && !ide && !ext) { App.ui.toast('至少给一类定个目标分钟'); return; }
        const pts = Math.max(0, +modal.querySelector('#hp-pts').value || 0);
        const tv = modal.querySelector('#hp-start').value || hhmm;
        const sd = new Date(); sd.setHours(+tv.split(':')[0] || 0, +tv.split(':')[1] || 0, 0, 0);
        const tvsel = modal.querySelector('#hp-task').value || '';
        let tKey = '', tId = '', tText = '';
        if (tvsel) {
          const idx = tvsel.indexOf(':');
          tKey = tvsel.slice(0, idx); tId = tvsel.slice(idx + 1);
          const ts = (day.tasks[tKey] || []).find(function (t) { return t.id === tId; });
          tText = ts ? ts.text : '';
        }
        day.activeHourPlan = { id: S().uid(), startAt: sd.toISOString(), duration: dur, reward: pts, taskKey: tKey, taskId: tId, taskText: tText, targets: { required: req, ideal: ide, extra: ext } };
        S().save();
        App.ui.closeModal();
        App.tasks.renderToday();
        App.ui.toast('🎯 已开始：从 ' + tv + ' 起 · ' + dur + ' 分钟（必' + req + '/理' + ide + '/拓' + ext + '），去执行！');
      },
      cancel: App.ui.closeModal
    });
  }
  // 结束结算：到点即封顶（窗口=[开始, 开始+时长+小休顺延]），到点后补做不算；
  // 还在做的任务（没点结算的）时间一并计入，达标就照常发提前定的积分
  function endHourPlan(fromLate) {
    const day = S().getDay(S().todayKey());
    const plan = day.activeHourPlan;
    if (!plan) { App.ui.toast('当前没有进行中的小时计划'); return; }
    if (smallRest) { App.ui.toast('☕ 小休中，这一段倒计时也暂停了——先结束小休再结算'); return; }
    const startMs = new Date(plan.startAt).getTime();
    const planEndMs = hpEffectiveEndMs(plan);
    const endAtMs = Math.min(Date.now(), planEndMs); // 到点即封顶，超时补做不计
    const sum = hourPlanSummary(plan, new Date(endAtMs), true); // record=true：进行中任务时间记账防重
    const met = sum.tTotal > 0 && sum.aTotal >= sum.tTotal;
    plan.endAt = new Date(endAtMs).toISOString();
    plan.autoEnd = Date.now() >= planEndMs; // 是否到点自动结算
    plan.actual = sum.actual;
    plan.met = met;
    plan.usedMin = sum.aTotal;
    plan.liveMin = sum.liveMin; // 这一段里"进行中未结算"任务贡献的分钟（留档可查）
    day.hourPlans = day.hourPlans || [];
    day.hourPlans.push(plan);
    day.activeHourPlan = null;
    S().save();
    App.tasks.renderToday();
    streakReset(); // 一段结束，连续学习重新计时
    // 顺序很重要：先把这段写进时间轴；达标时先弹自查、提交入账之后，才弹复盘+衔接。
    // （之前自查窗刚弹出来就被复盘窗顶掉，积分永远入不了账）
    hourPlanTimelinePush(plan);
    if (met) {
      hourDistractCheck(plan, function () { hourReviewPrompt(plan); });
    }
    else {
      App.ui.toast(plan.autoEnd
        ? ((fromLate ? '⏰ 到点了（你不在这个页面的时候），已经帮你自动结算：' : '⏰ 到点了，这段没达标（')
           + '做了 ' + sum.aTotal + '/' + sum.tTotal + ' 分，到点即封顶、超时补做不算）——积分清零，下段再冲 💪')
        : ('这小时没达标（做了 ' + sum.aTotal + '/' + sum.tTotal + ' 分）——下小时再冲一把 💪'));
      hourReviewPrompt(plan);
    }
  }
  // 每段小时代 → 在时间轴里单独记一条延续记录（视图条，不计入学习分钟避免重复）
  function hourPlanTimelinePush(plan) {
    const day = S().getDay(S().todayKey());
    const s = new Date(plan.startAt), e = new Date(plan.endAt);
    let sMin = s.getHours() * 60 + s.getMinutes();
    let eMin = e.getHours() * 60 + e.getMinutes();
    if (eMin < sMin) eMin = 1439;
    const total = Math.max(1, eMin - sMin);
    day.timeline = day.timeline || [];
    day.timeline.push({
      id: S().uid(), start: sMin, end: eMin, minutes: Math.min(total, Math.round(plan.usedMin || total)),
      content: '⏱ 小时代 ' + S().hhmmOf(sMin) + '→' + S().hhmmOf(eMin) + (plan.met ? ' · 达标' : ' · 未达标'),
      category: 'study', countAsStudy: false, auto: true, hourPlanId: plan.id,
      note: (plan.review && plan.review.text) || ''
    });
    S().save();
  }
  // 每段结算后的强制复盘：让用户写下这一段状态/感想，再强制衔接下一步
  function hourReviewPrompt(plan) {
    const m = App.ui.openModal('📝 这一段的复盘 · 感想', '' +
      '<p style="font-size:13px">写给自己：这一段做了什么、状态、想法。<b>边打边自动保存</b>，误关弹窗也不会丢。写完点保存，会强制衔接下一段（不让你闲下来）。</p>' +
      '<div class="field"><label>感想 / 复盘</label>' +
      '<textarea id="hrev-text" style="width:100%;min-height:84px;border:1px solid #e5e8ec;border-radius:8px;padding:8px;font-size:13.5px;resize:vertical">' +
      S().esc((plan.review && plan.review.text) || '') + '</textarea></div>',
      '<button class="btn btn-primary" data-act="ok">✔ 保存并下一步</button>' +
      '<button class="btn" data-act="skip">稍后再写（已打的内容会留着）</button>');
    autoSave(m.querySelector('#hrev-text'), function (v) {
      if (v.trim()) { plan.review = { text: v, at: new Date().toISOString() }; }
    });
    App.ui.bindActions({
      ok: function () {
        const v = m.querySelector('#hrev-text').value.trim();
        if (v) { plan.review = { text: v, at: new Date().toISOString() }; S().save(); }
        App.ui.closeModal(); nextStepPrompt();
      },
      skip: function () { S().save(); App.ui.closeModal(); nextStepPrompt(); }
    });
  }
  // 达标后的「中途消耗自查」：有消耗 → 按设置百分比扣掉这段奖励积分
  // done：自查提交（入账）之后再继续的回调——复盘窗必须等这步做完才能弹，否则会把自查窗顶掉
  function hourDistractCheck(plan, done) {
    const dayKey = S().todayKey();
    const rw = plan.reward || 0;
    const cutPct = (S().settings().hourDistractCut == null ? 100 : S().settings().hourDistractCut);
    const modal = App.ui.openModal('🎁 这段达标！先自查两句',
      '<p style="font-size:13px">这段奖励积分预设 <b>' + rw + '</b> 分。答真实才入账。</p>' +
      '<p style="font-size:13px;margin-top:8px"><b>① 这一段有没有好好休息？</b></p>' +
      '<div class="btn-row">' +
      '<button class="btn btn-small" data-act="rgood">✅ 好好休息了</button>' +
      '<button class="btn btn-small" data-act="rbad">⚠️ 没好好休息（刷了手机/没真歇）</button>' +
      '</div>' +
      '<p style="font-size:13px;margin-top:8px"><b>② 中途偷偷看了几次手机 / 刷了几次屏？</b></p>' +
      '<div class="btn-row">' +
      '<button class="btn btn-small" data-act="n0">0 次</button>' +
      '<button class="btn btn-small" data-act="n1">1 次</button>' +
      '<button class="btn btn-small" data-act="n2">2 次</button>' +
      '<button class="btn btn-small" data-act="n3">3 次以上</button>' +
      '</div>' +
      '<p style="font-size:12px;color:#8a919c;margin-top:8px">每消耗 1 次扣 ' + cutPct + '%（累计上限扣光）。选好两项再点「如实提交」。</p>',
      '<button class="btn btn-primary" data-act="ok">☑ 如实提交</button>',
      { lock: true }); // 上锁：点空白不许关，必须如实提交，积分才不会无声丢掉
    let restGood = null, times = 0;
    modal.addEventListener('click', function (e) {
      const b = e.target.closest('[data-act]');
      if (!b || b.dataset.act === 'ok') return;
      const a = b.dataset.act;
      if (a === 'rgood') restGood = true;
      else if (a === 'rbad') restGood = false;
      else if (a.charAt(0) === 'n') times = +a.slice(1);
      modal.querySelectorAll('[data-act]').forEach(function (x) { x.classList.remove('btn-primary'); });
      b.classList.add('btn-primary');
    });
    function settle() {
      if (restGood === null) { App.ui.toast('先点一下「好好休息 / 没好好休息」'); return; }
      const n = (restGood ? 0 : 1) + times;
      const cut = Math.min(100, n * cutPct);
      const gain = n > 0 ? Math.round(rw * (100 - cut) / 100) : rw;
      plan.rewardPoints = gain;
      plan.distracted = n > 0;
      plan.disturbCount = n;
      plan.restGood = restGood;
      if (gain > 0) {
        App.store.addLedger(dayKey, 'hour-reward', { points: gain, note: '小时计划达标奖励：积分+' + gain + '分' + (n > 0 ? '（消耗' + n + '次，扣' + cut + '%）' : '（全程专注）') });
      }
      S().save();
      if (App.app && App.app.refreshStats) App.app.refreshStats();
      App.tasks.renderToday();
      App.ui.closeModal();
      if (n > 0) {
        App.ui.toast(gain > 0
          ? ('⚠️ 这段消耗了 ' + n + ' 次，扣 ' + cut + '%，实得 +' + gain + ' 分；下次管住自己 💪')
          : ('⚠️ 这段消耗了 ' + n + ' 次，积分被扣光（' + cut + '%）'));
      }
      else {
        App.ui.toast(rw > 0 ? ('🎉 全程专注，这段 +' + rw + ' 分已入账！') : '🎉 全程专注，这段达到目标了！');
      }
      if (done) done(); // 入账完成，再走复盘+衔接
    }
    App.ui.bindActions({ ok: function () { settle(); } });
  }
  // 一段结束后的衔接选择窗：强制别闲下来 → 继续做任务 或 去休息
  function nextStepPrompt() {
    setPendingChoice('plan', '');        // ★ 先落库：关掉也不会丢
    renderAll();                         // ★ 立刻画出来（X 关掉弹窗也已经有入口）
    App.ui.openModal('✅ 这一段结束了，接下来？',
      '<p style="font-size:13px">别让空档落下去——马上定下一段，或主动去休息（好好休息也有积分）。'
      + '<b>先不选也不会丢</b>：任务页顶部会留一条，随时能接着选。</p>',
      '<button class="btn btn-primary" data-act="work">📚 继续做任务</button>' +
      '<button class="btn" data-act="rest">☕ 去休息</button>' +
      '<button class="btn" data-act="later">🕘 先不选（留着）</button>');
    App.ui.bindActions({
      work: function () { App.ui.closeModal(); clearPendingChoice(); renderAll(); startHourPlanModal(); },
      rest: function () { App.ui.closeModal(); clearPendingChoice(); renderAll(); startRestModal(); },
      later: function () { App.ui.closeModal(); renderAll(); App.ui.toast('好，这条留着 —— 任务页顶部随时能接着选', 3600); }
    });
  }
  // 定一段休息：类型 + 时长 + 提前填「好好休息」积分
  function startRestModal() {
    const day = S().getDay(S().todayKey());
    if (day.activeRest) { App.ui.toast('已经在休息中，先结束休息'); return; }
    const dflt = (S().settings().hourPlanDefaultMin || 30);
    const now = new Date();
    const hhmm = S().pad2(now.getHours()) + ':' + S().pad2(now.getMinutes());
    const modal = App.ui.openModal('☕ 定一段休息',
      '<p style="font-size:12.5px;color:#8a919c;margin-bottom:10px">选类型、定多久、以及「好好休息」给多少积分（提前定好）。休息到点自动结束，也能提前结束提前开下一段。</p>' +
      '<div class="field"><label>休息类型</label><select id="rs-type">' +
      '<option value="rest">☕ 单纯休息</option><option value="meal">🍚 吃饭</option><option value="sleep">😴 睡觉</option></select></div>' +
      '<div class="field"><label>休息多久（分钟，从 ' + hhmm + ' 起）</label><input type="number" id="rs-dur" min="1" value="' + dflt + '" /></div>' +
      '<div class="field"><label>🎁 好好休息可得积分（提前定）</label><input type="number" id="rs-pts" min="0" value="10" /></div>',
      '<button class="btn btn-primary" data-act="ok">☕ 开始休息</button><button class="btn" data-act="cancel">取消</button>');
    App.ui.bindActions({
      ok: function () {
        const type = modal.querySelector('#rs-type').value || 'rest';
        const dur = Math.max(1, +modal.querySelector('#rs-dur').value || dflt);
        const pts = Math.max(0, +modal.querySelector('#rs-pts').value || 0);
        const tn = type === 'meal' ? '🍚 吃饭' : (type === 'sleep' ? '😴 睡觉' : '☕ 休息');
        day.activeRest = { id: S().uid(), startAt: new Date().toISOString(), duration: dur, type: type, typeName: tn, reward: pts };
        pauseForRest();                       // 🧊 v106：休息开始 → 正在跑的计时冻上
        S().save(); App.ui.closeModal(); App.tasks.renderToday();
        App.ui.toast('☕ ' + tn + ' 开始：' + dur + ' 分钟，好好休息 +' + pts + ' 分');
      },
      cancel: App.ui.closeModal
    });
  }
  // 结束休息：先自查消耗（同上扣%）→ 入账休息积分 → 强制开始下一段
  function endRest() {
    const day = S().getDay(S().todayKey());
    const r = day.activeRest;
    if (!r) { App.ui.toast('当前不在休息'); return; }
    const startMs = new Date(r.startAt).getTime();
    const rEndMs = startMs + (r.duration || 30) * 60000;
    r.endAt = new Date(Math.min(Date.now(), rEndMs)).toISOString();
    r.autoEnd = Date.now() >= rEndMs;
    const rw = r.reward || 0;
    const cutPct = (S().settings().hourDistractCut == null ? 100 : S().settings().hourDistractCut);
    const modal = App.ui.openModal('✅ 休息结束，先自查',
      '<p style="font-size:13px">这段' + r.typeName + '预设奖励 <b>' + rw + '</b> 分。<br>休息期间有没有去干消耗性的事（刷手机等）？</p>',
      '<button class="btn btn-primary" data-act="ok">✅ 没有，全额给我</button><button class="btn" style="background:#e2545d;border-color:#e2545d;color:#fff" data-act="cut">⚠️ 有，扣' + cutPct + '%</button>');
    function settle(distracted) {
      const gain = distracted ? Math.round(rw * (100 - cutPct) / 100) : rw;
      r.rewardPoints = gain; r.distracted = !!distracted;
      if (gain > 0) {
        App.store.addLedger(S().todayKey(), 'rest-reward', { points: gain, note: r.typeName + '好好休息奖励：积分+' + gain + '分' + (distracted ? '（休息中消耗，扣' + cutPct + '%）' : '') });
      }
      day.rests = day.rests || []; day.rests.push(r); day.activeRest = null;
      resumeAfterRest();                    // 🧊 v106：休息结束 → 恢复刚才是它在跑的计时
      S().save();
      if (App.app && App.app.refreshStats) App.app.refreshStats();
      App.tasks.renderToday();
      streakReset(); // 休息结束，连续学习归零
      App.ui.closeModal();
      App.ui.toast(distracted
        ? ('休息有消耗，扣了 ' + cutPct + '%；起来动一动，接着冲 💪')
        : (rw > 0 ? ('🎉 好好休息 +' + gain + ' 分，休息到位！') : '休息到位，这杯水也喝得值 😌'));
      startHourPlanModal(); // 休息完强制立刻开下一段，不留空档
    }
    App.ui.bindActions({ ok: function () { settle(false); }, cut: function () { settle(true); } });
  }
  // 常驻 tick：连续学习累计（任何视图/悬浮窗藏着都算）+ 到点自动结算 + 实时刷新卡片倒计时
  function hourPlanAutoTick() {
    // 🔥 连续学习：真在学每秒 +1；小休到点自动结束
    if (smallRest) {
      if (Date.now() >= smallRest.startAt + smallRest.durMs) { endSmallRest(); }
      else renderStreakBar();
    } else {
      streakTick();
    }
    const day = S().getDay(S().todayKey());
    // 休息中：到点自动结束并衔接下一段
    const r = day.activeRest;
    if (r && r.duration) {
      const rEnd = new Date(r.startAt).getTime() + r.duration * 60000;
      if (Date.now() >= rEnd) { notifyNow('☕ 休息结束', '回专注计划开下一段吧'); endRest(); return; }
      const cR = document.getElementById('hp-countdown');
      if (cR) {
        const left = Math.max(0, rEnd - Date.now());
        cR.textContent = '⏳ 休息到点还有 ' + Math.floor(left / 60000) + ' 分 ' + S().pad2(Math.floor((left % 60000) / 1000)) + ' 秒';
      }
      return;
    }
    const p = day.activeHourPlan;
    if (p) {
      if (Date.now() >= hpEffectiveEndMs(p)) {
        const late = Date.now() - hpEffectiveEndMs(p);
        notifyNow('⏰ 这一段结束了', '回专注计划安排接下来：休息，还是接着学？');
        endHourPlan(late > 120000);   // 超过 2 分钟才发现 → 说明你当时没在这个页面
        return;
      } // 小休中到点同步冻结，不会误触发
    }
    const c = document.getElementById('hp-countdown');
    if (!c) return;
    const cur = day.activeHourPlan;
    if (cur) {
      if (smallRest) {
        c.textContent = '☕ 小休中 · 这一段的倒计时已暂停，休完接着算';
        return;
      }
      const left = Math.max(0, hpEffectiveEndMs(cur) - Date.now());
      c.textContent = '⏳ 到点还有 ' + Math.floor(left / 60000) + ' 分 ' + S().pad2(Math.floor((left % 60000) / 1000)) + ' 秒 · 到点自动结算（进行中的任务时间也一并算入）';
    }
  }
  // 📌 预定明天的某一段：提前定好几点到几点、三大类指标、奖励积分
  function bookTomorrowModal() {
    const today = S().getDay(S().todayKey());
    if (today.activeHourPlan || today.activeRest) { App.ui.toast('先把当前这段/休息处理完再预定明天'); return; }
    const tom = S().getDay(S().tomorrowKey());
    const dflt = (S().settings().hourPlanDefaultMin || 30);
    const req0 = Math.round(dflt * 0.5), ide0 = Math.round(dflt * 0.3), ext0 = Math.max(1, dflt - req0 - ide0);
    const modal = App.ui.openModal('📌 预定明天的时段', '' +
      '<p class="hint">提前给明天定一段（几点开始、多久、三类指标、奖励）。明天 1 键就能「用预定的第一段开始」，当场按此刻跑这一段的指标。</p>' +
      '<div class="field-row">' +
      '<div class="field"><label>明天几点开始</label><input type="time" id="bp-start" value="08:00" /></div>' +
      '<div class="field"><label>这一段多长（分钟）</label><input type="number" id="bp-dur" min="1" value="' + dflt + '" /></div>' +
      '</div>' +
      '<div class="field"><label>✅ 必须（分钟）</label><input type="number" id="bp-req" min="0" value="' + req0 + '" /></div>' +
      '<div class="field"><label>⭐ 理想（分钟）</label><input type="number" id="bp-ide" min="0" value="' + ide0 + '" /></div>' +
      '<div class="field"><label>🌱 拓展（分钟）</label><input type="number" id="bp-ext" min="0" value="' + ext0 + '" /></div>' +
      '<div class="field"><label>🎁 这段奖励积分（提前定）</label><input type="number" id="bp-pts" min="0" value="10" /></div>',
      '<button class="btn btn-primary" data-act="ok">📌 预定</button><button class="btn" data-act="cancel">取消</button>');
    App.ui.bindActions({
      ok: function () {
        const req = Math.max(0, +modal.querySelector('#bp-req').value || 0);
        const ide = Math.max(0, +modal.querySelector('#bp-ide').value || 0);
        const ext = Math.max(0, +modal.querySelector('#bp-ext').value || 0);
        if (!req && !ide && !ext) { App.ui.toast('至少给一类定分钟'); return; }
        const dur = Math.max(1, +modal.querySelector('#bp-dur').value || dflt);
        const pts = Math.max(0, +modal.querySelector('#bp-pts').value || 0);
        const tv = modal.querySelector('#bp-start').value || '08:00';
        tom.plannedHourPlans = tom.plannedHourPlans || [];
        tom.plannedHourPlans.push({ start: tv, dur: dur, req: req, ide: ide, ext: ext, pts: pts });
        S().save(); App.ui.closeModal(); App.tasks.renderToday(); App.tasks.renderTomorrow();
        App.ui.toast('📌 明天 ' + tv + ' 已预定一段：' + dur + ' 分（必' + req + '/理' + ide + '/拓' + ext + '）· 奖励 +' + pts + ' 分');
      },
      cancel: App.ui.closeModal
    });
  }
  // ▶ 用明天预定的第一段开始（现在就跑这一段的指标）
  function startFromPlanned() {
    const day = S().getDay(S().todayKey());
    const tom = S().getDay(S().tomorrowKey());
    const planned = tom.plannedHourPlans || [];
    if (!planned.length) { App.ui.toast('明天没有预定任何段'); return; }
    const p = planned.shift();
    day.activeHourPlan = {
      id: S().uid(), startAt: new Date().toISOString(),
      duration: p.dur, reward: p.pts, fromPlanned: true,
      targets: { required: p.req || 0, ideal: p.ide || 0, extra: p.ext || 0 }
    };
    tom.plannedHourPlans = planned;
    S().save(); App.tasks.renderToday();
    App.ui.toast('▶ 用明天预定的段开跑：' + p.dur + ' 分（必' + p.req + '/理' + p.ide + '/拓' + p.ext + '）· 奖励 +' + p.pts + ' 分');
  }
  // 渲染小时计划卡片（今天页顶部 #hour-card）
  function renderHourPlan(dayKey) {
    const box = document.getElementById('hour-card');
    if (!box) return;
    const day = S().getDay(dayKey);
    const rest = day.activeRest || null;
    if (rest) {
      const rEnd = new Date(rest.startAt).getTime() + (rest.duration || 30) * 60000;
      const rStartTxt = S().hhmmOf(new Date(rest.startAt).getHours() * 60 + new Date(rest.startAt).getMinutes());
      const rEndTxt = S().hhmmOf(new Date(rEnd).getHours() * 60 + new Date(rEnd).getMinutes());
      box.innerHTML = '<div class="hour-card active">' +
        '<h3 style="margin:0">☕ 休息中</h3>' +
        '<div style="font-size:12.5px;color:#8a919c;margin:2px 0 4px">' + rest.typeName + ' · 从 <b>' + rStartTxt + '</b> 到 <b>' + rEndTxt + '</b>（' + (rest.duration || 30) + ' 分钟）· 好好休息可得 <b>' + (rest.reward || 0) + '</b> 分</div>' +
        '<div id="hp-countdown" style="font-size:12px;color:#8a919c;margin:2px 0 6px"></div>' +
        '<div class="hp-actions"><button class="btn btn-small btn-primary" id="hp-endrest">⏭ 提前结束休息</button></div></div>';
      const e2 = box.querySelector('#hp-endrest');
      if (e2) e2.onclick = function () { endRest(); };
      return;
    }
    const plan = day.activeHourPlan || null;
    if (!plan) {
      const tp = (S().getDay(S().tomorrowKey()).plannedHourPlans || []);
      const plannedNote = tp.length
        ? '<p style="margin:2px 0 0;font-size:12.5px;color:#22a06b">📌 明天已预定 ' + tp.length + ' 段 → 点「▶ 用预定的第一段开始」现在就跑</p>'
        : '<p style="margin:2px 0 0;font-size:12.5px;color:#8a919c">给每一段定个学习指标，别让没有目标的时间悄悄溜走。</p>';
      box.innerHTML = '<div class="hour-card idle">' +
        '<div style="flex:1"><h3 style="margin:0">⏱ 小时计划</h3>' + plannedNote + '</div>' +
        '<div>' +
        '<button class="btn btn-primary btn-small" id="hp-start">🎯 开始这小时代</button>' +
        (tp.length ? '<button class="btn btn-small btn-primary" id="hp-planned" style="margin-left:6px">▶ 用预定的第一段开始</button>' : '') +
        '<button class="btn btn-small" id="hp-book" style="margin-left:6px">📌 预定明天的段</button>' +
        '<button class="btn btn-small" id="hp-export" style="margin-left:6px">📤 导出复盘给AI</button>' +
        '<button class="btn btn-small" id="hp-export-hour" style="margin-left:6px">📕 今日小时代复盘</button>' +
        '</div></div>';
      const b = box.querySelector('#hp-start');
      if (b) b.onclick = startHourPlanModal;
      const bb = box.querySelector('#hp-book');
      if (bb) bb.onclick = bookTomorrowModal;
      const bp = box.querySelector('#hp-planned');
      if (bp) bp.onclick = startFromPlanned;
      const eb = box.querySelector('#hp-export');
      if (eb) eb.onclick = function () { App.stats.exportReview(); };
      const eh = box.querySelector('#hp-export-hour');
      if (eh) eh.onclick = function () { App.stats.exportHourReviewToday(); };
      return;
    }
    const sum = hourPlanSummary(plan);
    const pct = sum.tTotal > 0 ? Math.min(100, Math.round(sum.aTotal / sum.tTotal * 100)) : 0;
    const met = sum.tTotal > 0 && sum.aTotal >= sum.tTotal;
    const liveNote = sum.liveMin > 0
      ? '<span style="font-size:11.5px;color:var(--muted)">（含进行中未结算 ' + (Math.round(sum.liveMin * 10) / 10) + ' 分）</span>' : '';
    const rows = HOUR_COLS.map(function (c) {
      const tg = sum.targets[c.k], ac = sum.actual[c.k];
      const pp = tg > 0 ? Math.min(100, Math.round(ac / tg * 100)) : 0;
      return '<div class="hp-row"><span class="hp-name">' + c.n + '</span>' +
        '<span class="hp-bar"><i style="width:' + pp + '%"></i></span>' +
        '<span class="hp-num">' + ac + '/' + tg + '分</span></div>';
    }).join('');
    var startMinTxt = '--';
    if (plan.startAt) { var d0 = new Date(plan.startAt); startMinTxt = S().hhmmOf(d0.getHours() * 60 + d0.getMinutes()); }
    var durTxt = plan.duration ? plan.duration + ' 分' : (sum.tTotal + ' 分（目标）');
    if (plan.restMs) durTxt += '（小休顺延 ' + Math.round(plan.restMs / 60000) + ' 分）';
    var endMinTxt = '--';
    if (plan.startAt && plan.duration) {
      var d1 = new Date(hpEffectiveEndMs(plan));
      endMinTxt = S().hhmmOf(d1.getHours() * 60 + d1.getMinutes());
    }
    box.innerHTML = '<div class="hour-card active">' +
      '<h3 style="margin:0">⏱ 当前小时计划</h3>' +
      '<div style="font-size:12.5px;color:#8a919c;margin:2px 0 4px">从 <b>' + startMinTxt + '</b> 开始 · 到 <b>' + endMinTxt + '</b> 到点（' + durTxt + '）· 目标合计 <b>' + sum.tTotal + '</b> 分</div>' +
      (plan.taskText ? '<div style="font-size:12.5px;color:#8a919c;margin:2px 0 4px">🔗 关联：' + S().esc(plan.taskText) + '</div>' : '') +
      '<div id="hp-countdown" style="font-size:12px;color:#8a919c;margin:2px 0 4px"></div>' +
      '<div style="font-size:12.5px;color:#8a919c;margin:2px 0 6px">已执行 <b style="color:' + (met ? '#22a06b' : '#3b82f6') + '">' + sum.aTotal + '</b> 分 · ' + (met ? '🎉 已达标！' : '达成率 ' + pct + '%') + liveNote + '</div>' +
      rows +
      '<div class="hp-actions"><button class="btn btn-small btn-primary" id="hp-end">⏹ 结束这小时代（结算）</button></div></div>';
    const e = box.querySelector('#hp-end');
    if (e) e.onclick = function () { endHourPlan(); };
  }

  /* 🎧 从任务进入听课三步（任务即课程；明天的任务也能开，时间记在今天） */
  /** 把「某一道题的重做安排」弹窗叫起来（弹窗 + 算法都在 calendar.js，这里只管找到那道题） */
  function repSubModal(listKey, taskId, subId, groupId, dayKey) {
    if (!App.calendar || !App.calendar.repeatSubModal) { App.ui.toast('重做安排暂时不可用'); return; }
    const key = dayKey || S().todayKey();
    const task = ((S().getDay(key).tasks[listKey]) || []).find(function (t) { return t.id === taskId; });
    if (!task) return;
    const sub = App.calendar.findSubById(task, groupId || null, subId);
    if (!sub) return;
    App.calendar.repeatSubModal(task, listKey, groupId || null, sub, key);
  }

  /** 从小任务（组里的题 / 单独小任务）开课：课程名=题目，听课预算=它的限时
      —— 任务组里的每一题、以及单独加的小任务，都能像整条任务一样走「预习→听课→整理」 */
  function startLectureFromSub(listKey, taskId, subId, groupId, fromTomorrow) {
    if (!App.lecture || !App.lecture.startFromSub) return;
    const day = S().getDay(fromTomorrow ? S().tomorrowKey() : S().todayKey());
    const task = day.tasks[listKey] && day.tasks[listKey].find(function (t) { return t.id === taskId; });
    if (!task) return;
    const f = findSubInTask(task, subId);
    if (!f || !f.sub) return;
    App.lecture.startFromSub(task, f.sub, groupId || (f.group && f.group.id) || null, fromTomorrow);
  }

  /** 听课三步走完 → 勾掉关联的小任务（时间轴/积分在听课时已记过，这里只打勾不重复算） */
  function finishSubByLecture(L) {
    if (!L || !L.subId) return '';
    let hit = null, hitTask = null, hitGroup = null, hitKey = '';
    [S().todayKey(), S().tomorrowKey()].forEach(function (k) {
      const d = S().getDay(k);
      ['required', 'ideal', 'extra'].forEach(function (col) {
        ((d.tasks && d.tasks[col]) || []).forEach(function (t) {
          const f = findSubInTask(t, L.subId);
          if (f && f.sub) { hit = f.sub; hitTask = t; hitGroup = f.group; hitKey = k; }
        });
      });
    });
    if (!hit || hit.done === true) return '';
    hit.done = true;
    hit.doneByLecture = true;
    S().save();
    // 🎯 听课走完把这一题勾掉了 → 顺带看整组是否全完成（全完成就发整组奖励）
    if (hitGroup) groupRewardCheck(hitTask, hitGroup, hitKey || S().todayKey());
    if (App.tasks && App.tasks.renderAll) App.tasks.renderAll();
    return hit.text;
  }

  function startLectureFromTask(listKey, taskId) {
    const todayDay = S().getDay(S().todayKey());
    const tomDay = S().getDay(S().tomorrowKey());
    let task = (todayDay.tasks[listKey] || []).filter(function (x) { return x.id === taskId; })[0];
    let fromTomorrow = false;
    if (!task) {
      task = (tomDay.tasks[listKey] || []).filter(function (x) { return x.id === taskId; })[0];
      fromTomorrow = !!task;
    }
    if (!task) { App.ui.toast('找不到这条任务'); return; }
    if (App.lecture && App.lecture.startFromTask) App.lecture.startFromTask(task, fromTomorrow);
  }
  function bindTodayEvents() {
    bindTaskAreaEvents(document.getElementById('task-columns'));
  }

  /** 🧲 v85：任务区域的统一事件委托 —— tasks 页三栏和队列页嵌入的当前条共用同一套 */
  function bindTaskAreaEvents(box) {
    // 单独定价：修改任务积分
    box.onchange = function (e) {
      const inp = e.target.closest('.task-points');
      if (!inp) return;
      const row = inp.closest('.task-row');
      if (!row) return;
      const day = S().getDay(S().todayKey());
      const task = day.tasks[row.dataset.list].find(function (t) { return t.id === row.dataset.id; });
      if (!task) return;
      task.points = Math.max(0, +inp.value || 0);
      S().save();
    };
    box.onclick = function (e) {
      const row = e.target.closest('.task-row');
      if (!row) {
        const actBtn = e.target.closest('[data-act]');
        if (!actBtn) return;
        const act2 = actBtn.dataset.act;
        if (act2 === 'quick-add') { quickAddModal(); return; }
        if (act2 === 'paste') { pasteTasksModal(S().todayKey()); return; }
        if (act2 === 'trash') { trashModal(); return; }
        if (act2 === 'export-img') { exportTasksImage(S().todayKey()); return; }
        const colEl = actBtn.closest('.task-col');
        const listKey = colEl ? colEl.dataset.col : null;
        if (!listKey) { App.ui.toast('无法识别任务栏'); return; }
        if (act2 === 'add') { addTaskModal(listKey, S().todayKey(), false); return; }
        if (act2 === 'sub-add') { addSubModal(listKey, actBtn.dataset.task, null, S().todayKey()); return; }
        if (act2 === 'sub-edit') { addSubModal(listKey, actBtn.dataset.task, actBtn.dataset.sub, S().todayKey()); return; }
        if (act2 === 'sub-del') { delSub(listKey, actBtn.dataset.task, actBtn.dataset.sub, S().todayKey()); return; }
        if (act2 === 'cd-start') { startCdTimer(listKey, actBtn.dataset.task, actBtn.dataset.sub); return; }
        if (act2 === 'sub-note') { editSubSummary(listKey, actBtn.dataset.task, actBtn.dataset.sub, S().todayKey()); return; }
        if (act2 === 'g-sub-note') { editSubSummary(listKey, actBtn.dataset.task, actBtn.dataset.sub, S().todayKey(), actBtn.dataset.group); return; }
        if (act2 === 'group-new') { addGroupModal(listKey, actBtn.dataset.task, S().todayKey()); return; }
        if (act2 === 'g-sub-add') { addSubModal(listKey, actBtn.dataset.task, null, S().todayKey(), actBtn.dataset.group); return; }
        if (act2 === 'g-sub-edit') { addSubModal(listKey, actBtn.dataset.task, actBtn.dataset.sub, S().todayKey(), actBtn.dataset.group); return; }
        if (act2 === 'g-sub-del') { delGroupSub(listKey, actBtn.dataset.task, actBtn.dataset.group, actBtn.dataset.sub, S().todayKey()); return; }
        if (act2 === 'g-cd-start') { startCdTimer(listKey, actBtn.dataset.task, actBtn.dataset.sub, actBtn.dataset.group); return; }
        if (act2 === 'sub-split') { openSplit(listKey, actBtn.dataset.task, actBtn.dataset.sub, null); return; }
        if (act2 === 'g-sub-split') { openSplit(listKey, actBtn.dataset.task, actBtn.dataset.sub, actBtn.dataset.group); return; }
        if (act2 === 'sub-lecture') { startLectureFromSub(listKey, actBtn.dataset.task, actBtn.dataset.sub, null, false); return; }
        if (act2 === 'g-sub-lecture') { startLectureFromSub(listKey, actBtn.dataset.task, actBtn.dataset.sub, actBtn.dataset.group, false); return; }
        if (act2 === 'sub-rep') { repSubModal(listKey, actBtn.dataset.task, actBtn.dataset.sub, null, S().todayKey()); return; }
        if (act2 === 'g-sub-rep') { repSubModal(listKey, actBtn.dataset.task, actBtn.dataset.sub, actBtn.dataset.group, S().todayKey()); return; }

        if (act2 === 'g-edit') { editGroupModal(listKey, actBtn.dataset.task, actBtn.dataset.group, S().todayKey()); return; }
        if (act2 === 'g-del') { delGroup(listKey, actBtn.dataset.task, actBtn.dataset.group, S().todayKey()); return; }
        return;
      }
      const listKey = row.dataset.list, taskId = row.dataset.id;
      const act = e.target.closest('[data-act]') && e.target.closest('[data-act]').dataset.act;
      // 🗑 v117：今天三栏任意一条都能直接删（先进回收站，可恢复；正在计时的不让删）
      if (act === 'del') {
        const dToday = S().getDay(S().todayKey());
        const listDel = (dToday.tasks[listKey] || []);
        const iDel = listDel.findIndex(function (t) { return t.id === taskId; });
        const tkDel = iDel >= 0 ? listDel[iDel] : null;
        if (!tkDel) { App.ui.toast('这条找不到了，刷新一下'); return; }
        if ((timer && timer.taskId === taskId) || (cdTimer && cdTimer.taskId === taskId)) {
          App.ui.toast('这条正在计时 —— 先在计时窗里结束它再删', 4400); return;
        }
        App.ui.confirm('删掉「' + S().esc(tkDel.text) + '」？<br>' +
          '<span class="hint">会先进任务页的 <b>🗑 回收站（误删恢复）</b>，删错了能找回来。</span>', '删除', function () {
          trashPush({ kind: 'task', dayKey: S().todayKey(), col: listKey, payload: JSON.parse(JSON.stringify(tkDel)) });
          listDel.splice(iDel, 1);
          S().save();
          App.ui.toast('🗑 删掉了 —— 想找回就去任务页的「🗑 回收站」');
          App.tasks.renderAll();
          try { if (App.queue && App.queue.render) App.queue.render(); } catch (e) { /* 忽略 */ }
          dropLectureIfDeleted(taskId, listKey, S().todayKey());
        });
        return;
      }
      if (act === 'sr-plan') { srPlanModal(srFindTask(taskId), listKey); return; }   // 🌱 v115
      if (act === 'lecture') { lecturePickModal(listKey, taskId, false); return; }
      if (act === 'memcards') {
        // 📅 v101：如果这条任务是"从卡片排过来的"，直接开那个合集（只翻那几张）
        const tk = ((S().getDay(S().todayKey()).tasks[listKey] || []).filter(function (t) { return t.id === taskId; })[0]) || null;
        if (tk && tk.mcRef && App.memcards.openRef && App.memcards.openRef(tk.mcRef)) return;
        // 🃏 v117：跟队列页/日历页同一个判断（别只是"不弹窗"了事 —— 要说清为什么）
        const w = mcWritable(tk);
        if (!w.ok) { App.ui.toast(w.why, 6600); return; }
        const el = row.querySelector('.task-text');
        App.memcards.openForTask({ id: taskId, text: el ? el.textContent.trim() : '设问卡' });
        return;
      }
      if (act === 'dup-merge') { dupMergeModal(S().todayKey(), listKey, taskId); return; }
      if (act === 'check') toggleTask(listKey, taskId);
      else if (act === 'edit') editTaskModal(listKey, taskId, S().todayKey(), false);
      else if (act === 'start') startTimer(listKey, taskId);
      else if (act === 'pause') togglePause();
      else if (act === 'stop') stopTimer();
    };
  }

  function renderTomorrow() {
    const dayKey = S().tomorrowKey();
    const day = S().getDay(dayKey);
    const box = document.getElementById('tomorrow-columns');
    document.getElementById('tomorrow-date').textContent = '📅 明天（提前填写）：' + S().fmtDateCN(dayKey);
    box.innerHTML = '<div class="day-toolbar">' +
      '<button class="btn btn-small" data-act="paste">📋 从其他天转移任务</button>' +
      '<button class="btn btn-small" data-act="export-img" title="把明天的任务清单导出成一张长图">🖼 导出长图</button>' +
      '<span class="day-toolbar-hint">别的日子（含今天没做完的）整批搬到这里；搬完按情况把做过的叉掉</span></div>' +
      COLS.map(function (col) {
      const list = day.tasks[col.key];
      const rows = list.map(function (t) {
        const pts = taskPoints(t, col.key);
        const ptsInput = pts != null
          ? '<span class="task-pts-wrap" title="完成此任务可得积分（每条可单独定价）">' +
            '<input type="number" class="task-points" data-act="points" min="0" value="' + pts + '" />' +
            '<span class="pts-unit">分</span></span>'
          : '';
        const lecPanel = (App.lecture && App.lecture.inlineHTML) ? App.lecture.inlineHTML(t) : '';
        return '<div class="task-row' + (lecPanel ? ' lec-running' : '') + '" data-list="' + col.key + '" data-id="' + t.id + '">' +
          '<span class="task-check" style="visibility:hidden">✓</span>' +
          '<span class="task-text" data-act="edit">' + S().esc(t.text) + '</span>' +
          carryTagHTML(t) +
          lecTagHTML(t) +
          ptsInput +
          '<button class="task-timer-btn task-lec-btn" data-act="lecture" title="🎧 听课三步（会记在今天的时间轴，走完勾掉这条明天的任务）">🎧</button>' +
          (((App.memcards && App.memcards.countForTask && App.memcards.countForTask(t.id)) || t.mcRef)
            ? '<button class="task-timer-btn" data-act="memcards" title="🃏 ' +
              (t.mcRef ? '这套卡排到明天复习的 —— 点开翻卡自测' : '这套设问卡：翻卡自测 / 补加') + '">🃏</button>' : '') +
          (findDupTask(S().tomorrowKey(), col.key, t)
            ? '<button class="task-timer-btn task-merge-btn" data-act="dup-merge" title="这一栏有两条同名的「' + S().esc(t.text) + '」，点这里合并成一条">🔗</button>'
            : '') +
          '<button class="task-timer-btn" data-act="edit" title="编辑">✎</button>' +
          '<button class="task-timer-btn" data-act="del" title="删除">🗑</button>' +
          '</div>' +
          lecPanel +
          subBlockHTML(t) +
          groupBlockHTML(t);
      }).join('');      return '<div class="task-col ' + col.style + '" data-col="' + col.key + '">' +
        '<div class="task-col-head"><h3>' + col.name + '</h3>' +
        '<span class="badge">' + list.length + ' 条</span></div>' +
        '<div class="task-col-head"><span class="desc">' + col.desc + '</span></div>' +
        rows +
        '<div class="extra-append"><button class="btn btn-small" data-act="add">＋ 添加任务</button></div>' +
        '</div>';
    }).join('');
    bindTomorrowEvents();
  }

  function bindTomorrowEvents() {
    const box = document.getElementById('tomorrow-columns');
    // 单独定价：修改任务积分（明天同样可定）
    box.onchange = function (e) {
      const inp = e.target.closest('.task-points');
      if (!inp) return;
      const row = inp.closest('.task-row');
      if (!row) return;
      const day = S().getDay(S().tomorrowKey());
      const task = day.tasks[row.dataset.list].find(function (t) { return t.id === row.dataset.id; });
      if (!task) return;
      task.points = Math.max(0, +inp.value || 0);
      S().save();
    };
    box.onclick = function (e) {
      const actBtn = e.target.closest('[data-act]');
      if (!actBtn) return;
      const act = actBtn.dataset.act;
      const row = e.target.closest('.task-row');
      const colEl = e.target.closest('.task-col');
      const listKey = colEl ? colEl.dataset.col : null;
      if (act === 'quick-add') { quickAddModal(); return; }   // ⚡ v126
      if (act === 'add') {
        if (!listKey) { App.ui.toast('无法识别任务栏'); return; }
        addTaskModal(listKey, S().tomorrowKey(), false);
        return;
      }
      if (act === 'sub-add' && listKey) { addSubModal(listKey, actBtn.dataset.task, null, S().tomorrowKey()); return; }
      if (act === 'sub-edit' && listKey) { addSubModal(listKey, actBtn.dataset.task, actBtn.dataset.sub, S().tomorrowKey()); return; }
      if (act === 'sub-del' && listKey) { delSub(listKey, actBtn.dataset.task, actBtn.dataset.sub, S().tomorrowKey()); return; }
      if (act === 'sr-plan' && listKey && row) {
        const tkSr = ((S().getDay(S().tomorrowKey()).tasks[listKey] || []).filter(function (t) { return t.id === row.dataset.id; })[0]) || null;
        if (tkSr) srPlanModal(tkSr, listKey);
        return;
      }
      if (act === 'lecture' && listKey && row) { lecturePickModal(listKey, row.dataset.id, true); return; }
      if (act === 'memcards' && row) {
        const tk2 = ((S().getDay(S().tomorrowKey()).tasks[listKey] || []).filter(function (t) { return t.id === row.dataset.id; })[0]) || null;
        if (tk2 && tk2.mcRef && App.memcards.openRef && App.memcards.openRef(tk2.mcRef)) return;
        const w2 = mcWritable(tk2);
        if (!w2.ok) { App.ui.toast(w2.why, 6600); return; }
        const el = row.querySelector('.task-text');
        App.memcards.openForTask({ id: row.dataset.id, text: el ? el.textContent.trim() : '设问卡' });
        return;
      }
      if (act === 'dup-merge' && listKey && row) { dupMergeModal(S().tomorrowKey(), listKey, row.dataset.id); return; }
      if (act === 'cd-start' && listKey) { App.ui.toast('明天的小任务，到了明天再开始倒计时哟'); return; }
      if (act === 'sub-note' && listKey) { editSubSummary(listKey, actBtn.dataset.task, actBtn.dataset.sub, S().tomorrowKey()); return; }
      if (act === 'g-sub-note' && listKey) { editSubSummary(listKey, actBtn.dataset.task, actBtn.dataset.sub, S().tomorrowKey(), actBtn.dataset.group); return; }
      if (act === 'group-new' && listKey) { addGroupModal(listKey, actBtn.dataset.task, S().tomorrowKey()); return; }
      if (act === 'g-sub-add' && listKey) { addSubModal(listKey, actBtn.dataset.task, null, S().tomorrowKey(), actBtn.dataset.group); return; }
      if (act === 'g-sub-edit' && listKey) { addSubModal(listKey, actBtn.dataset.task, actBtn.dataset.sub, S().tomorrowKey(), actBtn.dataset.group); return; }
      if (act === 'g-sub-del' && listKey) { delGroupSub(listKey, actBtn.dataset.task, actBtn.dataset.group, actBtn.dataset.sub, S().tomorrowKey()); return; }
      if (act === 'g-edit' && listKey) { editGroupModal(listKey, actBtn.dataset.task, actBtn.dataset.group, S().tomorrowKey()); return; }
      if (act === 'g-del' && listKey) { delGroup(listKey, actBtn.dataset.task, actBtn.dataset.group, S().tomorrowKey()); return; }
      if (act === 'g-cd-start') { App.ui.toast('明天的小任务，到了明天再开始倒计时哟'); return; }
      if (act === 'sub-lecture' && listKey) { startLectureFromSub(listKey, actBtn.dataset.task, actBtn.dataset.sub, null, true); return; }
      if (act === 'g-sub-lecture' && listKey) { startLectureFromSub(listKey, actBtn.dataset.task, actBtn.dataset.sub, actBtn.dataset.group, true); return; }
      if (act === 'sub-rep' && listKey) { repSubModal(listKey, actBtn.dataset.task, actBtn.dataset.sub, null, S().tomorrowKey()); return; }
      if (act === 'g-sub-rep' && listKey) { repSubModal(listKey, actBtn.dataset.task, actBtn.dataset.sub, actBtn.dataset.group, S().tomorrowKey()); return; }
      if (act === 'paste') { pasteTasksModal(S().tomorrowKey()); return; }
      if (act === 'sub-split') { App.ui.toast('明天的小任务，到了明天再用 🧭 拆解吧'); return; }
      if (act === 'g-sub-split') { App.ui.toast('明天的小任务，到了明天再用 🧭 拆解吧'); return; }
      if (act === 'g-claim') { return; }
      if (!row) return;
      const taskId = row.dataset.id;
      if (act === 'edit') editTaskModal(listKey, taskId, S().tomorrowKey(), false);
      else if (act === 'del') {
        App.ui.confirm('删除这条任务？（先进回收站，可恢复）', '删除', function () {
          const list = S().getDay(S().tomorrowKey()).tasks[listKey];
          const idx = list.findIndex(function (t) { return t.id === taskId; });
          if (idx >= 0) { trashPush({ kind: 'task', dayKey: S().tomorrowKey(), col: listKey, payload: JSON.parse(JSON.stringify(list[idx])) }); list.splice(idx, 1); S().save(); }
          App.ui.toast('已删除 · 可到回收站恢复');
          App.tasks.renderAll();
          dropLectureIfDeleted(taskId, null, null);
        });
      }
    };
  }

  /* ---------- 🎧 听课任务：加任务时就把这一课的时间定好 ----------
     以前只能等开课时再现场配预算（容易偷懒、也浪费时间）。
     现在加/改任务时就能勾「这是听课任务」，并把 预习/听课/整理/大奖分 先填好；
     任务行上会显示 🎓 合计分钟，排计划时一眼知道这节课大概要多久。
     存成 task.lecPlan = { previewMin, attendMin, consMin, pts } */
  const LEC_DEF = { previewMin: 30, attendMin: 45, consMin: 30, pts: 15 };

  /** 默认预算：优先用「上次开课用的那套」，跟听课模块保持一致 */
  function lecBudgetDefaults() {
    const f = (App.lecture && App.lecture.budgetDefaults) ? App.lecture.budgetDefaults() : null;
    return {
      previewMin: (f && f.previewMin) || LEC_DEF.previewMin,
      attendMin: (f && f.attendMin) || LEC_DEF.attendMin,
      consMin: (f && f.consMin) || LEC_DEF.consMin,
      pts: (f && f.pts != null) ? f.pts : LEC_DEF.pts
    };
  }

  /** 这条任务提前定好的听课预算（v41 时代只存了 lecMin 的老数据也认） */
  function lecPlanOf(task) {
    if (!task) return null;
    if (task.lecPlan) {
      const p = task.lecPlan;
      return {
        previewMin: Math.max(1, +p.previewMin || LEC_DEF.previewMin),
        attendMin: Math.max(1, +p.attendMin || LEC_DEF.attendMin),
        consMin: Math.max(1, +p.consMin || LEC_DEF.consMin),
        pts: Math.max(0, p.pts != null ? +p.pts : LEC_DEF.pts)
      };
    }
    if (task.lecMin) {          // 老字段：只记了「听课」多少分钟
      const m = Math.max(1, +task.lecMin || 0);
      return {
        previewMin: Math.min(LEC_DEF.previewMin, m),
        attendMin: m,
        consMin: Math.min(LEC_DEF.consMin, m),
        pts: task.points != null ? task.points : LEC_DEF.pts
      };
    }
    return null;
  }

  function lecTotalMin(p) { return p ? (p.previewMin + p.attendMin + p.consMin) : 0; }

  /** 任务行上的 🎓 徽标（只有提前定好听课时间的任务才显示） */
  function lecTagHTML(task) {
    const p = lecPlanOf(task);
    if (!p) return '';
    return '<span class="lec-tag" title="🎧 听课任务：预习 ' + p.previewMin + ' 分 + 听课 ' + p.attendMin +
      ' 分 + 整理 ' + p.consMin + ' 分 ＝ 约 ' + lecTotalMin(p) + ' 分钟' +
      (p.pts ? ' · 三步走完大奖 ' + p.pts + ' 分' : '') + '（开课时直接用这套，面板上还能临时改）">🎓 ' +
      lecTotalMin(p) + '分</span>';
  }

  /** 弹窗里的「这是听课任务」那块（prefix = 'add' / 'edit'） */
  function lecPlanFieldsHTML(prefix, plan, on) {
    const d = plan || lecBudgetDefaults();
    // 一项一格（弹窗里的 input 有全局 width:100%，直接排会竖成一列）
    const item = function (label, id, v, min) {
      return '<span class="lec-plan-item"><span class="lec-plan-l">' + label + '</span>' +
        '<input type="number" class="lec-num" id="' + id + '" min="' + min + '" value="' + v + '" />' +
        '<span class="lec-plan-u">分</span></span>';
    };
    return '<div class="lec-plan">' +
      '<label class="lec-plan-opt"><input type="checkbox" id="' + prefix + '-lec-on"' + (on ? ' checked' : '') + ' />' +
      '<span>🎧 <b>这是听课任务</b> —— 提前定好这一课的时间，排计划时就知道大概要花多久</span></label>' +
      '<div class="lec-plan-box"' + (on ? '' : ' hidden') + ' id="' + prefix + '-lec-box">' +
        '<div class="lec-plan-row">' +
          item('预习', prefix + '-lec-pre', d.previewMin, 1) +
          item('听课', prefix + '-lec-att', d.attendMin, 1) +
          item('整理', prefix + '-lec-cons', d.consMin, 1) +
          item('大奖分', prefix + '-lec-pts', d.pts, 0) +
        '</div>' +
        '<p class="lec-plan-sum" id="' + prefix + '-lec-sum"></p>' +
        '<p class="lec-plan-hint">流程：预习 → 听课 → 整理，三步走完发大奖。开课时直接用这里的数字，面板上还能临时改。</p>' +
      '</div></div>';
  }

  /** 勾选展开 + 实时算「这一课预计多久」 */
  function bindLecPlanFields(modal, prefix) {
    const on = modal.querySelector('#' + prefix + '-lec-on');
    const box = modal.querySelector('#' + prefix + '-lec-box');
    const sum = modal.querySelector('#' + prefix + '-lec-sum');
    const g = function (id) { const el = modal.querySelector('#' + prefix + id); return el ? Math.max(0, +el.value || 0) : 0; };
    const refresh = function () {
      if (!sum) return;
      const a = g('-lec-pre'), b = g('-lec-att'), c = g('-lec-cons'), t = g('-lec-pts');
      sum.innerHTML = '这一课预计 <b>' + (a + b + c) + ' 分钟</b>（预习 ' + a + ' · 听课 ' + b + ' · 整理 ' + c + '）' +
        (t ? '<br>三步走完大奖 <b>' + t + ' 分</b>' : '');
    };
    if (on && box) on.onchange = function () { box.hidden = !on.checked; refresh(); };
    Array.prototype.slice.call(modal.querySelectorAll('.lec-num')).forEach(function (el) {
      if (el.id.indexOf(prefix + '-lec-') === 0) el.oninput = refresh;
    });
    refresh();
  }

  /** 读弹窗里的听课预算；没勾就返回 null */
  function readLecPlan(modal, prefix) {
    const on = modal.querySelector('#' + prefix + '-lec-on');
    if (!on || !on.checked) return null;
    const g = function (id, def, min) {
      const el = modal.querySelector('#' + prefix + id);
      const v = el ? +el.value : def;
      return Math.max(min, isFinite(v) ? v : def);
    };
    return {
      previewMin: g('-lec-pre', LEC_DEF.previewMin, 1),
      attendMin: g('-lec-att', LEC_DEF.attendMin, 1),
      consMin: g('-lec-cons', LEC_DEF.consMin, 1),
      pts: g('-lec-pts', LEC_DEF.pts, 0)
    };
  }

  /* ---------- 添加 / 编辑任务弹窗 ---------- */
  function addTaskModal(listKey, dayKey, isTodayExtra) {
    const day = S().getDay(dayKey);
    const names = { required: '必须完成任务', ideal: '理想任务', extra: '长期拓展任务' };
    const defPts = taskPoints({}, listKey); // 默认积分（设置/内置兜底）
    const ptsField = defPts != null
      ? '<div class="field"><label>每条完成可得积分（可稍后在任务后面逐条修改）</label>' +
        '<input type="number" id="add-points" min="0" value="' + defPts + '" /></div>'
      : '';
    const modal = App.ui.openModal('＋ 添加' + names[listKey], '' +
      '<div class="field"><label>任务内容（支持多行，一行一条）</label>' +
      '<textarea id="add-text" placeholder=""></textarea></div>' +
      ptsField +
      // v93：不再让用户选「推进类型」（都按主线推进计，计入有效学习）—— 列表用法下这一栏没有意义
      '<div class="field"><label>🌱 知识类型（决定要不要按遗忘曲线复习）</label>' +
      '<select id="add-mode" class="select-small">' +
      '<option value="">普通任务（不排复习）</option>' +
      '<option value="new">📘 新知识 —— 完成时引导你设知识点，并排当天 3 轮复习</option>' +
      '<option value="review">🔄 复习知识 —— 只是标记，方便统计今天复习了多少</option>' +
      '</select></div>' +
      slotHintHTML() +
      lecPlanFieldsHTML('add', null, false) +
            '<button class="btn btn-primary" data-act="ok">添加</button><button class="btn" data-act="cancel">取消</button>');
    bindLecPlanFields(modal, 'add');
    const ta = modal.querySelector('#add-text');
    ta.focus();
    App.ui.bindActions({
      ok: function () {
        const lines = ta.value.split(/\n+/).map(function (s) { return s.trim(); }).filter(Boolean);
        if (!lines.length) { App.ui.toast('请至少输入一条任务'); return; }
        const ptsInput = modal.querySelector('#add-points');
        const pts = ptsInput ? Math.max(0, +ptsInput.value || 0) : null;
        const kv = 'main';   // v93：推进类型不再让用户选
        const modeEl = modal.querySelector('#add-mode');
        const modeV = modeEl ? modeEl.value : '';
        const plan = readLecPlan(modal, 'add');
        lines.forEach(function (text) {
          const t = { id: S().uid(), text: text, aux: kv === 'aux', long: kv === 'long' };
          if (modeV) t.mode = modeV;
          if (pts != null) t.points = pts;
          if (plan) t.lecPlan = { previewMin: plan.previewMin, attendMin: plan.attendMin, consMin: plan.consMin, pts: plan.pts };
          day.tasks[listKey].push(t);
        });
        S().save();
        App.ui.closeModal();
        App.ui.toast('已添加 ' + lines.length + ' 条任务' +
          (plan ? ' · 已设为听课任务（这一课约 ' + lecTotalMin(plan) + ' 分钟）' : ''));
        App.tasks.renderAll();
      },
      cancel: App.ui.closeModal
    });
  }

  function editTaskModal(listKey, taskId, dayKey) {
    const day = S().getDay(dayKey);
    const task = day.tasks[listKey].find(function (t) { return t.id === taskId; });
    if (!task) return;
    const ptsField = taskPoints(task, listKey) != null
      ? '<div class="field"><label>完成可得积分（单独定价）</label>' +
        '<input type="number" id="edit-points" min="0" value="' + taskPoints(task, listKey) + '" /></div>'
      : '';
    const modal = App.ui.openModal('✎ 编辑任务', '' +
      '<div class="field"><label>任务内容</label>' +
      '<textarea id="edit-text">' + S().esc(task.text) + '</textarea></div>' +
      ptsField +
      '<div class="field-row">' +
      // v93：去掉「任务分类（可移到别栏）」—— 用队列/列表的人不需要在弹窗里搬栏
      '<div class="field"><label>🌱 知识类型</label>' +
      '<select id="edit-mode" class="select-small">' +
      '<option value=""' + (!task.mode ? ' selected' : '') + '>普通任务（不排复习）</option>' +
      '<option value="new"' + (task.mode === 'new' ? ' selected' : '') + '>📘 新知识（排当天 3 轮复习）</option>' +
      '<option value="review"' + (task.mode === 'review' ? ' selected' : '') + '>🔄 复习知识（只作标记）</option>' +
      '</select></div>' +
      '</div>' +
      slotHintHTML() +
      lecPlanFieldsHTML('edit', lecPlanOf(task), !!lecPlanOf(task)) +
      '<button class="btn btn-primary" data-act="save">保存</button>' +
      '<button class="btn btn-danger" data-act="del">删除任务</button>' +
      '<button class="btn" data-act="cancel">取消</button>');
    bindLecPlanFields(modal, 'edit');
    const ta = modal.querySelector('#edit-text');
    ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length);
    App.ui.bindActions({
      save: function () {
        const text = ta.value.trim();
        if (!text) { App.ui.toast('内容不能为空'); return; }
        task.text = text;
        const ptsInput = modal.querySelector('#edit-points');
        if (ptsInput) task.points = Math.max(0, +ptsInput.value || 0);
        const modeEl2 = modal.querySelector('#edit-mode');
        if (modeEl2) {
          const mv = modeEl2.value;
          if (mv) task.mode = mv; else delete task.mode;
        }
        // v93：推进类型不再让用户选（保留原来的 aux/long 不动作）
        // 🎧 听课预设：勾了就存下来，取消勾选就把预设删掉（回到"开课时再配"）
        if (modal.querySelector('#edit-lec-on')) {
          const plan = readLecPlan(modal, 'edit');
          if (plan) task.lecPlan = plan;
          else { delete task.lecPlan; delete task.lecMin; }
        }
        const listEl = modal.querySelector('#edit-list');
        if (listEl && listEl.value !== listKey) {
          const from = day.tasks[listKey];
          const idx = from.findIndex(function (t) { return t.id === taskId; });
          if (idx >= 0) {
            from.splice(idx, 1);
            if (!day.tasks[listEl.value]) day.tasks[listEl.value] = [];
            day.tasks[listEl.value].push(task);
          }
        }
        S().save();
        App.ui.closeModal();
        App.tasks.renderAll();
      },
      del: function () {
        App.ui.confirm('删除这条任务？（先进回收站，可恢复）', '删除', function () {
          trashPush({ kind: 'task', dayKey: dayKey, col: listKey, payload: JSON.parse(JSON.stringify(task)) });
          const idx = day.tasks[listKey].findIndex(function (t) { return t.id === taskId; });
          if (idx >= 0) { day.tasks[listKey].splice(idx, 1); S().save(); }
          App.ui.toast('已删除 · 可到回收站恢复');
          App.ui.closeModal();
          App.tasks.renderAll();
          dropLectureIfDeleted(taskId, null, null);
        });
      },
      cancel: App.ui.closeModal
    });
  }

  /* ---------- 从往日粘贴任务（整批复制，含小题/任务组，再叉掉已做） ---------- */
  function deepCloneTask(t) {
    const c = JSON.parse(JSON.stringify(t));
    c.id = S().uid();
    // 粘贴的是"一天一开始"的任务：恢复为未完成状态，不带旧日的完成记录/拆解过程
    c.done = false;
    delete c.summary;
    // ⚠️ v74：这些是「跨天搬运」的标记，粘到新的一天就不再成立了（否则新任务顶着「昨天没做完」）
    delete c.rolled; delete c.carried; delete c.carriedFailed; delete c.movedOut;
    if (c.subs) c.subs = c.subs.map(function (x) {
      x.id = S().uid();
      // ⚠️ 必须 null：false 在界面上是「✗未完成」（红的），null 才是「还没做过」（初始状态）
      x.done = null;
      delete x.summary;
      delete x.splitlog;
      if (x.sessions) x.sessions = [];
      return x;
    });
    if (c.groups) c.groups = c.groups.map(function (g) {
      g.id = S().uid();
      if (g.subs) g.subs = g.subs.map(function (x) {
        x.id = S().uid();
        x.done = null;               // 同上：新的一天是全新的一题，别带旧的对错
        delete x.summary;
        delete x.splitlog;
        if (x.sessions) x.sessions = [];
        return x;
      });
      return g;
    });
    return c;
  }
  /* ---------- 📋 从别的日子把任务搬过来 ----------
     默认「只带没做完的题」；每条能展开看明细、逐题勾选、还能改分类栏；
     转过来的一律是初始状态（deepCloneTask 已把 done 清成 null） */
  function pasteTasksModal(targetDayKey) {
    const data = S().data();
    const target = S().getDay(targetDayKey);
    const todayK = S().todayKey(), tomorrowK = S().tomorrowKey();
    // ★ v69：源日期只列「今天及以前」+「真的有任务可搬」的日子。
    //   用户明确反馈：还没到的日子不该出现在「搬过来」的列表里 ——
    //   「为什么要把后面一天的任务搞到前面一天来做？」
    const allDays = Object.keys(data.days || {}).filter(function (k) { return k !== targetDayKey; }).sort();
    const hasTasks = function (k) {
      const d = data.days[k];
      if (!d || !d.tasks) return false;
      return COLS.some(function (c) {
        return ((d.tasks[c.key]) || []).some(function (t) { return t.text; });
      });
    };
    // 明天不算「多余记录」（renderTomorrow 每天都会建），所以两处的口径都不含明天
    const futureHidden = allDays.filter(function (k) { return k > todayK && k !== tomorrowK; });
    const days = allDays.filter(function (k) { return k <= todayK && hasTasks(k); });
    if (!allDays.length) { App.ui.toast('还没有可转移的日子'); return; }
    if (!days.length) {
      App.ui.toast(futureHidden.length
        ? '只有还没到的日期，没有能往回搬的（未来的任务不用搬）'
        : '之前的日子里都没有可搬的任务');
      return;
    }
    const labelOf = function (k) {
      return k === todayK ? '今天' : (k === tomorrowK ? '明天' : S().shortDateCN(k));
    };
    const colOpts = function (curKey) {
      return COLS.map(function (c) {
        return '<option value="' + c.key + '"' + (c.key === curKey ? ' selected' : '') + '>' + c.name + '</option>';
      }).join('');
    };
    /** 一条任务里的所有题：统一成 [{g, i, sub, gname}]（g = -1 表示不在任务组里） */
    const subsOf = function (t) {
      const list = [];
      (t.groups || []).forEach(function (g, gi) {
        (g.subs || []).forEach(function (x, si) { list.push({ g: gi, i: si, sub: x, gname: g.name || '任务组' }); });
      });
      (t.subs || []).forEach(function (x, si) { list.push({ g: -1, i: si, sub: x, gname: '' }); });
      return list;
    };
    /** 这条默认带不带：有没做完的题就带；没题的话看任务本身 */
    const defaultTaskOn = function (t) {
      const ss = subsOf(t);
      if (!ss.length) return !t.done;
      return ss.some(function (x) { return x.sub.done !== true; });
    };

    const modal = App.ui.openModal('📋 从其他天转移任务',
      '<p style="font-size:12.5px;color:var(--muted);margin-bottom:8px">把别的日子搬到「' + labelOf(targetDayKey) +
      '」。<b>默认只带没做完的题</b>，搬过来的一律是<b>初始状态</b>（不带旧日的对错）。' +
      '点「▸ 展开」能看到这一条下面的每道题，可以逐题勾；右边的下拉能改分类栏（<b>拓展没做完的可以并进必须</b>）。</p>' +
      '<div class="field"><label>要搬哪一天</label><select id="paste-date">' +
      days.map(function (k) {
        const n = ((data.days[k].tasks || {}).required || []).length;
        return '<option value="' + k + '">' + S().fmtDateCN(k) + '（必须 ' + n + ' 条）</option>';
      }).join('') + '</select>' +
      (futureHidden.length
        ? '<p class="hint" style="margin-top:6px">已隐藏 ' + futureHidden.length + ' 个<b>还没到</b>的日期（' +
          futureHidden.slice(0, 3).map(function (k) { return S().shortDateCN(k); }).join('、') +
          (futureHidden.length > 3 ? ' 等' : '') +
          '）—— 未来的任务不会出现在这里，也不用往回搬。' +
          '<button class="btn btn-small" id="paste-clean-future" style="margin-left:6px">🧹 清理这些未来记录</button></p>'
        : '') +
      '<div class="paste-quick">' +
      '<button class="btn btn-small" data-q="undone">只带没做完的</button>' +
      '<button class="btn btn-small" data-q="all">全部都带</button>' +
      '<button class="btn btn-small" data-q="none">全不选</button>' +
      '<span class="paste-quick-hint">勾了任务=它下面没做完的题一起带</span></div>' +
      '<div id="paste-list" style="max-height:46vh;overflow:auto;border:1px solid var(--line);border-radius:8px;padding:10px;margin-top:8px"></div>',
      '<button class="btn btn-primary" data-act="ok">📋 转移勾选内容</button><button class="btn" data-act="cancel">取消</button>');

    const srcDayOf = function () { return data.days[modal.querySelector('#paste-date').value]; };
    const taskByKey = function (key) {
      const p = key.split(':');
      const day = srcDayOf();
      return day ? (((day.tasks || {})[p[0]] || [])[+p[1]] || null) : null;
    };
    /** pick 值形如 col:idx:g2:3（组内第3题）或 col:idx:s:5（单独小任务第5个） */
    const pickInfo = function (key, pv) {
      const p = pv.split(':');
      const t = taskByKey(key);
      if (!t) return null;
      const tag = p[2], ii = +p[3];
      if (tag && tag.charAt(0) === 'g') {
        const g = (t.groups || [])[+tag.slice(1)];
        return g && g.subs && g.subs[ii] ? { g: +tag.slice(1), i: ii, sub: g.subs[ii] } : null;
      }
      return t.subs && t.subs[ii] ? { g: -1, i: ii, sub: t.subs[ii] } : null;
    };

    function renderPaste() {
      const box = modal.querySelector('#paste-list');
      const day = srcDayOf();
      if (!day) { box.innerHTML = '<p style="text-align:center;color:var(--muted)">这一天没有任务</p>'; return; }
      let html = '';
      COLS.forEach(function (col) {
        const list = ((day.tasks || {})[col.key] || []);
        if (!list.length) return;
        html += '<div class="paste-col"><div class="paste-col-h">' + col.name + '（' + list.length + '）</div>';
        list.forEach(function (t, idx) {
          const key = col.key + ':' + idx;
          const ss = subsOf(t);
          const undone = ss.filter(function (x) { return x.sub.done !== true; }).length;
          const badge = ss.length
            ? (undone ? '<span class="paste-badge undone">' + undone + ' 题没做完</span>'
                      : '<span class="paste-badge okk">都做完了</span>')
            : '<span class="paste-badge">无小题</span>';
          html += '<div class="paste-item" data-key="' + key + '">' +
            '<label class="paste-row"><input type="checkbox" data-check value="' + key + '"' +
            (defaultTaskOn(t) ? ' checked' : '') + ' /><span class="paste-name">' + S().esc(t.text) + '</span>' + badge + '</label>' +
            '<select class="paste-tcol" data-tcol="' + key + '" title="转移到哪个分类栏">' + colOpts(col.key) + '</select>' +
            (ss.length ? '<button class="btn btn-small paste-exp" data-exp="' + key + '">▸ 展开</button>' : '') +
            '</div>' +
            (ss.length ? '<div class="paste-detail" data-detail="' + key + '" hidden>' +
              ss.map(function (x) {
                const pk = key + ':' + (x.g >= 0 ? 'g' + x.g : 's') + ':' + x.i;
                const st = x.sub.done === true ? '<span class="paste-st done">✓ 已完成</span>'
                  : (x.sub.done === false ? '<span class="paste-st fail">✗ 未完成</span>'
                    : '<span class="paste-st">· 没做过</span>');
                return '<label class="paste-sub"><input type="checkbox" data-pick value="' + pk + '"' +
                  (x.sub.done !== true ? ' checked' : '') + ' />' +
                  (x.gname ? '<span class="paste-gtag">' + S().esc(x.gname) + '</span>' : '') +
                  S().esc(x.sub.text) + st + '</label>';
              }).join('') + '</div>' : '');
        });
        html += '</div>';
      });
      box.innerHTML = html || '<p style="text-align:center;color:var(--muted)">这一天没有任务</p>';
    }

    modal.querySelector('#paste-date').onchange = renderPaste;

    // v69：一键去清理「未来的记录」（提前安排的会单独标出、默认不动）
    const cleanF = modal.querySelector('#paste-clean-future');
    if (cleanF) cleanF.onclick = function () {
      App.ui.closeModal();
      setTimeout(function () { futureDaysModal(); }, 80);
    };

    // 快捷：只带没做完的 / 全部都带 / 全不选
    modal.querySelector('.paste-quick').onclick = function (e) {
      const b = e.target.closest('[data-q]');
      if (!b) return;
      const q = b.dataset.q;
      modal.querySelectorAll('.paste-item').forEach(function (it) {
        const key = it.dataset.key;
        const t = taskByKey(key);
        const chk = it.querySelector('[data-check]');
        const picks = modal.querySelectorAll('[data-detail="' + key + '"] [data-pick]');
        if (q === 'none') { chk.checked = false; picks.forEach(function (p) { p.checked = false; }); return; }
        if (q === 'all') { chk.checked = true; picks.forEach(function (p) { p.checked = true; }); return; }
        chk.checked = !!t && defaultTaskOn(t);
        picks.forEach(function (p) {
          const info2 = pickInfo(key, p.value);
          p.checked = !!info2 && info2.sub.done !== true;
        });
      });
    };

    // 展开 / 收起
    modal.querySelector('#paste-list').onclick = function (e) {
      const b = e.target.closest('[data-exp]');
      if (!b) return;
      const d = modal.querySelector('[data-detail="' + b.dataset.exp + '"]');
      if (!d) return;
      if (d.hasAttribute('hidden')) { d.removeAttribute('hidden'); b.textContent = '▾ 收起'; }
      else { d.setAttribute('hidden', ''); b.textContent = '▸ 展开'; }
    };
    // 勾任务 = 把它没做完的题一起勾上（取消 = 一起取消）
    modal.querySelector('#paste-list').onchange = function (e) {
      const chk = e.target.closest('[data-check]');
      if (!chk) return;
      const key = chk.dataset.key;
      modal.querySelectorAll('[data-detail="' + key + '"] [data-pick]').forEach(function (p) {
        const info3 = pickInfo(key, p.value);
        p.checked = chk.checked && !!info3 && info3.sub.done !== true;
      });
    };

    renderPaste();

    App.ui.bindActions({
      ok: function () {
        const its = modal.querySelectorAll('.paste-item');
        let n = 0, keptN = 0, mergedN = 0;
        its.forEach(function (it) {
          const key = it.dataset.key;
          const chk = it.querySelector('[data-check]');
          if (!chk || !chk.checked) return;
          const t = taskByKey(key);
          if (!t) return;
          const toCol = (it.querySelector('[data-tcol]') || {}).value || key.split(':')[0];
          const keepS = [], keepG = {};
          let hasDetail = false;
          modal.querySelectorAll('[data-detail="' + key + '"] [data-pick]').forEach(function (p) {
            hasDetail = true;
            if (!p.checked) return;
            const info4 = pickInfo(key, p.value);
            if (!info4) return;
            if (info4.g >= 0) { keepG[info4.g] = keepG[info4.g] || []; keepG[info4.g].push(info4.i); }
            else keepS.push(info4.i);
          });
          const c = deepCloneTask(t);        // 已完成状态/旧评语/旧拆解 都会被清掉
          if (hasDetail) {
            keptN += keepS.length + Object.keys(keepG).reduce(function (a, k) { return a + keepG[k].length; }, 0);
            if (c.subs) c.subs = c.subs.filter(function (x, ii) { return keepS.indexOf(ii) >= 0; });
            if (c.groups) {
              c.groups = c.groups.map(function (g, gi) {
                g.subs = (g.subs || []).filter(function (x, si) { return (keepG[gi] || []).indexOf(si) >= 0; });
                return g;
              }).filter(function (g) { return (g.subs || []).length > 0; });
            }
            if (c.subs && !c.subs.length) delete c.subs;
            if (c.groups && !c.groups.length) delete c.groups;
          }
          if (!target.tasks[toCol]) target.tasks[toCol] = [];
          // ★ v60 修根源：目标栏已有同名任务就并进去，不再新建（以前会戳出两条一模一样的任务）
          const dupT = target.tasks[toCol].find(function (t2) { return normName(t2.text) === normName(c.text); });
          if (dupT) { mergeTaskInto(dupT, c); mergedN++; }
          else target.tasks[toCol].push(c);
          n++;
        });
        if (!n) { App.ui.toast('先勾选要转移的任务'); return; }
        S().save();
        App.ui.closeModal();
        App.ui.toast('📋 已转移 ' + n + ' 条到「' + labelOf(targetDayKey) + '」' +
          (keptN ? '（带 ' + keptN + ' 道题）' : '') +
          (mergedN ? ' · 其中 ' + mergedN + ' 条并进了原有同名任务' : '') + ' · 都是初始状态', 3400);
        if (App.tasks && App.tasks.renderAll) App.tasks.renderAll();
        if (App.calendar && App.calendar.render) App.calendar.render();
      },
      cancel: App.ui.closeModal
    });
  }
  /* ---------- 回收站弹窗：误删的任务/小题/任务组可一键恢复 ---------- */
  function trashModal() {
    const trash = (S().data().trash = S().data().trash || []);
    const modal = App.ui.openModal('🗑 回收站（误删恢复）', '' +
      '<p style="font-size:12.5px;color:#8a919c;margin-bottom:10px">删除的任务 / 小题 / 任务组都会先进这里，点「♻ 恢复」放回原处；「彻底删除」才会真正清掉。</p>' +
      '<div id="trash-list" style="max-height:52vh;overflow:auto;border:1px solid #e5e8ec;border-radius:8px;padding:6px 10px"></div>',
      '<button class="btn" data-act="cancel">关闭</button>');
    const box = modal.querySelector('#trash-list');
    const colName = function (c) { return { required: '必须', ideal: '理想', extra: '拓展' }[c] || ''; };
    function render() {
      box.innerHTML = trash.length
        ? trash.slice().reverse().map(function (entry) {
            const kind = entry.kind === 'dailytask' ? '📌 基础任务'
              : (entry.kind === 'task' ? '任务' : entry.kind === 'group' ? '任务组' : '小题');
            const text = entry.payload && entry.payload.text ? S().esc(entry.payload.text) : (entry.payload && entry.payload.name ? S().esc(entry.payload.name) : '');
            const when = new Date(entry.at).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
            return '<div style="display:flex;align-items:center;gap:8px;padding:8px 4px;border-bottom:1px solid #eceff3;font-size:13px">' +
              '<span style="flex:1">[' + kind + ' · ' + colName(entry.col) + '] <b>' + text + '</b>' +
              '<div style="color:#8a919c;font-size:11.5px">' + S().fmtDateCN(entry.dayKey) + ' · 删于 ' + when + '</div></span>' +
              '<button class="btn btn-small btn-primary" data-trash-id="' + entry.id + '">♻ 恢复</button>' +
              '<button class="btn btn-small btn-danger" data-trash-del="' + entry.id + '">彻底删除</button></div>';
          }).join('')
        : '<p style="color:#8a919c;text-align:center;padding:18px 0">回收站是空的，以后删除都会有保险～</p>';
    }
    function restore(id) {
      const i = trash.findIndex(function (x) { return x.id === id; });
      if (i < 0) return;
      const entry = trash[i];
      // 🌙 v110：三种"非当日任务"的恢复（不然删了真找不回来）
      if (entry.src === 'daily') {
        const list = S().data().daily = S().data().daily || [];
        const p = JSON.parse(JSON.stringify(entry.payload));
        if (entry.kind === 'dailytask') {
          if (!p.pinnedDay) p.pinnedDay = entry.dayKey;
          list.push(p);
        } else {
          const target = list.filter(function (x) { return x.id === entry.ownerId; })[0];
          if (!target) { App.ui.toast('这条原来是挂在「' + (entry.ownerText || '某个基础任务') + '」下的，那条已经不在了 —— 先把它加回来再恢复', 5200); return; }
          if (entry.groupId) {
            const g = (target.groups || []).filter(function (x) { return x.id === entry.groupId; })[0];
            if (!g) { App.ui.toast('它原来那个任务组不在了，先把任务组建回来', 4600); return; }
            g.subs = g.subs || []; g.subs.push(p);
          } else { target.subs = target.subs || []; target.subs.push(p); }
        }
        trash.splice(i, 1);
        S().save();
        try { App.queue.render(); App.tasks.renderAll(); } catch (e) { /* 忽略 */ }
        render();
        App.ui.toast('♻ 已经恢复了：' + (p.text || p.name || ''));
        return;
      }
      if (entry.src === 'queue') {
        const q = S().data().queue = S().data().queue || [];
        const p = JSON.parse(JSON.stringify(entry.payload));
        const target = q.filter(function (x) { return x.id === entry.ownerId; })[0];
        if (!target) { App.ui.toast('这条原来是队列里「' + (entry.ownerText || '某条') + '」的明细，那一条已经不在了', 5200); return; }
        target.subs = target.subs || []; target.subs.push(p);
        trash.splice(i, 1);
        S().save();
        try { App.queue.render(); } catch (e) { /* 忽略 */ }
        render();
        App.ui.toast('♻ 已经恢复了：' + (p.text || p.name || ''));
        return;
      }
      const day = S().getDay(entry.dayKey);
      day.tasks[entry.col] = day.tasks[entry.col] || [];
      if (entry.kind === 'task') {
        day.tasks[entry.col].push(entry.payload);
      } else if (entry.kind === 'group') {
        const task = day.tasks[entry.col].find(function (t) { return t.id === entry.taskId; });
        if (task) { task.groups = task.groups || []; task.groups.push(entry.payload); }
      } else {
        const task = day.tasks[entry.col].find(function (t) { return t.id === entry.taskId; });
        if (task) {
          if (entry.groupId) {
            const g = (task.groups || []).find(function (x) { return x.id === entry.groupId; });
            if (g) { g.subs = g.subs || []; g.subs.push(entry.payload); }
          } else { task.subs = task.subs || []; task.subs.push(entry.payload); }
        }
      }
      trash.splice(i, 1);
      S().save();
      render();
      App.ui.toast('已恢复');
      App.tasks.renderAll();
    }
    box.onclick = function (e) {
      const r = e.target.closest('[data-trash-id]');
      const d = e.target.closest('[data-trash-del]');
      if (r) { restore(r.dataset.trashId); return; }
      if (d) {
        const i = trash.findIndex(function (x) { return x.id === d.dataset.trashDel; });
        if (i >= 0) { trash.splice(i, 1); S().save(); render(); }
      }
    };
    render();
    App.ui.bindActions({ cancel: App.ui.closeModal });
  }

  /* ---------- Tab 切换 ---------- */
  function switchTab(tab) {
    activeTab = tab;
    document.querySelectorAll('.tab-btn').forEach(function (b) {
      b.classList.toggle('active', b.dataset.tab === tab);
    });
    document.getElementById('tasks-today').classList.toggle('active', tab === 'today');
    document.getElementById('tasks-tomorrow').classList.toggle('active', tab === 'tomorrow');
  }

  /* ============================================================
   * 🖼 一键导出任务长图（v63）
   *   —— 零依赖：自己用 Canvas 画一张竖长图，直接发给别人看
   *   内容：日期 + 三栏（必须/理想/长期拓展）每条任务、完成状态、分值 + 汇总
   * ============================================================ */
  const IMG_COLS = [
    { key: 'required', name: '必须完成', color: '#d94854', bg: '#fdf2f3', dot: '#e2545d' },
    { key: 'ideal', name: '理想任务', color: '#c07d13', bg: '#fdf7ec', dot: '#e0a02c' },
    { key: 'extra', name: '长期拓展', color: '#1e8f60', bg: '#eefaf3', dot: '#22a06b' }
  ];
  const IMG_FONT = '"Microsoft YaHei", "PingFang SC", "Hiragino Sans GB", "Noto Sans CJK SC", system-ui, sans-serif';
  const IMG_W = 760;      // 逻辑宽度
  const IMG_PAD = 36;     // 页面左右留白
  const IMG_CPAD = 20;    // 卡片内留白
  const IMG_LINE = 27;    // 任务行高

  function imgRR(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  /** 按像素宽度折行（中文逐字折，够用） */
  function imgWrap(ctx, text, maxW) {
    const out = [];
    String(text == null ? '' : text).split('\n').forEach(function (para) {
      let cur = '';
      for (let i = 0; i < para.length; i++) {
        const c = para[i];
        if (cur && ctx.measureText(cur + c).width > maxW) { out.push(cur); cur = c; }
        else cur += c;
      }
      out.push(cur);
    });
    return out.length ? out : [''];
  }
  function imgStatus(t) {
    if (t.done === true) return { mark: '\u2713', color: '#22a06b' };
    if (t.done === false) return { mark: '\u2717', color: '#e2545d' };
    return { mark: '\u00b7', color: '#c2c9d2' };
  }

  /** 纯构建：返回画好的 canvas（测试可以直接拿它验尺寸/像素） */
  function buildTasksImage(dayKey) {
    const key = dayKey || S().todayKey();
    const day = S().getDay(key);

    const ruler = document.createElement('canvas').getContext('2d');
    const rf = function (spec) { ruler.font = spec; return ruler; };

    // 预排三栏：每条任务先算出高度（折几行）
    const cols = IMG_COLS.map(function (c) {
      const list = (day.tasks[c.key] || []).slice();
      const items = list.map(function (t) {
        const pts = taskPoints(t, c.key);
        const ptsTxt = pts != null ? '+' + pts + ' 分' : '';
        const maxTextW = IMG_W - IMG_PAD * 2 - IMG_CPAD * 2 - 30 - (ptsTxt ? 66 : 0);
        const lines = imgWrap(rf('15px ' + IMG_FONT), t.text, maxTextW);
        return { t: t, lines: lines, ptsTxt: ptsTxt, h: lines.length * IMG_LINE + 8 };
      });
      const doneN = list.filter(function (t) { return t.done; }).length;
      const bodyH = items.length
        ? items.reduce(function (a, it) { return a + it.h; }, 0) + 8
        : 34;
      return { def: c, list: list, items: items, doneN: doneN, h: 48 + bodyH + 8 };
    });

    // 总高：边距 + 标题 + 三栏 + 汇总 + 边距
    let H = 30 + 74 + 10;
    cols.forEach(function (c) { H += c.h + 16; });
    H += 104 + 26;

    const cv = document.createElement('canvas');
    const dpr = 2;
    cv.width = IMG_W * dpr;
    cv.height = Math.round(H) * dpr;
    const ctx = cv.getContext('2d');
    ctx.scale(dpr, dpr);

    // 白底
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, IMG_W, H);

    let y = 30;

    /* ---- 标题区 ---- */
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#1f2937';
    ctx.font = 'bold 27px ' + IMG_FONT;
    ctx.fillText(S().fmtDateCN(key), IMG_PAD, y + 26);

    // 右上角小标签
    ctx.font = '13px ' + IMG_FONT;
    const tagTxt = '\u{1F4DA} 专注计划';
    const tagW = ctx.measureText(tagTxt).width + 22;
    ctx.fillStyle = '#eef2f7';
    imgRR(ctx, IMG_W - IMG_PAD - tagW, y + 2, tagW, 28, 14);
    ctx.fill();
    ctx.fillStyle = '#5b6675';
    ctx.fillText(tagTxt, IMG_W - IMG_PAD - tagW + 11, y + 21);

    ctx.fillStyle = '#8a919c';
    ctx.font = '14px ' + IMG_FONT;
    const totalN = cols.reduce(function (a, c) { return a + c.list.length; }, 0);
    const totalDone = cols.reduce(function (a, c) { return a + c.doneN; }, 0);
    ctx.fillText('今日任务清单 · 共 ' + totalN + ' 条，已完成 ' + totalDone + ' 条', IMG_PAD, y + 54);
    y += 74 + 10;

    /* ---- 三栏 ---- */
    cols.forEach(function (c) {
      const cardX = IMG_PAD, cardW = IMG_W - IMG_PAD * 2;
      ctx.fillStyle = c.def.bg;
      imgRR(ctx, cardX, y, cardW, c.h, 16);
      ctx.fill();

      // 栏名 + 计数
      ctx.fillStyle = c.def.dot;
      ctx.beginPath();
      ctx.arc(cardX + IMG_CPAD + 5, y + 25, 5.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = c.def.color;
      ctx.font = 'bold 17px ' + IMG_FONT;
      ctx.fillText(c.def.name, cardX + IMG_CPAD + 19, y + 31);
      const nameW = ctx.measureText(c.def.name).width;
      ctx.font = 'bold 15px ' + IMG_FONT;
      ctx.fillText(c.doneN + '/' + c.list.length, cardX + IMG_CPAD + 19 + nameW + 12, y + 31);

      let iy = y + 48;
      if (!c.items.length) {
        ctx.fillStyle = '#a7aeb8';
        ctx.font = '14px ' + IMG_FONT;
        ctx.fillText('（这一类今天没有任务）', cardX + IMG_CPAD, iy + 18);
      }
      c.items.forEach(function (it) {
        const st = imgStatus(it.t);
        const tx = cardX + IMG_CPAD + 26;
        ctx.fillStyle = st.color;
        ctx.font = 'bold 17px ' + IMG_FONT;
        ctx.fillText(st.mark, cardX + IMG_CPAD, iy + 20);
        const grey = it.t.done === true;
        ctx.fillStyle = grey ? '#9aa1ab' : '#28313d';
        ctx.font = '15px ' + IMG_FONT;
        it.lines.forEach(function (ln, li) {
          ctx.fillText(ln, tx, iy + 20 + li * IMG_LINE);
        });
        if (grey) {   // 完成的划一道删除线
          ctx.strokeStyle = '#c8ced6';
          ctx.lineWidth = 1;
          it.lines.forEach(function (ln, li) {
            const w = ctx.measureText(ln).width;
            ctx.beginPath();
            ctx.moveTo(tx, iy + 15 + li * IMG_LINE);
            ctx.lineTo(tx + w, iy + 15 + li * IMG_LINE);
            ctx.stroke();
          });
        }
        if (it.ptsTxt) {   // 右侧分值
          ctx.fillStyle = grey ? '#b9bfc8' : '#6b7280';
          ctx.font = '14px ' + IMG_FONT;
          ctx.textAlign = 'right';
          ctx.fillText(it.ptsTxt, cardX + cardW - IMG_CPAD, iy + 20);
          ctx.textAlign = 'left';
        }
        iy += it.h;
      });
      y += c.h + 16;
    });

    /* ---- 底部汇总 ---- */
    const sumX = IMG_PAD, sumW = IMG_W - IMG_PAD * 2;
    ctx.fillStyle = '#f6f8fa';
    imgRR(ctx, sumX, y, sumW, 88, 16);
    ctx.fill();
    const focusMin = (day.sessions || []).reduce(function (a, x) { return a + (x.actualMinutes || 0); }, 0);
    const dayPts = S().ledger().filter(function (e) { return e.date === key; }).reduce(function (a, e) { return a + (e.points || 0); }, 0);
    ctx.fillStyle = '#374151';
    ctx.font = 'bold 15px ' + IMG_FONT;
    ctx.fillText(cols.map(function (c) { return c.def.name + ' ' + c.doneN + '/' + c.list.length; }).join('   \u00b7   '), sumX + IMG_CPAD, y + 32);
    ctx.fillStyle = '#6b7280';
    ctx.font = '14px ' + IMG_FONT;
    ctx.fillText('\u23F1 计时专注 ' + S().fmtDur(focusMin) + '   \u00b7   \u2B50 当日积分 ' + (dayPts >= 0 ? '+' : '') + dayPts + ' 分', sumX + IMG_CPAD, y + 56);
    ctx.fillStyle = '#aab1bb';
    ctx.font = '12px ' + IMG_FONT;
    ctx.textAlign = 'right';
    ctx.fillText('由「专注计划」生成 · ' + new Date().toLocaleString('zh-CN', { hour12: false }), sumX + sumW - IMG_CPAD, y + 74);
    ctx.textAlign = 'left';

    return cv;
  }

  /** 导出为 PNG 下载 */
  function exportTasksImage(dayKey) {
    const key = dayKey || S().todayKey();
    let cv;
    try {
      cv = buildTasksImage(key);
    } catch (e) {
      App.ui.toast('出图失败：' + (e && e.message ? e.message : e));
      return null;
    }
    try {
      cv.toBlob(function (blob) {
        if (!blob) { App.ui.toast('出图失败，浏览器没能生成图片'); return; }
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = '专注计划-' + key + '.png';
        document.body.appendChild(a);
        a.click();
        setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 3000);
        App.ui.toast('\u{1F5BC} 长图已导出（' + (cv.width / 2) + '×' + (cv.height / 2) + '），在「下载」里找它');
      }, 'image/png');
    } catch (e2) {
      App.ui.toast('出图失败：' + (e2 && e2.message ? e2.message : e2));
    }
    return cv;
  }

  /* ============================================================
   * 🧹 未来日期的记录：列表 + 清理（v63）
   *   为什么会有：日历里可以提前给未来某天安排任务；而"只是点到了那天"
   *   也会把那天实体化成一条空记录 → 它们不该出现在「按日记录 / 复盘」里
   * ============================================================ */
  function dayContentSummary(d) {
    if (!d) return [];
    const n = function (col) { return ((d.tasks && d.tasks[col]) || []).length; };
    const parts = [];
    if (n('required')) parts.push('必须 ' + n('required') + ' 条');
    if (n('ideal')) parts.push('理想 ' + n('ideal') + ' 条');
    if (n('extra')) parts.push('拓展 ' + n('extra') + ' 条');
    if ((d.timeline || []).length) parts.push('时间轴 ' + d.timeline.length);
    if ((d.sessions || []).length) parts.push('计时 ' + d.sessions.length);
    if ((d.hourPlans || []).length) parts.push('小时代 ' + d.hourPlans.length);
    if ((d.sports || []).length) parts.push('运动 ' + d.sports.length);
    if ((d.lectures || []).length) parts.push('听课 ' + d.lectures.length);
    if (d.review && d.review.text) parts.push('复盘');
    if (d.extDebt && !d.extDebt.settled) parts.push('拓展欠账');
    return parts;
  }

  function futureDaysModal() {
    const today = S().todayKey();
    const all = S().data().days;
    // ⚠️ 只从「后天」往后算：明天是页面每天都会正常创建的（明天页要用），不算幽灵记录
    const tomorrow = S().tomorrowKey();
    const keys = Object.keys(all).filter(function (k) { return k > tomorrow; }).sort();
    if (!keys.length) { App.ui.toast('很干净：后天以后没有任何日期的记录'); return; }

    const emptyKeys = keys.filter(function (k) { return dayContentSummary(all[k]).length === 0; });
    const rows = keys.map(function (k) {
      const parts = dayContentSummary(all[k]);
      const empty = !parts.length;
      return '<label style="display:flex;gap:8px;align-items:flex-start;padding:5px 0;font-size:13.5px;color:#374151">' +
        '<input type="checkbox" data-fday="' + k + '"' + (empty ? ' checked' : '') + ' style="margin-top:3px" /> ' +
        '<span>' + S().fmtDateCN(k) + ' \u2014 ' + (empty
          ? '<span style="color:#8a919c">空记录，没有任何内容（建议删）</span>'
          : '<span style="color:#b06a00">' + parts.join(' \u00b7 ') + '（提前安排的，确认不要才勾）</span>') + '</span></label>';
    }).join('');

    const modal = App.ui.openModal('\u{1F9F9} 未来日期的记录（共 ' + keys.length + ' 天）',
      '<p style="font-size:13px">这些是<b>还没到</b>的日期，却已经在数据里留了记录。</p>' +
      '<p style="font-size:13px">默认只勾了<b>完全空白</b>的那些（' + emptyKeys.length + ' 天）——删掉没有任何影响；' +
      '有内容的那些是你自己提前安排的任务，想留就留着（日历里能看到）。</p>' +
      '<div style="max-height:260px;overflow-y:auto;border:1px solid #e5e8ec;border-radius:8px;padding:6px 10px">' + rows + '</div>' +
      '<p class="hint">删除后这一天就彻底没了（任务/记录/复盘一起删），不能撤销。</p>',
      '<button class="btn" data-act="pick-empty">只勾空白项</button>' +
      '<button class="btn" data-act="pick-none">全不选</button>' +
      '<button class="btn btn-primary" data-act="ok">删除勾选的记录</button>' +
      '<button class="btn" data-act="cancel">取消</button>');

    App.ui.bindActions({
      'pick-empty': function () {
        modal.querySelectorAll('[data-fday]').forEach(function (c) {
          c.checked = dayContentSummary(S().data().days[c.dataset.fday]).length === 0;
        });
      },
      'pick-none': function () {
        modal.querySelectorAll('[data-fday]').forEach(function (c) { c.checked = false; });
      },
      ok: function () {
        const picked = [];
        modal.querySelectorAll('[data-fday]:checked').forEach(function (c) { picked.push(c.dataset.fday); });
        if (!picked.length) { App.ui.toast('一个都没勾，什么都没删'); return; }
        App.ui.confirm('确定删除这 ' + picked.length + ' 天的记录吗？不可恢复。', '删除', function () {
          const n = S().purgeDays(picked);
          App.ui.closeModal();
          App.ui.toast('\u{1F9F9} 已清理 ' + n + ' 天的记录');
          App.tasks.renderAll();
          if (App.stats && App.stats.render) App.stats.render();
          if (App.calendar && App.calendar.render) App.calendar.render();
        });
      },
      cancel: App.ui.closeModal
    });
  }

  /* ============================================================
   * 🌱 v70 主动回忆 + 间隔重复
   *   · 任务可标「📘 新知识」/「🔄 复习知识」
   *   · 新知识完成 → 引导设「知识点」（自己出题＝主动回忆）
   *   · 并按遗忘曲线在当天排 3 轮复习（默认 完成后 +30分 / +2时 / +6时）
   *   · 每轮复习独立计时、进时间轴、发积分
   * ============================================================ */
  const SR_GAPS_DEF = [30, 120, 360];
  /* ---------- 🌱 v115：复习计划（用户自定义） ----------
     用户：「支持用户为任意任务（新知识 / 旧知识）自行指定复习内容与时间节点，而不是由系统固定」
     · 三个间隔由用户填（1天 / 3小时 / 1周…），单位统一在内部换算成**分钟**
     · 第 2 轮 = 第 1 轮**真做完那一刻** + 间隔②，第 3 轮同理 → 自然跨天
     · 每天可重复 N 遍（perDay）：这一轮过够 N 遍才算完成
     · 截止时刻可以留空（= 不限时刻），留空就永远不会"今天排不满" */
  const SR_PLAN_DEF = { gaps: [1440, 4320, 10080], perDay: 1, dl: '' };   // 1天 / 3天 / 7天
  const SR_UNITS = [['星期', 10080], ['周', 10080], ['w', 10080],
                    ['天', 1440], ['日', 1440], ['d', 1440],
                    ['小时', 60], ['时', 60], ['h', 60],
                    ['分钟', 1], ['分', 1], ['m', 1]];

  /** 「1天」/「3小时」/「30分」/「1周」→ 分钟；纯数字=天（用户举例就是"一天/三天/一周"）；解析不了返回 null */
  function parseGap(str) {
    const s = String(str == null ? '' : str).trim().toLowerCase();
    if (!s) return null;
    const m = s.match(/^(\d+(?:\.\d+)?)\s*(星期|周|天|日|小时|时|分钟|分|w|d|h|m)?$/);
    if (!m) return null;
    const num = parseFloat(m[1]);
    if (!isFinite(num) || num <= 0) return null;
    const u = m[2] || '天';
    for (let i = 0; i < SR_UNITS.length; i++) if (SR_UNITS[i][0] === u) return Math.round(num * SR_UNITS[i][1]);
    return null;
  }
  function fmtGap(min) {
    const m = Math.max(1, Math.round(+min || 0));
    if (m % 10080 === 0) return (m / 10080) + '周';
    if (m % 1440 === 0) return (m / 1440) + '天';
    if (m % 60 === 0) return (m / 60) + '小时';
    return m + '分钟';
  }
  /** 这条任务的复习配置：任务自己的 srCfg → 设置里的模板 → 内置默认 */
  function srCfgOf(task) {
    const s = S().settings() || {};
    const tplGaps = (s.srPlanGaps && s.srPlanGaps.length) ? s.srPlanGaps : SR_PLAN_DEF.gaps;
    const tpl = {
      gaps: tplGaps.map(function (g) { return (typeof g === 'number') ? g : (parseGap(g) || 1440); }),
      perDay: Math.max(1, (s.srPerDay == null ? SR_PLAN_DEF.perDay : +s.srPerDay) || 1),
      dl: (s.srDeadline === undefined ? SR_PLAN_DEF.dl : s.srDeadline)
    };
    const t = (task && task.srCfg) ? task.srCfg : null;
    if (!t) return { gaps: tpl.gaps.slice(), perDay: tpl.perDay, dl: tpl.dl };
    const g = (t.gaps || []).map(function (x) { return (typeof x === 'number') ? x : parseGap(x); })
      .filter(function (x) { return x && x > 0; });
    return {
      gaps: g.length ? g : tpl.gaps.slice(),
      perDay: Math.max(1, +(t.perDay || 1)),
      dl: (t.dl === undefined ? tpl.dl : t.dl)
    };
  }
  /** 按配置生成 3 个轮次（链式：due(n+1) = due(n) + gap(n+1)；先给预估值，做完一轮会按实际时刻重排） */
  function srBuildPlan(cfg, fromMs, dayKey) {
    const gaps = (cfg && cfg.gaps && cfg.gaps.length) ? cfg.gaps : SR_PLAN_DEF.gaps;
    const perDay = Math.max(1, (cfg && cfg.perDay) || 1);
    let base = +fromMs || Date.now();
    const rounds = gaps.map(function (g, i) {
      base = base + g * 60000;
      return { n: i + 1, gap: g, due: base, done: null, at: null, need: perDay, hits: [] };
    });
    const dl = (cfg && cfg.dl) ? srClockMs(dayKey || S().todayKey(), cfg.dl) : 0;
    return { rounds: rounds, dl: dl };
  }
  /** 到点显示：今天 → 08:00；明天 → 明天 08:00；更远 → 9/26 08:00 */
  function srWhen(ms) {
    if (!ms) return '';
    const d = new Date(ms);
    const key = S().dateKey(d);
    const t = srHHMM(ms);
    if (key === S().todayKey()) return t;
    if (key === S().tomorrowKey()) return '明天 ' + t;
    return (d.getMonth() + 1) + '/' + d.getDate() + ' ' + t;
  }
  const SR_MODE_NEW = 'new', SR_MODE_REV = 'review';
  let srPendKp = null;       // 待弹「设知识点」
  let srPendShort = null;    // 待弹「今天排不满」
  let srRev = null;          // 正在进行的复习会话
  let srKpTmp = null;        // 设问编辑中的临时数据
  let srKpReturn = null;     // 从复习里跳去改知识点，改完要跳回来
  const srNotified = {};     // 已提醒过的轮次（内存态）
  let srBannerAt = 0;

  function srOn() { return S().settings().srEnabled !== false; }
  function srGaps() {
    const g = S().settings().srGaps;
    return (g && g.length) ? g : SR_GAPS_DEF;
  }
  function srDeadlineHM() { return S().settings().srDeadline || '22:00'; }
  function srPoints() { const v = S().settings().srPoints; return v == null ? 5 : Math.max(0, +v || 0); }
  function srKpPoints() { const v = S().settings().srKpPoints; return v == null ? 2 : Math.max(0, +v || 0); }
  function srFinishBonus() { const v = S().settings().srFinishBonus; return v == null ? 5 : Math.max(0, +v || 0); }
  /* ---------- ⏰ v71 学习时段：新知识时间 / 复习时间 ---------- */
  function slotOn() { return S().settings().slotOn !== false; }
  function slotHM(k) {
    const v = S().settings()[k];
    return /^\d{1,2}:\d{2}$/.test(String(v || '')) ? v : (k === 'slotNewEnd' ? '16:00' : '08:00');
  }
  function slotMin(hhmm) {
    const p = String(hhmm).split(':');
    return (parseInt(p[0], 10) || 0) * 60 + (parseInt(p[1], 10) || 0);
  }
  function slotRangeText() { return slotHM('slotNewStart') + ' – ' + slotHM('slotNewEnd'); }
  /** 现在处在哪一段？用「昨天 / 今天 / 明天」三个候选区间判，跨零点（如 22:00→06:00）也成立 */
  function slotState(nowMs) {
    const ms = (nowMs == null) ? Date.now() : nowMs;
    const a = slotMin(slotHM('slotNewStart')), b = slotMin(slotHM('slotNewEnd'));
    const d0 = new Date(ms); d0.setHours(0, 0, 0, 0);
    const D = d0.getTime(), DAY = 86400000;
    // 起止填成一样 → 没有「新知识时段」这一说，直接返回全天复习（spans 留空）
    const spans = (a === b) ? [] : [-1, 0, 1].map(function (k) {
      return { s: D + k * DAY + a * 60000, e: D + k * DAY + (b > a ? b : b + 1440) * 60000 };
    });
    let span = null, next = null;
    spans.forEach(function (x) {
      if (!span && ms >= x.s && ms < x.e) span = x;
      if (!next && x.s > ms) next = x;
    });
    return { inNew: !!span, span: span, nextStart: next ? next.s : null,
      untilEnd: span ? span.e : null, a: a, b: b, empty: a === b };
  }
  function slotDurText(ms) {
    const m = Math.max(0, Math.round(ms / 60000));
    if (m <= 0) return '不到 1 分钟';
    if (m < 60) return m + ' 分钟';
    const h = Math.floor(m / 60), r = m % 60;
    return r ? (h + ' 小时 ' + r + ' 分') : (h + ' 小时');
  }
  function slotWhenText(ms) {
    if (!ms) return '';
    const d0 = new Date(); d0.setHours(0, 0, 0, 0);
    const d1 = new Date(ms); d1.setHours(0, 0, 0, 0);
    const diff = Math.round((d1.getTime() - d0.getTime()) / 86400000);
    if (diff === 0) return srHHMM(ms);
    if (diff === 1) return '明天 ' + srHHMM(ms);
    if (diff === -1) return '昨天 ' + srHHMM(ms);
    return (d1.getMonth() + 1) + ' 月 ' + d1.getDate() + ' 日 ' + srHHMM(ms);
  }
  /** 今天「新知识」任务推进得怎么样（只读，不建日期） */
  function slotNewStats() {
    let total = 0, done = 0;
    const day = (S().peekDay ? S().peekDay(S().todayKey()) : null);
    if (day && day.tasks) COLS.forEach(function (c) {
      (day.tasks[c.key] || []).forEach(function (t) {
        if (t.mode === SR_MODE_NEW) { total++; if (t.done) done++; }
      });
    });
    return { total: total, done: done, left: total - done };
  }
  /** 首页顶部的时段条 */
  function renderSlotBar() {
    const bar = document.getElementById('slot-bar');
    if (!bar) return;
    if (!slotOn()) { bar.innerHTML = ''; return; }
    const st = slotState();
    if (st.empty) { bar.innerHTML = ''; return; }
    const L = slotNewStats();
    let cls, head, tail;
    if (st.inNew) {
      cls = 'slot-new';
      head = '📘 <b>新知识时间</b> · 到 <b>' + slotHM('slotNewEnd') + '</b> 结束，还有 <b>' +
        slotDurText(st.untilEnd - Date.now()) + '</b>';
      if (L.total === 0) tail = '这会儿适合开新的课 —— 复习也照做，到点上面会提醒你。';
      else if (L.left > 0) tail = '今天的新课 <b>' + L.done + '/' + L.total + '</b> —— 还剩 <b>' +
        L.left + '</b> 条，趁这段时间推（复习不受影响，随时能做）。';
      else tail = '今天的新课都推完了 👍 剩下交给复习、整理，或提前做拓展。';
    } else {
      cls = 'slot-rev';
      head = '🔄 <b>复习时间</b> · 新知识时间 <b>' + slotWhenText(st.nextStart) + '</b> 再开';
      if (L.left > 0) tail = '还有 <b>' + L.left + '</b> 条新课没推完 —— 留到明天开头学更牢，今晚把学过的过一遍就行。';
      else tail = '这会儿把时间交给复习 / 整理 / 做题 —— 新的课留到明天开头再开。';
    }
    bar.innerHTML = '<div class="slot-bar ' + cls + '">' +
      '<div class="slot-head">' + head + '</div>' +
      '<div class="slot-tail">' + tail + '</div>' +
      '</div>';
  }
  /** 添加 / 编辑任务弹窗里的一行提示（只提醒，不拦你） */
  function slotHintHTML() {
    if (!slotOn()) return '';
    const st = slotState();
    if (st.empty) return '';
    if (st.inNew) {
      return '<p class="hint slot-hint">📘 现在是<b>新知识时间</b>（到 ' + slotHM('slotNewEnd') +
        ' 结束）—— 适合开新的课；<b>复习也照做，不用等</b>。</p>';
    }
    return '<p class="hint slot-hint">🔄 现在是<b>复习时间</b>（新知识时间 ' + slotRangeText() +
      '，下一次 ' + slotWhenText(st.nextStart) + '）—— 新的课建议留到那时候再开，这句只是提醒你一下。</p>';
  }

  function srHHMM(ms) {
    const d = new Date(ms);
    return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  }
  function srClockMs(dayKey, hhmm) {
    const p = String(hhmm || '22:00').split(':');
    const d = S().keyToDate(dayKey);
    d.setHours(+p[0] || 0, +p[1] || 0, 0, 0);
    return d.getTime();
  }
  function srPlan(task) { return (task && task.sp && task.sp.planned) || []; }
  function srPendingOf(task) {
    return srPlan(task).filter(function (r) { return r.done === null; });
  }

  /** 🌱 v112：**复习计划可能挂在三种对象上** —— 这是本轮修的真 bug。
   *  以前「待复习条 / 找任务 / 开始复习」都只翻**今天任务页**那几条（day.tasks），
   *  可是队列完成一条任务时，`onTaskDone` 会把任务页那份**副本收走**（dropCopy），
   *  而 `syncBack` 早把 `sp`（3 轮复习计划）同步到**队列项**上了 →
   *  计划跟着「已完成」里那条躺着，复习系统却永远看不见它：
   *  用户原话「它（toast）有显示，但是为什么我去看的时候又没有？」。
   *  所以统一从三个地方收集：今天任务页的 + 队列里 / 已完成里带计划的。
   *  （只看"今天相关"的：已完成里只认今天做完的，别把上个月的旧计划翻出来。） */
  function srCarriers() {
    const out = [];
    const seen = {};
    const dayKey = S().todayKey();
    const push = function (t, listKey, src) {
      if (!t || seen[t.id]) return;
      if (!srPlan(t).length) return;      // 没排过复习的不管
      seen[t.id] = 1;
      out.push({ t: t, listKey: listKey, src: src });
    };
    // 🌱 v115：复习计划会**跨天** —— 轮次挂在"当初那条任务"上，所以得往前翻几天找它
    const days = (S().data() || {}).days || {};
    const fromD = new Date(); fromD.setDate(fromD.getDate() - 30);
    const fromKey = S().dateKey(fromD);
    Object.keys(days).sort().forEach(function (k) {
      if (k < fromKey || k > dayKey) return;
      const day = days[k];
      if (!day || !day.tasks) return;
      COLS.forEach(function (c) {
        (day.tasks[c.key] || []).forEach(function (t) { push(t, c.key, 'day'); });
      });
    });
    const d = S().data() || {};
    const take = function (list, src) {
      (list || []).forEach(function (it) {
        if (src === 'qd' && it.doneDay && it.doneDay !== dayKey) return;   // 已完成只看今天的
        push(it, null, src);
      });
    };
    take(d.queueDone, 'qd');
    take(d.queue, 'queue');
    return out;
  }

  /** 算出这节课该在哪些时刻复习（相对完成时刻 + 三个间隔） */
  function planSpaced(dayKey, fromMs, task) {
    // 🌱 v115：间隔来自「用户给这条任务设的 / 设置里的模板」，不再是写死的 30/120/360
    const cfg = srCfgOf(task);
    const built = srBuildPlan(cfg, fromMs, dayKey);
    const dl = built.dl;
    // 截止时刻只约束**落在当天**的轮次 —— 跨天的轮次本来就不归今天的几点管
    const fit = built.rounds.filter(function (r) {
      if (!dl) return true;
      if (S().dateKey(new Date(r.due)) !== dayKey) return true;
      return r.due <= dl;
    });
    return { all: built.rounds, fit: fit, dl: dl, cfg: cfg };
  }

  function srFindTask(id) {
    // 🌱 v112：也去队列 / 已完成里找（不然"设知识点"弹窗对着 {} 干活，存哪都存不对）
    const hit = srCarriers().filter(function (x) { return x.t.id === id; })[0];
    if (hit) return hit.t;
    if (!id) return null;
    // 兜底：今天任务页里找一遍（哪怕这条还没有复习计划）
    const day = S().peekDay ? S().peekDay(S().todayKey()) : null;
    let found = null;
    if (day && day.tasks) COLS.forEach(function (c) {
      const t = (day.tasks[c.key] || []).find(function (x) { return x.id === id; });
      if (t) found = t;
    });
    return found;
  }

  /** 任务行上的知识类型徽标 + 复习进度圆点 ●●○ */
  /** 🔁 v116：一轮复习做完之后问「还要再来一轮吗」
   *  用户：「请在每一轮复习结束时增加一个选项，让我选择是否进行再次复习」——
   *  不点就是结束，**系统不替他决定**。 */
  /** 🔁 v120：一轮做完 → 问「**下一次什么时候**」。
   *  用户口径：「给用户去单独安排时间，就安排一天，就安排下一次的就可以了」+
   *  「以多少分钟…你要记住现在是几点，然后按照现在的这个时间去排」——
   *  所以这里只填一个间隔，当场把算出来的**具体时刻**写在下面（不再有"第 N/3 轮"那种框架）。 */
  /* 🌱 v121：排期输入从「隔多久」改成**直接挑哪天几点**（一个控件说清一切）。
     用户口径：「新学的知识你可以去当天安排复习」「错题/知识卡的复习…就是像我们之前转移到的一天，用户自己选」
     → 新知识默认**当天稍后**；复习类默认**明天早上**，想改自己改。 */
  const SR_NEW_FIRST_MIN = 30;      // 新知识学完 → 默认 30 分钟后（就是"当天"）
  function dtLocalVal(d) {
    const z = function (n) { return (n < 10 ? '0' : '') + n; };
    return d.getFullYear() + '-' + z(d.getMonth() + 1) + '-' + z(d.getDate()) +
      'T' + z(d.getHours()) + ':' + z(d.getMinutes());
  }
  function dtLocalParse(v) {
    if (!v) return 0;
    const t = new Date(v).getTime();
    return (isFinite(t) && t > 0) ? t : 0;
  }
  /** 默认"下次复习"时刻：新知识=当天稍后；复习类=明天早上 8 点 */
  function srDefaultDue(task) {
    const d = new Date();
    const doneN = srPlan(task).filter(function (r) { return r.done === true; }).length;
    const isNew = task && task.mode === SR_MODE_NEW && !doneN;
    if (isNew) d.setMinutes(d.getMinutes() + SR_NEW_FIRST_MIN, 0, 0);
    else { d.setDate(d.getDate() + 1); d.setHours(8, 0, 0, 0); }
    return d;
  }
  /** 日期时间输入 → 下面那行"→ 明天 08:00（11 小时后）"的联动（oninput/onchange/onkeyup 都接） */
  function srBindWhenPreview(modal, inputId, outId) {
    const el = modal.querySelector('#' + inputId), w = modal.querySelector('#' + outId);
    const upd = function () {
      if (!w) return;
      const ms = dtLocalParse(el ? el.value : '');
      if (!ms) { w.innerHTML = '<span style="color:#b0262e">先挑一个时间</span>'; return; }
      const mins = Math.round((ms - Date.now()) / 60000);
      w.innerHTML = '→ <b>' + srWhen(ms) + '</b>' +
        (mins >= 0 ? '（' + fmtGap(Math.max(1, mins)) + '后）'
                   : '（<span style="color:#b0262e">已经过了，会立刻提醒你复习</span>）');
    };
    if (el) { el.oninput = upd; el.onchange = upd; el.onkeyup = upd; }
    upd();
    return el;
  }
  function srNextRoundNo(plan) {
    return plan.reduce(function (mx, r) { return Math.max(mx, r.n || 0); }, 0) + 1;
  }

  /** 🎯 v123：这次「写出来了吗」——用户：「有的时候我写过之后，但为了确保自己还记得，可能还会在
   *  未来的 7 天或者 30 天之内安排；如果说我没写出来的话，还有可能第二天就接着安排了」
   *  → **结果直接决定下次隔多久**：写出来了 = 7 天后巩固（想更久点 +30 天）；
   *    没写出来 = 明天再来一遍。结果只记在**最近完成的那一轮**上，重排 / 清空都不抹历史。 */
  const SR_RES_LABEL = { ok: '✅ 写出来了', no: '✗ 没写出来' };
  function srLastDoneRound(task) {
    const plan = srPlan(task);
    for (let i = plan.length - 1; i >= 0; i--) { if (plan[i].done === true) return plan[i]; }
    return null;
  }
  /** 🎯 v123：某一轮的结果小标签（没记过结果就不显示） */
  function srResTag(r) {
    if (!(r && r.result)) return '';
    return '<span class="sr-res-tag ' + (r.result === 'ok' ? 'ok' : 'no') + '">' +
      SR_RES_LABEL[r.result] + '</span>';
  }

  function srAskAgain(task) {
    if (!task || !srOn()) return;
    const plan = srPlan(task);
    if (!plan.length) return;
    const doneN = plan.filter(function (r) { return r.done === true; }).length;
    const cfg = (task.sp && task.sp.cfg) || srCfgOf(task);
    const lastR = plan[plan.length - 1];
    const per0 = Math.max(1, (lastR && lastR.need) || cfg.perDay || 1);
    const target = srLastDoneRound(task);          // 这次的结果记在它身上
    let picked = (target && target.result) || null;
    /** 结果 → 默认的下次时间：写出来了 = 7 天后；没写出来 = 明天 */
    const dueFor = function (res) {
      const d = new Date();
      if (res === 'ok') { d.setDate(d.getDate() + 7); return d; }
      if (res === 'no') { d.setDate(d.getDate() + 1); return d; }
      return srDefaultDue(task);
    };
    const m = App.ui.openModal('🎯 这次写出来了吗？',
      '<p class="rev-hint">「' + S().esc(task.text) + '」到今天已经复习 <b>' + doneN + '</b> 次' +
      (lastR && lastR.at ? '（最近一次 ' + srWhen(lastR.at) + '）' : '') + '。<br>' +
      '先记一下这次的结果：<b>写出来了</b>就隔久一点再看，<b>没写出来</b>就明天接着来。</p>' +
      '<div class="sr-res-pick">' +
      '<button class="btn sr-res" data-act="res-ok">' + SR_RES_LABEL.ok + '</button>' +
      '<button class="btn sr-res" data-act="res-no">' + SR_RES_LABEL.no + '</button></div>' +
      '<p class="sr-why" id="sra-why"></p>' +
      '<div class="field"><label>下次复习时间</label>' +
      '<input type="datetime-local" id="sra-at" value="' + dtLocalVal(dueFor(picked)) + '" style="width:200px" /></div>' +
      '<p class="rev-hint" id="sra-when" style="margin-top:-2px"></p>' +
      '<div class="sr-chips">' +
      '<button class="btn" data-act="q-tmr">明天</button>' +
      '<button class="btn" data-act="q-3">+3 天</button>' +
      '<button class="btn" data-act="q-7">+7 天</button>' +
      '<button class="btn" data-act="q-30">+30 天</button>' +
      '<span class="hint" style="align-self:center">（快捷：从<b>现在</b>往后算）</span></div>' +
      '<div class="field"><label>这一轮过几遍</label>' +
      '<input type="number" id="sra-per" min="1" max="20" style="width:90px" value="' + per0 + '" /></div>',
      '<button class="btn btn-primary" data-act="again">🔁 排这一次</button>' +
      '<button class="btn" data-act="stop">🆗 就到这儿（不再安排）</button>');
    const gEl = srBindWhenPreview(m, 'sra-at', 'sra-when');
    const whyEl = m.querySelector('#sra-why');
    const paint = function () {
      const bs = m.querySelectorAll('.sr-res');
      for (let i = 0; i < bs.length; i++) {
        const a = bs[i].getAttribute('data-act');
        bs[i].classList.toggle('on', (a === 'res-ok' && picked === 'ok') || (a === 'res-no' && picked === 'no'));
      }
      if (whyEl) {
        whyEl.innerHTML = picked === 'ok'
          ? ('✅ <b>写出来了</b> → 默认 <b>7 天后</b>巩固一下（想更久就点 +30 天）')
          : (picked === 'no'
            ? ('✗ <b>没写出来</b> → 默认 <b>明天</b>再来一遍（想宽限几天也行）')
            : '（选一个结果，我就按它给你定下次 —— 不选也能直接挑时间）');
      }
    };
    const resPick = function (res) {
      picked = res;
      if (gEl) { gEl.value = dtLocalVal(dueFor(res)); gEl.dispatchEvent(new Event('input')); }
      paint();
    };
    const jump = function (days) {
      const d = new Date(); d.setDate(d.getDate() + days);
      if (gEl) { gEl.value = dtLocalVal(d); gEl.dispatchEvent(new Event('input')); }
    };
    paint();
    App.ui.bindActions({
      'res-ok': function () { resPick('ok'); },
      'res-no': function () { resPick('no'); },
      'q-tmr': function () { jump(1); },
      'q-3': function () { jump(3); },
      'q-7': function () { jump(7); },
      'q-30': function () { jump(30); },
      again: function () {
        const due = dtLocalParse(gEl ? gEl.value : '');
        if (!due) { App.ui.toast('先挑一个时间'); return; }
        if (due < Date.now() - 86400000) { App.ui.toast('那个时间太早了 —— 重新挑一个', 4200); return; }
        const perEl = m.querySelector('#sra-per');
        const need = Math.max(1, Math.min(20, parseInt(perEl ? perEl.value : '', 10) || per0));
        const gap = Math.max(1, Math.round((due - Date.now()) / 60000));
        const n = srNextRoundNo(plan);
        if (target && picked) { target.result = picked; target.resultAt = Date.now(); }   // 🎯 v123
        plan.push({ n: n, gap: gap, due: due, done: null, at: null, need: need, hits: [] });
        if (task.sp) {
          delete task.sp.stopped; delete task.sp.stoppedAt; delete task.sp.droppedN;   // 🚩 v122 重新开始
          task.sp.cfg = { gaps: plan.map(function (r) { return r.gap; }), perDay: need, dl: task.sp.dl || cfg.dl };
          task.sp.bonus = false;      // 又加了新的一次 → 全清奖励重新算
          task.sp.at = Date.now();
        }
        S().save();
        App.ui.closeModal();
        App.tasks.renderAll();
        try { if (App.queue && App.queue.render) App.queue.render(); } catch (e) { /* 忽略 */ }
        App.ui.toast('🔁 第 ' + n + ' 次复习排好了：<b>' + srWhen(due) + '</b>' +
          (need > 1 ? '（这轮过 ' + need + ' 遍）' : '') +
          (picked === 'no' ? ' · 明天再来一遍 💪' : '') + ' —— 到点会提醒你', 5600);
      },
      // 🚩 v122：**"不复习了"这个决定要留痕** —— 用户：「有的错题我习惯一个月之后写出来，
      //   如果还能写出来就不管了…这个你也得记录一下」。以前点了等于什么都没发生，
      //   第二天看到那条分不清是"我决定不复习了"还是"我忘了排"。
      //   顺便把还没到点的后续轮次撤掉（不然到点它还会来提醒你复习，跟"不再安排"自相矛盾）。
      // 🎯 v123：结束的时候如果选了结果，也一起记下来（"写出来了所以不排了"正是他的习惯）。
      stop: function () {
        const left = srPendingOf(task).length;
        if (task.sp) {
          if (left) {
            const pl = srPlan(task);
            for (let i = pl.length - 1; i >= 0; i--) { if (pl[i].done === null) pl.splice(i, 1); }
          }
          if (target && picked) { target.result = picked; target.resultAt = Date.now(); }   // 🎯 v123
          task.sp.stopped = true;
          task.sp.stoppedAt = Date.now();
          if (left) task.sp.droppedN = left;
          S().save();
        }
        App.ui.closeModal();
        App.tasks.renderAll();
        try { if (App.queue && App.queue.render) App.queue.render(); } catch (e) { /* 忽略 */ }
        App.ui.toast('🚩 记下了：这条复习<b>到此结束</b>' +
          (picked === 'ok' ? '（这次 ✅ 写出来了）' : '') +
          (left ? '（顺手撤了还没到点的 ' + left + ' 条）' : '') + ' —— 想重新开始点任务行的 🌱', 6000);
      }
    });
  }
  /** 📅 v120：这条任务的**复习记录**（每一次：计划哪天、做完没有）—— 用户要的"历史要清楚" */
  /** 🚩 v122：已结束的尾巴（谁在什么时候决定不再安排的） */
  /** 🎯 v123：结束那行也带上结果 —— "写出来了所以不排了"和"没写出来但先不排"是两回事 */
  function srEndNote(task) {
    if (!(task && task.sp && task.sp.stopped)) return '';
    const at = task.sp.stoppedAt || Date.now();
    const d = new Date(at);
    const z = function (n) { return (n < 10 ? '0' : '') + n; };
    const lastD = srLastDoneRound(task);
    const rz = (lastD && lastD.result) ? ('（这次 ' + SR_RES_LABEL[lastD.result] + '）') : '';
    return '<div class="sr-hist-end">🚩 复习到此结束 —— ' + (d.getMonth() + 1) + '/' + d.getDate() + ' ' +
      z(d.getHours()) + ':' + z(d.getMinutes()) + ' 你决定不再安排' + rz +
      (task.sp.droppedN ? '（当时撤了 ' + task.sp.droppedN + ' 条还没到点的）' : '') +
      '。<br>想重新开始，就在上面挑个时间再排一次。</div>';
  }
  function srHistHTML(plan, task) {
    if (!plan.length) {
      return '<p class="hint" style="margin-top:0">这条还没排过复习 —— 排一次就有一条记录，复习完再定下一次。</p>';
    }
    const now = Date.now();
    return '<div class="sr-hist"><div class="sr-hist-t">📅 复习记录（共 ' + plan.length + ' 次）</div>' +
      plan.map(function (r) {
        const st = r.done === true
          ? ('✅ 完成于 ' + srWhen(r.at || r.due))
          : (r.done === false ? '✗ 那天没做'
            : (r.due <= now ? '⚠️ 已过期还没做' : '📅 待做'));
        const cls = r.done === true ? ' ok' : ((r.done === null && r.due <= now) ? ' late' : '');
        return '<div class="sr-hist-r"><span class="sr-hist-n">第 ' + r.n + ' 次</span>' +
          '<span class="sr-hist-d">计划 ' + srWhen(r.due) + '</span>' +
          '<span class="sr-hist-s' + cls + '">' + st + '</span>' + srResTag(r) + '</div>';
      }).join('') + srEndNote(task) + '</div>';
  }
  /** 🌱 v120：给这条任务定「**下一次**复习」。
   *  用户口径：「一次只定下一次」——「你主要一开始就是以多少分钟，然后你要记住现在是几点，
   *  然后按照现在的这个时间去排懂我意思吗？」「你不要就是搞搞这种东西啊」（指三段式模板）。
   *  所以：① 历史排期全列出来 ② 只填一个间隔、当场显示算出来的具体时刻 ③ 随时能清空。 */
  function srPlanModal(task, listKey) {
    if (!task) { App.ui.toast('这条任务找不到了，刷新一下'); return; }
    const plan = srPlan(task);
    const cfg = srCfgOf(task);
    const lastR = plan[plan.length - 1];
    const lastGap = (lastR && lastR.gap) || cfg.gaps[0] || 1440;
    const per0 = Math.max(1, (lastR && lastR.need) || cfg.perDay || 1);
    const isNewTask = task.mode === SR_MODE_NEW && !plan.some(function (r) { return r.done === true; });
    const body = srHistHTML(plan, task) +
      '<div class="field"><label>下次哪天几点复习</label>' +
      '<input type="datetime-local" id="srp-at" value="' + dtLocalVal(srDefaultDue(task)) + '" style="width:200px" /></div>' +
      '<p class="rev-hint" id="srp-when" style="margin-top:-2px"></p>' +
      '<div class="field"><label>这一次要过几遍（默认 1 遍）</label>' +
      '<input type="number" id="srp-per" min="1" max="20" style="width:90px" value="' + per0 + '" /></div>' +
      '<p class="hint">' + (isNewTask
        ? '📘 <b>新知识</b>：默认就排<b>今天稍后</b>（先过一遍最不容易忘）。'
        : '🔄 <b>复习</b>：默认明天早上，想哪天/几点自己改。') +
      '现在是 ' + srWhen(Date.now()) + '。</p>';
    const m = App.ui.openModal('🌱 定下一次复习（' + S().esc(String(task.text || '').slice(0, 14)) + '）',
      body,
      '<button class="btn btn-primary" data-act="ok">🌱 就排这一次</button>' +
      (plan.length ? '<button class="btn" data-act="clear">🧹 清空这条的复习安排</button>' : '') +
      '<button class="btn" data-act="cancel">取消</button>');
    const gEl = srBindWhenPreview(m, 'srp-at', 'srp-when');
    App.ui.bindActions({
      ok: function () {
        const due = dtLocalParse(gEl ? gEl.value : '');
        if (!due) { App.ui.toast('先挑一个时间'); return; }
        if (due < Date.now() - 86400000) { App.ui.toast('那个时间太早了 —— 重新挑一个', 4200); return; }
        const perEl = m.querySelector('#srp-per');
        const perDay = Math.max(1, Math.min(20, parseInt(perEl ? perEl.value : '', 10) || 1));
        const gap = Math.max(1, Math.round((due - Date.now()) / 60000));
        const n = srNextRoundNo(plan);
        if (!task.sp) task.sp = { planned: [], dl: cfg.dl || '', at: Date.now(), bonus: false, cfg: null };
        if (!Array.isArray(task.sp.planned)) task.sp.planned = [];
        task.sp.planned.push({ n: n, gap: gap, due: due, done: null, at: null, need: perDay, hits: [] });
        task.sp.at = Date.now();
        task.sp.bonus = false;
        // 🚩 v122：重新排 = 重新开始 → 结束标记要清掉（不然行上一直写着「已结束」）
        delete task.sp.stopped; delete task.sp.stoppedAt; delete task.sp.droppedN;
        task.sp.cfg = { gaps: task.sp.planned.map(function (r) { return r.gap; }), perDay: perDay,
                        dl: task.sp.dl || cfg.dl || '' };
        S().save();
        App.ui.closeModal();
        App.tasks.renderAll();
        try { if (App.queue && App.queue.render) App.queue.render(); } catch (e) { /* 忽略 */ }
        App.ui.toast('🌱 第 ' + n + ' 次复习：<b>' + srWhen(due) + '</b>' +
          (perDay > 1 ? ' · 过 ' + perDay + ' 遍' : '') + ' —— 到点会提醒你', 6800);
      },
      clear: function () {
        App.ui.confirm('清空「<b>' + S().esc(String(task.text || '').slice(0, 16)) + '</b>」的复习安排？<br>' +
          '<span class="hint">这 ' + plan.length + ' 次排期都会删掉（已经拿到的分不退），之后想复习再点 🌱 重新定。</span>',
          '清空', function () {
            delete task.srCfg; delete task.sp;
            S().save();
            App.ui.closeModal();
            App.tasks.renderAll();
            try { if (App.queue && App.queue.render) App.queue.render(); } catch (e) { /* 忽略 */ }
            App.ui.toast('🧹 这条的复习安排清空了 —— 想重新开始随时点 🌱');
          });
      },
      cancel: function () { App.ui.closeModal(); }
    });
  }

  /** 🌱 v112：复习进度圆点 ●●○ —— 抽出来给「已完成」行也用（不然排了复习在那儿看不见） */
  function revDotsHTML(t) {
    const plan = srPlan(t);
    if (!plan.length) return '';
    const now = Date.now();
    const doneN = plan.filter(function (r) { return r.done === true; }).length;
    const pend = plan.filter(function (r) { return r.done === null; });
    const next = pend[0] || null;
    const late = !!next && next.due <= now;
    // 🌱 v116：鼠标放上去能看全 —— 每一轮在哪天、什么状态（已完成 / 待做 / 已过期）
    const stoppedNow = !!(t && t.sp && t.sp.stopped);
    const allTxt = '复习计划 ' + doneN + '/' + plan.length + ' 轮已完成' +
      (stoppedNow ? '（🚩 已结束，不再安排）' : '') + ' ｜ ' +
      plan.map(function (r) {
        const st = r.done === true ? ('✓已完成' + (r.result ? '·' + SR_RES_LABEL[r.result] : '')) : (r.done === false ? '✗那天没做' : (r.due <= now ? '⚠️已过期还没做' : '待做'));
        return '第' + r.n + '轮 ' + srWhen(r.due) + '(' + st + ')';
      }).join(' ｜ ');
    // 🌱 v116：日期直接写在行上（最多列 3 个），不用点开也不用悬停
    const dates = pend.slice(0, 3).map(function (r) { return srWhen(r.due); }).join(' · ') +
      (pend.length > 3 ? ' 等 ' + pend.length + ' 轮' : '');
    // 🌱 v120：一次只定下一次 → 行上直接写「已复习 N 次 · 下次哪天几点」，鼠标放上去看全部历史
    // 🚩 v122：主动结束的，行上就直接写「已结束」——不然跟"忘了排"根本分不清
    const stopped = !!(t && t.sp && t.sp.stopped);
    const label = next
      ? ('🌱 已复习 ' + doneN + ' 次 · 下次 ' + dates + (late ? ' · 该复习了' : ''))
      : (stopped
        ? ('🌱 已复习 ' + doneN + ' 次 · 已结束')
        : ('🌱 已复习 ' + doneN + ' 次 · 没有下一次了'));
    const cls2 = late ? ' late' : (next ? '' : ' done');
    return '<span class="rev-dots" title="' + allTxt + '">' +
      plan.map(function (r) {
        const isLate = r.done === null && r.due <= now;
        const cls = r.done === true ? 'on' : (r.done === false ? 'miss' : (isLate ? 'late' : ''));
        return '<i class="' + cls + '"></i>';
      }).join('') + doneN + '/' + plan.length + '</span>' +
      '<span class="rev-next' + cls2 + '" title="' + allTxt + '">' + label + '</span>';
  }

  function modeTagHTML(t) {
    if (!t) return '';
    const dots = revDotsHTML(t);
    // 🌱 v116：没标知识类型、但自己排过复习计划 → 圆点和日期照样要显示
    if (!t.mode) return dots;
    if (t.mode === SR_MODE_NEW) {
      // ⏰ v71：已经过了新知识时间还没做 → 徽标变淡，鼠标放上去解释一句（不拦人）
      const out = !t.done && slotOn() && !slotState().inNew;
      const tip = out
        ? ('现在是复习时间（新知识时间 ' + slotRangeText() + '）—— 这条新知识留到下一次新知识时间开头学更牢')
        : '新知识：完成时会引导你设知识点，并按遗忘曲线排当天 3 轮复习';
      return '<span class="mode-tag mode-new' + (out ? ' mode-out' : '') + '" title="' + tip + '">📘 新知识</span>' + dots;
    }
    return '<span class="mode-tag mode-rev" title="复习知识：只是标记（不排间隔复习），方便统计今天复习了多少">🔄 复习</span>' + dots;
  }

  /* ---------- ① 新知识任务完成后的处理 ---------- */
  /** 🌱 v115：这条要不要在完成时自动排复习 —— ① 用户自己给它设过计划 ② 标了「📘 新知识」（走模板） */
  function srWanted(task) {
    if (!task) return false;
    return !!task.srCfg || task.mode === SR_MODE_NEW;
  }

  /** 🌱 v120：这条任务完成时**只排下一次复习**（不再一次铺三轮）
   *  用户：「我讲的复习是针对于新知识而言，一个东西它是新知识，然后你可以安排日期」——
   *  日期 = 现在 + 模板的第一个间隔；后面每次复习完再单独定下一次。 */
  function srAfterTaskDone(task, listKey, dayKey) {
    if (!srOn() || !srWanted(task) || task.sp) return;
    const cfg = srCfgOf(task);
    // 🌱 v121：新知识**当天**就排一次（用户：「对于我们新学的知识，你可以去当天安排复习好吗？」）
    const gap = SR_NEW_FIRST_MIN;
    const perDay = Math.max(1, cfg.perDay || 1);
    const due = Date.now() + gap * 60000;
    const dl = cfg.dl ? srClockMs(dayKey || S().todayKey(), cfg.dl) : 0;
    // 截止时刻只约束"落在同一天"的那一轮（跨天的不归今天的几点管）
    if (dl && S().dateKey(new Date(due)) === (dayKey || S().todayKey()) && due > dl) {
      App.ui.toast('🌱 这会儿排下一次复习会到 ' + srHHMM(due) + '（超过你设的截止 ' + srHHMM(dl) +
        '）—— 今天先不自动排，想排就点任务行的 🌱', 6400);
      srPendKp = { id: task.id, listKey: listKey, dayKey: dayKey };
      return;
    }
    task.sp = {
      planned: [{ n: 1, gap: gap, due: due, done: null, at: null, need: perDay, hits: [] }],
      dl: dl, at: Date.now(), bonus: false,
      cfg: { gaps: [gap], perDay: perDay, dl: cfg.dl }
    };
    S().save();
    App.ui.toast('🌱 新知识已排<b>今天</b>复习：<b>' + srWhen(due) + '</b>' +
      (perDay > 1 ? '（这一轮过 ' + perDay + ' 遍）' : '') +
      ' —— 到点在「今天」页顶上提醒你', 6800);
    srPendKp = { id: task.id, listKey: listKey, dayKey: dayKey };
  }

  /** 等任务总结弹窗关掉之后再弹（免得两个弹窗打架） */
  function srRunPending() {
    if (srPendShort) {
      const q = srPendShort; srPendShort = null;
      srShortModal(q); return;
    }
    if (srPendKp) {
      const q = srPendKp; srPendKp = null;
      const t = srFindTask(q.id);
      if (t && srOn()) srAskKps(t, q.listKey, q.dayKey);
    }
  }

  /** 今天跑不满 3 轮 → 让用户自己决定 */
  /** 日期字符串 + N 天 */
  function srShiftDay(key, n) {
    const p = String(key || '').split('-');
    const d = new Date(+p[0], (+p[1]) - 1, +p[2]);
    d.setDate(d.getDate() + n);
    const z = function (x) { return (x < 10 ? '0' : '') + x; };
    return d.getFullYear() + '-' + z(d.getMonth() + 1) + '-' + z(d.getDate());
  }

  function srShortModal(q) {
    const task = srFindTask(q.id);
    if (!task) return;
    const last = q.all[q.all.length - 1];
    const body = '<div class="field"><label>任务</label><p style="font-size:14px;font-weight:700">' + S().esc(task.text) + '</p></div>' +
      '<p class="rev-hint">按遗忘曲线，这节课该在 <b>' + q.all.map(function (x) { return srHHMM(x.due); }).join(' · ') + '</b> 各复习一次。<br>' +
      '但你设的复习截止时刻是 <b>' + srHHMM(q.dl) + '</b>，现在才完成的话，只有前 <b>' + q.fit.length + '</b> 轮能在今天跑完（最后一轮会到 ' + srHHMM(last.due) + '）。</p>' +
      '<p class="rev-hint">💡 想完整吃到 ' + q.all.length + ' 轮，最晚要在 <b>' +
      srHHMM(q.dl - last.gap * 60000) + '</b> 前把学习任务做完（截止点 ' + srHHMM(q.dl) +
      ' 减去最后一轮的 ' + last.gap + ' 分钟）。</p>';
    const m = App.ui.openModal('🌱 今天排不满 3 轮，怎么办？', body +
      '<div class="btn-row">' +
      '<button class="btn btn-small btn-primary" data-act="fit">只排今天跑得完的 ' + q.fit.length + ' 轮</button>' +
      '<button class="btn btn-small" data-act="rest">今天排 ' + q.fit.length + ' 轮，剩下的安排到某天</button>' +
      '<button class="btn btn-small" data-act="all">照排 3 轮（最后一轮会到 ' + srHHMM(last.due) + '）</button>' +
      '<button class="btn btn-small" data-act="none">今天不排了</button>' +
      '</div>');
    const setSp = function (plan, msg) {
      task.sp = { planned: plan, dl: q.dl, at: Date.now(), bonus: false, cfg: q.cfg || (task.sp && task.sp.cfg) };
      S().save(); App.ui.closeModal(); App.tasks.renderAll();
      App.ui.toast(msg, 5200);
      srPendKp = { id: q.id, listKey: q.listKey, dayKey: q.dayKey };
      setTimeout(srRunPending, 320);
    };
    App.ui.bindActions({
      fit: function () { setSp(q.fit, '🌱 已排 ' + q.fit.length + ' 轮：' + q.fit.map(function (x) { return srHHMM(x.due); }).join(' / ')); },
      all: function () { setSp(q.all, '🌱 已照排 3 轮，最后一轮到 ' + srHHMM(last.due)); },
      // 📅 v98：今天排不下的那几轮 → 挑一天接着复习（用户：「完成前面几轮之后，要加一个安排到哪一天的选项」）
      rest: function () {
        const leftN = q.all.length - q.fit.length;
        const base = q.dayKey || S().todayKey();
        let pickKey = srShiftDay(base, 1);
        let nm = task.text + ' · 复习';
        const mm = App.ui.openModal('📅 今天 ' + q.fit.length + ' 轮，剩下 ' + leftN + ' 轮安排到哪天？',
          '<p class="rev-hint">今天先跑：<b>' + q.fit.map(function (x) { return srHHMM(x.due); }).join(' · ') + '</b><br>' +
          '剩下的 <b>' + leftN + '</b> 轮今天跑不完（会到 ' + srHHMM(last.due) + ' 之后），挑一天接着复习 —— ' +
          '那天它会出现在<b>日历</b>和任务清单里，做的时候再按 📘/🔄 走就行。</p>' +
          '<div class="field"><label>哪一天</label>' +
          '<input type="date" id="sr-rest-date" value="' + pickKey + '" style="width:180px" /></div>' +
          '<div class="field"><label>名称（可以改）</label>' +
          '<input type="text" id="sr-rest-name" value="' + S().esc(nm) + '" style="width:100%" /></div>',
          '<button class="btn btn-primary" data-act="sr-rest-ok">✔ 就这么安排</button>' +
          '<button class="btn" data-act="sr-rest-cancel">取消</button>');
        const dtEl = mm.querySelector('#sr-rest-date');
        if (dtEl) dtEl.onchange = function () { pickKey = dtEl.value || pickKey; };
        App.ui.bindActions({
          'sr-rest-ok': function () {
            if (dtEl && dtEl.value) pickKey = dtEl.value;   // 同理：别只靠 onchange
            const nmEl = mm.querySelector('#sr-rest-name');
            nm = (nmEl && nmEl.value.trim()) ? nmEl.value.trim() : nm;
            if (pickKey < S().todayKey()) { App.ui.toast('那一天已经过去了，往后挑一天'); return; }
            if (!App.calendar || !App.calendar.copyTaskToDay) { App.ui.toast('日历模块没加载，先刷新一下'); return; }
            const okN = App.calendar.copyTaskToDay({ text: nm }, q.listKey || 'required', pickKey, '', false, 'required');
            if (!okN) { App.ui.toast('那一天已经有同名任务了，改个名字或换一天'); return; }
            // 给安排过去的那条标成「🔄 复习」，到那天一眼看出是复习
            try {
              const d2 = S().getDay(pickKey);
              let hit = null;
              ['required', 'ideal', 'extra'].forEach(function (k) {
                (d2.tasks[k] || []).forEach(function (t) { if (!hit && t.text === nm) hit = t; });
              });
              if (hit) { hit.mode = SR_MODE_REV; hit.srFrom = task.id; }
            } catch (e) { /* 忽略 */ }
            task.sp = { planned: q.fit, dl: q.dl, at: Date.now(), bonus: false };
            S().save();
            App.ui.closeModal();
            App.tasks.renderAll();
            App.ui.toast('🌱 今天 ' + q.fit.length + ' 轮（' + q.fit.map(function (x) { return srHHMM(x.due); }).join(' / ') +
              '）· 📅 「' + nm + '」已安排到 ' + pickKey, 6000);
            srPendKp = { id: q.id, listKey: q.listKey, dayKey: q.dayKey };
            setTimeout(srRunPending, 320);
          },
          'sr-rest-cancel': function () { App.ui.closeModal(); }
        });
      },
      none: function () {
        App.ui.closeModal();
        srPendKp = { id: q.id, listKey: q.listKey, dayKey: q.dayKey };
        setTimeout(srRunPending, 320);
      }
    });
  }

  /* ---------- ② 设知识点（主动回忆的入口） ---------- */
  function srAskKps(task, listKey, dayKey) {
    if (!task) return;
    srKpTmp = {
      taskId: task.id, listKey: listKey, dayKey: dayKey,
      items: JSON.parse(JSON.stringify(task.kps || [])),
      startAt: Date.now(), before: (task.kps || []).length
    };
    if (!srKpTmp.items.length) srKpTmp.items.push({ id: S().uid(), q: '', a: '' });
    srRenderKps();
  }

  function srRenderKps() {
    const d = srKpTmp; if (!d) return;
    const task = srFindTask(d.taskId) || {};
    const body =
      '<p class="rev-hint">🌱 <b>主动回忆</b>：把这一课的要害变成几个小问题，后面每轮复习就拿它们考你。<br>' +
      '自己出题这一步本身就在帮你记 —— 试着复述一遍，比单纯再看一遍书管用得多。</p>' +
      '<div id="kp-list"></div>' +
      '<button class="btn btn-small" data-act="kp-add" style="margin-top:4px">＋ 再加一条</button>' +
      '<p class="rev-hint" style="margin-top:10px">不设问题也能复习，只是效果差一些 —— 那时复习会让你自己回忆整节课讲了什么。</p>' +
      '<div class="btn-row"><button class="btn btn-small btn-primary" data-act="kp-save">保存</button>' +
      '<button class="btn btn-small" data-act="kp-skip">' + (d.before ? '取消' : '不用了，跳过') + '</button></div>';
    const m = App.ui.openModal('🌱 给「' + S().esc(task.text || '') + '」设几个知识点', body);
    srPaintKps(m);
    App.ui.bindActions({
      'kp-add': function () { srCollectKps(m); d.items.push({ id: S().uid(), q: '', a: '' }); srPaintKps(m); },
      'kp-save': function () { srSaveKps(); },
      'kp-skip': function () {
        App.ui.closeModal(); srKpTmp = null;
        if (srKpReturn) { const r = srKpReturn; srKpReturn = null; srOpenReview(r.task, r.round); }
      }
    });
  }

  function srPaintKps(m) {
    const d = srKpTmp; if (!d) return;
    const box = m.querySelector('#kp-list');
    box.innerHTML = d.items.map(function (k, i) {
      return '<div class="rev-kp" data-i="' + i + '">' +
        '<div style="display:flex;gap:8px;align-items:center;margin-bottom:6px">' +
        '<b style="font-size:13px">第 ' + (i + 1) + ' 条</b>' +
        '<button class="btn btn-mini" data-kpdel="' + i + '" style="margin-left:auto">删除</button></div>' +
        '<div class="field" style="margin:0 0 6px"><label>问题 / 提示（例：2H2O = ？）</label>' +
        '<textarea class="kp-q" data-i="' + i + '" style="width:100%;min-height:42px">' + S().esc(k.q) + '</textarea></div>' +
        '<div class="field" style="margin:0"><label>答案 / 要点（复习时先藏起来）</label>' +
        '<textarea class="kp-a" data-i="' + i + '" style="width:100%;min-height:42px">' + S().esc(k.a) + '</textarea></div>' +
        '</div>';
    }).join('') || '<p class="rev-hint">还没设。点下面「＋ 再加一条」。</p>';
    box.querySelectorAll('[data-kpdel]').forEach(function (b) {
      b.onclick = function () { srCollectKps(m); d.items.splice(+b.dataset.kpdel, 1); srPaintKps(m); };
    });
    box.querySelectorAll('.kp-q, .kp-a').forEach(function (t) {
      t.oninput = function () { srCollectKps(m); };
    });
  }

  function srCollectKps(m) {
    const d = srKpTmp; if (!d) return;
    const box = (m && m.querySelector('#kp-list')) || document.getElementById('kp-list');
    if (!box) return;
    box.querySelectorAll('.rev-kp').forEach(function (row) {
      const i = +row.dataset.i;
      const q = row.querySelector('.kp-q'), a = row.querySelector('.kp-a');
      if (d.items[i]) { d.items[i].q = q.value; d.items[i].a = a.value; }
    });
  }

  function srSaveKps() {
    const d = srKpTmp; if (!d) return;
    srCollectKps(null);   // ⚠️ 必须再收一次：只靠 oninput 会漏掉粘贴 / 输入法上屏 / 自动填充
    const task = srFindTask(d.taskId);
    const clean = d.items
      .filter(function (k) { return String(k.q || '').trim() || String(k.a || '').trim(); })
      .map(function (k) { return { id: k.id || S().uid(), q: String(k.q || '').trim(), a: String(k.a || '').trim() }; });
    const added = Math.max(0, clean.length - (d.before || 0));
    if (task) {
      task.kps = clean;
      S().save();
      if (added > 0) {
        const p = added * srKpPoints();
        if (p > 0) {
          S().addLedger(S().todayKey(), 'earn-kps',
            { points: p, note: '🌱 主动出题 ' + added + ' 条：' + task.text, taskId: task.id });
          App.ui.floatAt(document.getElementById('stat-points'), '+' + p + '分');
        }
        App.ui.toast('🌱 存了 ' + clean.length + ' 条知识点' + (p > 0 ? ' · +' + p + ' 分' : ''), 4600);
      } else {
        App.ui.toast('知识点已更新', 2600);
      }
      srLogWork('🌱 给「' + task.text + '」设知识点（' + clean.length + ' 条）', d.startAt, Date.now(), task.id);
    }
    App.ui.closeModal();
    srKpTmp = null;
    App.tasks.renderAll();
    if (srKpReturn) { const r = srKpReturn; srKpReturn = null; setTimeout(function () { srOpenReview(r.task, r.round); }, 320); }
  }

  /* ---------- ③ 独立计时 → 进时间轴 ---------- */
  function srLogWork(content, fromMs, toMs, taskId) {
    if (!toMs || toMs - fromMs < 30000) return;    // 少于半分钟就别记了（避免噪声）
    const dayKey = S().todayKey();
    const day = S().getDay(dayKey);
    const base = S().keyToDate(dayKey).getTime();
    const sMin = Math.max(0, Math.min(1439, Math.floor((fromMs - base) / 60000)));
    const eMin = Math.max(0, Math.min(1439, Math.floor((toMs - base) / 60000)));
    if (eMin <= sMin) return;
    day.timeline.push({
      id: S().uid(), start: sMin, end: eMin, minutes: eMin - sMin,
      content: content, category: 'study', countAsStudy: true, auto: true,
      taskId: taskId || null, taskText: '', note: '', srWork: true
    });
    S().save();
  }

  /* ---------- ④ 今日「待复习」提醒条 ---------- */
  function srPendingList() {
    const out = [];
    srCarriers().forEach(function (x) {
      srPendingOf(x.t).forEach(function (r) { out.push({ t: x.t, listKey: x.listKey, r: r }); });
    });
    out.sort(function (a, b) { return a.r.due - b.r.due; });
    return out;
  }

  function renderReviewBanner() {
    const bar = document.getElementById('review-banner');
    if (!bar) return;
    if (!srOn()) { bar.innerHTML = ''; return; }
    const list = srPendingList();
    if (!list.length) {
      let total = 0, doneN = 0;
      srCarriers().forEach(function (x) {           // 🌱 v112：队列/已完成里的那些也算进来
        total += srPlan(x.t).length;
        doneN += srPlan(x.t).filter(function (r) { return r.done === true; }).length;
      });
      bar.innerHTML = (total > 0 && doneN >= total)
        ? '<div class="card rev-banner rev-all-done">🌱 今天的 ' + total + ' 轮间隔复习全部做完了 —— 遗忘曲线今天就吃满了 🎉</div>'
        : '';
      return;
    }
    const now = Date.now();
    const due = list[0].r.due <= now;
    const left = Math.round((list[0].r.due - now) / 60000);
    const groups = {};
    list.forEach(function (x) {
      const k = x.t.id;
      if (!groups[k]) groups[k] = { t: x.t, rs: [] };
      groups[k].rs.push(x.r);
    });
    const rows = Object.keys(groups).map(function (k) {
      const g = groups[k];
      return '<div class="rev-row"><span class="rev-name">' + S().esc(g.t.text) + '</span>' +
        '<span class="rev-when">' + g.rs.map(function (r) {
          return '<i class="' + (r.due <= now ? 'late' : '') + '">' + srWhen(r.due) +
            ((r.need || 1) > 1 ? ' ×' + r.need : '') + '</i>';
        }).join('') + '</span></div>';
    }).join('');
    bar.innerHTML = '<div class="card rev-banner' + (due ? ' rev-due' : '') + '">' +
      '<div class="rev-head">' +
      (due ? '⏰ <b>该复习了</b>' : '🌱 <b>待复习 ' + list.length + ' 轮</b>') +
      ' · 最近一轮 <b>' + srWhen(list[0].r.due) + '</b>' +
      (due ? '（已到点）' : '（' + (left <= 0 ? '就现在' : left + ' 分钟后') + '）') +
      '<button class="btn btn-small btn-primary" data-act="rev-go" style="margin-left:auto">▶ 开始复习</button>' +
      '</div>' + rows + '</div>';
  }

  function bindReviewBanner() {
    const bar = document.getElementById('review-banner');
    if (!bar || bar.dataset.bound) return;
    bar.dataset.bound = '1';
    bar.addEventListener('click', function (e) {
      const b = e.target.closest('[data-act]');
      if (b && b.dataset.act === 'rev-go') srStartRound(null, null);
    });
  }

  /** 到点了就提醒一次（每轮只提醒一次） */
  function srCheckDue() {
    if (!srOn()) return;
    const fresh = [];
    srPendingList().forEach(function (x) {
      const key = x.t.id + '#' + x.r.n;
      if (x.r.due <= Date.now() && !srNotified[key]) { srNotified[key] = 1; fresh.push(x); }
    });
    if (!fresh.length) return;
    // ⚠️ 一次到点可能有好几轮（甚至好几条任务）—— 必须合成一条，不然会连环刷屏
    const names = fresh.map(function (x) { return x.t.text + ' 第 ' + x.r.n + ' 轮'; });
    App.tasks.notifyNow('🌱 该复习了',
      fresh.length === 1 ? names[0] + '（计划 ' + srHHMM(fresh[0].r.due) + '）'
        : '共 ' + fresh.length + ' 轮到点：' + names.slice(0, 3).join('、') + (fresh.length > 3 ? ' 等' : ''),
      'focus-plan-review');
    App.ui.toast(fresh.length === 1
      ? '⏰ 该复习了：' + fresh[0].t.text + '（第 ' + fresh[0].r.n + ' 轮）'
      : '⏰ 该复习了 · ' + fresh.length + ' 轮到点了（' + fresh[0].t.text + ' 等）', 5600);
  }

  /* ---------- ⑤ 复习流程 ---------- */
  function srStartRound(taskId, n) {
    const dayKey = S().todayKey();
    const day = S().getDay(dayKey);
    let task = null;
    if (taskId) { task = srFindTask(taskId); }
    else {
      // 🌱 v112：队列 / 已完成的那些也要能被"▶ 开始复习"抓到
      const all = srPendingList();
      all.sort(function (a, b) { return a.r.due - b.r.due; });
      if (!all.length) { App.ui.toast('今天没有待复习的内容'); return; }
      task = all[0].t;
      n = all[0].r.n;
    }
    if (!task) { App.ui.toast('这条任务找不到了'); return; }
    const round = n ? srPlan(task).find(function (r) { return r.n === n; }) : srPendingOf(task)[0];
    // ⚠️ 必须连「这一轮已经做过了」一起挡掉：只判 !round 的话，
    //    从外部按轮次号调进来会把已完成的轮次又做一遍（重复发分）。
    if (!round || round.done !== null) { App.ui.toast('这一轮已经复习过了'); return; }
    srOpenReview(task, round);
  }

  function srOpenReview(task, round) {
    srRev = { taskId: task.id, n: round.n, startAt: Date.now() };
    // 🔗 v120：**复习就用你自己做的知识卡**。用户原话：「我做了那么多知识卡片，就是在这个时候用上的…
    // 你给我推送的时候，你说还没有具体的知识点，你到底有没有把这两个东西绑在一块？」
    // 以前确实没绑（复习只认 task.kps）→ 现在卡片优先，一张都没有才退回"心里过三件事"。
    let cards = [];
    try { cards = (App.memcards && App.memcards.cardsForTask) ? App.memcards.cardsForTask(task) : []; }
    catch (e) { cards = []; }
    const kps = cards.length
      ? cards.map(function (c) { return { q: c.front, a: c.back }; })
      : (task.kps || []);
    const colNames = [];
    cards.forEach(function (c) { if (c.colName && colNames.indexOf(c.colName) < 0) colNames.push(c.colName); });
    const plan = srPlan(task);
    const late = Date.now() > round.due;
    let body = '<div class="field" style="margin:0 0 8px"><label>任务</label>' +
      '<p style="font-size:14px;font-weight:700">' + S().esc(task.text) + '</p></div>' +
      '<p class="rev-hint">🌱 计划时间 <b>' + srHHMM(round.due) + '</b>' +
      (late ? ' · <span style="color:#b0262e">晚了一点，没关系，做了就有效</span>' : '') + '<br>' +
      '先自己回忆，再点「看答案」核对 —— 想不起来是正常的，这正是复习在起作用。</p>';
    if (cards.length) {
      body += '<p class="rev-hint">🃏 这一轮用你做的 <b>' + cards.length + '</b> 张知识卡复习' +
        (colNames.length ? '（' + S().esc(colNames.join('、').slice(0, 34)) + '）' : '') + '</p>';
    }
    if (!kps.length) {
      body += '<div class="rev-big-q">这节课还没有知识卡。<br>心里把这三件事过一遍：<b>讲了什么 · 关键结论是什么 · 哪里最容易错</b>，然后点下面的按钮。<br>' +
        '<span class="hint">💡 做完这轮，去任务行点 <b>🃏</b> 做几张卡 —— 下次复习就直接翻卡自测了。</span></div>';
    } else {
      body += '<div id="rev-kps">' + kps.map(function (k, i) {
        return '<div class="rev-kp" data-i="' + i + '">' +
          '<div class="rev-kp-q">' + (i + 1) + '. ' + S().esc(k.q || '（没写问题 —— 自己想想该问什么）') + '</div>' +
          '<div class="rev-kp-a hidden-a" data-ans="' + i + '">' + S().esc(k.a || '（没写答案）') + '</div>' +
          '<div class="rev-kp-bar"><button class="btn btn-mini btn-primary" data-reveal="' + i + '">👁 看答案</button></div>' +
          '</div>';
      }).join('') + '</div>';
    }
    body += '<div class="btn-row" style="margin-top:4px">' +
      (cards.length ? '' :
        '<button class="btn btn-small" data-act="rev-edit">' + (kps.length ? '✎ 改知识点' : '＋ 现在设几个知识点') + '</button>') +
      '<button class="btn btn-small btn-primary" data-act="rev-ok">✅ 这一轮复习完了</button>' +
      '<button class="btn btn-small" data-act="rev-quit">先不复习了</button></div>';
    const m = App.ui.openModal('🌱 第 ' + round.n + '/' + plan.length + ' 轮复习', body);
    m.querySelectorAll('[data-reveal]').forEach(function (b) {
      b.onclick = function () {
        const i = b.dataset.reveal;
        const a = m.querySelector('.rev-kp-a[data-ans="' + i + '"]');
        if (a) a.classList.remove('hidden-a');
        const bar = b.parentNode;
        bar.innerHTML = '<span class="rev-hint">感觉如何：</span>' +
          '<button class="btn btn-mini" data-grade="easy" data-i="' + i + '">😀 记得</button>' +
          '<button class="btn btn-mini" data-grade="hard" data-i="' + i + '">🤔 模糊</button>' +
          '<button class="btn btn-mini" data-grade="forgot" data-i="' + i + '">😵 忘了</button>';
        const row = m.querySelector('.rev-kp[data-i="' + i + '"]');
        bar.querySelectorAll('[data-grade]').forEach(function (g) {
          g.onclick = function () {
            const label = { easy: '😀 记得', hard: '🤔 模糊', forgot: '😵 忘了' }[g.dataset.grade] || '';
            bar.innerHTML = '<span class="rev-hint">已记下：' + label + '</span>';
            if (row) row.classList.add('rev-kp-done');
          };
        });
      };
    });
    App.ui.bindActions({
      'rev-edit': function () {
        srKpReturn = { task: task, round: round };
        srAskKps(task, null, S().todayKey());
      },
      'rev-ok': function () { srFinishRound(task, round); },
      'rev-quit': function () {
        App.ui.closeModal(); srRev = null;
        App.ui.toast('没关系，想起来再来一轮', 3200);
      }
    });
  }

  /** 🌱 v115：以这一轮**实际完成那一刻**为起点，重排后面几轮
   *  （用户：「第一次复习之后，间隔多久进行第二次复习」→ 就是接着上次真做完的时间往后推） */
  function srReschedule(task, round) {
    const plan = srPlan(task);
    const cfg = (task.sp && task.sp.cfg) || srCfgOf(task);
    const gaps = (cfg && cfg.gaps && cfg.gaps.length) ? cfg.gaps : SR_PLAN_DEF.gaps;
    let base = (round && round.at) || Date.now();
    let after = false;
    plan.forEach(function (r) {
      if (round && r.n === round.n) { after = true; return; }
      if (!after) return;
      const gap = (gaps[r.n - 1] != null) ? gaps[r.n - 1] : (r.gap || 1440);
      base = base + gap * 60000;
      r.gap = gap;
      r.due = base;
      r.need = Math.max(1, cfg.perDay || 1);
    });
    return plan;
  }

  function srFinishRound(task, round) {
    if (!round || round.done === true) { App.ui.closeModal(); return; }   // 防重复触发重复发分
    const dayKey = S().todayKey();
    const plan = srPlan(task);
    // 🌱 v115：一天多遍 —— 这一轮要过够 need 遍才算完成（每遍都记一次，分数照给）
    const need = Math.max(1, +(round.need || 1));
    if (!round.hits) round.hits = [];
    round.hits.push(Date.now());
    const got = round.hits.length;
    const enough = got >= need;
    if (enough) { round.done = true; round.at = Date.now(); }
    const p = srPoints();
    if (p > 0) {
      S().addLedger(dayKey, 'earn-review',
        { points: p, note: '🌱 第 ' + round.n + ' 轮复习' + (need > 1 ? '（第 ' + got + '/' + need + ' 遍）' : '') + '：' + task.text, taskId: task.id });
      App.ui.floatAt(document.getElementById('stat-points'), '+' + p + '分');
    }
    let bonusMsg = '';
    if (plan.length && plan.every(function (r) { return r.done === true; }) && !task.sp.bonus) {
      task.sp.bonus = true;
      const b = srFinishBonus();
      if (b > 0) {
        S().addLedger(dayKey, 'earn-review-all',
          { points: b, note: '🌱 当天 ' + plan.length + ' 轮全做完：' + task.text, taskId: task.id });
        bonusMsg = ' · 全轮完成再 +' + b + ' 分 🎉';
      }
    }
    // 🌱 v115：这轮真过了 → 后面几轮按"刚才做完的时刻"重排
    if (enough) srReschedule(task, round);
    S().save();
    if (srRev) srLogWork('🌱 第 ' + round.n + ' 轮复习：' + task.text, srRev.startAt, Date.now(), task.id);
    srRev = null;
    App.ui.closeModal();
    App.tasks.renderAll();
    // 🌱 v112：队列页上也有复习提醒和 ●●○ 了，做完一轮得跟着刷新
    try { if (App.queue && App.queue.render) App.queue.render(); } catch (e) { /* 忽略 */ }
    const left = srPendingOf(task).length;
    App.ui.toast(enough
      ? ('✅ 第 ' + round.n + ' 轮完成 · +' + p + ' 分' + bonusMsg +
        (left ? ' · 还剩 ' + left + ' 轮（下一次 ' + srWhen(srPendingOf(task)[0].due) + '）' : ''))
      : ('🔁 第 ' + round.n + ' 轮第 ' + got + '/' + need + ' 遍 ✅ · +' + p + ' 分 —— 这一天再过 ' +
        (need - got) + ' 遍就算这轮过了'), 5600);
    // 🔁 v116：这轮真做完了 → 问一句要不要再排一轮（想结束就不点）
    if (enough) setTimeout(function () { srAskAgain(task); }, 500);
  }



  /* ---------- \u23F0 v76：还没结算的日子，摆在首页上 + 一键结算 ---------- */
  /** 有没有「今天以前、还没结算、而且那天真有东西」的日子？（最多回看 7 天）
      只找今天以前的 —— 今天还没到结算点，不算漏。 */
  function missedSettleKey() {
    for (let i = 1; i <= 7; i++) {
      const dd = new Date(); dd.setDate(dd.getDate() - i);
      const k = S().dateKey(dd);
      const pd = (S().peekDay ? S().peekDay(k) : null);
      if (pd && !pd.ended && !isEmptyDay(pd)) return k;
    }
    return null;
  }
  function renderSettleBar() {
    const bar = document.getElementById('settle-bar');
    if (!bar) return;
    const k = missedSettleKey();
    if (!k) { bar.innerHTML = ''; return; }
    const st = S().settings();
    const autoOff = st.autoEndDay === false;
    const noRoll = st.rollover === false;
    let warn = '';
    if (autoOff) {
      warn += '<br><span class="settle-warn">\u26A0\uFE0F 「到点自动结算」是<b>关着</b>的（设置 \u2192 \u23F0 到点自动结算），所以它不会自己结。</span>';
    }
    if (noRoll) {
      warn += '<br><span class="settle-warn">\u26A0\uFE0F 「每日未完成任务自动顺延到明天」也是<b>关着</b>的（设置 \u2192 \u{1F518} 行为开关），所以结算完任务也不会搬过来。</span>';
    }
    bar.innerHTML = '<div class="settle-bar">' +
      '<span class="settle-txt">\u23F0 <b>' + S().shortDateCN(k) +
      '</b> 还没结算 \u2014\u2014 那天没做完的任务还没搬过来。' + warn + '</span>' +
      '<button class="btn btn-small btn-primary" data-act="settle-now">\u{1F3C1} 现在结算</button>' +
      '</div>';
  }
  function bindSettleBar() {
    const bar = document.getElementById('settle-bar');
    if (!bar || bar.dataset.bound) return;
    bar.dataset.bound = '1';
    bar.addEventListener('click', function (e) {
      const b = e.target.closest('[data-act]');
      if (b && b.dataset.act === 'settle-now') {
        try { App.ui.closeModal(); } catch (err) { /* 忽略 */ }
        endDay();   // 它自己会用 pickSettleKey() 找到"那天"，不用你来选
      }
    });
  }

  /* ---------- \u21A9 v74：昨天搬过来的任务，一眼认得出 + 一键清掉 ---------- */
  /** 今天有哪些是「昨天没做完搬过来的」（只数必须/理想栏的 rolled） */
  function rolledList() {
    const day = (S().peekDay ? S().peekDay(S().todayKey()) : null);
    const out = [];
    if (!day || !day.tasks) return out;
    COLS.forEach(function (c) {
      (day.tasks[c.key] || []).forEach(function (t) {
        if (t.rolled) out.push({ col: c.key, task: t });
      });
    });
    return out;
  }
  function renderRollBar() {
    const bar = document.getElementById('roll-bar');
    if (!bar) return;
    const list = rolledList();
    if (!list.length) { bar.innerHTML = ''; return; }
    const n = list.length;
    bar.innerHTML = '<div class="roll-bar">' +
      '<span class="roll-txt">\u21A9 今天有 <b>' + n + '</b> 条是<b>昨天没做完</b>搬过来的 ' +
      '\u2014\u2014 不打算做的直接清掉，别让它占着清单</span>' +
      '<button class="btn btn-small" data-act="roll-clear">\u{1F9F9} 清掉这 ' + n + ' 条</button>' +
      '</div>';
  }
  function bindRollBar() {
    const bar = document.getElementById('roll-bar');
    if (!bar || bar.dataset.bound) return;
    bar.dataset.bound = '1';
    bar.addEventListener('click', function (e) {
      const b = e.target.closest('[data-act]');
      if (b && b.dataset.act === 'roll-clear') rollClear();
    });
  }
  function rollClear() {
    const list = rolledList();
    if (!list.length) { App.ui.toast('没有可清的了'); return; }
    const n = list.length;
    App.ui.confirm('清掉这 ' + n + ' 条昨天搬来的任务？<br>' +
      '<span style="color:#8a919c">它们会从今天的清单里消失（想找回就去「\u{1F5D1} 回收站」）。拓展栏那条带扣分规则的不会被清。</span>',
      '清掉 ' + n + ' 条', function () {
        const day = S().getDay(S().todayKey());
        const rm = {};
        list.forEach(function (x) { rm[x.task.id] = 1; });
        let cnt = 0;
        ['required', 'ideal', 'extra'].forEach(function (k) {
          const keep = [];
          (day.tasks[k] || []).forEach(function (t) {
            if (rm[t.id]) {
              trashPush({ kind: 'task', dayKey: S().todayKey(), col: k, payload: JSON.parse(JSON.stringify(t)) });
              cnt++;
            } else keep.push(t);
          });
          day.tasks[k] = keep;
        });
        S().save();
        renderAll();
        App.ui.toast('\u{1F9F9} 清掉 ' + cnt + ' 条 \u2014\u2014 清单轻了', 4200);
      });
  }

  function renderAll() {
    renderToday();
    renderTomorrow();
    // 🎧 三步面板的按钮/预算是动态拼进任务行的，渲染完要重新接一次事件
    if (App.lecture && App.lecture.bindInline) App.lecture.bindInline();
    if (typeof App.app !== 'undefined') App.app.refreshStats();
  }

  function init() {
    document.querySelectorAll('.tab-btn').forEach(function (b) {
      b.onclick = function () { switchTab(b.dataset.tab); };
    });
    document.getElementById('btn-end-day').onclick = endDay;
    streakRestore(); // 恢复刷新前的连续学习（当天有效）
    // ⏱ 小时计划常驻 tick：连续学习累计 + 到点自动结算 + 实时刷新倒计时
    setInterval(function () { hourPlanAutoTick(); }, 1000);
    // ⏰ v66：到点自动结算 —— 每 30 秒看一眼（页面切后台靠下面的可见性事件补判）
    setInterval(function () { try { autoEndDayTick(); } catch (e) { /* 忽略 */ } }, 30000);
    // 🌱 v70：间隔复习 —— 每 30 秒看一眼有没有到点的轮次（到点提醒 + 刷新顶部的「待复习」条）
    setInterval(function () {
      try { srCheckDue(); if (activeTab === 'today') { renderReviewBanner(); renderSlotBar(); } } catch (e) { /* 忽略 */ }
    }, 30000);
    setTimeout(function () { try { srCheckDue(); } catch (e) { /* 启动时先看一眼 */ } }, 4000);
    setTimeout(function () { try { autoEndDayTick(); } catch (e) { /* 启动时补判昨天 */ } }, 2500);
    // ★ v55：页面重新可见 / 从后台回来 / 手机回前台 → 立刻判一次，逾期的小时代马上结算
    // ★ v56：上次留下"待办衔接"（某题没标结果 / 接着做还是休息）→ 启动就把悬浮窗亮出来
    try {
      const d0 = S().getDay(S().todayKey());
      if (d0.pendingChoice || (d0.pendingSubs || []).length) {
        const f0 = document.querySelector('#timer-float');
        if (f0) f0.classList.remove('hidden');
        renderDrawer();
      }
    } catch (e) { /* 忽略 */ }
    ['visibilitychange', 'pageshow', 'focus'].forEach(function (ev) {
      window.addEventListener(ev, function () {
        if (document.hidden) return;
        try { hourPlanAutoTick(); } catch (e) { /* 忽略 */ }
        try { autoEndDayTick(); } catch (e) { /* 忽略 */ }   // ⏰ 回前台补判自动结算
      });
    });
    // 手机锁屏/切后台会释放防息屏锁，回前台且有计时时重新拿一次
    window.addEventListener('pagehide', function () { wakeFree(); saveTimerSnap(); });   // 🛟 v107：走之前记一笔
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) { saveTimerSnap(); return; }                                   // 🛟 v107：切后台/关标签也记一笔
      if (!timer && !cdTimer) return;
      wakeKeep();
      showTimerBar();   // 兜一次：万一悬浮窗被小窗带走或丢了，这里会把它补回页面
    });
    window.addEventListener('focus', function () {
      if ((timer || cdTimer) && floatRoot() && floatRoot().classList.contains('hidden')) showTimerBar();
    });
    // 🛟 v107：启动最后一步 —— 看看上一次是不是有没结束的计时，能接就接、接不了就让用户定
    try { restoreTimerSnap(); } catch (e) { /* 恢复失败绝不能影响打开 */ }
  }

  /* ============================================================
   * v126 ⚡ 智能快速添加 —— 整句输入，自动拆出 日期 / 时段 / 时长 / 学科
   * 「明天下午背英语单词30分钟」→ 明天(≈15:00) · 30分钟 · 英语 · 背英语单词
   * 原则：只拿「结构」，认不出的字全部留给任务名，绝不吞内容
   * ============================================================ */
  const QA_CN_DIG = { '一': 1, '二': 2, '两': 2, '三': 3, '四': 4, '五': 5, '六': 6, '七': 7, '八': 8, '九': 9 };
  function qaCnNum(s) {
    if (s == null) return NaN;
    if (/^[0-9]+$/.test(s)) return parseFloat(s);
    if (s === '半') return 0.5;
    if (s === '十') return 10;
    const i = s.indexOf('十');
    if (i >= 0) {
      const a = i > 0 ? (QA_CN_DIG[s[i - 1]] || 1) : 1;
      const b = i < s.length - 1 ? (QA_CN_DIG[s[i + 1]] || 0) : 0;
      return a * 10 + b;
    }
    if (s.length === 1) return QA_CN_DIG[s] != null ? QA_CN_DIG[s] : NaN;
    return NaN;
  }
  const QA_WD = { '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '日': 0, '天': 0 };

  function quickParse(raw) {
    const input = String(raw || '');
    let rest = ' ' + input.trim() + ' ';
    const res = { raw: input, offset: null, hour: null, hourApprox: false, minute: 0, minutes: null, subject: null, title: '' };
    const eat = function (re) {
      const m = rest.match(re);
      if (m) rest = rest.replace(m[0], ' ');
      return m;
    };
    let m;
    // ---- 时长（先「X个半」再「半小时」再小时再分钟，避免互相吃）----
    if ((m = eat(/([0-9一二两三四五六七八九十]+)\s*个\s*半\s*(?:小时|钟头)/))) res.minutes = qaCnNum(m[1]) * 60 + 30;
    if (res.minutes == null && eat(/半\s*个?\s*(?:小时|钟头)/)) res.minutes = 30;
    if (res.minutes == null && (m = eat(/([0-9一二两三四五六七八九十]+)\s*(?:个\s*)?(?:小时|钟头)(?:\s*([0-9一二两三四五六七八九十]+)\s*分[钟]?)?/))) {
      res.minutes = qaCnNum(m[1]) * 60 + (m[2] != null ? qaCnNum(m[2]) : 0);
    }
    if (res.minutes == null && (m = eat(/([0-9一二两三四五六七八九十]+)\s*分[钟]/))) res.minutes = qaCnNum(m[1]);
    if (res.minutes == null && (m = eat(/([0-9]+(?:\.[0-9]+)?)\s*(h|hr|hour|hours|min|mins|minutes)\b/i))) {
      const v = parseFloat(m[1]);
      res.minutes = /^h/i.test(m[2]) ? Math.round(v * 60) : Math.round(v);
    }
    if (res.minutes != null && (isNaN(res.minutes) || res.minutes <= 0 || res.minutes > 24 * 60)) res.minutes = null;
    // ---- 日期 ----
    if (eat(/大\s*后\s*天/)) res.offset = 3;
    else if (eat(/后\s*天/)) res.offset = 2;
    else if (eat(/明\s*(?:天|日)/)) res.offset = 1;
    else if (eat(/今\s*(?:天|日)|今\s*晚/)) res.offset = 0;
    else if ((m = eat(/下\s*(?:周|星期|礼拜)\s*([一二三四五六日天])/))) {
      res.offset = ((QA_WD[m[1]] - new Date().getDay() + 7) % 7) + 7;
    } else if ((m = eat(/(?:周|星期|礼拜)\s*([一二三四五六日天])/))) {
      res.offset = (QA_WD[m[1]] - new Date().getDay() + 7) % 7;
    } else if ((m = eat(/([0-9]{1,2})\s*月\s*([0-9]{1,2})\s*[日号]/))) {
      const now = new Date();
      let dt = new Date(now.getFullYear(), +m[1] - 1, +m[2]);
      const t0 = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      if (dt < t0) dt.setFullYear(dt.getFullYear() + 1);
      res.offset = Math.round((dt - t0) / 86400000);
    } else if ((m = eat(/([0-9]{1,2})\s*[日号]/))) {
      const now = new Date();
      let dt = new Date(now.getFullYear(), now.getMonth(), +m[1]);
      const t0 = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      if (dt < t0) dt.setMonth(dt.getMonth() + 1);
      res.offset = Math.round((dt - t0) / 86400000);
    }
    if (res.offset == null) res.offset = 0;
    // ---- 时刻（先「X点半」再「H:MM」）----
    if ((m = eat(/(凌晨|早上|早晨|上午|中午|午间|下午|傍晚|晚上|夜里|晚间)?\s*([0-9一二两三四五六七八九十]{1,2})\s*[点时]\s*(半|[0-9]{1,2})?\s*分?/))
      || (m = eat(/(凌晨|早上|早晨|上午|中午|午间|下午|傍晚|晚上|夜里|晚间)?\s*([0-9]{1,2})\s*[：:]\s*([0-9]{1,2})/))) {
      const h0 = qaCnNum(m[2]);
      if (!isNaN(h0)) {
        let h = h0;
        const mi = m[3] != null ? (m[3] === '半' ? 30 : (qaCnNum(m[3]) || 0)) : 0;
        const p = m[1] || '';
        if ((p === '下午' || p === '傍晚' || p === '晚上' || p === '夜里' || p === '晚间') && h < 12) h += 12;
        if (p === '凌晨' && h === 12) h = 0;
        if (h >= 0 && h <= 23 && mi >= 0 && mi <= 59) { res.hour = h; res.minute = mi; res.hourApprox = false; }
      }
    }
    if (res.hour == null && (m = eat(/凌晨|早上|早晨|上午|中午|午间|下午|傍晚|晚上|夜里|晚间/))) {
      const p = m[0];
      res.hour = p.indexOf('凌晨') >= 0 ? 1
        : (p === '早上' || p === '早晨' || p === '上午') ? 8
        : (p === '中午' || p === '午间') ? 12
        : (p === '下午') ? 15
        : (p === '傍晚') ? 17 : 19;
      res.hourApprox = true;
    }
    // ---- 任务名（剩下的字都给它）----
    let title = rest.replace(/\s+/g, ' ').trim()
      .replace(/^[，,。；;、的\s]+/, '')
      .replace(/[，,。；;、\s]+$/, '');
    res.subject = (App.stats && App.stats.subjectOf) ? App.stats.subjectOf(title) : null;
    if (res.subject && title.indexOf(res.subject) !== 0) title = res.subject + ' · ' + title;
    res.title = title || input.trim();
    return res;
  }
  function qaDayKey(offset) {
    const n = new Date();
    return S().dateKey(new Date(n.getFullYear(), n.getMonth(), n.getDate() + (offset || 0)));
  }
  /** 解析结果 → 真任务。返回 'ok' | 'dup' */
  function quickApply(p, col) {
    if (!p || !p.title) return 'dup';
    const t = { id: S().uid(), text: p.title, done: false };
    if (p.minutes) t.minutes = p.minutes;
    const pts = taskPoints({}, col);
    if (pts != null) t.points = pts;
    if (col === 'queue') {
      const q = (S().data().queue = S().data().queue || []);
      if (q.some(function (x) { return x.text === p.title && x.done !== true; })) return 'dup';   // ⚡ v126：队列里同名未完成的不再重复加
      q.push({ id: S().uid(), text: p.title, minutes: p.minutes || 30, done: false, added: Date.now() });
      S().save();
      if (App.queue && App.queue.render) try { App.queue.render(); } catch (e) {}
      return 'ok';
    }
    const dayKey = qaDayKey(p.offset);
    if (p.offset === 0) {
      const day = S().getDay(dayKey);
      if (!day.tasks[col]) day.tasks[col] = [];
      if (day.tasks[col].some(function (x) { return x.text === t.text; })) return 'dup';
      day.tasks[col].push(t);
      S().save(); renderToday();
      return 'ok';
    }
    const ok = App.calendar.copyTaskToDay({ text: t.text, points: t.points }, 'required', dayKey, null, false, col);
    return ok === false ? 'dup' : 'ok';
  }
  let qaState = null;
  function quickAddModal() {
    const names = { required: '今天 · 必须完成', ideal: '今天 · 理想（选做）', extra: '今天 · 长期拓展', queue: '📋 队列（按顺序做）' };
    qaState = { parsed: quickParse(''), col: 'required' };
    const m = App.ui.openModal('⚡ 快速添加',
      '<p class="hint">像说话一样整句写，我来自动拆 <b>日期 / 时段 / 时长 / 学科</b>：<br>' +
      '比如「明天下午背英语单词30分钟」「后天 数学卷子 1小时」「周五晚上 整理错题本」。<br>' +
      '认不出的字全都留给任务名，不会吞内容。</p>' +
      '<div class="field"><input type="text" id="qa-text" style="width:100%" placeholder="比如：明天下午背英语单词30分钟" /></div>' +
      '<div id="qa-preview" class="qa-preview"></div>' +
      '<div class="field"><label>加到哪里（日期不是今天时，会加到 📅 日历那天）</label>' +
      '<div class="qa-targets" id="qa-targets"></div></div>',
      '<button class="btn btn-primary" data-act="qa-add">⚡ 添加</button>' +
      '<button class="btn" data-act="cancel">取消</button>');
    const input = m.querySelector('#qa-text');
    const prev = m.querySelector('#qa-preview');
    const tbox = m.querySelector('#qa-targets');
    const paintTargets = function () {
      const opts = qaState.parsed.offset === 0 ? ['required', 'ideal', 'extra', 'queue'] : ['required', 'ideal', 'extra'];
      tbox.innerHTML = opts.map(function (c) {
        return '<button class="btn btn-small qa-t' + (qaState.col === c ? ' on' : '') + '" data-col="' + c + '">' + names[c] + '</button>';
      }).join('');
      tbox.querySelectorAll('.qa-t').forEach(function (b) {
        b.onclick = function () { qaState.col = b.dataset.col; paintTargets(); };
      });
    };
    const paint = function () {
      qaState.parsed = quickParse(input.value);
      const p = qaState.parsed;
      if (!input.value.trim()) {
        prev.innerHTML = '<p class="hint">识别结果会出现在这里。</p>';
        paintTargets(); return;
      }
      const dt = new Date(); dt.setDate(dt.getDate() + p.offset);
      const chips = ['📅 ' + (p.offset === 0 ? '今天' : p.offset === 1 ? '明天'
        : (dt.getMonth() + 1) + '/' + dt.getDate() + ' 周' + '日一二三四五六'[dt.getDay()])];
      if (p.hour != null) chips.push('⏰ ' + (p.hourApprox ? '≈' : '') + S().hhmmOf(p.hour * 60 + p.minute));
      if (p.minutes) chips.push('⏱ ' + S().fmtDur(p.minutes));
      if (p.subject) chips.push('🏷 ' + p.subject);
      prev.innerHTML = '<div class="qa-chips">' + chips.map(function (c) { return '<span>' + c + '</span>'; }).join('') + '</div>' +
        '<div class="qa-title">任务名 → <b>' + S().esc(p.title) + '</b></div>';
      paintTargets();
    };
    input.addEventListener('input', paint);
    paint();
    App.ui.bindActions({
      'qa-add': function () {
        if (!input.value.trim()) { App.ui.toast('先写一句吧'); return; }
        const r = quickApply(qaState.parsed, qaState.col);
        if (r === 'dup') App.ui.toast('那天已经有同名任务了 —— 没有重复加');
        else { App.ui.closeModal(); App.ui.toast('⚡ 已添加：' + qaState.parsed.title); }
      },
      cancel: App.ui.closeModal
    });
    setTimeout(function () { try { input.focus(); } catch (e) {} }, 60);
  }

  App.tasks = {
    buildTasksImage: buildTasksImage,
    exportTasksImage: exportTasksImage,
    futureDaysModal: futureDaysModal,
    dayContentSummary: dayContentSummary,
    init: init, renderAll: renderAll, renderToday: renderToday,
    quickParse: quickParse, quickAddModal: quickAddModal, quickApply: quickApply,
    carryTagHTML: carryTagHTML, settleDayCore: settleDayCore,
    taskRowHTML: taskRowHTML, bindTaskAreaEvents: bindTaskAreaEvents,
    // 🌱 v115：复习计划（用户自定义）
    parseGap: parseGap, fmtGap: fmtGap, srCfgOf: srCfgOf, srBuildPlan: srBuildPlan,
    srReschedule: srReschedule, srPlanModal: srPlanModal, srWhen: srWhen, srWanted: srWanted,
    srAskAgain: srAskAgain,     // 🔁 v116
    mcWritable: mcWritable,     // 🃏 v117
    autoEndDayTick: autoEndDayTick, autoSettleKey: autoSettleKey,
    toggleTask: toggleTask, startTimer: startTimer, togglePause: togglePause,
    stopTimer: stopTimer, endDay: endDay, onTick: onTick,
    addTaskModal: addTaskModal, editTaskModal: editTaskModal,
    // 🧩 v110：基础任务明细里要复用任务页那套"小题按钮"，所以把这些也导出去
    addSubModal: addSubModal, delSub: delSub, addGroupModal: addGroupModal, delGroupSub: delGroupSub,
    openSplit: openSplit, editSubSummary: editSubSummary, trashPush: trashPush,
    // 🌱 v70 主动回忆 + 间隔重复
    srOn: srOn, srGaps: srGaps, srDeadlineHM: srDeadlineHM, srPoints: srPoints,
    srKpPoints: srKpPoints, srFinishBonus: srFinishBonus,
    planSpaced: planSpaced, srPlan: srPlan, srPendingOf: srPendingOf,
    srPendingList: srPendingList, renderReviewBanner: renderReviewBanner,
    srCarriers: srCarriers, revDotsHTML: revDotsHTML,     // 🌱 v112
    srStartRound: srStartRound, srFinishRound: srFinishRound, srAskKps: srAskKps,
    srHHMM: srHHMM, srClockMs: srClockMs, srClockMsOf: srClockMs,
    // ⏰ v71 学习时段
    slotOn: slotOn, slotHM: slotHM, slotMin: slotMin, slotRangeText: slotRangeText,
    slotState: slotState, slotWhenText: slotWhenText, slotDurText: slotDurText,
    slotNewStats: slotNewStats, renderSlotBar: renderSlotBar, slotHintHTML: slotHintHTML,
    // ↩ v74 昨天搬来的任务
    renderRollBar: renderRollBar, rolledList: rolledList, rollClear: rollClear,
    // ⏰ v76 漏结算提醒
    missedSettleKey: missedSettleKey, renderSettleBar: renderSettleBar,
    modeTagHTML: modeTagHTML, srLogWork: srLogWork, srCheckDue: srCheckDue,
    srAfterTaskDone: srAfterTaskDone, srRunPending: srRunPending,
    srFindTask: srFindTask, srShortModal: srShortModal, srOpenReview: srOpenReview,
    srRenderKps: srRenderKps, srSaveKps: srSaveKps, srPaintKps: srPaintKps,
    getTimer: function () { return timer; },
    // 🛟 v107：快照读写（测试与排查都用得上）
    saveTimerSnap: saveTimerSnap, restoreTimerSnap: restoreTimerSnap, readTimerSnap: readTimerSnap,
    clearTimerSnap: clearTimerSnap,
    srShortModal: function (q) { srShortModal(q); },
    getCdTimer: function () { return cdTimer; },
    startSmallRest: startSmallRest, endSmallRest: endSmallRest,
    pauseForRest: pauseForRest, resumeAfterRest: resumeAfterRest,   // 🧊 v106
    isRunning: isRunning, elapsedMs: elapsedMs,
    toggleCdPause: toggleCdPause, cdFinish: cdFinish,
    startCdTimer: startCdTimer,
    pipOpen: pipOpen, pipBack: pipBack, pipToggle: pipToggle, isPip: inPip,
    pipNeedSpace: pipNeedSpace, floatDoc: floatDoc, refreshFloat: showTimerBar,
    bindFloatButtons: bindFloatButtons,
    dupMergeModal: dupMergeModal, mergeTaskInto: mergeTaskInto, findDupTask: findDupTask,
    lecTagHTML: lecTagHTML, lecPlanOf: lecPlanOf, lecBudgetDefaults: lecBudgetDefaults,
    hourPlanAutoTick: hourPlanAutoTick, endHourPlan: endHourPlan,
    hourPlanActual: hourPlanActual, hourPlanSummary: hourPlanSummary,
    pendingBarHTML: pendingBarHTML, bindPendingBar: bindPendingBar,
    lecturePickModal: lecturePickModal, lectureItemsOf: lectureItemsOf,
    startQueue: startQueue, queueInfo: queueInfo, playQueueItem: playQueueItem,
    endQueue: endQueue, afterLecture: afterLecture, queuePrompt: queuePrompt,
    askSwitchLecture: askSwitchLecture,
    doPendingAction: doPendingAction, resolvePendingSub: resolvePendingSub,
    settleCdNow: settleCdNow, setPendingChoice: setPendingChoice, clearPendingChoice: clearPendingChoice,
    wakeFree: wakeFree, bringPageForModal: bringPageForModal,
    finishSubByLecture: finishSubByLecture, startLectureFromSub: startLectureFromSub,
    dropLectureIfDeleted: dropLectureIfDeleted,
    askNotify: askNotify, notifyNow: notifyNow,
    quickFinishSub: quickFinishSub, startNextSub: startNextSub,
    // 从计时悬浮窗「🧭 回拆解」按钮回来：用当前倒计时的上下文重开拆解界面（不重置计时）
    reopenSplit: function () {
      if (!cdTimer) { App.ui.toast('当前没有在拆解的题'); return; }
      if (!cdTimer.fromSplit) { App.ui.toast('这个倒计时不是逐题拆解'); return; }
      openSplit(cdTimer.taskKey, cdTimer.taskId, cdTimer.subId, cdTimer.groupId || null);
    }
  };

  bindFloat(floatRoot());
  // 留一份干净模板：悬浮窗万一被小窗带走/销毁，能原样重造出来
  (function () {
    const f = document.getElementById('timer-float');
    if (f) { floatTpl = f.cloneNode(true); floatTpl.classList.add('hidden'); }
  })();
})();