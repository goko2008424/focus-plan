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

  /* ---------- 开始：定课程与三步预算 ---------- */
  function startModal() {
    const day = today();
    if (day.activeLecture) { App.ui.toast('已有一节课在进行中，先完成或放弃它'); return; }
    const st = S().settings();
    const dPts = st.lectureBonusPts != null ? st.lectureBonusPts : 15;
    const modal = App.ui.openModal('🎓 开始听课三步',
      '<p style="font-size:12.5px;color:var(--muted);margin-bottom:10px">预习只读目标与总结（到点就停，做减法）→ 听课用空白纸记重点 → 课后用自己的逻辑重构笔记。' +
      '<b>三步都走完才发大奖</b>，跳步/放弃拿不到。</p>' +
      '<div class="field"><label>课程名（如：化学 · 盐类水解）</label><input id="lec-course" style="width:100%;' + INPUT_STYLE + '" placeholder="这节课叫什么" /></div>' +
      '<div class="field-row">' +
      '<div class="field"><label>⏳ 预习上限（分钟）</label><input type="number" id="lec-pmin" min="1" value="30" /></div>' +
      '<div class="field"><label>🪑 听课时长（分钟，参考）</label><input type="number" id="lec-amin" min="1" value="45" /></div>' +
      '<div class="field"><label>⏳ 整理上限（分钟）</label><input type="number" id="lec-cmin" min="1" value="30" /></div>' +
      '</div>' +
      '<div class="field"><label>🎁 三步齐发奖励积分（提前定好）</label><input type="number" id="lec-pts" min="0" value="' + dPts + '" /></div>' +
      '<p class="hint">听课本体不封顶（课多长听多长）；预习/整理到点会提醒收尾，超时如实记录。</p>',
      '<button class="btn btn-primary" data-act="ok">🎯 开始预习</button><button class="btn" data-act="cancel">取消</button>');
    const cEl = modal.querySelector('#lec-course');
    if (cEl) cEl.focus();
    App.ui.bindActions({
      ok: function () {
        const course = (modal.querySelector('#lec-course').value || '').trim();
        if (!course) { App.ui.toast('先写课程名'); return; }
        const pmin = Math.max(1, +modal.querySelector('#lec-pmin').value || 30);
        const amin = Math.max(1, +modal.querySelector('#lec-amin').value || 45);
        const cmin = Math.max(1, +modal.querySelector('#lec-cmin').value || 30);
        const pts = Math.max(0, +modal.querySelector('#lec-pts').value || 0);
        day.activeLecture = {
          id: S().uid(), course: course,
          previewMin: pmin, attendMin: amin, consMin: cmin, pts: pts,
          phase: 'preview',
          previewStartAt: Date.now(),
          checklist: [false, false, false],
          overdueToasted: false,
          createdAt: S().nowIso ? S().nowIso() : new Date().toISOString()
        };
        S().save();
        App.ui.closeModal();
        render();
        App.ui.toast('🎓 预习开始！只读目标与总结，到点就停');
      },
      cancel: App.ui.closeModal
    });
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
        App.ui.closeModal();
        render();
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
    render();
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
        App.ui.closeModal();
        render();
        if (App.app && App.app.refreshStats) App.app.refreshStats();
        App.ui.toast(bonus > 0
          ? ('🎉 三步齐了！「' + L.course + '」完成，大奖 +' + bonus + ' 分')
          : ('📝 「' + L.course + '」已记录（有三步没走全，没发大奖）'));
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
      render();
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
      S().save();
      render();
      App.ui.toast('已放弃并存档。下次换个预算再试');
    });
  }

  function timelinePush(L) {
    const day = today();
    const start = new Date(L.previewStartAt), end = new Date(L.endAt || Date.now());
    let sMin = start.getHours() * 60 + start.getMinutes();
    let eMin = end.getHours() * 60 + end.getMinutes();
    if (eMin < sMin) eMin = 1439;
    const totalMin = Math.max(1, Math.round((phaseSeconds(L, 'preview') + phaseSeconds(L, 'attend') + phaseSeconds(L, 'cons')) / 60));
    day.timeline = day.timeline || [];
    day.timeline.push({
      id: S().uid(), start: sMin, end: eMin, minutes: totalMin,
      content: '🎓 听课三步 · ' + L.course + (L.awarded > 0 ? ' · 三步达成' : ''),
      category: 'study', countAsStudy: true, auto: true, lectureId: L.id,
      note: (L.question ? '核心问题：' + L.question + '　' : '') + (L.chain || '')
    });
    S().save();
  }

  /* ---------- 渲染 ---------- */
  function render() {
    const day = ensure(today());
    const wrap = document.getElementById('lecture-view');
    if (!wrap) return;
    const L = day.activeLecture;
    let html = '';
    if (!L) {
      html += '<div class="card"><h3>🎓 听课三步</h3>' +
        '<p class="hint">预习 30 分钟封顶只读目标与总结 → 听课空白纸记重点 → 课后用自己的逻辑重构笔记。' +
        '<b>三步齐了才发大奖</b>——把"被动复制"变成"主动筛选"。<br>' +
        '<a href="https://www.bilibili.com/video/BV1DA411N78G" target="_blank" style="color:var(--primary);font-size:12px">📺 方法出处：B站【让我效率翻倍的听网课方法！】</a>（方法高度个性化，时长预算按自己的节奏改）</p>' +
        '<button class="btn btn-primary" id="lec-start">🎓 开始听课三步</button></div>';
    } else {
      html += renderActive(L);
    }
    // 今日已完成
    const list = (day.lectures || []).slice().reverse().filter(function (x) { return x.endAt; });
    if (list.length) {
      html += '<div class="card" style="margin-top:12px"><h3>📚 今天的课</h3>';
      list.forEach(function (x) {
        const mins = Math.round((phaseSeconds(x, 'preview') + phaseSeconds(x, 'attend') + phaseSeconds(x, 'cons')) / 60);
        const flag = x.abandoned ? '🚫 放弃' : (x.awarded > 0 ? '🎁 大奖 +' + x.awarded + ' 分' : '📄 未走全');
        html += '<div style="display:flex;align-items:center;gap:8px;padding:8px 2px;border-bottom:1px solid var(--line);flex-wrap:wrap">' +
          '<b style="color:var(--ink)">' + S().esc(x.course) + '</b>' +
          '<span style="font-size:12px;color:var(--muted)">预' + Math.round(phaseSeconds(x, 'preview') / 60) + '分 · 听' + Math.round(phaseSeconds(x, 'attend') / 60) + '分 · 整' + Math.round(phaseSeconds(x, 'cons') / 60) + '分 · 合计 ' + mins + ' 分钟</span>' +
          '<span style="margin-left:auto;font-size:12px;font-weight:700;color:' + (x.awarded > 0 ? 'var(--extra)' : 'var(--muted)') + '">' + flag + '</span></div>' +
          (x.chain ? '<div style="font-size:12.5px;color:var(--muted);padding:2px 2px 6px">🔗 ' + S().esc(x.chain) + '</div>' : '');
      });
      html += '</div>';
    }
    // 最近 7 天小结
    let week = 0, weekMin = 0, weekBonus = 0;
    const keys = [];
    for (let i = 0; i < 7; i++) { const d = new Date(); d.setDate(d.getDate() - i); keys.push(S().dateKey(d)); }
    keys.forEach(function (k) {
      (S().getDay(k).lectures || []).forEach(function (x) {
        if (x.abandoned) return;
        week++;
        weekMin += Math.round((phaseSeconds(x, 'preview') + phaseSeconds(x, 'attend') + phaseSeconds(x, 'cons')) / 60);
        weekBonus += x.awarded || 0;
      });
    });
    if (week > 0) {
      html += '<div class="card" style="margin-top:12px"><h3>📊 最近 7 天</h3>' +
        '<p style="font-size:13px;color:var(--muted)">完成 <b style="color:var(--ink)">' + week + '</b> 节三步 · 总投入 ' + S().fmtDur(weekMin) +
        (weekBonus > 0 ? ' · 赢得大奖 ' + weekBonus + ' 分' : '') + '</p></div>';
    }
    wrap.innerHTML = html;

    // 绑定
    const sb = wrap.querySelector('#lec-start');
    if (sb) sb.onclick = startModal;
    if (L) bindActive(wrap, L);
  }

  function renderActive(L) {
    let inner = '';
    if (L.phase === 'preview') {
      const cap = L.previewMin * 60000;
      const left = Math.max(0, L.previewStartAt + cap - Date.now());
      const overdue = left <= 0;
      inner = '<div id="lec-clock" style="font-size:26px;font-weight:800;color:' + (overdue ? 'var(--req)' : 'var(--primary)') + '">' +
        (overdue ? '⏰ 超时 ' + fmtClock(-left) + ' —— 该停了，做减法！' : fmtClock(left) + ' 后该去上课') + '</div>' +
        '<p class="hint">预习清单（只做这三件事，其余当小说翻）：</p>' +
        PREVIEW_ITEMS.map(function (t, i) {
          const on = (L.checklist || [])[i];
          return '<label style="display:flex;align-items:center;gap:8px;padding:6px 2px;font-size:13.5px;cursor:pointer">' +
            '<input type="checkbox" class="lec-chk" data-i="' + i + '"' + (on ? ' checked' : '') + ' style="width:16px;height:16px" /> <span>' + t + '</span></label>';
        }).join('') +
        '<div class="btn-row" style="margin-top:10px">' +
        '<button class="btn btn-primary" id="lec-preview-done">❓ 写核心问题 → 去上课</button>' +
        '<button class="btn btn-small" id="lec-skip" style="margin-left:6px">⏭ 跳过预习</button></div>';
    } else if (L.phase === 'attend') {
      inner = '<div id="lec-clock" style="font-size:26px;font-weight:800;color:var(--primary)">' + fmtClock(phaseSeconds(L, 'attend') * 1000) + '</div>' +
        (L.prepDone ? '<div style="font-size:12px;color:var(--extra)">✅ 课前准备已完成</div>' : '<div style="font-size:12px;color:var(--muted)">（没走课前准备清单，可能直接跳进来的）</div>') +
        (L.question ? '<div style="font-size:13.5px;background:rgba(59,130,246,.08);border:1px solid var(--line);border-radius:8px;padding:8px 10px;margin:8px 0">🎯 带着问题听：<b>' + S().esc(L.question) + '</b></div>' : '') +
        '<p class="hint">空白纸模式：只记关键词和重点，别抄整句，别在讲义上批注。</p>' +
        '<textarea id="lec-note" style="width:100%;min-height:140px;border:1px solid var(--line);border-radius:8px;padding:10px;font-size:14px;resize:vertical;background:#fff;color:var(--ink)" placeholder="白纸区：只写重点……"></textarea>' +
        '<div class="btn-row" style="margin-top:10px">' +
        '<button class="btn btn-primary" id="lec-attend-done">🔔 下课了，停表去整理</button>' +
        '<button class="btn btn-small" id="lec-skip" style="margin-left:6px">⏭ 跳过听课</button></div>';
    } else if (L.phase === 'consolidate') {
      const cap = L.consMin * 60000;
      const left = Math.max(0, L.consStartAt + cap - Date.now());
      const overdue = left <= 0;
      inner = '<div id="lec-clock" style="font-size:26px;font-weight:800;color:' + (overdue ? 'var(--req)' : 'var(--primary)') + '">' +
        (overdue ? '⏰ 整理超时 ' + fmtClock(-left) + ' —— 差不多了，写逻辑链收尾' : '整理剩 ' + fmtClock(left)) + '</div>' +
        '<p class="hint">用自己的逻辑重构，不跟讲义结构走；可读性 > 美观，允许简写和符号。</p>' +
        '<textarea id="lec-note" style="width:100%;min-height:140px;border:1px solid var(--line);border-radius:8px;padding:10px;font-size:14px;resize:vertical;background:#fff;color:var(--ink)" placeholder="重构后的笔记……">' + S().esc(L.note || '') + '</textarea>' +
        '<div class="btn-row" style="margin-top:10px">' +
        '<button class="btn btn-primary" id="lec-cons-done">✍️ 写核心逻辑链，完成' + (allThreeDone(L) ? '（领大奖 +' + (L.pts || 0) + ' 分）' : '') + '</button>' +
        '<button class="btn btn-small" id="lec-skip" style="margin-left:6px">⏭ 跳过整理</button></div>';
    }
    const stepNo = L.phase === 'preview' ? 1 : (L.phase === 'attend' ? 2 : 3);
    return '<div class="card"><h3>🎓 听课三步 · ' + S().esc(L.course) +
      ' <span style="font-size:12px;color:var(--muted)">第 ' + stepNo + '/3 步 · ' + phaseLabel(L.phase) +
      ' · 预算 预' + L.previewMin + '/听' + L.attendMin + '/整' + L.consMin + ' 分 · 大奖 ' + (L.pts || 0) + ' 分</span></h3>' +
      inner +
      '<button class="btn btn-small btn-danger" id="lec-abandon" style="margin-top:10px">🚫 放弃这节课（不发积分）</button></div>';
  }

  let noteTimer = null;
  function bindActive(wrap, L) {
    wrap.querySelectorAll('.lec-chk').forEach(function (c) {
      c.onchange = function () { saveCheck(+c.dataset.i, c.checked); };
    });
    const pd = wrap.querySelector('#lec-preview-done');
    if (pd) pd.onclick = previewDone;
    const ad = wrap.querySelector('#lec-attend-done');
    if (ad) ad.onclick = attendDone;
    const cd = wrap.querySelector('#lec-cons-done');
    if (cd) cd.onclick = consolidateDone;
    const sk = wrap.querySelector('#lec-skip');
    if (sk) sk.onclick = function () { skipStep(L.phase === 'preview' ? 'preview' : (L.phase === 'attend' ? 'attend' : 'cons')); };
    const ab = wrap.querySelector('#lec-abandon');
    if (ab) ab.onclick = abandon;
    const note = wrap.querySelector('#lec-note');
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
    if (!L || (L.phase !== 'preview' && L.phase !== 'consolidate')) return;
    const el = document.getElementById('lec-clock');
    if (!el) return;
    const cap = (L.phase === 'preview' ? L.previewMin : L.consMin) * 60000;
    const startAt = L.phase === 'preview' ? L.previewStartAt : L.consStartAt;
    const left = cap - (Date.now() - startAt);
    if (left > 0) {
      if (L.phase === 'preview') el.textContent = fmtClock(left) + ' 后该去上课';
      else el.textContent = '整理剩 ' + fmtClock(left);
    } else {
      el.textContent = '⏰ 超时 ' + fmtClock(-left) + (L.phase === 'preview' ? ' —— 该停了，做减法！' : ' —— 写逻辑链收尾');
      el.style.color = 'var(--req)';
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
    render();
  }

  App.lecture = { init: init, render: render };
})();
