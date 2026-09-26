/* ============================================================
 * memcards.js — 🃏 设问卡（主动回忆 / 自测卡片）
 *
 * 为什么要有它：听课时「整理」这一步，最强的动作其实是**给自己出题**——
 * 主动回忆比再看一遍书管用得多。所以这里做的不是「记笔记」，是「出题」：
 * 每张卡正面一个要问自己的问题，反面是答案与要点，之后靠翻卡自测。
 *
 * 跟同学那份「记忆卡片」的关系：渲染那层（Markdown + LaTeX + 化学式）直接沿用
 * （marked + KaTeX + mhchem 那三个库就是从他文件里搬来的），
 * 但**排期逻辑全部砍掉**：没有 1/2/4/7/15 的艾宾浩斯曲线、没有 due/level、
 * 没有复习量柱状图（那套是他自己排的）。复习日期用我这边本来就有的
 * 日历 / 安排到某一天 来管 —— 卡片本身只负责「有题、有答案」。
 *
 * 数据（懒初始化，老数据不用迁移）：
 *   data.memcards = [ { id, name, taskId, subId, course, dayKey,
 *                       createdAt, updatedAt,
 *                       cards: [ { id, front, back, at } ] } ]
 *   一个合集 = 一节课整理出来的那套卡；名称默认取课程/任务名。
 * ============================================================ */
