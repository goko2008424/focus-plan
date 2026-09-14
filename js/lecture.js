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
    if (name === 'preview') {
      if (L.previewStartAt == null) return 0;
      const end = L.previewEndAt != null ? L.previewEndAt : Date.now();
      return Math.max(0, Math.floor((end - L.previewStartAt) / 1000));
    }
    if (name === 'attend') {
      if (L.attendStartAt == null) return 0;
      const end = L.attendEndAt != null ? L.attendEndAt : Date.now();
      return Math.max(0, Math.floor((end - L.attendStartAt) / 1000));
    }
    if (L.consStartAt == null) return 0;
    const end = L.consEndAt != null ? L.consEndAt : Date.now();
    return Math.max(0, Math.floor((end - L.consStartAt) / 1000));
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
      App.ui.toast('已经有一节课在进行中（' + day.activeLecture.course + '），先完成或放弃它');
      return null;
    }
    const d = defaults();
    const pts = o.pts != null ? o.pts : d.pts;
    day.activeLecture = {
      id: S().uid(), course: o.course, taskId: o.taskId || null,
      subId: o.subId || null, groupId: o.groupId || null,   // 从小任务开的课记下来，走完勾那条小任务
      previewMin: o.previewMin != null ? o.previewMin : d.previewMin,
      attendMin: o.attendMin || d.attendMin,
      consMin: o.consMin != null ? o.consMin : d.consMin,
      pts: pts || 0,
      phase: 'preview', previewStartAt: Date.now(),
      checklist: [false, false, false], overdueToasted: false,
      createdAt: S().nowIso ? S().nowIso() : new Date().toISOString()
    };
    S().save();
    refresh();
    return day.activeLecture;
  }

  function startFromTask(task, fromTomorrow) {
    const L = beginLecture({
      course: task.text, taskId: task.id,
      attendMin: task.lecMin || defaults().attendMin,
      pts: task.points != null ? task.points : null
    });
    if (!L) return;
    App.ui.toast(fromTomorrow
      ? '🎓 预习开始！（记在今天的时间轴；走完三步会勾掉「明天」那条任务）'
      : '🎓 预习开始！只读目标与总结，到点就停');
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
        L.phase = 'attend';
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
    L.attendConfirm = false;
    L.phase = 'consolidate';
    L.consStartAt = Date.now();
    L.overdueToasted = false;
    S().save();
    refresh();
    App.ui.toast('✍️ 进入整理：用自己的逻辑重构笔记，可读 > 美观');
  }

  // 整理 →（弹核心逻辑链）→ 完成，发大奖
  function consolidateDone() {
    const day = today(), L = day.activeLecture;
    if (!L || L.phase !== 'consolidate') return;
    const modal = App.ui.openModal('🔗 这节课的核心逻辑链',
      '<p style="font-size:13px">用自己的话把框架串成一句/几句话（这是整理的输出，也是未来复习的钥匙）：</p>' +
      '<div class="field"><textarea id="lec-chain" style="width:100%;min-height:84px;border:1px solid var(--line);border-radius:8px;padding:8px;font-size:13.5px;resize:vertical" placeholder="例：水解的前提是有弱离子 → 谁弱谁水解 → 越弱越水解 → 微弱程度决定酸碱性"></textarea></div>',
      '<button class="btn btn-primary" data-act="ok">' + (allThreeDone(L) ? '🎁 完成三步，领大奖' : '✔ 完成记录') + '</button><button class="btn" data-act="cancel">再改改</button>');
    App.ui.bindActions({
      ok: function () {
        const v = (modal.querySelector('#lec-chain').value || '').trim();
        if (!v) { App.ui.toast('写一句核心逻辑链，这是整理的收尾'); return; }
        L.chain = v;
        L.consEndAt = Date.now();
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
        L.phase = 'attend'; L.prepDone = false; L.attendStartAt = Date.now(); L.note = L.note || '';
        timelinePush(L);
        App.ui.toast('已跳过预习（无大奖）。听课开始');
      } else if (which === 'attend') {
        L.skipAttend = true; L.attendEndAt = Date.now();
        L.phase = 'consolidate'; L.consStartAt = Date.now(); L.overdueToasted = false;
        App.ui.toast('已跳过听课（无大奖）。进入整理');
      } else {
        L.skipCons = true; L.consEndAt = Date.now();
        L.phase = 'done'; L.endAt = Date.now();
        L.awarded = 0;
        day.lectures = day.lectures || [];
        day.lectures.push(L);
        day.activeLecture = null;
        timelinePush(L);
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
      day.lectures = day.lectures || [];
      day.lectures.push(L);
      day.activeLecture = null;
      timelinePush(L);
      S().save();
      refresh();
      App.ui.toast('已放弃并存档。下次换个预算再试');
    });
  }

  /* 时间轴同步（upsert）：开始听就挂一条，阶段推进/完成/放弃时更新同一条 */
  function timelinePush(L) {
    const day = today();
    day.timeline = day.timeline || [];
    const start = new Date(L.previewStartAt), end = new Date(L.endAt || Date.now());
    let sMin = start.getHours() * 60 + start.getMinutes();
    let eMin = end.getHours() * 60 + end.getMinutes();
    if (eMin < sMin) eMin = 1439;
    const totalMin = Math.max(1, Math.round((phaseSeconds(L, 'preview') + phaseSeconds(L, 'attend') + phaseSeconds(L, 'cons')) / 60));
    const content = '🎓 听课三步 · ' + L.course + (L.endAt ? (L.abandoned ? ' · 放弃' : (L.awarded > 0 ? ' · 三步达成' : '')) : ' · 进行中');
    const note = (L.question ? '核心问题：' + L.question + '　' : '') + (L.chain || '');
    const rec = day.timeline.find(function (r) { return r.lectureId === L.id; });
    if (rec) {
      rec.start = sMin; rec.end = eMin; rec.minutes = Math.min(totalMin, Math.max(1, eMin - sMin));
      rec.content = content; rec.note = note;
    } else {
      day.timeline.push({
        id: S().uid(), start: sMin, end: eMin, minutes: Math.min(totalMin, Math.max(1, eMin - sMin)),
        content: content, category: 'study', countAsStudy: true, auto: true, lectureId: L.id,
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
      '<span class="lec-step">' + S().esc(L.course) + ' · 第 ' + stepNo + '/3 步 · ' + phaseLabel(L.phase) + '</span>' +
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
      '<span class="lec-step">第 ' + stepNo + '/3 步 · ' + phaseLabel(L.phase) + '</span>' +
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
        const flag = x.abandoned ? '🚫 放弃' : (x.awarded > 0 ? '🎁 大奖 +' + x.awarded + ' 分' : '📄 未走全');
        html += '<div class="lec-hist-row">' +
          '<span class="lec-hist-date">' + S().fmtDateCN(r.k) + '</span>' +
          '<b>' + S().esc(x.course) + '</b>' +
          '<span class="lec-hist-min">预' + Math.round(phaseSeconds(x, 'preview') / 60) +
          ' · 听' + Math.round(phaseSeconds(x, 'attend') / 60) +
          ' · 整' + Math.round(phaseSeconds(x, 'cons') / 60) + ' 分 ＝ ' + mins + ' 分钟</span>' +
          '<span class="lec-hist-flag">' + flag + '</span></div>' +
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
      const cap = L.previewMin * 60000;
      const left = Math.max(0, L.previewStartAt + cap - Date.now());
      const overdue = left <= 0;
      return '<div class="lec-clock" id="' + P + 'lec-clock" style="color:' + (overdue ? 'var(--req)' : 'var(--primary)') + '">' +
        (overdue ? '⏰ 超时 ' + fmtClock(-left) + ' —— 该停了，做减法！' : fmtClock(left) + ' 后该去上课') + '</div>' +
        '<div class="lec-hint">只做这三件事，其余当小说翻：</div>' +
        PREVIEW_ITEMS.map(function (t, i) {
          const on = (L.checklist || [])[i];
          return '<label class="lec-chk-row"><input type="checkbox" class="lec-chk" data-i="' + i + '"' + (on ? ' checked' : '') + ' /> <span>' + t + '</span></label>';
        }).join('') +
        '<div class="lec-actions">' +
        '<button class="btn btn-small btn-primary" id="' + P + 'lec-preview-done">❓ 写核心问题 → 去上课</button>' +
        '<button class="btn btn-small" id="' + P + 'lec-skip">⏭ 跳过预习</button>' +
        '<button class="btn btn-small btn-danger" id="' + P + 'lec-abandon">🚫 放弃</button></div>';
    }
    if (L.phase === 'attend') {
      return '<div class="lec-clock" id="' + P + 'lec-clock" style="color:var(--primary)">听课中 ' + fmtClock(phaseSeconds(L, 'attend') * 1000) + '</div>' +
        (L.question
          ? '<div class="lec-q">🎯 带着问题听：<b>' + S().esc(L.question) + '</b></div>'
          : '<div class="lec-hint">空白纸模式：只记关键词和重点，别抄整句。</div>') +
        '<textarea id="' + P + 'lec-note" class="lec-ta" placeholder="白纸区：只写重点……"></textarea>' +
        '<div class="lec-actions">' +
        '<button class="btn btn-small btn-primary" id="' + P + 'lec-attend-done">🔔 下课了，停表去整理</button>' +
        '<button class="btn btn-small" id="' + P + 'lec-skip">⏭ 跳过听课</button>' +
        '<button class="btn btn-small btn-danger" id="' + P + 'lec-abandon">🚫 放弃</button></div>';
    }
    const cap = L.consMin * 60000;
    const left = Math.max(0, L.consStartAt + cap - Date.now());
    const overdue = left <= 0;
    return '<div class="lec-clock" id="' + P + 'lec-clock" style="color:' + (overdue ? 'var(--req)' : 'var(--primary)') + '">' +
      (overdue ? '⏰ 整理超时 ' + fmtClock(-left) + ' —— 差不多了，写逻辑链收尾' : '整理剩 ' + fmtClock(left)) + '</div>' +
      '<div class="lec-hint">用自己的逻辑重构，不跟讲义结构走；可读性 &gt; 美观。</div>' +
      '<textarea id="' + P + 'lec-note" class="lec-ta" placeholder="重构后的笔记……">' + S().esc(L.note || '') + '</textarea>' +
      '<div class="lec-actions">' +
      '<button class="btn btn-small btn-primary" id="' + P + 'lec-cons-done">✍️ 写核心逻辑链，完成' +
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
    const setTxt = function (t, color) {
      els.forEach(function (x) { x.textContent = t; if (color) x.style.color = color; });
    };
    // 听课阶段：正计时（原来漏了 attend，计时器不走，一并修掉）
    if (L.phase === 'attend') { setTxt('听课中 ' + fmtClock(phaseSeconds(L, 'attend') * 1000)); return; }
    if (L.phase !== 'preview' && L.phase !== 'consolidate') return;
    const cap = (L.phase === 'preview' ? L.previewMin : L.consMin) * 60000;
    const startAt = L.phase === 'preview' ? L.previewStartAt : L.consStartAt;
    const left = cap - (Date.now() - startAt);
    if (left > 0) {
      if (L.phase === 'preview') setTxt(fmtClock(left) + ' 后该去上课');
      else setTxt('整理剩 ' + fmtClock(left));
    } else {
      setTxt('⏰ 超时 ' + fmtClock(-left) + (L.phase === 'preview' ? ' —— 该停了，做减法！' : ' —— 写逻辑链收尾'), 'var(--req)');
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
    inlineHTML: inlineHTML, bindInline: bindInline, historyHTML: historyHTML
  };
})();
