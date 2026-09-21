/* lecture.js — 🎓 听课三步：预习(倒计时封顶) → 听课(白板+计时) → 整理(重构+封顶)
   方法内核：信息处理从"被动复制"转为"主动筛选"——每步结束必须写一句话，
   三步齐了才发大奖（提前定的积分），断了/跳步就拿不到。 */
(function () {
  'use strict';
  const App = (window.App = window.App || {});
  const S = () => App.store;

  const PREVIEW_ITEMS = ['先精读课程目标', '再读要点总结', '其余内容快速扫过（不求全懂）'];
  const PREP_ITEMS = ['💧 水已备好', '📱 手机已放远', '📄 空白纸和笔在手边'];

  const INPUT_STYLE = 'background:#fff;border:1px solid var(--line);border-radius:6px;padding:6px 8px;color:var(--ink);font-size:13px';

  /* ---------- 工具 ---------- */
  function fmtClock(ms) { return S().fmtClock(ms); }
  function today() { return S().getDay(S().todayKey()); }
  function ensure(day) {
    day.lectures = day.lectures || [];
    return day;
  }
  function phaseLabel(p) {
    return p === 'preview' ? '① 预习' : (p === 'attend' ? '② 听课' : '③ 整理');
  }
  /** 各步实际用时（秒）。preview/consolidate 封顶=预算，超出部分不鼓励但如实记录 */
  function phaseSeconds(L, name) {
    // ✅ v64：已经结束的阶段直接用"固化过的净秒数"。
    //    （pausedMs 是单值，进下一阶段会被 resetPause 清零 → 不固化的话这一阶段的暂停就丢了）
    const fixed = name === 'preview' ? L.previewNetSec
      : (name === 'attend' ? L.attendNetSec : L.consNetSec);
    if (fixed != null) return Math.max(0, Math.floor(fixed));
    // ⏸ 暂停中：把"当前时刻"钉在按下暂停的那一刻 —— 这样秒数真的完全冻住，
    // 也不会出现 floor(a+b)-floor(b) 的 1 秒取整漂移
    const nowMs = L.pauseAt || Date.now();
    let sec = 0;
    if (name === 'preview') {
      if (L.previewStartAt == null) return 0;
      const end = L.previewEndAt != null ? L.previewEndAt : nowMs;
      sec = Math.max(0, Math.floor((end - L.previewStartAt) / 1000));
    } else if (name === 'attend') {
      if (L.attendStartAt == null) return 0;
      const end = L.attendEndAt != null ? L.attendEndAt : nowMs;
      sec = Math.max(0, Math.floor((end - L.attendStartAt) / 1000));
    } else {
      if (L.consStartAt == null) return 0;
      const end = L.consEndAt != null ? L.consEndAt : nowMs;
      sec = Math.max(0, Math.floor((end - L.consStartAt) / 1000));
    }
    // ⏸ 暂停/小休的时间不算：用户中途去准备、去吃饭、坐下来先调时间，不该白跑
    if (L.pausedMs) sec -= Math.floor(L.pausedMs / 1000);
    return Math.max(0, sec);
  }

  /** 进下一个阶段时把暂停状态清掉（新阶段重新开始计时） */
  function resetPause(L) { L.pausedMs = 0; L.pauseAt = null; L.restUntil = null; }

  /** ⚠️ v64：阶段结束、准备 resetPause 之前，先把这一阶段"扣掉暂停后的净秒数"固化下来。
      pausedMs 是共享的单值，清零后上一阶段的暂停时长就再也算不回来了 ——
      这是"听课 4 小时里其实只学了 1 小时、时间轴却记成 4 小时"的根因。 */
  function freezePhase(L, name) {
    if (!L) return;
    if (name === 'preview') { if (L.previewNetSec == null) L.previewNetSec = Math.floor(phaseSeconds(L, 'preview')); }
    else if (name === 'attend') { if (L.attendNetSec == null) L.attendNetSec = Math.floor(phaseSeconds(L, 'attend')); }
    else { if (L.consNetSec == null) L.consNetSec = Math.floor(phaseSeconds(L, 'cons')); }
  }

  /** ⏸ 暂停：先坐着把预算和时间想清楚再开始，或者中途去吃饭，时间都冻着 */
  function pauseLecture() {
    const L = today().activeLecture;
    if (!L || L.pauseAt) return;
    L.pauseAt = Date.now();
    S().save();
    refresh();
    App.ui.toast('⏸ 已暂停 —— 时间冻住了，准备好了点「▶ 继续」');
  }

  /** ▶ 继续 */
  function resumeLecture() {
    const L = today().activeLecture;
    if (!L || !L.pauseAt) return;
    L.pausedMs = (L.pausedMs || 0) + (Date.now() - L.pauseAt);
    L.pauseAt = null;
    L.restUntil = null;
    S().save();
    refresh();
    App.ui.toast('▶ 继续走，刚才暂停的时间没算进去');
  }

  /** ☕ 小休：暂停并设定休息多久，到点自动继续 */
  function restLecture(mins) {
    const L = today().activeLecture;
    if (!L) return;
    if (L.pauseAt) { resumeLecture(); }        // 已经暂停着 → 先归零再进小休
    const L2 = today().activeLecture;
    if (!L2) return;
    L2.pauseAt = Date.now();
    L2.restUntil = Date.now() + Math.max(1, mins) * 60000;
    S().save();
    refresh();
    App.ui.toast('☕ 小休 ' + mins + ' 分钟，休息时间不算听课，到点自动继续');
  }

  /** 小休时长选择 */
  function restModal() {
    const modal = App.ui.openModal('☕ 听课中小休',
      '<p style="font-size:13px">休息时间<b>不算听课时长</b>（预习/整理的倒计时也一起冻住），到点自动继续。</p>',
      '<button class="btn" data-act="r5">5 分钟</button>' +
      '<button class="btn" data-act="r10">10 分钟</button>' +
      '<button class="btn" data-act="r15">15 分钟</button>' +
      '<button class="btn" data-act="r20">20 分钟</button>' +
      '<button class="btn" data-act="cancel">不用了</button>');
    App.ui.bindActions({
      r5: function () { App.ui.closeModal(); restLecture(5); },
      r10: function () { App.ui.closeModal(); restLecture(10); },
      r15: function () { App.ui.closeModal(); restLecture(15); },
      r20: function () { App.ui.closeModal(); restLecture(20); },
      cancel: App.ui.closeModal
    });
    return modal;
  }

  /** 时钟文案：暂停 / 小休 / 正计时 / 倒计时 都在这里出 */
  function clockInfo(L, kind) {
    const cap = (kind === 'preview' ? L.previewMin : (kind === 'cons' ? L.consMin : 0)) * 60000;
    const used = phaseSeconds(L, kind) * 1000;
    if (L.pauseAt) {
      if (L.restUntil) {
        return { txt: '☕ 小休中 · 还剩 ' + fmtClock(Math.max(0, L.restUntil - Date.now())) + '（休息不算听课）', color: 'var(--muted)' };
      }
      return { txt: '⏸ 已暂停 —— 时间冻结中，准备好了点「▶ 继续」', color: 'var(--muted)' };
    }
    if (kind === 'attend') return { txt: '听课中 ' + fmtClock(used), color: 'var(--primary)' };
    const left = cap - used;
    if (left > 0) {
      return { txt: (kind === 'preview' ? fmtClock(left) + ' 后该去上课' : '整理剩 ' + fmtClock(left)), color: 'var(--primary)' };
    }
    return {
      txt: '⏰ 超时 ' + fmtClock(-left) + (kind === 'preview' ? ' —— 该停了，做减法！' : ' —— 差不多了，写逻辑链收尾'),
      color: 'var(--req)'
    };
  }

  /** 面板上的「暂停 / 小休 / 继续」按钮（页内和悬浮窗共用） */
  function pauseBtns(L, P) {
    if (L.pauseAt) {
      return '<button class="btn btn-small btn-primary" id="' + P + 'lec-resume">▶ 继续</button>';
    }
    return '<button class="btn btn-small" id="' + P + 'lec-pause" title="暂停：去准备、去吃饭，时间都不会白跑">⏸ 暂停</button>' +
      '<button class="btn btn-small" id="' + P + 'lec-rest" title="听课时小休一下，休息不算听课时长">☕ 小休</button>';
  }
  function allThreeDone(L) {
    return !L.skipPreview && !L.skipAttend && !L.skipCons;
  }

  /* ---------- 从任务一键进入：自动带课程名和时长（任务即课程） ---------- */
  /* 三步走完 → 自动勾掉关联任务（任务即课程）。积分已在「三步大奖」发过，这里只打勾不重复计分 */
  function autoCheckTask(L) {
    if (!L) return '';
    // 从小任务开的课 → 勾掉那条小任务（时间轴/积分在听课时已记过，这里只打勾不重复）
    if (L.subId) {
      if (App.tasks && App.tasks.finishSubByLecture) return App.tasks.finishSubByLecture(L) || '';
      return '';
    }
    if (!L.taskId) return '';
    let hit = null;
    [S().todayKey(), S().tomorrowKey()].forEach(function (k) {
      const d = S().getDay(k);
      ['required', 'ideal', 'extra'].forEach(function (col) {
        ((d.tasks && d.tasks[col]) || []).forEach(function (x) { if (x.id === L.taskId) hit = x; });
      });
    });
    if (!hit || hit.done) return '';
    hit.done = true;
    hit.doneByLecture = true;
    S().save();
    if (App.tasks && App.tasks.renderAll) App.tasks.renderAll();
    return hit.text;
  }

  /* ---------- 三步预算：记住上次用的，下次开课直接带上 ---------- */
  const DEF_BUDGET = { previewMin: 30, attendMin: 45, consMin: 30, pts: 15 };
  function defaults() {
    const st = S().settings();
    const d = st.lectureDefaults || {};
    return {
      previewMin: Math.max(1, +d.previewMin || DEF_BUDGET.previewMin),
      attendMin: Math.max(1, +d.attendMin || DEF_BUDGET.attendMin),
      consMin: Math.max(1, +d.consMin || DEF_BUDGET.consMin),
      pts: Math.max(0, d.pts != null ? +d.pts : (st.lectureBonusPts != null ? st.lectureBonusPts : DEF_BUDGET.pts))
    };
  }
  function rememberBudget(L) {
    const st = S().settings();
    st.lectureDefaults = { previewMin: L.previewMin, attendMin: L.attendMin, consMin: L.consMin, pts: L.pts || 0 };
    S().save();
  }

  /** 这一条（整条任务 / 小任务）是不是正在进行的那节课 */
  function isActive(taskId, subId) {
    const L = today().activeLecture;
    if (!L) return false;
    return subId ? L.subId === subId : (!L.subId && L.taskId === taskId);
  }

  /* ---------- 从任务 / 小任务直接开课：不弹窗，面板直接长在那一条下面 ---------- */
  function beginLecture(o) {
    const day = today();
    if (day.activeLecture) {
      // ★ v57：以前这里只弹一句一闪而过的 toast，用户以为"点了没反应"。
      // 现在交给任务模块弹一个明确的二选一窗（换课 / 先上完）
      if (App.tasks && App.tasks.askSwitchLecture) {
        App.tasks.askSwitchLecture(o.course, function () { return beginLectureRaw(o); });
        return null;
      }
      App.ui.toast('已经有一节课在进行中（' + day.activeLecture.course + '），先完成或放弃它', 3600);
      return null;
    }
    return beginLectureRaw(o);
  }

  /** 真开课（不做"已有课"的守卫）。forceBegin 会先把旧课按放弃存档，再调它 */
  function beginLectureRaw(o) {
    const day = today();
    const d = defaults();
    const pts = o.pts != null ? o.pts : d.pts;
    day.activeLecture = {
      id: S().uid(), course: o.course, taskId: o.taskId || null,
      subId: o.subId || null, groupId: o.groupId || null,   // 从小任务开的课记下来，走完勾那条小任务
      previewMin: o.previewMin != null ? o.previewMin : d.previewMin,
      attendMin: o.attendMin || d.attendMin,
      consMin: o.consMin != null ? o.consMin : d.consMin,
      pts: pts || 0,
      phase: 'preview', previewStartAt: Date.now(), pausedMs: 0, pauseAt: null, restUntil: null,
      previewNetSec: null, attendNetSec: null, consNetSec: null,   // v64：各阶段"扣掉暂停后的净秒数"
      checklist: [false, false, false], overdueToasted: false,
      createdAt: S().nowIso ? S().nowIso() : new Date().toISOString()
    };
    S().save();
    refresh();
    return day.activeLecture;
  }

  /** 把当前那节按"放弃"存档（已听时间照样记，不发奖）。不动别的 */
  function abandonActive() {
    const day = today();
    const L = day.activeLecture;
    if (!L) return false;
    L.abandoned = true;
    L.endAt = Date.now();
    if (L.phase === 'preview' && L.previewEndAt == null) L.previewEndAt = Date.now();
    if (L.phase === 'attend' && L.attendEndAt == null) L.attendEndAt = Date.now();
    if (L.phase === 'consolidate' && L.consEndAt == null) L.consEndAt = Date.now();
    freezePhase(L, L.phase === 'preview' ? 'preview' : (L.phase === 'attend' ? 'attend' : 'cons'));
    day.lectures = day.lectures || [];
    day.lectures.push(L);
    day.activeLecture = null;
    timelinePush(L);
    S().save();
    return true;
  }

  /** 强行换课：当前那节按"放弃"存档，再开新的 */
  function forceBegin(o) {
    abandonActive();
    return beginLectureRaw(o);
  }

  function startFromTask(task, fromTomorrow) {
    // ★ v62：任务上提前定好的听课预算（加/改任务时填的）优先，没填就用默认
    const p = (App.tasks && App.tasks.lecPlanOf) ? App.tasks.lecPlanOf(task) : null;
    const L = beginLecture({
      course: task.text, taskId: task.id,
      previewMin: p ? p.previewMin : null,
      attendMin: (p && p.attendMin) || task.lecMin || defaults().attendMin,
      consMin: p ? p.consMin : null,
      pts: (p && p.pts != null) ? p.pts : (task.points != null ? task.points : null)
    });
    if (!L) return;
    App.ui.toast((fromTomorrow
      ? '🎓 预习开始！（记在今天的时间轴；走完三步会勾掉「明天」那条任务）'
      : '🎓 预习开始！只读目标与总结，到点就停') +
      (p ? '（用你预设的 ' + p.previewMin + ' / ' + p.attendMin + ' / ' + p.consMin + ' 分钟）' : ''));
  }

  /** 从「小任务」开课：课程名=题目，听课预算=它的限时（做题和听课本来就是一回事）
      —— 任务组里的题、单独加的小任务都能开，和整条任务那套完全一样 */
  function startFromSub(task, sub, groupId, fromTomorrow) {
    if (!task || !sub) return;
    const d = defaults();
    const mins = Math.max(1, sub.minutes || d.attendMin);
    // 一道 5 分钟的题不该配 30 分钟预习（那样面板看着就别扭）→
    // 预习/整理都按题长封顶，但不超过你在设置里定的默认值
    const L = beginLecture({
      course: sub.text, taskId: task.id, subId: sub.id, groupId: groupId || null,
      attendMin: mins,
      previewMin: Math.min(d.previewMin, mins),
      consMin: Math.min(d.consMin, mins),
      pts: sub.points != null ? sub.points : null
    });
    if (!L) return;
    App.ui.toast((fromTomorrow ? '🎓 预习开始！（记在今天的时间轴；走完会勾掉「明天」那条小任务）' : '🎓 预习开始！') +
      '课程：' + sub.text + '（听课 ' + L.attendMin + ' 分）');
  }
  /* ---------- 步进 ---------- */
  function saveCheck(i, checked) {
    const L = today().activeLecture;
    if (!L) return;
    L.checklist = L.checklist || [false, false, false];
    L.checklist[i] = !!checked;
    S().save();
  }

  // 预习 →（弹核心问题）→ 课前准备 → 听课
  function previewDone() {
    const day = today(), L = day.activeLecture;
    if (!L || L.phase !== 'preview') return;
    const modal = App.ui.openModal('❓ 这节课要解决的核心问题',
      '<p style="font-size:13px">一句话写下来（预习的输出不是抄书，是带着问题去上课）：</p>' +
      '<div class="field"><textarea id="lec-q" style="width:100%;min-height:64px;border:1px solid var(--line);border-radius:8px;padding:8px;font-size:13.5px;resize:vertical" placeholder="例：为什么两种盐水解后酸碱性不同？"></textarea></div>',
      '<button class="btn btn-primary" data-act="ok">✔ 记下，去准备上课</button><button class="btn" data-act="cancel">再看看</button>');
    App.ui.bindActions({
      ok: function () {
        const v = (modal.querySelector('#lec-q').value || '').trim();
        if (!v) { App.ui.toast('写一句核心问题，这是预习的钩子'); return; }
        L.question = v;
        L.previewEndAt = Date.now();
        S().save();
        App.ui.closeModal();
        prepModal();
      },
      cancel: App.ui.closeModal
    });
  }

  function prepModal() {
    const day = today(), L = day.activeLecture;
    if (!L) return;
    const modal = App.ui.openModal('🧘 上课前 30 秒准备',
      '<p style="font-size:13px;margin-bottom:8px">提前准备是专注的一半。三项全勾才算准备好：</p>' +
      PREP_ITEMS.map(function (t, i) {
        return '<label style="display:flex;align-items:center;gap:8px;padding:8px 2px;font-size:14px;cursor:pointer">' +
          '<input type="checkbox" class="prep-chk" data-i="' + i + '" style="width:17px;height:17px" /> <span>' + t + '</span></label>';
      }).join(''),
      '<button class="btn btn-primary" data-act="ok" id="prep-ok" disabled style="opacity:.5">🪑 准备好了，开始听课</button><button class="btn" data-act="cancel">等一下</button>');
    const okBtn = modal.querySelector('#prep-ok');
    modal.querySelectorAll('.prep-chk').forEach(function (c) {
      c.onchange = function () {
        const all = Array.from(modal.querySelectorAll('.prep-chk')).every(function (x) { return x.checked; });
        okBtn.disabled = !all;
        okBtn.style.opacity = all ? '1' : '.5';
      };
    });
    App.ui.bindActions({
      ok: function () {
        freezePhase(L, 'preview');   // ⚠️ 必须赶在 resetPause 之前
        L.phase = 'attend';
        resetPause(L);
        L.prepDone = true;
        L.attendStartAt = Date.now();
        L.note = L.note || '';
        S().save();
        timelinePush(L); // 📅 开始听就进时间轴
        App.ui.closeModal();
        refresh();
        App.ui.toast('🪑 开始听课！只记重点，别在讲义上批注');
      },
      cancel: App.ui.closeModal
    });
  }

  function attendDone() {
    const day = today(), L = day.activeLecture;
    if (!L || L.phase !== 'attend') return;
    const sec = phaseSeconds(L, 'attend');
    if (sec < 60) { App.ui.toast('听课才不到 1 分钟，确认下课了吗？再点一次确认'); 
      if (!L.attendConfirm) { L.attendConfirm = true; S().save(); return; }
    }
    L.attendEndAt = Date.now();
    freezePhase(L, 'attend');    // ⚠️ 必须赶在 resetPause 之前
    L.attendConfirm = false;
    L.phase = 'consolidate';
    resetPause(L);
    L.consStartAt = Date.now();
    L.overdueToasted = false;
    S().save();
    timelinePush(L);   // ★ v55：阶段推进也要写时间轴，否则"听完课还没写整理"那段时间会丢
    refresh();
    App.ui.toast('✍️ 进入整理：用自己的逻辑重构笔记，可读 > 美观');
  }

  // 整理 →（弹核心逻辑链）→ 完成，发大奖
  function consolidateDone() {
    const day = today(), L = day.activeLecture;
    if (!L || L.phase !== 'consolidate') return;
    const modal = App.ui.openModal('🔗 这节课的收获（可留空）',
      '<p style="font-size:13px"><b>想写就写，不想写直接点完成</b> —— 留空不影响积分、不影响记录，也不会卡住这节课。'
      + '写下的东西之后在「历史」页（🎓 听课记录）能翻到。</p>' +
      '<div class="field"><textarea id="lec-chain" style="width:100%;min-height:84px;border:1px solid var(--line);border-radius:8px;padding:8px;font-size:13.5px;resize:vertical" placeholder="（可留空）"></textarea></div>',
      '<button class="btn btn-primary" data-act="ok">' + (allThreeDone(L) ? '🎁 完成三步，领大奖' : '✔ 完成记录') + '</button><button class="btn" data-act="cancel">再改改</button>');
    App.ui.bindActions({
      ok: function () {
        const v = (modal.querySelector('#lec-chain').value || '').trim();
        L.chain = v;   // ★ v55：留空也照样完成 —— 用户明确说不想被强制写
        L.consEndAt = Date.now();
        freezePhase(L, 'cons');      // ⚠️ 固化整理净时长，别让暂停混进总时长
        L.phase = 'done';
        L.endAt = Date.now();
        const bonus = allThreeDone(L) ? (L.pts || 0) : 0;
        L.awarded = bonus;
        day.lectures = day.lectures || [];
        day.lectures.push(L);
        day.activeLecture = null;
        S().save();
        if (bonus > 0) {
          App.store.addLedger(S().todayKey(), 'lecture', { points: bonus, note: '🎓 「' + L.course + '」听课三步齐了，大奖 +' + bonus + ' 分' });
        }
        timelinePush(L);
        const autoDone = autoCheckTask(L);
        // ★ v57：连着听的时候，交给任务模块弹"下一节"
        if (App.tasks && App.tasks.afterLecture) setTimeout(function () { App.tasks.afterLecture(L, 'done'); }, 80);
        App.ui.closeModal();
        refresh();
        if (App.app && App.app.refreshStats) App.app.refreshStats();
        App.ui.toast((bonus > 0
          ? ('🎉 三步齐了！「' + L.course + '」完成，大奖 +' + bonus + ' 分')
          : ('📝 「' + L.course + '」已记录（有三步没走全，没发大奖）'))
          + (autoDone ? ' ｜ 「' + autoDone + '」已自动打勾 ✓' : ''));
      },
      cancel: App.ui.closeModal
    });
  }

  function skipStep(which) {
    const day = today(), L = day.activeLecture;
    if (!L) return;
    App.ui.confirm('跳过这一步，这节课就拿不到三步大奖了（记录照样保留）。确定跳过？', '跳过', function () {
      if (which === 'preview') {
        L.skipPreview = true; L.previewEndAt = Date.now();
        freezePhase(L, 'preview');
        L.phase = 'attend'; resetPause(L); L.prepDone = false; L.attendStartAt = Date.now(); L.note = L.note || '';
        timelinePush(L);
        App.ui.toast('已跳过预习（无大奖）。听课开始');
      } else if (which === 'attend') {
        L.skipAttend = true; L.attendEndAt = Date.now();
        freezePhase(L, 'attend');
        L.phase = 'consolidate'; resetPause(L); L.consStartAt = Date.now(); L.overdueToasted = false;
        App.ui.toast('已跳过听课（无大奖）。进入整理');
      } else {
        L.skipCons = true; L.consEndAt = Date.now();
        freezePhase(L, 'cons');
        L.phase = 'done'; L.endAt = Date.now();
        L.awarded = 0;
        day.lectures = day.lectures || [];
        day.lectures.push(L);
        day.activeLecture = null;
        timelinePush(L);
        if (App.tasks && App.tasks.afterLecture) setTimeout(function () { App.tasks.afterLecture(L, 'done'); }, 80);
        App.ui.toast('已跳过整理（无大奖）。课程已记录');
      }
      S().save();
      refresh();
    });
  }

  function abandon() {
    const day = today(), L = day.activeLecture;
    if (!L) return;
    App.ui.confirm('放弃「' + L.course + '」的三步流程？已计的时间会存档，但不发积分。', '放弃', function () {
      L.abandoned = true;
      L.endAt = Date.now();
      if (L.phase === 'preview' && L.previewEndAt == null) L.previewEndAt = Date.now();
      if (L.phase === 'attend' && L.attendEndAt == null) L.attendEndAt = Date.now();
      if (L.phase === 'consolidate' && L.consEndAt == null) L.consEndAt = Date.now();
      freezePhase(L, L.phase === 'preview' ? 'preview' : (L.phase === 'attend' ? 'attend' : 'cons'));
      day.lectures = day.lectures || [];
      day.lectures.push(L);
      day.activeLecture = null;
      timelinePush(L);
      S().save();
      refresh();
      if (App.tasks && App.tasks.afterLecture) setTimeout(function () { App.tasks.afterLecture(L, 'abandon'); }, 80);
      App.ui.toast('已放弃并存档。下次换个预算再试');
    });
  }

  /* 时间轴同步（upsert）：开始听就挂一条，阶段推进/完成/放弃时更新同一条 */
  /** 时间戳兜底：新数据存的是毫秒数字，老/手写数据可能是 ISO 字符串 —— 两种都算得出来 */
  function msOf(v) {
    const n = +v;
    if (isFinite(n)) return n;
    const t = new Date(v).getTime();
    return isFinite(t) ? t : 0;
  }

  function timelinePush(L) {
    const day = today();
    day.timeline = day.timeline || [];
    const start = new Date(L.previewStartAt), end = new Date(L.endAt || Date.now());
    let sMin = start.getHours() * 60 + start.getMinutes();
    let eMin = end.getHours() * 60 + end.getMinutes();
    if (eMin < sMin) eMin = 1439;
    // ✅ v64：只把"净时长"（扣掉暂停/小休）记成学习时间；
    //    暂停了多久单列到 pausedMin，时间轴卡片会写"（暂停 X 不算）"
    const netSec = phaseSeconds(L, 'preview') + phaseSeconds(L, 'attend') + phaseSeconds(L, 'cons');
    const totalMin = Math.max(1, Math.round(netSec / 60));
    const spanSec = Math.max(0, Math.round((end.getTime() - msOf(L.previewStartAt)) / 1000));
    const pausedMin = Math.max(0, Math.round((spanSec - netSec) / 60));
    const content = '🎓 听课三步 · ' + L.course + (L.endAt ? (L.abandoned ? ' · 放弃' : (L.awarded > 0 ? ' · 三步达成' : '')) : ' · 进行中');
    const note = (L.question ? '核心问题：' + L.question + '　' : '') + (L.chain || '');
    const rec = day.timeline.find(function (r) { return r.lectureId === L.id; });
    if (rec) {
      rec.start = sMin; rec.end = eMin; rec.minutes = Math.min(totalMin, Math.max(1, eMin - sMin));
      rec.pausedMin = pausedMin;
      rec.content = content; rec.note = note;
    } else {
      day.timeline.push({
        id: S().uid(), start: sMin, end: eMin, minutes: Math.min(totalMin, Math.max(1, eMin - sMin)),
        content: content, category: 'study', countAsStudy: true, auto: true, lectureId: L.id,
        pausedMin: pausedMin,   // ⏸ 这段时间里暂停/小休了多少（不算学习）
        taskId: L.taskId || null,      // 记下来归属，小时计划才能把它算进对应的分类
        note: note
      });
    }
    S().save();
  }

  /* ---------- 渲染：三步面板直接长在任务行下面 ---------- */
  function refresh() {
    if (App.tasks && App.tasks.renderAll) App.tasks.renderAll();
    if (App.tasks && App.tasks.refreshFloat) App.tasks.refreshFloat();   // 悬浮窗里的听课面板一起刷
  }

  /** 正在进行的那节课（没有则 null）——悬浮窗用它决定要不要显示听课面板 */
  function current() {
    return today().activeLecture || null;
  }

  /** 这节课到目前为止一共用了多少秒（给小时计划的"进行中"统计用，暂停的时间不算） */
  function activeSeconds() {
    const L = today().activeLecture;
    if (!L) return 0;
    return phaseSeconds(L, 'preview') + phaseSeconds(L, 'attend') + phaseSeconds(L, 'cons');
  }

  /** 悬浮窗里的听课面板：和任务行那张用同一份状态、同一套内容
      （预算可改、清单可勾、白板可写），只是 id 前缀换成 fl- 免得撞车 */
  function floatPanelHTML() {
    const day = ensure(today());
    const L = day.activeLecture;
    if (!L) return '';
    const stepNo = L.phase === 'preview' ? 1 : (L.phase === 'attend' ? 2 : 3);
    let budget;
    if (L.phase === 'preview') {
      budget = '<span class="lec-bwrap">' +
        '<label class="lec-bl">预<input type="number" class="lec-b" data-k="previewMin" min="1" value="' + L.previewMin + '" /></label>' +
        '<label class="lec-bl">听<input type="number" class="lec-b" data-k="attendMin" min="1" value="' + L.attendMin + '" /></label>' +
        '<label class="lec-bl">整<input type="number" class="lec-b" data-k="consMin" min="1" value="' + L.consMin + '" /></label>' +
        '<label class="lec-bl">🎁<input type="number" class="lec-b" data-k="pts" min="0" value="' + (L.pts || 0) + '" /></label>' +
        '<span class="lec-bhint">分（可改）</span></span>';
    } else {
      budget = '<span class="lec-bhint">预算 预' + L.previewMin + ' / 听' + L.attendMin + ' / 整' + L.consMin +
        ' 分 · 大奖 ' + (L.pts || 0) + ' 分</span>';
    }
    return '<div class="lec-inline lec-float" data-fl-lec="' + L.id + '">' +
      '<div class="lec-head"><b>🎓 听课三步</b>' +
      '<span class="lec-step">' + S().esc(L.course) + ' · 第 ' + stepNo + '/3 步 · ' + phaseLabel(L.phase) + '</span>' + queueBadge() +
      '<span class="lec-spacer"></span>' + budget + '</div>' +
      phaseInner(L, 'fl-') +
      '</div>';
  }

  /** 接悬浮窗面板上的事件（和任务行那张共用 bindActive，只是 id 前缀不同） */
  function bindFloatLec(root) {
    const L = today().activeLecture;
    if (!L || !root) return;
    bindActive(root, L, 'fl-');
  }
  /** 某条任务 / 小任务行下面的三步面板；不是进行中的那一条 → 返回空串
      传了 sub 就是「小任务」视角（任务组里的题、单独小任务都一样） */
  /** 🎧 连听 3/12 —— 让用户一眼知道还在连听队列里 */
  function queueBadge() {
    let q = null;
    try { q = (App.tasks && App.tasks.queueInfo) ? App.tasks.queueInfo() : null; } catch (e) { q = null; }
    if (!q) return '';
    return '<span class="lec-q">🎧 连听 ' + q.idx + '/' + q.total + '</span>';
  }
  function inlineHTML(task, sub) {
    const day = ensure(today());
    const L = day.activeLecture;
    if (!L || !task) return '';
    if (sub ? L.subId !== sub.id : (L.subId || L.taskId !== task.id)) return '';
    const stepNo = L.phase === 'preview' ? 1 : (L.phase === 'attend' ? 2 : 3);
    let budget;
    if (L.phase === 'preview') {
      budget = '<span class="lec-bwrap">' +
        '<label class="lec-bl">预<input type="number" class="lec-b" data-k="previewMin" min="1" value="' + L.previewMin + '" /></label>' +
        '<label class="lec-bl">听<input type="number" class="lec-b" data-k="attendMin" min="1" value="' + L.attendMin + '" /></label>' +
        '<label class="lec-bl">整<input type="number" class="lec-b" data-k="consMin" min="1" value="' + L.consMin + '" /></label>' +
        '<label class="lec-bl">🎁<input type="number" class="lec-b" data-k="pts" min="0" value="' + (L.pts || 0) + '" /></label>' +
        '<span class="lec-bhint">分（可改）</span></span>';
    } else {
      budget = '<span class="lec-bhint">预算 预' + L.previewMin + ' / 听' + L.attendMin + ' / 整' + L.consMin +
        ' 分 · 大奖 ' + (L.pts || 0) + ' 分</span>';
    }
    return '<div class="lec-inline" data-lec-id="' + L.id + '">' +
      '<div class="lec-head"><b>🎓 听课三步</b>' +
      '<span class="lec-step">第 ' + stepNo + '/3 步 · ' + phaseLabel(L.phase) + '</span>' + queueBadge() +
      '<span class="lec-spacer"></span>' + budget + '</div>' +
      phaseInner(L) +
      '</div>';
  }

  /** 任务页渲染完后接事件（tasks.js 会调用）——面板可能有两张（任务行 / 小任务行），逐个绑 */
  function bindInline() {
    const day = today();
    const L = day.activeLecture;
    if (!L) return;
    document.querySelectorAll('.lec-inline[data-lec-id="' + L.id + '"]').forEach(function (wrap) {
      bindActive(wrap, L);            // 预算、清单、按钮、白板都在里面
    });
  }

  /** 「历史」页用的听课记录（最近 30 天） */
  function historyHTML() {
    const rows = [];
    const keys = [];
    for (let i = 0; i < 30; i++) { const d = new Date(); d.setDate(d.getDate() - i); keys.push(S().dateKey(d)); }
    keys.forEach(function (k) {
      ((S().getDay(k).lectures) || []).slice().reverse().forEach(function (x) {
        if (x.endAt) rows.push({ k: k, x: x });
      });
    });
    let html = '';
    if (!rows.length) {
      html = '<p class="hint">还没有听课记录。到「任务」页点任意一条任务右边的 🎧，走完「预习 → 听课 → 整理」三步，这里就会出现记录（三步齐了才发大奖）。</p>';
    } else {
      html += '<div class="lec-hist">';
      rows.slice(0, 25).forEach(function (r) {
        const x = r.x;
        const mins = Math.round((phaseSeconds(x, 'preview') + phaseSeconds(x, 'attend') + phaseSeconds(x, 'cons')) / 60);
        const pausedMin = x.endAt && x.previewStartAt
          ? Math.max(0, Math.round((msOf(x.endAt) - msOf(x.previewStartAt)) / 60000) - mins) : 0;
        const flag = x.abandoned ? '🚫 放弃' : (x.awarded > 0 ? '🎁 大奖 +' + x.awarded + ' 分' : '📄 未走全');
        html += '<div class="lec-hist-row">' +
          '<span class="lec-hist-date">' + S().fmtDateCN(r.k) + '</span>' +
          '<b>' + S().esc(x.course) + '</b>' +
          '<span class="lec-hist-min">预' + Math.round(phaseSeconds(x, 'preview') / 60) +
          ' · 听' + Math.round(phaseSeconds(x, 'attend') / 60) +
          ' · 整' + Math.round(phaseSeconds(x, 'cons') / 60) + ' 分 ＝ ' + mins + ' 分钟' +
          (pausedMin > 0 ? '（⏸ 暂停 ' + pausedMin + ' 分钟未计）' : '') + '</span>' +
          '<span class="lec-hist-flag">' + flag + '</span>' +
          '<button class="mc-ib" data-act="mc-hist" data-k="' + r.k + '" data-id="' + x.id +
          '" title="这节整理出的设问卡（课已经上完了也能补加）">🃏</button></div>' +
          (x.chain ? '<div class="lec-hist-chain">🔗 ' + S().esc(x.chain) + '</div>' : '');
      });
      if (rows.length > 25) html += '<div class="lec-hist-more">只显示最近 25 条（共 ' + rows.length + ' 条）</div>';
      html += '</div>';
    }
    let week = 0, weekMin = 0, weekBonus = 0;
    const wkeys = [];
    for (let i = 0; i < 7; i++) { const d = new Date(); d.setDate(d.getDate() - i); wkeys.push(S().dateKey(d)); }
    wkeys.forEach(function (k) {
      (S().getDay(k).lectures || []).forEach(function (x) {
        if (!x.endAt || x.abandoned) return;
        week++;
        weekMin += Math.round((phaseSeconds(x, 'preview') + phaseSeconds(x, 'attend') + phaseSeconds(x, 'cons')) / 60);
        weekBonus += x.awarded || 0;
      });
    });
    if (week > 0) {
      html += '<p class="hint" style="margin-top:10px">📊 最近 7 天：完成 <b style="color:var(--ink)">' + week + '</b> 节三步 · 总投入 ' +
        S().fmtDur(weekMin) + (weekBonus > 0 ? ' · 赢得大奖 ' + weekBonus + ' 分' : '') + '</p>';
    }
    return html;
  }

  /* 面板内的阶段内容（紧凑版，住在任务行下面） */
  function phaseInner(L, P) {
    P = P || '';   // id 前缀：页面里是空、悬浮窗里是 fl-
    if (L.phase === 'preview') {
      const ci = clockInfo(L, 'preview');
      return '<div class="lec-clock" id="' + P + 'lec-clock" style="color:' + ci.color + '">' + ci.txt + '</div>' +
        '<div class="lec-hint">只做这三件事，其余当小说翻：</div>' +
        PREVIEW_ITEMS.map(function (t, i) {
          const on = (L.checklist || [])[i];
          return '<label class="lec-chk-row"><input type="checkbox" class="lec-chk" data-i="' + i + '"' + (on ? ' checked' : '') + ' /> <span>' + t + '</span></label>';
        }).join('') +
        '<div class="lec-actions">' +
        pauseBtns(L, P) +
        '<button class="btn btn-small btn-primary" id="' + P + 'lec-preview-done">❓ 写核心问题 → 去上课</button>' +
        '<button class="btn btn-small" id="' + P + 'lec-skip">⏭ 跳过预习</button>' +
        '<button class="btn btn-small btn-danger" id="' + P + 'lec-abandon">🚫 放弃</button></div>';
    }
    if (L.phase === 'attend') {
      const ci2 = clockInfo(L, 'attend');
      return '<div class="lec-clock" id="' + P + 'lec-clock" style="color:' + ci2.color + '">' + ci2.txt + '</div>' +
        (L.question
          ? '<div class="lec-q">🎯 带着问题听：<b>' + S().esc(L.question) + '</b></div>'
          : '<div class="lec-hint">空白纸模式：只记关键词和重点，别抄整句。</div>') +
        '<textarea id="' + P + 'lec-note" class="lec-ta" placeholder="白纸区：只写重点……"></textarea>' +
        '<div class="lec-actions">' +
        pauseBtns(L, P) +
        '<button class="btn btn-small btn-primary" id="' + P + 'lec-attend-done">🔔 下课了，停表去整理</button>' +
        '<button class="btn btn-small" id="' + P + 'lec-skip">⏭ 跳过听课</button>' +
        '<button class="btn btn-small btn-danger" id="' + P + 'lec-abandon">🚫 放弃</button></div>';
    }
    const ci3 = clockInfo(L, 'cons');
    const mcN = (App.memcards && App.memcards.countForTask && L.taskId) ? App.memcards.countForTask(L.taskId) : 0;
    return '<div class="lec-clock" id="' + P + 'lec-clock" style="color:' + ci3.color + '">' + ci3.txt + '</div>' +
      '<div class="lec-hint">这一步<b>可写可不写</b>：想留点东西就写，不想写直接点完成，不影响积分。</div>' +
      '<textarea id="' + P + 'lec-note" class="lec-ta" placeholder="（可留空）">' + S().esc(L.note || '') + '</textarea>' +
      '<div class="lec-actions">' +
      pauseBtns(L, P) +
      '<button class="btn btn-small" id="' + P + 'lec-cards" title="对着笔记给自己出题：正面提问、反面答案。主动回忆最有效的一步">' +
      '🃏 设问卡' + (mcN ? '（' + mcN + ' 张）' : '') + '</button>' +
      '<button class="btn btn-small btn-primary" id="' + P + 'lec-cons-done">✅ 完成整理' +
      (allThreeDone(L) ? '（领大奖 +' + (L.pts || 0) + ' 分）' : '') + '</button>' +
      '<button class="btn btn-small" id="' + P + 'lec-skip">⏭ 跳过整理</button>' +
      '<button class="btn btn-small btn-danger" id="' + P + 'lec-abandon">🚫 放弃</button></div>';
  }

  let noteTimer = null;
  function bindActive(wrap, L, P) {
    P = P || '';                      // id 前缀：页面里是空、悬浮窗里是 fl-
    wrap.querySelectorAll('.lec-chk').forEach(function (c) {
      c.onchange = function () { saveCheck(+c.dataset.i, c.checked); };
    });
    // 预算（预/听/整/大奖分）在面板上随手就能改，两处面板共用这一套
    wrap.querySelectorAll('.lec-b').forEach(function (inp) {
      inp.onchange = function () {
        const k = inp.dataset.k;
        const floor = k === 'pts' ? 0 : 1;
        L[k] = Math.max(floor, +inp.value || 0);
        S().save();
        rememberBudget(L);
        refresh();
      };
    });
    const mcBtn = wrap.querySelector('#' + P + 'lec-cards');
    if (mcBtn) mcBtn.onclick = function () { App.memcards.openForLecture(L); };
    const pa = wrap.querySelector('#' + P + 'lec-pause');
    if (pa) pa.onclick = pauseLecture;
    const rs = wrap.querySelector('#' + P + 'lec-resume');
    if (rs) rs.onclick = resumeLecture;
    const rt = wrap.querySelector('#' + P + 'lec-rest');
    if (rt) rt.onclick = restModal;
    const pd = wrap.querySelector('#' + P + 'lec-preview-done');
    if (pd) pd.onclick = previewDone;
    const ad = wrap.querySelector('#' + P + 'lec-attend-done');
    if (ad) ad.onclick = attendDone;
    const cd = wrap.querySelector('#' + P + 'lec-cons-done');
    if (cd) cd.onclick = consolidateDone;
    const sk = wrap.querySelector('#' + P + 'lec-skip');
    if (sk) sk.onclick = function () { skipStep(L.phase === 'preview' ? 'preview' : (L.phase === 'attend' ? 'attend' : 'cons')); };
    const ab = wrap.querySelector('#' + P + 'lec-abandon');
    if (ab) ab.onclick = abandon;
    const note = wrap.querySelector('#' + P + 'lec-note');
    if (note) {
      note.value = L.note || '';
      note.oninput = function () {
        L.note = note.value;
        if (noteTimer) clearTimeout(noteTimer);
        noteTimer = setTimeout(function () { S().save(); }, 600);
      };
    }
  }

  /* ---------- 每秒刷新时钟（只改文本，不动输入框） ---------- */
  setInterval(function () {
    const day = App.store ? S().getDay(S().todayKey()) : null;
    const L = day && day.activeLecture;
    if (!L) return;
    // ☕ 小休到点 → 自动继续（时间继续走）
    if (L.pauseAt && L.restUntil && Date.now() >= L.restUntil) { resumeLecture(); return; }
    const kind = L.phase === 'preview' ? 'preview' : (L.phase === 'attend' ? 'attend' : (L.phase === 'consolidate' ? 'cons' : null));
    if (!kind) return;
    // 面板可能同时出现在「任务页」和「悬浮窗（小窗）」两处 → 都刷，别只刷一个
    const els = [];
    document.querySelectorAll('.lec-clock').forEach(function (x) { els.push(x); });
    if (App.tasks && App.tasks.floatDoc) {
      try {
        const d = App.tasks.floatDoc();
        if (d && d !== document) d.querySelectorAll('.lec-clock').forEach(function (x) { els.push(x); });
      } catch (e) { /* 忽略 */ }
    }
    if (!els.length) return;
    const info = clockInfo(L, kind);
    els.forEach(function (x) { x.textContent = info.txt; x.style.color = info.color; });
    if (L.pauseAt) return;                  // 暂停/小休时不提醒超时
    const cap = (kind === 'preview' ? L.previewMin : L.consMin) * 60000;
    const left = cap - phaseSeconds(L, kind) * 1000;
    if (left <= 0) {
      if (!L.overdueToasted) {
        L.overdueToasted = true;
        S().save();
        App.ui.toast(L.phase === 'preview'
          ? '⏰ 预习到点！带着问题去上课，别恋战'
          : '⏰ 整理到点！写完核心逻辑链就收');
      }
    }
  }, 1000);

  function init() {
    /* 三步面板现在长在任务页里，init 不需要预渲染 */
  }

  App.lecture = {
    init: init, render: refresh, refresh: refresh,
    current: current, floatPanelHTML: floatPanelHTML, bindFloatLec: bindFloatLec,
    startFromTask: startFromTask, startFromSub: startFromSub, isActive: isActive,
    forceBegin: forceBegin, abandonActive: abandonActive, queueBadge: queueBadge,
    budgetDefaults: defaults,
    pauseLecture: pauseLecture, resumeLecture: resumeLecture, restLecture: restLecture,
    activeSeconds: activeSeconds,
    inlineHTML: inlineHTML, bindInline: bindInline, historyHTML: historyHTML
  };
})();