(function () {
  'use strict';

  const App = (window.App = window.App || {});
  const S = function () { return App.store; };
  const esc = function (s) { return S().esc(s); };

  /* ---------- 数据 ---------- */
  function D() {
    const d = S().data(); if (!d) return [];
    if (!Array.isArray(d.memcards)) d.memcards = [];
    return d.memcards;
  }
  function find(id) {
    return D().filter(function (c) { return c.id === id; })[0] || null;
  }
  function forTask(taskId) {
    return D().filter(function (c) { return c.taskId === taskId; });
  }
  function countForTask(taskId) {
    return forTask(taskId).reduce(function (n, c) { return n + (c.cards || []).length; }, 0);
  }
  function countAll() {
    return D().reduce(function (n, c) { return n + (c.cards || []).length; }, 0);
  }
  function save() { S().save(); }

  /* ---------- 🔗 v120：复习要用的就是你自己做的这些卡 ----------
     用户原话：「我做了那么多知识卡片，就是在这个时候用上的…你给我推送的时候，
     你说还没有具体的知识点，你到底有没有把这两个东西绑在一块？」
     —— 以前确实没绑：复习只认 task.kps，卡片是 memcards，两个字段井水不犯河水。
     这里给出唯一的解析入口：任务 → 该翻哪些卡。 */
  /** 这条任务该翻哪些卡 → [{front, back, colId, colName, cardId}] */
  function cardsForTask(task) {
    const out = [];
    const push = function (col, only) {
      (col.cards || []).forEach(function (k) {
        if (only && only.indexOf(k.id) < 0) return;
        // 🖼 v134：题图/答案图必须跟着走 —— 复习弹窗靠它们出图（丢图用户就没法答题）
        out.push({ front: k.front || '', back: k.back || '', colId: col.id,
                   colName: col.name || '', cardId: k.id,
                   frontImgs: k.frontImgs || [], backImgs: k.backImgs || [] });
      });
    };
    if (!task) return out;
    // ① 从「📅 排到某天」建出来的复习任务：mcRef 直接指着那套卡
    if (task.mcRef && task.mcRef.colId) {
      const col = find(task.mcRef.colId);
      if (col) push(col, task.mcRef.cardIds || null);
      if (out.length) return out;
    }
    // ② 这条任务自己做的卡（做课时点 🃏 攒下来的）
    forTask(task.id).forEach(function (col) { push(col, null); });
    if (out.length) return out;
    // ③ 兜底：合集名 / 课程名跟任务文字**一模一样**才算（别乱蹭别的课）
    const txt = String(task.text || '')
      .replace(/^\s*🃏\s*/, '').replace(/^\s*复习\s*[·:：]\s*/, '').trim();
    if (txt) {
      D().forEach(function (col) {
        if (String(col.name || '').trim() === txt || String(col.course || '').trim() === txt) push(col, null);
      });
    }
    return out;
  }

  /** 🧹 v120：清掉某个合集在日历里的全部复习安排（那串「📅 已排」） */
  function clearSchedOf(colId) {
    const days = (S().data() || {}).days || {};
    let n = 0;
    Object.keys(days).forEach(function (k) {
      const d = days[k];
      if (!d || !d.tasks) return;
      ['required', 'ideal', 'extra'].forEach(function (c) {
        const list = d.tasks[c] || [];
        for (let i = list.length - 1; i >= 0; i--) {
          if (list[i].mcRef && list[i].mcRef.colId === colId) { list.splice(i, 1); n++; }
        }
      });
    });
    return n;
  }

  /** 🧹 v120：清掉**所有**复习安排（卡片排期 + 任务上的复习轮次），给用户"后悔的机会" */
  function clearAllSched() {
    const d = S().data() || {};
    const days = d.days || {};
    let nSched = 0, nPlan = 0;
    Object.keys(days).forEach(function (k) {
      const day = days[k];
      if (!day || !day.tasks) return;
      ['required', 'ideal', 'extra'].forEach(function (c) {
        const list = day.tasks[c] || [];
        for (let i = list.length - 1; i >= 0; i--) {
          if (list[i].mcRef) { list.splice(i, 1); nSched++; }
        }
        list.forEach(function (t) {
          if (t.sp) { delete t.sp; nPlan++; }
          if (t.srCfg) delete t.srCfg;
        });
      });
    });
    (d.queue || []).forEach(function (q) { if (q.sp) { delete q.sp; nPlan++; } if (q.srCfg) delete q.srCfg; });
    (d.queueDone || []).forEach(function (q) { if (q.sp) { delete q.sp; nPlan++; } if (q.srCfg) delete q.srCfg; });
    (d.daily || []).forEach(function (x) { if (x.sp) { delete x.sp; nPlan++; } if (x.srCfg) delete x.srCfg; });
    return { sched: nSched, plan: nPlan };
  }

  /** 找一个已有合集（同一节课：任务 + 小题 + 那天）；找不到就新建 */
  function ensureCollection(o) {
    o = o || {};
    let col = D().filter(function (c) {
      return c.taskId === o.taskId && (c.subId || null) === (o.subId || null) && c.dayKey === o.dayKey;
    })[0];
    if (col) return col;
    col = {
      id: S().uid(),
      name: String(o.name || o.course || '设问卡').slice(0, 40),
      taskId: o.taskId || null,
      subId: o.subId || null,
      course: o.course || o.name || '',
      subject: o.subject || '',
      dayKey: o.dayKey || S().todayKey(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      cards: []
    };
    D().push(col);
    save();
    return col;
  }

  function touch(col) { col.updatedAt = new Date().toISOString(); save(); }

  /* ---------- 🏷 v101：学科（高中九科打底，用户自己加的会一直留着） ---------- */
  const SUBJECTS_DEF = ['语文', '数学', '英语', '物理', '化学', '生物', '政治', '历史', '地理'];
  const NO_SUB = '（未分学科）';

  function subjects() {
    const d = S().data() || {};
    return (d.subjects && d.subjects.length) ? d.subjects.slice() : SUBJECTS_DEF.slice();
  }

  function addSubject(name) {
    const v = String(name || '').trim();
    if (!v) return;
    const d = S().data();
    if (!d.subjects) d.subjects = SUBJECTS_DEF.slice();
    if (d.subjects.indexOf(v) < 0) { d.subjects.push(v); save(); }
  }

  function subjectOf(col) { return (col && col.subject) || ''; }

  /** 📅 v101：把「整个合集」或「某一张卡」排到日历某一天 —— 那天出现一条 🔄 复习 任务，
   *  点它右边的 🃏 直接翻卡。用户：「我添加进去的每个知识卡都要支持添加到日历」。 */
  /** 📅 v116：这个合集被排到过哪几天（从带 mcRef 的任务里找）
   *  用户：「单独查看时无法知道每个内容被安排到了哪一天」→ 把日期直接长在合集上 */
  function schedDaysOf(colId) {
    const out = [];
    const days = (S().data() || {}).days || {};
    const today = S().todayKey();
    Object.keys(days).forEach(function (k) {
      const d = days[k];
      if (!d || !d.tasks) return;
      ['required', 'ideal', 'extra'].forEach(function (c) {
        (d.tasks[c] || []).forEach(function (t) {
          if (!t.mcRef || t.mcRef.colId !== colId) return;
          out.push({ key: k, text: t.text, done: t.done === true, late: k < today && t.done !== true,
                     at: t.doneAt || t.at || '' });
        });
      });
    });
    out.sort(function (a, b) { return a.key < b.key ? -1 : (a.key > b.key ? 1 : 0); });
    return out;
  }

  /** 📅 v116→v120：合集行上那串小日期（✓已完成 / ⚠已过期 / 📅待做）
   *  v120：① 每个日期带 ✕ 能单独取消那天 ② 末尾给「已完成 N 天 · 下一天 X」+ 🧹 清空
   *  用户：「你要把历史它在哪些天设了，这个要清楚…每次他定的时间都要在这边有时间的显示」 */
  function schedBadgeHTML(colId) {
    const list = schedDaysOf(colId);
    if (!list.length) return '';
    const doneN = list.filter(function (x) { return x.done; }).length;
    const next = list.filter(function (x) { return !x.done; })[0] || null;
    const chips = list.map(function (x) {
      const p = x.key.split('-');
      const st = x.done ? ('已完成' + (x.at ? '（' + String(x.at).slice(11, 16) + '）' : ''))
        : (x.late ? '已过期（那天没做）' : '还没到点');
      return '<span class="mc-chip' + (x.done ? ' done' : (x.late ? ' late' : '')) +
        '" title="' + x.key + ' · ' + st + ' · 那天的任务：' + esc(x.text) + '">' +
        (x.done ? '✓' : (x.late ? '⚠' : '📅')) + (+p[1]) + '/' + (+p[2]) +
        '<i class="mc-chip-x" data-act="mc-unsched" data-col="' + colId + '" data-day="' + x.key +
        '" title="取消 ' + x.key + ' 这天的复习安排">✕</i></span>';
    }).join('');
    const nextTxt = next ? (function () {
      const p2 = String(next.key).split('-');
      return ' · 下一天 ' + (+p2[1]) + '/' + (+p2[2]);
    })() : ' · 没了';
    return '<div class="mc-schedline" title="这个合集已排的全部复习日期 —— 点日期上的 ✕ 能取消某一天">' +
      '<span class="mc-schedlab">📅 已排 ' + list.length + ' 天</span>' + chips +
      '<span class="mc-schedsum">已完成 ' + doneN + ' 天' + nextTxt + '</span>' +
      '<button class="mc-ib" data-act="mc-unsched-all" data-id="' + colId +
      '" title="清空这个合集的全部复习安排">🧹</button></div>';
  }

  /** 📅 v116：某一天里，这个合集已经排过的（用来提示"这天排过了"） */
  function dupOnDay(colId, key) {
    const out = [];
    const d = (S().data().days || {})[key];
    if (!d || !d.tasks) return out;
    ['required', 'ideal', 'extra'].forEach(function (c) {
      (d.tasks[c] || []).forEach(function (t) { if (t.mcRef && t.mcRef.colId === colId) out.push(t); });
    });
    return out;
  }

  function schedCardModal(col, cards) {
    const isOne = !!(cards && cards.length === 1);
    const nmDefault = isOne
      ? ('🃏 ' + (oneLine(cards[0].front).slice(0, 16) || '（看图那张）'))
      : ('🃏 复习 · ' + col.name);
    let pickKey = S().todayKey();
    const mm = App.ui.openModal('📅 安排到某一天复习',
      '<p class="hint" style="margin-top:0">到那天，日历和任务页里会多一条任务 —— ' +
      '点它右边的 <b>🃏</b> 就直接进翻卡自测。<br>本次要排的是：<b>' +
      (isOne ? '这一张' : '整个合集（' + (col.cards || []).length + ' 张）') + '</b></p>' +
      '<div class="field"><label>哪一天</label>' +
      '<input type="date" id="mc-sch-date" value="' + pickKey + '" style="width:180px" /></div>' +
      '<div class="field"><label>那天它叫什么（可以改，比如「复习 化学平衡」）</label>' +
      '<input type="text" id="mc-sch-name" value="' + esc(nmDefault) + '" style="width:100%" /></div>' +
      '<p class="mc-dupwarn" id="mc-sch-warn"></p>',
      '<button class="btn btn-primary" data-act="mc-sch-ok">✔ 就排这天</button>' +
      '<button class="btn" data-act="mc-sch-cancel">取消</button>');
    const dt = mm.querySelector('#mc-sch-date');
    // 📅 v116：这天已经排过这一套了 → 就地提醒，别重复安排
    const warnEl = mm.querySelector('#mc-sch-warn');
    const updWarn = function (key) {
      if (!warnEl) return;
      const hits = dupOnDay(col.id, key);
      warnEl.innerHTML = hits.length
        ? ('⚠️ <b>这天已经排过这套卡了</b>（「' + esc(hits[0].text) + '」' + (hits[0].done === true ? ' · 已完成' : ' · 还没做') +
           '）—— 再排一次就是**再来一份**，别重复安排。')
        : '';
    };
    if (dt) dt.onchange = function () { pickKey = dt.value || pickKey; updWarn(pickKey); };
    updWarn(pickKey);
    App.ui.bindActions({
      'mc-sch-ok': function () {
        // ⚠️ 别只依赖 onchange —— 直接改 input.value 是不触发 change 的（2026-09-22 被测试抓出来）
        if (dt && dt.value) pickKey = dt.value;
        const nmEl = mm.querySelector('#mc-sch-name');
        const nm = (nmEl && nmEl.value.trim()) ? nmEl.value.trim() : nmDefault;
        if (pickKey < S().todayKey()) { App.ui.toast('那天已经过去了，往后挑一天'); return; }
        if (!App.calendar || !App.calendar.copyTaskToDay) { App.ui.toast('日历模块没加载，先刷新一下'); return; }
        const okN = App.calendar.copyTaskToDay({ text: nm }, 'required', pickKey, '', false, 'required');
        if (!okN) { App.ui.toast('那天已经有同名任务了 —— 改个名字或换一天'); return; }
        // 给它标成「🔄 复习」，并记住它对应哪几张卡
        try {
          const d2 = S().getDay(pickKey);
          let hit = null;
          ['required', 'ideal', 'extra'].forEach(function (k) {
            (d2.tasks[k] || []).forEach(function (t) { if (!hit && t.text === nm) hit = t; });
          });
          if (hit) {
            hit.mode = 'review';
            hit.mcRef = {
              colId: col.id,
              cardIds: isOne ? [cards[0].id] : null,
              n: isOne ? 1 : (col.cards || []).length
            };
          }
        } catch (e) { /* 忽略 */ }
        S().save();
        App.ui.closeModal();
        try { App.tasks.renderAll(); } catch (e) { /* 忽略 */ }
        try { renderPage(); } catch (e) { /* 忽略 */ }
        App.ui.toast('📅 已排到 ' + pickKey + '：' + nm.slice(0, 16) + ' —— 那天点 🃏 直接翻卡', 5200);
      },
      'mc-sch-cancel': function () { App.ui.closeModal(); }
    });
  }

  /** 从任务行点 🃏 进来：如果那条任务记着「对应哪几张卡」，就直接开那个合集 */
  function openRef(ref) {
    if (!ref || !ref.colId) return false;
    const col = find(ref.colId);
    if (!col) { App.ui.toast('这套卡不在了（合集被删过）'); return false; }
    openCol(col.id, { only: ref.cardIds || null });
    return true;
  }

  /* ---------- 📷 照片（v95）：正面/反面都能贴图 ----------
   * 为什么不把图直接塞进 data：localStorage 只有 ~5MB，两三张手机照片就爆了。
   * 所以图片走**独立 IndexedDB**（focus-plan-photos），卡片里只存 id；
   * 启动时全量读进内存 phCache，渲染同步取；导出 Obsidian 时再写成真图片文件。 */
  const PH_DB = 'focus-plan-photos';
  const PH_STORE = 'photos';
  const PH_MAX = 1400;              // 最长边（再大对看题没用，只是占空间）
  let phCache = {};                 // id -> dataURL
  let phReady = false;
  let phWait = [];

  function phOpen() {
    return new Promise(function (resolve, reject) {
      if (!('indexedDB' in window)) { reject(new Error('no indexedDB')); return; }
      const req = indexedDB.open(PH_DB, 1);
      req.onupgradeneeded = function () {
        const db = req.result;
        if (!db.objectStoreNames.contains(PH_STORE)) db.createObjectStore(PH_STORE);
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
  }
  /** 一次性把照片读进内存（之后同步取；回调里重画一次界面） */
  function phLoadAll(cb) {
    if (cb) phWait.push(cb);
    if (phReady) { flushPhWait(); return; }
    if (phWait.length > 1) return;      // 已有一次在跑
    phOpen().then(function (db) {
      return new Promise(function (resolve) {
        const tx = db.transaction(PH_STORE, 'readonly');
        const rq = tx.objectStore(PH_STORE).getAll();
        rq.onsuccess = function () {
          (rq.result || []).forEach(function (v) { if (v && v.id && v.dataUrl) phCache[v.id] = v.dataUrl; });
          resolve(true);
        };
        rq.onerror = function () { resolve(false); };
      });
    }).catch(function () { /* 没 IDB 也不致命 */ }).then(function () {
      phReady = true;
      flushPhWait();
    });
  }
  function flushPhWait() {
    const q = phWait; phWait = [];
    q.forEach(function (f) { try { if (f) f(); } catch (e) { /* 忽略 */ } });
  }
  function phGet(id) { return (id && phCache[id]) || ''; }
  function phPut(id, dataUrl) {
    phCache[id] = dataUrl;
    phOpen().then(function (db) {
      const tx = db.transaction(PH_STORE, 'readwrite');
      tx.objectStore(PH_STORE).put({ id: id, dataUrl: dataUrl, at: Date.now() }, id);
    }).catch(function () { /* 忽略 */ });
  }
  function phDel(id) {
    if (!id) return;
    delete phCache[id];
    phOpen().then(function (db) {
      const tx = db.transaction(PH_STORE, 'readwrite');
      tx.objectStore(PH_STORE).delete(id);
    }).catch(function () { /* 忽略 */ });
  }
  /** 把选进来的图片压到最长边 1400 / JPEG 0.82（课本照片一般 150~300KB） */
  function compressImage(file, cb) {
    const fr = new FileReader();
    fr.onload = function () {
      const img = new Image();
      img.onload = function () {
        try {
          let w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
          const k = Math.min(1, PH_MAX / Math.max(w, h));
          w = Math.max(1, Math.round(w * k)); h = Math.max(1, Math.round(h * k));
          const cv = document.createElement('canvas');
          cv.width = w; cv.height = h;
          const cx = cv.getContext('2d');
          cx.fillStyle = '#ffffff'; cx.fillRect(0, 0, w, h);   // 透明 PNG 压 JPEG 会发黑，先垫白底
          cx.drawImage(img, 0, 0, w, h);
          cb(cv.toDataURL('image/jpeg', 0.82), w, h);
        } catch (e) { cb('', 0, 0); }
      };
      img.onerror = function () { cb('', 0, 0); };
      img.src = fr.result;
    };
    fr.onerror = function () { cb('', 0, 0); };
    fr.readAsDataURL(file);
  }
  /** 一批 File → 存好 → 回调 (id 数组, 失败的张数)
   *  ⚠️ v103：**不要**再用 `f.type` 过滤 —— 真机上「从相机导入 / HEIC / 从聊天记录另存的图」
   *  经常给一个**空的 type**，一过滤就被默默丢掉，表现就是「点选了一张图，什么都没发生」
   *  （用户 2026-09-22 报的）。改成全都试着解码，解不出来自然淘汰，并把失败数报回去。 */
  function takeImages(files, cb) {
    const arr = [];
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      if (!f) continue;
      const looksImg = /^image\//.test(f.type || '') || /\.(png|jpe?g|webp|gif|bmp|heic|heif|avif)$/i.test(f.name || '');
      if (!looksImg) continue;                       // 明显不是图的（比如误选了 PDF）才跳过
      arr.push(f);
    }
    if (!arr.length) { cb([], 0); return; }
    const out = [];
    let left = arr.length, bad = 0;
    const done = function () {
      left--;
      if (left <= 0) cb(out, bad);
    };
    arr.forEach(function (f) {
      compressImage(f, function (dataUrl) {
        if (!dataUrl) { bad++; done(); return; }
        const id = 'p' + S().uid().slice(0, 8) + Date.now().toString(36).slice(-4);
        phPut(id, dataUrl);
        out.push(id);
        done();
      });
    });
  }
  /** 卡片上的图（列表/复习/预览共用） */
  function imgsHTML(ids) {
    const list = (ids || []).filter(phGet);
    if (!list.length) return '';
    return '<span class="mc-imgs">' + list.map(function (id) {
      return '<img class="mc-img" src="' + phGet(id) + '" data-act="mc-zoom" data-id="' + id +
        '" loading="lazy" alt="图" title="点一下看大图" />';
    }).join('') + '</span>';
  }
  /** 正面/反面整块（文字 + 图），全站统一走这两个函数 */
  function faceHTML(card) {
    return (card.front ? render(card.front) : '') + imgsHTML(card.frontImgs);
  }
  function backHTML(card) {
    return (card.back ? render(card.back) : '') + imgsHTML(card.backImgs);
  }
  function hasText(card) {
    return !!(card && ((card.front || '').trim() || (card.back || '').trim()));
  }
  /** 找出"没有任何卡片引用"的图片（删合集、贴了图又没保存都会留下这种） */
  function usedImgIds() {
    const set = {};
    D().forEach(function (c) {
      (c.cards || []).forEach(function (x) {
        (x.frontImgs || []).forEach(function (id) { set[id] = 1; });
        (x.backImgs || []).forEach(function (id) { set[id] = 1; });
      });
    });
    return set;
  }
  function orphanPhotoIds() {
    const used = usedImgIds();
    return Object.keys(phCache).filter(function (id) { return !used[id]; });
  }
  /** 🧹 清掉没人用的图片，返回清掉的张数 */
  function cleanOrphanPhotos() {
    const list = orphanPhotoIds();
    list.forEach(phDel);
    return list.length;
  }
  /** 图片库现在大概占多少（用来告诉用户"为什么值得清一下"） */
  function photoStats() {
    const ids = Object.keys(phCache);
    let bytes = 0;
    ids.forEach(function (id) { bytes += String(phCache[id] || '').length * 0.75; });   // base64 → 字节
    return { n: ids.length, mb: Math.round(bytes / 1048576 * 10) / 10 };
  }

  /** 💾 v121：备份/导出用 —— 把图片库整个交出去（id → dataURL）。
   *  用户原话：「我做了那么多问答的图片，它肯定不可能只是 KB…你肯定要把我问答的卡片存下来，拜托了」 */
  function allPhotos() {
    const out = {};
    Object.keys(phCache).forEach(function (id) { out[id] = phCache[id]; });
    return out;
  }
  /** 💾 v121：从备份/导入文件把图片**写回图片库**（找回照片本体）。返回写回的张数。 */
  function restorePhotos(map) {
    if (!map || typeof map !== 'object') return 0;
    let n = 0;
    Object.keys(map).forEach(function (id) {
      const v = map[id];
      if (!v || typeof v !== 'string') return;
      phPut(id, v);          // 内部同时写内存缓存 + IDB
      n++;
    });
    return n;
  }

  function colImgCount(c) {
    return (c.cards || []).reduce(function (n, x) {
      return n + (x.frontImgs || []).length + (x.backImgs || []).length;
    }, 0);
  }
  function imgCount(c) { return colImgCount(c); }

  /* ---------- Markdown + LaTeX + 化学式（懒加载同学的三个库） ---------- */
  let mathState = 0;              // 0 没开始 · 1 加载中 · 2 好了 · 3 失败
  let mathWait = [];
  function ensureMath(cb) {
    if (cb) {
      if (mathState === 2 || mathState === 3) { cb(); return; }
      mathWait.push(cb);
    }
    if (mathState !== 0) return;
    mathState = 1;
    const done = function () {
      mathState = (typeof window.katex !== 'undefined') ? 2 : 3;
      const q = mathWait.slice(); mathWait = [];
      q.forEach(function (f) { try { f(); } catch (e) { /* 忽略 */ } });
    };
    const addCss = function () {
      if (document.getElementById('katex-css')) return;
      const l = document.createElement('link');
      l.id = 'katex-css'; l.rel = 'stylesheet'; l.href = 'css/katex.css?v=104';
      document.head.appendChild(l);
    };
    const load = function (src) {
      return new Promise(function (res) {
        const st = document.createElement('script');
        st.src = src; st.async = true;
        st.onload = function () { res(true); };
        st.onerror = function () { res(false); };
        document.head.appendChild(st);
      });
    };
    addCss();
    load('js/marked.min.js?v=104').then(function () {
      return load('js/katex.min.js?v=104');
    }).then(function () {
      return load('js/mhchem.min.js?v=104');
    }).then(done, done);
  }

  /* 公式占位：先抽走，别让 Markdown 把 * _ \ 吃掉 */
  let MATH = [];
  function protectMath(src) {
    MATH = [];
    let out = String(src).replace(/\r\n?/g, '\n');
    out = out.replace(/\$\$([\s\S]+?)\$\$/g, function (m, tex) {
      MATH.push({ tex: tex.trim(), display: true });
      return '@@MATH' + (MATH.length - 1) + '@@';
    });
    out = out.replace(/\\\[([\s\S]+?)\\\]/g, function (m, tex) {
      MATH.push({ tex: tex.trim(), display: true });
      return '@@MATH' + (MATH.length - 1) + '@@';
    });
    out = out.replace(/\\\(([\s\S]+?)\\\)/g, function (m, tex) {
      MATH.push({ tex: tex.trim(), display: false });
      return '@@MATH' + (MATH.length - 1) + '@@';
    });
    out = out.replace(/\$(?!\s)((?:[^$\n\\]|\\.)+?)(?<!\s)\$/g, function (m, tex) {
      MATH.push({ tex: tex.trim(), display: false });
      return '@@MATH' + (MATH.length - 1) + '@@';
    });
    return out;
  }
  function restoreMath(html) {
    return html.replace(/@@MATH(\d+)@@/g, function (m, i) {
      const item = MATH[+i];
      if (!item) return m;
      if (typeof window.katex === 'undefined') return '<code>' + esc(item.tex) + '</code>';
      try {
        return window.katex.renderToString(item.tex, {
          displayMode: item.display, throwOnError: false, strict: false, trust: true
        });
      } catch (e) { return '<code>' + esc(item.tex) + '</code>'; }
    });
  }
  /** 渲染一段（Markdown + 公式）；库还没加载好就先出纯文本，加载完自己会重画 */
  function render(src) {
    if (!src) return '';
    if (typeof window.marked === 'undefined') {
      ensureMath(refreshOpen);
      return esc(src).replace(/\n/g, '<br>');
    }
    if (typeof window.katex !== 'undefined') {
      return restoreMath(window.marked.parse(protectMath(src)));
    }
    return window.marked.parse(String(src).replace(/\r\n?/g, '\n'));
  }

  /* 批量导入解析：=== 分卡 · --- 分正反 · 单行用 | 或 Tab */
  function parseBulk(text) {
    const out = [];
    const blocks = String(text).replace(/\r\n?/g, '\n').split(/^\s*===\s*$/m);
    blocks.forEach(function (b) {
      const t = b.replace(/^\n+|\n+$/g, '');
      if (!t) return;
      if (t.indexOf('\n') >= 0) {
        const parts = t.split(/^\s*---\s*$/m);
        if (parts.length >= 2) {
          out.push({ front: parts[0].replace(/^\n+|\n+$/g, ''), back: parts.slice(1).join('\n').replace(/^\n+|\n+$/g, '') });
        } else {
          const ls = t.split('\n');
          out.push({ front: ls[0].trim(), back: ls.slice(1).join('\n').replace(/^\n+|\n+$/g, '') });
        }
      } else {
        const seg = t.split(/\t|｜|\|/);
        if (seg.length >= 2) out.push({ front: seg[0].trim(), back: seg.slice(1).join(' ').trim() });
        else out.push({ front: t.trim(), back: '' });
      }
    });
    return out.filter(function (c) { return c.front; });
  }

  /* ---------- 成 md 文本（v99：导出到 Obsidian 已去掉 —— 这段是老实现，没有入口） ---------- */
  function oneLine(s) { return String(s || '').replace(/\s*\n\s*/g, ' ').trim(); }
  function safeName(s) {
    return String(s || '设问卡').replace(/[\\/:*?"<>|#^\[\]]/g, '·').replace(/\s+/g, ' ').trim().slice(0, 60) || '设问卡';
  }
  /** 附件文件名（导出时图片写到 attachments/ 下；md 里用相对路径引用） */
  function attName(col, i, side, k) {
    return safeName(col.name) + '-' + (i + 1) + '-' + side + (k ? ('-' + (k + 1)) : '') + '.jpg';
  }
  /** 一行标题：没文字只有图的卡，标题写「（看图）」而不是空 */
  function cardTitle(c, i) {
    const t = oneLine(c.front);
    return '## ' + (i + 1) + '. ' + (t || '（看图）');
  }
  function mdFor(col) {
    const L = [];
    L.push('---');
    L.push('title: ' + oneLine(col.name));
    L.push('tags: [设问卡]');
    if (col.course) L.push('来源: ' + oneLine(col.course));
    L.push('整理日期: ' + (col.dayKey || ''));
    L.push('卡片数: ' + (col.cards || []).length);
    L.push('---');
    L.push('');
    L.push('# ' + oneLine(col.name));
    L.push('');
    (col.cards || []).forEach(function (c, i) {
      L.push(cardTitle(c, i));
      L.push('');
      (c.frontImgs || []).filter(phGet).forEach(function (id, k) {
        L.push('![正面' + (k + 1) + '](attachments/' + attName(col, i, 'front', k) + ')');
        L.push('');
      });
      if (String(c.back || '').trim()) {
        L.push(String(c.back || '').trim());
        L.push('');
      }
      (c.backImgs || []).filter(phGet).forEach(function (id, k) {
        L.push('![反面' + (k + 1) + '](attachments/' + attName(col, i, 'back', k) + ')');
        L.push('');
      });
    });
    return L.join('\n');
  }
  function download(name, text) {
    const a = document.createElement('a');
    const blob = new Blob([text], { type: 'text/markdown;charset=utf-8' });
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () {
      try { URL.revokeObjectURL(a.href); a.remove(); } catch (e) { /* 忽略 */ }
    }, 1500);
  }
  /* ---------- 📁 v95：记住文件夹（v99：导出入口已去掉，这段保留但没入口） ----------
   * 用户原话：「你自动会在 obsidian 里面给我开一个…以链接的形式搞到那个文件夹里面」。
   * 浏览器不能凭空写盘，但 FileSystemDirectoryHandle 可以**存进 IndexedDB**，
   * 所以只要他第一次指过 Obsidian 的目录，之后就再也不用选了：
   * 导出 = 写 设问卡/<合集>.md + 设问卡/attachments/<图>.jpg + 重写「🃏 设问卡总览.md」。 */
  const FS_DB = 'focus-plan-fs';
  const FS_STORE = 'fs';
  const SUB_DIR = '设问卡';
  let fsName = '';          // 记住的目录名（卡片页显示用）
  let fsHandleMem = null;   // 同一会话内的内存副本（万一 handle 存不进 IDB 也不会每轮都弹选择框）

  function fsOpen() {
    return new Promise(function (resolve, reject) {
      if (!('indexedDB' in window)) { reject(new Error('no indexedDB')); return; }
      const req = indexedDB.open(FS_DB, 1);
      req.onupgradeneeded = function () {
        const db = req.result;
        if (!db.objectStoreNames.contains(FS_STORE)) db.createObjectStore(FS_STORE);
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
  }
  function fsGet() {
    if (fsHandleMem) return Promise.resolve(fsHandleMem);
    return fsOpen().then(function (db) {
      return new Promise(function (resolve) {
        const tx = db.transaction(FS_STORE, 'readonly');
        const rq = tx.objectStore(FS_STORE).get('obsidian');
        rq.onsuccess = function () { if (rq.result) fsHandleMem = rq.result; resolve(rq.result || null); };
        rq.onerror = function () { resolve(null); };
      });
    }).catch(function () { return null; });
  }
  function fsSet(h) {
    fsName = h && h.name ? h.name : '';
    fsHandleMem = h;
    return fsOpen().then(function (db) {
      const tx = db.transaction(FS_STORE, 'readwrite');
      tx.objectStore(FS_STORE).put(h, 'obsidian');
    }).catch(function () { /* 忽略 */ });
  }

  /** 拿 Obsidian 目录：记着且还有权限就直接用；否则让他选一次（force = 换一个） */
  function obsDir(force) {
    return new Promise(function (resolve, reject) {
      if (!window.showDirectoryPicker) { reject(new Error('no-fs')); return; }
      const pick = function () {
        window.showDirectoryPicker({ id: 'focusplan-cards', mode: 'readwrite', startIn: 'documents' })
          .then(function (dir) { fsSet(dir); resolve(dir); })
          .catch(reject);
      };
      if (force) { pick(); return; }
      fsGet().then(function (h) {
        if (!h) { pick(); return; }
        let q;
        try { q = h.queryPermission({ mode: 'readwrite' }); } catch (e) { pick(); return; }
        q.then(function (p) {
          if (p === 'granted') { fsName = h.name || fsName; resolve(h); return; }
          if (p === 'denied') { pick(); return; }
          // 'prompt'：趁这次点击顺手申请一次；不行再让他选
          let r;
          try { r = h.requestPermission({ mode: 'readwrite' }); } catch (e) { pick(); return; }
          r.then(function (x) {
            if (x === 'granted') { fsName = h.name || fsName; resolve(h); } else pick();
          }).catch(pick);
        }).catch(pick);
      });
    });
  }

  function writeFileTo(dir, name, data) {
    return dir.getFileHandle(name, { create: true }).then(function (h) {
      return h.createWritable().then(function (w) {
        return w.write(data).then(function () { return w.close(); });
      });
    });
  }
  function dataUrlToBytes(dataUrl) {
    const b64 = String(dataUrl).split(',')[1] || '';
    const bin = atob(b64);
    const buf = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
    return buf;
  }
  /** 总览：用双链把所有合集串起来（用户说的「以链接的形式」） */
  function writeIndex(sub) {
    const list = D().slice().sort(function (a, b) {
      return String(b.updatedAt || b.createdAt || '').localeCompare(String(a.updatedAt || a.createdAt || ''));
    });
    const L = ['---', 'tags: [设问卡]', '---', '', '# 🃏 设问卡总览', '',
      '> 这个文件由 focus-plan 每次导出时自动重写 —— 别在这里手写内容。', ''];
    list.forEach(function (c) {
      const n = (c.cards || []).length;
      L.push('- [[' + safeName(c.name) + ']] —— ' + n + ' 张' +
        (c.course ? ' · ' + oneLine(c.course) : '') + (c.dayKey ? ' · ' + c.dayKey : ''));
    });
    L.push('');
    L.push('> 复习日期由自己排：在 focus-plan 里用日历 / 📅 安排到某一天，到那天点 🃏 翻卡自测。');
    L.push('');
    return writeFileTo(sub, '🃏 设问卡总览.md', L.join('\n'));
  }
  /** 写一个合集（md + 它自己的图），并刷新总览 */
  function writeCol(dir, col) {
    let sub = null, att = null, imgN = 0;
    return dir.getDirectoryHandle(SUB_DIR, { create: true }).then(function (d) {
      sub = d;
      return d.getDirectoryHandle('attachments', { create: true });
    }).then(function (a) {
      att = a;
      const jobs = [];
      (col.cards || []).forEach(function (c, i) {
        [['front', c.frontImgs], ['back', c.backImgs]].forEach(function (pair) {
          (pair[1] || []).forEach(function (id, k) {
            const src = phGet(id);
            if (!src) return;
            jobs.push(writeFileTo(att, attName(col, i, pair[0], k), dataUrlToBytes(src))
              .then(function () { imgN++; }));
          });
        });
      });
      return Promise.all(jobs);
    }).then(function () {
      return writeFileTo(sub, safeName(col.name) + '.md', mdFor(col));
    }).then(function () {
      return writeIndex(sub);
    }).then(function () {
      return { img: imgN, dir: (dir.name || ''), sub: SUB_DIR };
    });
  }

  /** 导出单个合集 */
  function exportCol(col, opts) {
    const file = safeName(col.name) + '.md';
    const text = mdFor(col);
    if (!window.showDirectoryPicker) {
      download(file, text);
      App.ui.toast('⬇ 已下载 ' + file + '（这个浏览器不能直接写文件夹）', 4200);
      return;
    }
    obsDir(opts && opts.force).then(function (dir) {
      return writeCol(dir, col);
    }).then(function (r) {
      App.ui.toast('📥 已写进 「' + r.dir + '/' + r.sub + '/' + file + '」' +
        (col.cards.length ? '（' + col.cards.length + ' 张卡' + (r.img ? ' · ' + r.img + ' 张图' : '') + '）' : ''), 5000);
      renderPage();
    }).catch(function (e) {
      if (e && e.name === 'AbortError') return;
      download(file, text);
      App.ui.toast('写不进那个文件夹，已改成下载 ' + file + '（图要手动一起放进去）', 4600);
    });
  }

  /** 导出全部合集（一个合集一个 md，一起写进 设问卡/） */
  function exportAll(opts) {
    const list = D();
    if (!list.length) { App.ui.toast('还没有合集'); return; }
    if (!window.showDirectoryPicker) {
      list.forEach(function (c) { download(safeName(c.name) + '.md', mdFor(c)); });
      App.ui.toast('⬇ 已逐个下载（这个浏览器不能直接写文件夹）', 4600);
      return;
    }
    obsDir(opts && opts.force).then(function (dir) {
      let chain = Promise.resolve(), okN = 0, imgN = 0;
      list.forEach(function (c) {
        chain = chain.then(function () { return writeCol(dir, c); }).then(function (r) { okN++; imgN += r.img; });
      });
      return chain.then(function () { return { n: okN, img: imgN, dir: dir.name || '' }; });
    }).then(function (r) {
      App.ui.toast('📥 全部导出好了：' + r.n + ' 个合集写进 「' + r.dir + '/' + SUB_DIR + '/」' +
        (r.img ? '（共 ' + r.img + ' 张图）' : '') + ' —— 里面有份「🃏 设问卡总览」把它们都链起来了', 6000);
      renderPage();
    }).catch(function (e) {
      if (e && e.name === 'AbortError') return;
      App.ui.toast('全部导出失败了：' + ((e && e.message) || e), 4600);
    });
  }

  /* ---------- 弹窗 ---------- */
  let cur = null;       // 当前打开的弹窗元素
  let state = null;     // { col, mode, idx, flipped, order, editId }

  function refreshOpen() {
    if (cur && state && document.body.contains(cur)) paint();
  }

  function paint() {
    const box = cur.querySelector('.mc-body');
    if (!box) return;
    captureDraftText();          // 📝 v111：重建之前先把加卡区写着的文字收好（不然换标签一按就没了）
    const col = state.col;
    const n = (col.cards || []).length;

    if (state.mode === 'review') {
      const order = state.order || [];
      if (!order.length) { state.mode = 'box'; paint(); return; }
      if (state.idx >= order.length) state.idx = 0;
      const c = col.cards.filter(function (x) { return x.id === order[state.idx]; })[0];
      if (!c) { state.mode = 'box'; paint(); return; }
      box.innerHTML =
        '<div class="mc-revtop"><span class="mc-cnt">' + (state.idx + 1) + ' / ' + order.length + '</span>' +
        '<span><button class="btn btn-small" data-act="mc-shuffle">🔀 打乱</button> ' +
        '<button class="btn btn-small" data-act="mc-backbox">← 回到列表</button></span></div>' +
        '<div class="mc-flipbox' + (state.flipped ? ' flipped' : '') + '" data-act="mc-flip" title="点一下翻面">' +
        '<div class="mc-flip-inner">' +
        '<div class="mc-flip-face mc-flip-front"><span class="mc-face-tag">问题</span>' + faceHTML(c) + '</div>' +
        '<div class="mc-flip-face mc-flip-back"><span class="mc-face-tag">答案</span>' + backHTML(c) + '</div>' +
        '</div></div>' +
        (state.flipped
          ? '<div class="mc-flip-hint">👆 点卡片翻回正面（空格也行）</div>'
          : '<div class="mc-flip-hint">👆 先自己想一遍，再点卡片翻面看答案（空格也行）</div>') +
        '<div class="mc-revacts">' +
        '<button class="btn btn-small" data-act="mc-prev">⬅ 上一张</button>' +
        '<button class="btn btn-small btn-primary" data-act="mc-flip">' + (state.flipped ? '↩ 看正面' : '🔄 翻面') + '</button>' +
        '<button class="btn btn-small" data-act="mc-next">下一张 ➡</button></div>';
      return;
    }

    if (state.mode === 'import') {
      box.innerHTML =
        '<p class="hint" style="margin-top:0">把 AI 出的题 / 自己写的一堆题粘进来，一次全变成卡：<br>' +
        '每张卡之间用<b>单独一行 ===</b>；正面和反面之间用<b>单独一行 ---</b>；' +
        '一行搞定的也能写「正面 | 反面」。</p>' +
        '<textarea class="mc-imp" rows="10" placeholder="平衡常数 K 只与什么有关？\n---\n只与温度有关。\n浓度、压强变了 K 不变，但 Q 会变。\n===\n催化剂影响 K 吗？ | 不影响。"></textarea>' +
        '<div class="mc-row"><button class="btn btn-primary" data-act="mc-doimport">📋 导入</button>' +
        '<button class="btn" data-act="mc-backbox">返回</button></div>';
      return;
    }

    if (state.mode === 'subject') {
      const now = subjectOf(col);
      box.innerHTML =
        '<div class="mc-lab">这门课属于哪个学科？（卡片页会按学科分组，以后多了也好找）</div>' +
        '<div class="mc-subgrid">' +
        subjects().map(function (s) {
          return '<button class="mc-subpick' + (s === now ? ' on' : '') + '" data-act="mc-dosubject" data-v="' + esc(s) + '">' + esc(s) + '</button>';
        }).join('') +
        '<button class="mc-subpick' + (now ? '' : ' on') + '" data-act="mc-dosubject" data-v="">（先不分）</button>' +
        '</div>' +
        '<div class="mc-row" style="margin-top:12px">' +
        '<input class="mc-inp" id="mc-newsubject" placeholder="也可以自己加一个学科，比如「信息技术」" style="flex:1" />' +
        '<button class="btn btn-small" data-act="mc-addsubject">＋ 新增</button></div>' +
        '<div class="mc-row" style="margin-top:8px"><button class="btn" data-act="mc-backbox">← 返回</button></div>';
      return;
    }

    if (state.mode === 'rename') {
      box.innerHTML =
        '<div class="mc-lab">合集名字（以后认它就靠这个，写清楚一点）</div>' +
        '<input class="mc-inp" data-f="name" value="' + esc(col.name) + '" />' +
        '<div class="mc-row"><button class="btn btn-primary" data-act="mc-dorename">保存</button>' +
        '<button class="btn" data-act="mc-backbox">返回</button></div>';
      return;
    }

    // 主视图：加卡 + 列表
    const list = (col.cards || []).map(function (c, i) {
      const open = state.editId === c.id;
      return '<div class="mc-card" data-id="' + c.id + '">' +
        '<div class="mc-card-top"><span class="mc-idx">' + (i + 1) + '</span>' +
        '<span class="mc-front" data-act="mc-toggle">' + (faceHTML(c) || '<span class="hint" style="margin:0">（只有图 / 空）</span>') + '</span>' +
        '<button class="mc-ib" data-act="mc-card-sched" data-id="' + c.id + '" title="把这一张排到某天复习">📅</button>' +
        '<button class="mc-ib" data-act="mc-card-ed" data-id="' + c.id + '" title="改">✏️</button>' +
        '<button class="mc-ib" data-act="mc-card-del" data-id="' + c.id + '" title="删">🗑</button></div>' +
        (state.openId === c.id ? '<div class="mc-back">' + (backHTML(c) || '<span class="hint" style="margin:0">（反面还没写）</span>') + '</div>' : '') +
        (open
          ? '<div class="mc-edit"><textarea class="mc-ta" data-f="ef" rows="2" placeholder="正面文字（也可以只贴图）">' + esc(c.front) + '</textarea>' +
            '<div class="mc-thumbs" data-thumbs="ef"></div>' +
            '<textarea class="mc-ta" data-f="eb" rows="3" placeholder="反面文字">' + esc(c.back) + '</textarea>' +
            '<div class="mc-thumbs" data-thumbs="eb"></div>' +
            '<div class="mc-row"><button class="btn btn-small" data-act="mc-pick" data-side="ef">📷 正面贴图</button>' +
            '<button class="btn btn-small" data-act="mc-pick" data-side="eb">📷 反面贴图</button>' +
            '<button class="btn btn-small btn-primary" data-act="mc-card-save" data-id="' + c.id + '">保存</button>' +
            '<button class="btn btn-small" data-act="mc-card-cancel">取消</button></div></div>'
          : '') +
        '</div>';
    }).join('');

    box.innerHTML =
      '<div class="mc-head">' +
      '<div><b>' + esc(col.name) + '</b> <span class="mc-cnt">' + n + ' 张</span>' +
      '<button class="mc-tag" data-act="mc-subject" title="改学科">' +
      (col.subject ? '🏷 ' + esc(col.subject) : '🏷 未分学科') + '</button></div>' +
      '<div class="mc-sub">' + (col.course ? '来自：' + esc(col.course) + ' · ' : '') + (col.dayKey || '') +
      '　·　卡片只存在你本机，<b>复习日期你自己排</b></div>' +
      '<div class="mc-acts">' +
      '<button class="btn btn-small btn-primary" data-act="mc-review"' + (n ? '' : ' disabled') + '>🃏 开始复习' +
      (state.only && state.only.length ? '（只这 ' + state.only.length + ' 张）' : '') + '</button>' +
      '<button class="btn btn-small" data-act="mc-sched"' + (n ? '' : ' disabled') + ' title="整个合集排到某一天复习">📅 安排复习</button>' +
      '<button class="btn btn-small" data-act="mc-import">📋 批量粘贴导入</button>' +
      '<button class="btn btn-small" data-act="mc-rename">✏️ 改名字</button>' +
      '</div></div>' +
      '<div class="mc-add">' +
      '<div class="mc-lab">➕ 加一张（正面 = 要问自己的问题；反面 = 答案与要点）</div>' +
      '<div class="mc-siderow"><span class="mc-sidetag">正面</span>' +
      '<button class="btn btn-small" data-act="mc-pick" data-side="front">📷 贴图</button>' +
      '<span class="hint" style="margin:0">截图可以直接 <b>Ctrl+V</b> 粘进框里</span></div>' +
      '<textarea class="mc-ta" data-f="front" rows="2" placeholder="正面：如 平衡常数 K 只与什么有关？（只有图也行）">' +
      esc(state.draftText.front) + '</textarea>' +
      '<div class="mc-thumbs" data-thumbs="front"></div>' +
      '<div class="mc-siderow"><span class="mc-sidetag">反面</span>' +
      '<button class="btn btn-small" data-act="mc-pick" data-side="back">📷 贴图</button></div>' +
      '<textarea class="mc-ta" data-f="back" rows="3" placeholder="反面：如 只与温度有关。浓度压强变了 K 不变、Q 变。">' +
      esc(state.draftText.back) + '</textarea>' +
      '<div class="mc-thumbs" data-thumbs="back"></div>' +
      '<div class="mc-prev"><span class="mc-prevlab">反面预览</span><div class="mc-prevbody" data-prev></div></div>' +
      '<div class="mc-row"><button class="btn btn-primary" data-act="mc-add">＋ 加这张</button>' +
      '<span class="hint" style="margin:0">支持 Markdown、$x^2$、$\\ce{H2SO4}$（化学式）</span></div>' +
      '<div class="hint" style="margin:6px 0 0 2px">✍️ 写到一半去换标签 / 改名字 / 批量导入都没关系 —— 回来你写的内容还在（只有点「＋ 加这张」才会清空）。</div></div>' +
      '<input type="file" class="mc-file" accept="image/*" multiple />' +
      (n ? '<div class="mc-list">' + list + '</div>'
         : '<p class="hint">还没有卡片。想到什么就问自己一句，写完点「＋ 加这张」——一节课攒 5~10 张就够。</p>');

    const f = box.querySelector('[data-f="front"]');
    if (f && state.focusAdd) { try { f.focus(); } catch (e) { /* 忽略 */ } }
    state.focusAdd = false;
    paintThumbs();
    paintPrev();
  }

  /** 草稿图缩略图：side = front / back / ef / eb（只重画这一块，不碰 textarea） */
  function draftThumbs(side) {
    const ids = (state && state.draft && state.draft[side]) || [];
    if (!ids.length) return '';
    return ids.map(function (id, i) {
      return '<span class="mc-thumb"><img src="' + phGet(id) + '" data-act="mc-zoom" data-id="' + id + '" alt="图" />' +
        '<button class="mc-thumb-x" data-act="mc-unpick" data-side="' + side + '" data-i="' + i +
        '" title="去掉这张图" type="button">×</button></span>';
    }).join('');
  }
  function paintThumbs() {
    if (!cur) return;
    ['front', 'back', 'ef', 'eb'].forEach(function (side) {
      const box = cur.querySelector('[data-thumbs="' + side + '"]');
      if (box) box.innerHTML = draftThumbs(side);
    });
    // 🔔 v104：贴了图就把「＋ 加这张」写清楚（带几张图）并跳一跳 —— 别让人以为贴完就存下了
    const addBtn = cur.querySelector('[data-act="mc-add"]');
    if (addBtn) {
      const df = (state.draft.front || []).length + (state.draft.back || []).length;
      addBtn.textContent = df ? ('＋ 加这张（带 ' + df + ' 张图）') : '＋ 加这张';
      addBtn.classList.toggle('mc-add-ready', df > 0);
    }
  }
  /** 点图看大图（覆盖层，点哪都能关） */
  function zoomImg(id) {
    const src = phGet(id);
    if (!src) return;
    const ov = document.createElement('div');
    ov.className = 'mc-zoomov';
    ov.innerHTML = '<img src="' + src + '" alt="大图" /><span class="mc-zoomhint">点一下关闭</span>';
    ov.addEventListener('click', function () { ov.remove(); });
    document.body.appendChild(ov);
  }
  /** 从输入框反推"这是正面还是反面" */
  function sideOf(el) {
    if (!el || !el.dataset) return '';
    const f = el.dataset.f;
    return (f === 'front' || f === 'back' || f === 'ef' || f === 'eb') ? f : '';
  }
  function addPicked(side, files) {
    const needSave = (side === 'ef' || side === 'eb');
    takeImages(files, function (ids, bad) {
      if (!ids.length) {
        App.ui.toast(bad
          ? '😵 这张图浏览器解不开 —— 苹果的 HEIC 照片常这样：先在相册里导出成 JPG 再选，或者直接用截图复制粘贴'
          : '没读到图片文件（选一张 png / jpg 试试）', 5200);
        return;
      }
      state.draft[side] = (state.draft[side] || []).concat(ids);
      paintThumbs();
      App.ui.toast('📷 贴了 ' + ids.length + ' 张图' +
        (bad ? '（有 ' + bad + ' 张解不开，跳过了）' : '') +
        (needSave ? ' —— 记得点「保存」' : ' —— 记得点「＋ 加这张」才算存进卡里'), 4600);
    });
  }
  function onFilePick(e) {
    const t = e.target;
    if (!t || t.type !== 'file') return;
    // 🔴 v103 真凶：`input.files` 是**活的 FileList** —— 先把 `t.value = ''` 执行了，
    //    那个 FileList 会被一起清空，于是 `files.length` 变 0、**选完图什么都没发生**
    //    （这也解释了为什么"复制粘贴能用、选文件不行"：粘贴走 onPaste，不经过这里）。
    //    所以必须**先把文件拷成普通数组**，再清 value。
    const files = [];
    for (let i = 0; i < (t.files || []).length; i++) files.push(t.files[i]);
    const side = (state && state.pickSide) || 'front';
    try { t.value = ''; } catch (err) { /* 忽略 */ }
    if (files.length) addPicked(side, files);
  }
  function onPaste(e) {
    const cd = e.clipboardData;
    if (!cd || !cd.files || !cd.files.length) return;
    const side = sideOf(e.target) || 'front';
    e.preventDefault();
    addPicked(side, cd.files);
  }

  function paintPrev() {
    if (!cur) return;
    const box = cur.querySelector('.mc-body'); if (!box) return;
    const ta = box.querySelector('[data-f="back"]'); const pv = box.querySelector('[data-prev]');
    if (!ta || !pv) return;
    const v = (ta.value || '').trim();
    pv.innerHTML = v ? render(v) : '<span class="hint" style="margin:0">（写点答案，这里马上照着显示 —— 复习时它是被盖住的）</span>';
  }

  /* ---------- 事件 ---------- */
  /** 🃏 把「加卡区」现在的文字 + 草稿图存成一张卡
   *  （点「＋ 加这张」和关窗时点「加进卡里」共用同一套） */
  function addCardFromDraft() {
    const col = state && state.col;
    if (!cur || !col) return false;
    const f = cur.querySelector('[data-f="front"]');
    const bk = cur.querySelector('[data-f="back"]');
    // 📝 v111：加卡区不在视图里（如"换标签"页）时，退回用 state 收着的那份
    const dt = state.draftText || {};
    const fv = f ? (f.value || '').trim() : String(dt.front || '').trim();
    const bv = bk ? (bk.value || '').trim() : String(dt.back || '').trim();
    const fi = (state.draft.front || []).slice();
    const bi = (state.draft.back || []).slice();
    if (!fv && !fi.length) { App.ui.toast('正面写一句，或者贴张图 📷'); return false; }
    const nc = { id: S().uid(), front: fv, back: bv, at: Date.now() };
    if (fi.length) nc.frontImgs = fi;
    if (bi.length) nc.backImgs = bi;
    col.cards.push(nc);
    touch(col);
    if (f) f.value = '';
    if (bk) bk.value = '';
    state.draft.front = []; state.draft.back = [];
    state.draftText.front = ''; state.draftText.back = '';   // 📝 v111：这才是"加进卡里"该有的清空
    state.closeWarned = false;
    state.focusAdd = true;
    paint();
    afterChange();
    App.ui.toast('🃏 加好了（共 ' + col.cards.length + ' 张）');
    return true;
  }

  /** 🚪 v104：关窗前的守门人 —— 加卡区还有没保存的东西就别悄悄关掉
   *  （用户 2026-09-22：「我明明已经添加两张照片了，但它却显示 0 张」——
   *   他贴完图直接关了窗，草稿只在内存里，一关就没了） */
  function draftPending() {
    const df = ((state.draft.front || []).length + (state.draft.back || []).length);
    const fEl = cur && cur.querySelector('[data-f="front"]');
    const bEl = cur && cur.querySelector('[data-f="back"]');
    const dt = state.draftText || {};
    // 📝 v111：加卡区不在视图里时（换标签/导入/复习中）也得认得出"手上有草稿"
    const hasText = !!((fEl && fEl.value.trim()) || (bEl && bEl.value.trim()) ||
      String(dt.front || '').trim() || String(dt.back || '').trim());
    return { imgs: df, text: hasText, any: (df > 0 || hasText) };
  }

  /** 📝 v111：把加卡区**眼下写着的文字**收进 state（paint 会重建 innerHTML，不先收就没了） */
  function captureDraftText() {
    if (!cur || !state || !state.draftText) return false;
    const f = cur.querySelector('[data-f="front"]');
    const b = cur.querySelector('[data-f="back"]');
    if (!f && !b) return false;                 // 视图里没有加卡区（换标签/导入/复习中）
    if (f) state.draftText.front = f.value || '';
    if (b) state.draftText.back = b.value || '';
    return true;
  }

  /** 📝 v111：离开加卡区时给个回执 —— 让他知道「刚写的没丢」 */
  function draftKeptToast(where) {
    const d = (state && state.draftText) || {};
    if (!String(d.front || '').trim() && !String(d.back || '').trim()) return;
    App.ui.toast('✍️ 你先写着的内容给你留着了 —— 回到加卡区还在' + (where ? '（' + where + '）' : ''), 3400);
  }

  function tryClose() {
    if (!cur) { App.ui.closeModal(); return; }
    const p = draftPending();
    if (p.any && !state.closeWarned) {
      state.closeWarned = true;          // 第二次点「关闭」就直接关（不啰嗦）
      const old = cur.querySelector('.mc-closewarn');
      if (old) old.remove();
      const box = cur.querySelector('.mc-body') || cur;
      const tip = document.createElement('div');
      tip.className = 'mc-closewarn';
      tip.innerHTML = '⚠️ 还有 ' +
        (p.imgs ? '<b>' + p.imgs + ' 张刚贴的图</b>' : '') +
        (p.imgs && p.text ? ' 和 ' : '') +
        (p.text ? '刚写的内容' : '') +
        ' 没加进卡里 —— 现在加吗？' +
        '<span class="mc-closewarn-acts">' +
        '<button class="btn btn-small btn-primary" data-act="mc-save-now" type="button">＋ 加进卡里</button>' +
        '<button class="btn btn-small" data-act="mc-drop-draft" type="button">不要了，关掉</button>' +
        '<button class="btn btn-small" data-act="mc-keep" type="button">留在这儿</button>' +
        '</span>';
      box.insertBefore(tip, box.firstChild);
      try { tip.scrollIntoView({ block: 'nearest' }); } catch (e) { /* 忽略 */ }
      return;
    }
    App.ui.closeModal();
  }

  function onClick(e) {
    const b = e.target.closest ? e.target.closest('[data-act]') : null;
    if (!b || !state || !cur) return;
    const act = b.dataset.act;
    const col = state.col;

    if (act === 'mc-close') { tryClose(); return; }
    if (act === 'mc-backbox') { state.mode = 'box'; state.flipped = false; state.editId = null; paint(); return; }
    if (act === 'mc-rename') { state.mode = 'rename'; paint(); draftKeptToast('改名字'); return; }
    if (act === 'mc-dorename') {
      const inp = cur.querySelector('[data-f="name"]');
      const v = inp ? (inp.value || '').trim() : '';
      if (!v) { App.ui.toast('名字不能为空'); return; }
      col.name = v.slice(0, 40); touch(col);
      state.mode = 'box'; paint(); App.ui.toast('✏️ 改好了：' + col.name);
      return;
    }
    if (act === 'mc-import') { state.mode = 'import'; paint(); draftKeptToast('批量导入'); return; }
    if (act === 'mc-doimport') {
      const ta = cur.querySelector('.mc-imp');
      const arr = parseBulk(ta ? ta.value : '');
      if (!arr.length) { App.ui.toast('没解析出卡片 —— 记得每张之间空一行 ==='); return; }
      arr.forEach(function (x) { col.cards.push({ id: S().uid(), front: x.front, back: x.back, at: Date.now() }); });
      touch(col);
      state.mode = 'box'; paint();
      App.ui.toast('📋 导入了 ' + arr.length + ' 张卡');
      afterChange();
      return;
    }
    if (act === 'mc-add') { addCardFromDraft(); return; }
    if (act === 'mc-save-now') { if (addCardFromDraft()) App.ui.closeModal(); return; }
    if (act === 'mc-drop-draft') { App.ui.closeModal(); return; }
    if (act === 'mc-keep') {
      state.closeWarned = false;
      const tip = cur.querySelector('.mc-closewarn');
      if (tip) tip.remove();
      return;
    }
    if (act === 'mc-review') {
      state.mode = 'review'; state.idx = 0; state.flipped = false;
      const all = (col.cards || []);
      const only = state.only;
      const use = (only && only.length) ? all.filter(function (c) { return only.indexOf(c.id) >= 0; }) : all;
      state.order = use.map(function (c) { return c.id; });
      paint(); return;
    }
    if (act === 'mc-subject') { state.mode = 'subject'; paint(); draftKeptToast('换标签'); return; }
    if (act === 'mc-dosubject') {
      const v = b.dataset.v || '';
      col.subject = v; touch(col);
      state.mode = 'box'; paint();
      App.ui.toast(v ? '🏷 归到「' + v + '」了' : '先不分学科');
      return;
    }
    if (act === 'mc-addsubject') {
      const el = cur.querySelector('#mc-newsubject');
      const v = el ? (el.value || '').trim() : '';
      if (!v) { App.ui.toast('先写个学科名'); return; }
      addSubject(v);
      col.subject = v; touch(col);
      state.mode = 'box'; paint();
      App.ui.toast('🏷 新增学科「' + v + '」，以后都能选它');
      return;
    }
    if (act === 'mc-sched') { schedCardModal(col, null); return; }
    if (act === 'mc-card-sched') {
      const c = (col.cards || []).filter(function (x) { return x.id === b.dataset.id; })[0];
      if (c) schedCardModal(col, [c]);
      return;
    }
    if (act === 'mc-shuffle') {
      const o = state.order.slice();
      for (let i = o.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); const t = o[i]; o[i] = o[j]; o[j] = t; }
      state.order = o; state.idx = 0; state.flipped = false; paint(); return;
    }
    if (act === 'mc-flip') { state.flipped = !state.flipped; paint(); return; }
    if (act === 'mc-next') {
      state.flipped = false;
      state.idx = (state.idx + 1) % state.order.length;
      paint(); return;
    }
    if (act === 'mc-prev') {
      state.flipped = false;
      state.idx = (state.idx - 1 + state.order.length) % state.order.length;
      paint(); return;
    }
    if (act === 'mc-export') { App.ui.toast('导出已经去掉啦 —— 卡片就在这儿复习就好', 3600); return; }
    if (act === 'mc-pick') {
      state.pickSide = b.dataset.side || 'front';
      let fi = cur.querySelector('.mc-file');
      if (!fi) {
        // 🛟 v103 兜底：正常情况下 input 就在视图里；万一没有（视图切换/模板变动），
        //   现造一个再点 —— 不然用户看到的就是「点了没反应」
        fi = document.createElement('input');
        fi.type = 'file';
        fi.accept = 'image/*';
        fi.multiple = true;
        fi.className = 'mc-file';
        fi.style.display = 'none';
        fi.addEventListener('change', onFilePick);
        cur.appendChild(fi);
      }
      try { fi.click(); } catch (e) { App.ui.toast('这个浏览器不让选文件，试试直接复制图片粘贴'); }
      return;
    }
    if (act === 'mc-unpick') {
      const side = b.dataset.side, i = +b.dataset.i;
      if (state.draft[side]) { state.draft[side].splice(i, 1); paintThumbs(); }
      return;
    }
    if (act === 'mc-zoom') { zoomImg(b.dataset.id); return; }
    if (act === 'mc-toggle') {
      const id = b.closest('.mc-card') ? b.closest('.mc-card').dataset.id : null;
      state.openId = (state.openId === id) ? null : id;
      paint(); return;
    }
    if (act === 'mc-card-ed') {
      const c0 = col.cards.filter(function (c) { return c.id === b.dataset.id; })[0];
      state.editId = b.dataset.id; state.openId = b.dataset.id;
      state.draft.ef = c0 ? (c0.frontImgs || []).slice() : [];
      state.draft.eb = c0 ? (c0.backImgs || []).slice() : [];
      paint(); return;
    }
    if (act === 'mc-card-cancel') { state.editId = null; paint(); return; }
    if (act === 'mc-card-save') {
      const t = cur.querySelectorAll('[data-f="ef"]');
      const k = cur.querySelectorAll('[data-f="eb"]');
      const card = col.cards.filter(function (c) { return c.id === b.dataset.id; })[0];
      if (!card) return;
      card.front = (t[0].value || '').trim();
      card.back = (k[0].value || '').trim();
      const ef = (state.draft.ef || []).slice(), eb = (state.draft.eb || []).slice();
      if (ef.length) card.frontImgs = ef; else delete card.frontImgs;
      if (eb.length) card.backImgs = eb; else delete card.backImgs;
      state.draft.ef = []; state.draft.eb = [];
      touch(col);
      state.editId = null; paint(); afterChange();
      App.ui.toast('改好了');
      return;
    }
    if (act === 'mc-card-del') {
      const id = b.dataset.id;
      const card = col.cards.filter(function (c) { return c.id === id; })[0];
      if (!card) return;
      App.ui.confirm('删掉这张卡？<br><span class="hint">' + esc(oneLine(card.front)).slice(0, 40) + '</span>', '删掉', function () {
        (card.frontImgs || []).forEach(phDel);   // 📷 图不跟着卡留着，免得越攒越多
        (card.backImgs || []).forEach(phDel);
        const i = col.cards.findIndex(function (c) { return c.id === id; });
        if (i >= 0) col.cards.splice(i, 1);
        touch(col); paint(); afterChange();
        App.ui.toast('🗑 删掉了');
      });
      return;
    }
  }

  function onInput(e) {
    const t = e.target;
    if (!t || !t.dataset) return;
    // 📝 v111：加卡区一边写一边存进 state —— 这样任何重画都不会把内容弄丢
    if (state && state.draftText && (t.dataset.f === 'front' || t.dataset.f === 'back')) {
      state.draftText[t.dataset.f] = t.value || '';
    }
    if (t.dataset.f === 'back') paintPrev();
  }
  function onKey(e) {
    if (!state) return;
    if (e.key === 'Escape') { tryClose(); return; }
    const typing = e.target && /textarea|input/i.test(e.target.tagName);
    if (state.mode !== 'review' || typing) return;
    if (e.key === ' ') { e.preventDefault(); state.flipped = !state.flipped; paint(); }
    if (e.key === 'ArrowRight') { state.flipped = false; state.idx = (state.idx + 1) % state.order.length; paint(); }
    if (e.key === 'ArrowLeft') { state.flipped = false; state.idx = (state.idx - 1 + state.order.length) % state.order.length; paint(); }
  }

  /** 卡片变了之后：刷新任务页（🃏 计数）和听课面板（整理那步的计数） */
  function afterChange() {
    try { if (App.tasks && App.tasks.renderAll) App.tasks.renderAll(); } catch (e) { /* 忽略 */ }
    try { if (App.lecture && App.lecture.refresh) App.lecture.refresh(); } catch (e) { /* 忽略 */ }
  }

  function openCol(colId, opts) {
    const col = find(colId);
    if (!col) { App.ui.toast('这个合集不在了'); return; }
    state = {
      col: col, mode: 'box', idx: 0, flipped: false, order: [], openId: null, editId: null,
      focusAdd: !!(opts && opts.focusAdd),
      only: (opts && opts.only) || null,          // 📅 从"排到某天的复习任务"进来时，只复习这几张
      draft: { front: [], back: [], ef: [], eb: [] },   // 📷 还没加进卡里的图
      // 📝 v111：加卡区**已经写进去的文字**（正面/反面）。
      //   ⚠️ 以前这俩只有 DOM 里那一份 —— `paint()` 一重建 innerHTML 就全没了：
      //   用户「我原先在正面写了一大段，点了一下上面的换标签，它就把我正在写的给搞没了」。
      draftText: { front: '', back: '' },
      pickSide: 'front'
    };
    const foot = '<button class="btn" data-act="mc-close">关闭</button>';
    cur = App.ui.openModal('🃏 设问卡 · ' + esc(col.name).slice(0, 14), '<div class="mc-body"></div>', foot);
    cur.addEventListener('click', onClick);
    cur.addEventListener('input', onInput);
    cur.addEventListener('change', onFilePick);
    cur.addEventListener('paste', onPaste);
    document.addEventListener('keydown', onKey);
    paint();
    ensureMath(function () { refreshOpen(); });
    phLoadAll(function () { refreshOpen(); });   // 📷 图读进内存后重画一次
  }

  /** 从任务行进：有合集就开最近那个，没有就新建一个 */
  function openForTask(task, opts) {
    opts = opts || {};
    const list = forTask(task.id).sort(function (a, b) {
      return String(b.updatedAt || '').localeCompare(String(a.updatedAt || ''));
    });
    if (!list.length) {
      const col = ensureCollection({
        taskId: task.id, subId: opts.subId || null, course: task.text,
        name: opts.name || task.text, dayKey: opts.dayKey || S().todayKey()
      });
      openCol(col.id, { focusAdd: true });
      App.ui.toast('🃏 给「' + task.text.slice(0, 12) + '」开了个新合集');
      return;
    }
    if (opts.colId) {
      const hit = list.filter(function (c) { return c.id === opts.colId; })[0];
      openCol((hit || list[0]).id);
      return;
    }
    openCol(list[0].id);
  }

  /** 听课用：按「这节课」定位合集（同一任务 + 小题 + 那天） */
  function openForLecture(L, dayKey) {
    if (!L) return;
    const day = dayKey || S().todayKey();
    const name = L.course || L.name || '设问卡';
    let task = null;
    try {
      const d = S().getDay(day);
      ['required', 'ideal', 'extra'].forEach(function (k) {
        (d.tasks[k] || []).forEach(function (t) { if (!task && t.id === L.taskId) task = t; });
      });
    } catch (e) { /* 忽略 */ }
    const col = ensureCollection({
      taskId: L.taskId, subId: L.subId || null, course: L.course || (task ? task.text : ''),
      name: (task && !L.subId) ? task.text : name, dayKey: day
    });
    openCol(col.id, { focusAdd: true });
  }

  /* ---------- 入口 ---------- */
  function init() {
    // 📁 读一次"记着的文件夹"名字（v99：导出入口已去掉，这段保留但没入口）
    fsGet().then(function (h) {
      if (h && h.name) { fsName = h.name; renderPage(); }
    });
    // 📷 照片读进内存
    phLoadAll(function () { renderPage(); refreshOpen(); });
    // 🃏 卡片页（容器 innerHTML 重画，监听挂在容器上）
    const pv = document.getElementById('cards-view');
    if (pv) pv.addEventListener('click', onPageClick);
    // 历史页的听课记录（补加入口）：容器是 innerHTML 重画的，监听挂在容器上
    document.addEventListener('click', function (e) {
      const b = e.target.closest ? e.target.closest('[data-act="mc-hist"]') : null;
      if (!b) return;
      const k = b.dataset.k, id = b.dataset.id;
      let rec = null;
      try {
        ((S().peekDay ? S().peekDay(k) : S().getDay(k)).lectures || []).forEach(function (x) { if (!rec && x.id === id) rec = x; });
      } catch (err) { /* 忽略 */ }
      if (!rec) { App.ui.toast('这条记录找不到了'); return; }
      openForLecture({ taskId: rec.taskId, subId: rec.subId || null, course: rec.course, name: rec.course }, k);
    });
  }

  /* ---------- 🃏 v93：独立的「卡片」页（导出 Obsidian 的固定入口） ---------- */
  function pageHTML() {
    const list = D().slice().sort(function (a, b) {
      return String(b.updatedAt || b.createdAt || '').localeCompare(String(a.updatedAt || a.createdAt || ''));
    });
    const total = list.reduce(function (n, c) { return n + (c.cards || []).length; }, 0);
    let h = '<div class="card">' +
      '<h2>🃏 设问卡</h2>' +
      '<p class="hint" style="margin-top:-2px">听课「③ 整理」那一步给自己出的题，都收在这里 —— 一个合集 = 一节课。' +
      '出题：<b>听课 → ③整理 → 🃏 设问卡</b>，或任务行上的 🃏（课已经上完了也能补加）。<br>' +
      '<b>复习日期由你自己排</b>：卡片本身不带日期；要用日历 / 📅 安排到某一天，到那天点开翻卡自测。' +
      '（' + list.length + ' 个合集 · 共 ' + total + ' 张）</p>' +
      '<div class="mc-acts" style="margin-bottom:10px">' +
      '<button class="btn btn-small" data-act="card-new">＋ 新建一个合集</button>' +
      '<button class="btn btn-small" data-act="mc-clear-all" title="把日历里所有 🃏 复习安排、以及所有任务上的复习轮次，一次清干净">' +
      '🧹 清空所有复习安排</button>' +
      (photoStats().n ? '<button class="btn btn-small" data-act="card-clean">🧹 清理没用的图（' +
        orphanPhotoIds().length + ' / 共 ' + photoStats().n + ' 张 · 约 ' + photoStats().mb + 'MB）</button>' : '') +
      '</div>' +
      '<p class="hint" style="margin-top:-4px">卡片<b>就在这个软件里复习</b> —— 复习的时候正面只有问题，' +
      '点一下才翻到答案（跟 Anki 一个意思）。<br>' +
      '📷 贴的照片<b>只存在你这台电脑的浏览器里</b>（跟着卡片走），哪天清了浏览器数据会一起没 —— 重要的题记得别只贴图。</p>';

    if (!list.length) {
      h += '<div class="q-empty">还没有卡片。<br>去听课「③ 整理」给自己出几道题，或到任务行点 🃏 补加 —— ' +
        '正面是要问自己的问题，反面是答案要点。</div>';
    } else {
      // 🏷 v101：按学科分组（高中九科打底，自己加的排在后面，没分类的垫底）
      const bySub = {};
      list.forEach(function (c) {
        const s = c.subject || NO_SUB;
        (bySub[s] = bySub[s] || []).push(c);
      });
      const order = subjects().concat([NO_SUB]);
      const keys = Object.keys(bySub).sort(function (a, b) {
        const ia = order.indexOf(a), ib = order.indexOf(b);
        return (ia < 0 ? 900 + a.charCodeAt(0) : ia) - (ib < 0 ? 900 + b.charCodeAt(0) : ib);
      });
      keys.forEach(function (s) {
        const arr = bySub[s];
        const tot = arr.reduce(function (m, c) { return m + (c.cards || []).length; }, 0);
        h += '<div class="mc-subhead">' + esc(s) +
          '<span class="mc-cnt">' + arr.length + ' 个合集 · ' + tot + ' 张</span></div>';
        arr.forEach(function (c) {
          const n = (c.cards || []).length;
          h += '<div class="mc-rowline" data-id="' + c.id + '">' +
            '<div class="mc-rowmain">' +
            '<b>' + esc(c.name) + '</b> <span class="mc-cnt">' + n + ' 张</span>' +
            '<div class="mc-sub">' + (c.course ? esc(c.course) + ' · ' : '') + (c.dayKey || '') +
            ((c.cards || []).length
              ? ' · 第一张：' + esc(oneLine(c.cards[0].front) || (c.cards[0].frontImgs && c.cards[0].frontImgs.length ? '（看图）' : '')).slice(0, 26) +
                (imgCount(c) ? ' · 📷 ' + imgCount(c) + ' 张图' : '')
              : '') + '</div>' +
            schedBadgeHTML(c.id) +
            '</div>' +
            '<span class="mc-acts">' +
            '<button class="btn btn-small btn-primary" data-act="card-open" data-id="' + c.id + '">🃏 打开 / 复习</button>' +
            (n ? '<button class="btn btn-small" data-act="card-sched" data-id="' + c.id + '">📅 排到某天</button>' : '') +
            '<button class="mc-ib" data-act="card-del" data-id="' + c.id + '" title="删掉这个合集">🗑</button>' +
            '</span></div>';
        });
      });
    }
    h += '</div>';
    return h;
  }

  function renderPage() {
    const el = document.getElementById('cards-view');
    if (!el) return;
    el.innerHTML = pageHTML();
  }

  function newColModal() {
    App.ui.openModal('🃏 新建一个合集',
      '<div class="field"><label>合集名字（默认可以用任务名）</label>' +
      '<input id="mc-new-name" class="mc-inp" type="text" placeholder="比如：化学 · 平衡常数那节" /></div>' +
      '<div class="field"><label>学科（卡片页会按学科分组；也能自己写一个新的）</label>' +
      '<input id="mc-new-subject" class="mc-inp" type="text" list="mc-sub-list" placeholder="比如：化学" />' +
      '<datalist id="mc-sub-list">' + subjects().map(function (s) { return '<option value="' + esc(s) + '"></option>'; }).join('') + '</datalist></div>' +
      '<p class="hint">合集只是个收纳盒 —— 里面一张卡也没有也没关系，打开后随时加。</p>',
      '<button class="btn btn-primary" data-act="mc-nc-ok">建好并打开</button>' +
      '<button class="btn" data-act="mc-nc-cancel">取消</button>');
    App.ui.bindActions({
      'mc-nc-ok': function () {
        const el = App.ui.query('#mc-new-name');
        const v = el ? (el.value || '').trim() : '';
        if (!v) { App.ui.toast('先起个名字'); return; }
        const se = App.ui.query('#mc-new-subject');
        const sv = se ? (se.value || '').trim() : '';
        if (sv) addSubject(sv);
        const col = ensureCollection({ name: v, course: '', subject: sv, dayKey: S().todayKey() });
        App.ui.closeModal();
        renderPage();
        openCol(col.id, { focusAdd: true });
      },
      'mc-nc-cancel': function () { App.ui.closeModal(); }
    });
  }

  /** 📁 主动选 / 换一个 Obsidian 文件夹 */
  function pickDir() {
    if (!window.showDirectoryPicker) { App.ui.toast('这个浏览器不支持直接写文件夹，用「下载」吧'); return; }
    obsDir(true).then(function (dir) {
      App.ui.toast('📁 记住了：' + (dir.name || '') + ' —— 以后导出直接写进它的「' + SUB_DIR + '/」里', 4600);
      renderPage();
    }).catch(function (e) {
      if (e && e.name === 'AbortError') return;
      App.ui.toast('没选成：' + ((e && e.message) || e));
    });
  }

  function onPageClick(e) {
    const b = e.target.closest ? e.target.closest('[data-act]') : null;
    if (!b) return;
    const act = b.dataset.act;
    if (act === 'card-new') { newColModal(); return; }
    // 📥 v99：导出到 Obsidian 已经去掉了（用户明确说不需要）—— 卡片就在这儿复习
    if (act === 'card-exportall') { App.ui.toast('导出已经去掉啦 —— 卡片就在这儿复习就好', 3600); return; }
    if (act === 'card-pickdir') { App.ui.toast('导出已经去掉啦 —— 卡片就在这儿复习就好', 3600); return; }
    if (act === 'card-clean') {
      const n = orphanPhotoIds().length;
      if (!n) { App.ui.toast('没有没用的图 —— 都是卡片正在用的'); renderPage(); return; }
      const st = photoStats();
      App.ui.confirm('清掉 <b>' + n + '</b> 张没被任何卡片用到的图？<br>' +
        '<span class="hint">一般是"删掉的合集留下的"或者"贴了图没保存"的那种。' +
        '卡片里正在用的图<b>不会动</b>。（现在共 ' + st.n + ' 张 · 约 ' + st.mb + 'MB）</span>', '清掉', function () {
        const m = cleanOrphanPhotos();
        renderPage();
        App.ui.toast('🧹 清掉了 ' + m + ' 张没用的图');
      });
      return;
    }
    if (act === 'mc-unsched') {
      const colId = b.dataset.col, dayKey = b.dataset.day;
      const d = (S().data().days || {})[dayKey];
      let hit = 0;
      if (d && d.tasks) ['required', 'ideal', 'extra'].forEach(function (c) {
        const list = d.tasks[c] || [];
        for (let i = list.length - 1; i >= 0; i--) {
          if (list[i].mcRef && list[i].mcRef.colId === colId) { list.splice(i, 1); hit++; }
        }
      });
      if (!hit) { App.ui.toast('那天本来就没有这套卡的安排'); }
      else {
        save(); renderPage();
        try { if (App.tasks && App.tasks.renderAll) App.tasks.renderAll(); } catch (e) { /* 忽略 */ }
        App.ui.toast('✕ 取消了 ' + dayKey + ' 那天的复习安排');
      }
      return;
    }
    if (act === 'mc-unsched-all') {
      const c0 = find(b.dataset.id);
      if (!c0) return;
      const n0 = schedDaysOf(c0.id).length;
      App.ui.confirm('清空「<b>' + esc(c0.name) + '</b>」的全部复习安排？<br>' +
        '<span class="hint">那 ' + n0 + ' 天日历里的「🃏 复习」任务会删掉（卡片本身一张不动）。</span>',
        '清空', function () {
          const n = clearSchedOf(c0.id);
          save(); renderPage();
          try { if (App.tasks && App.tasks.renderAll) App.tasks.renderAll(); } catch (e) { /* 忽略 */ }
          App.ui.toast('🧹 清掉了 ' + n + ' 天的安排');
        });
      return;
    }
    if (act === 'mc-clear-all') {
      App.ui.confirm('把<b>所有复习安排</b>一次清空？<br>' +
        '<span class="hint">包括：日历里所有「🃏 复习」任务、以及所有任务上的复习轮次（🌱 那些）。' +
        '<b>卡片和任务本身一张都不删</b>，只是不再自动提醒复习 —— 想重新开始随时再排。</span>',
        '全部清空', function () {
          const r = clearAllSched();
          save(); renderPage();
          try { if (App.tasks && App.tasks.renderAll) App.tasks.renderAll(); } catch (e) { /* 忽略 */ }
          try { if (App.queue && App.queue.render) App.queue.render(); } catch (e) { /* 忽略 */ }
          App.ui.toast('🧹 清空了 ' + r.sched + ' 天的排期 + ' + r.plan + ' 条复习计划', 5200);
        });
      return;
    }
    const col = find(b.dataset.id);
    if (!col) return;
    if (act === 'card-open') { openCol(col.id); return; }
    if (act === 'card-sched') { schedCardModal(col, null); return; }
    if (act === 'card-export') { exportCol(col); return; }
    if (act === 'card-del') {
      App.ui.confirm('删掉合集「<b>' + esc(col.name) + '</b>」（含里面 ' + (col.cards || []).length + ' 张卡）？' +
        '<br><span class="hint">导出去 Obsidian 的那份不受影响。</span>', '删掉', function () {
        const i = D().findIndex(function (x) { return x.id === col.id; });
        if (i >= 0) D().splice(i, 1);
        const cleaned = cleanOrphanPhotos();     // 📷 v97：合集里那些照片别留着占地方
        save(); renderPage();
        App.ui.toast('🗑 合集删掉了' + (cleaned ? '（顺手清了 ' + cleaned + ' 张它的图）' : ''));
      });
      return;
    }
  }

  App.memcards = {
    init: init,
    renderPage: renderPage,
    pageHTML: pageHTML,
    openRef: openRef,
    schedCardModal: schedCardModal,
    schedDaysOf: schedDaysOf, schedBadgeHTML: schedBadgeHTML, dupOnDay: dupOnDay,   // 📅 v116
    cardsForTask: cardsForTask, clearSchedOf: clearSchedOf, clearAllSched: clearAllSched,   // 🔗🧹 v120
    subjects: subjects,
    addSubject: addSubject,
    subjectOf: subjectOf,
    render: render,
    ensureMath: ensureMath,
    exportCol: exportCol,
    exportAll: exportAll,
    pickDir: pickDir,
    phGet: phGet,
    imgsHTML: imgsHTML, zoomImg: zoomImg,   // 🖼 v134 复习弹窗也要出图（带放大）
    phPut: phPut,
    phDel: phDel,
    phLoadAll: phLoadAll,
    cleanOrphanPhotos: cleanOrphanPhotos,
    allPhotos: allPhotos, restorePhotos: restorePhotos,           // 💾 v121 备份带图
    photoMB: function () { return photoStats().mb; },
    orphanPhotoIds: orphanPhotoIds,
    photoStats: photoStats,
    takeImages: takeImages,
    parseBulk: parseBulk,
    mdFor: mdFor,
    openForTask: openForTask,
    openForLecture: openForLecture,
    openCol: openCol,
    forTask: forTask,
    countForTask: countForTask,
    countAll: countAll,
    ensureCollection: ensureCollection
  };
})();
