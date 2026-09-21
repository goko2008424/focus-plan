/* ============================================================
 * queue.js — 📋 队列（按顺序做，没有完成率）+ 📌 每日必做（v77）
 *
 * 为什么要这一页：「每天要完成 N 条」这个指标本身在制造挫败感 ——
 * 只要分母在，每天都会得出「没完成」。所以这里刻意不显示完成率，
 * 只告诉你「现在这一条是什么」，做完下一条自动顶上。
 *
 * 数据结构（懒初始化，老数据不用迁移）：
 *   data.queue      = [ {id,text,note,createdAt, points?,mode?,standard?,subs?,groups?} ]
 *                     数组顺序 = 执行顺序；v82 起是完整任务对象
 *   data.queueDone  = [ {id,text,note,doneDay,doneAt} ]   已完成，可「↻ 放回队列」
 *   data.daily      = [ {id,text,days:{'2026-09-20':ts}} ] 每日必做
 *
 * v82 实体化：当前条自动在「今天 · 必须」顶部生成一份真任务副本（fromQueue 指回队列项）
 * —— 计时 / 听课三步 / 悬浮窗 / 小任务·任务组 / 编辑 全部原生可用，一行渲染代码都不用改。
 * ============================================================ */
(function () {
  'use strict';

  const App = (window.App = window.App || {});
  const S = function () { return App.store; };
  const esc = function (s) { return S().esc(s); };

  let showDone = false;

  /* ---------- 数据存取 ---------- */
  function Q() {
    const d = S().data(); if (!d) return [];
    if (!Array.isArray(d.queue)) d.queue = [];
    return d.queue;
  }
  function QD() {
    const d = S().data(); if (!d) return [];
    if (!Array.isArray(d.queueDone)) d.queueDone = [];
    return d.queueDone;
  }
  function DY() {
    const d = S().data(); if (!d) return [];
    if (!Array.isArray(d.daily)) d.daily = [];
    return d.daily;
  }

  function current() { return Q()[0] || null; }

  /** 🧩 v86：这条下面挂着什么，直接列出来（组名 + 每道小题的名称），不再只给个计数 */
  function subDetailHTML(subs, groups) {
    const lines = [];
    (groups || []).forEach(function (g) {
      lines.push('🧩 ' + (g.name || '任务组') + '（' + (g.subs || []).length + ' 题）：' +
        (g.subs || []).map(function (s) { return s.text; }).join('、'));
    });
    (subs || []).forEach(function (s) {
      lines.push('📝 ' + s.text + (s.minutes ? '（' + s.minutes + ' 分钟）' : ''));
    });
    if (!lines.length) return '';
    return '<div class="q-sub-detail">' + lines.map(function (l) { return '<div>' + esc(l) + '</div>'; }).join('') + '</div>';
  }

  /** 「名称|分钟」行解析（加任务 / 改任务的 textarea 用） */
  function parseSubLines(str) {
    return String(str || '').split('\n').map(function (l) { return l.trim(); })
      .filter(function (l) { return l; })
      .map(function (l) {
        const m = l.split(/[|｜]/);
        return { text: m[0].trim(), minutes: Math.max(0, +m[1] || 0) };
      }).filter(function (x) { return x.text; });
  }
  function serializeSubLines(subs) {
    return (subs || []).map(function (s) { return s.text + (s.minutes ? '|' + s.minutes : ''); }).join('\n');
  }
  function newSub(parsed) {
    return { id: S().uid(), text: parsed.text, minutes: parsed.minutes, points: 0, done: null };
  }
  /** 任务组编辑块（加/改弹窗里用，动态增删） */
  function groupBlockHTML(name, subsStr) {
    return '<div class="q-gblock" style="border:1px solid var(--line);border-radius:8px;padding:8px;margin-top:6px">' +
      '<input class="q-input g-name" type="text" placeholder="任务组名称（如：函数第一章）" value="' + esc(name || '') + '" style="width:100%" />' +
      '<textarea class="q-input g-subs" rows="2" style="width:100%;margin-top:4px;resize:vertical" placeholder="组内小任务，每行一个；要限时就写「题名|分钟」">' + esc(subsStr || '') + '</textarea></div>';
  }
  function readGroupBlocks(rootSel) {
    const out = [];
    document.querySelectorAll(rootSel + ' .q-gblock').forEach(function (b) {
      const name = (b.querySelector('.g-name').value || '').trim();
      const gs = parseSubLines(b.querySelector('.g-subs').value);
      if (name && gs.length) {
        out.push({ id: S().uid(), name: name, subs: gs.map(newSub) });
      }
    });
    return out;
  }
  function findIn(list, id) {
    return list.filter(function (x) { return x.id === id; })[0] || null;
  }
  function idxOf(list, id) {
    return list.findIndex(function (x) { return x.id === id; });
  }
  function dDone(it, k) { return !!(it.days && it.days[k]); }

  /** 每日必做：连续做了几天（今天还没做就从昨天往前数） */
  function dStreak(it) {
    const days = it.days || {};
    const today = S().todayKey();
    let t = S().keyToDate(today).getTime();
    if (!days[today]) t -= 86400000;
    let n = 0;
    while (n < 999) {
      if (!days[S().dateKey(new Date(t))]) break;
      n++;
      t -= 86400000;
    }
    return n;
  }

  /* ---------- v82 实体化：队列当前条 = 任务页必须栏顶上的真任务 ---------- */

  function timingId() {
    const t = (App.tasks && App.tasks.getTimer) ? App.tasks.getTimer() : null;
    return t ? t.taskId : null;
  }

  /** 找某条队列项在今天的未完成副本 */
  function findCopyOf(qid) {
    const day = S().getDay(S().todayKey());
    let out = null;
    ['required', 'ideal', 'extra'].forEach(function (k) {
      (day.tasks[k] || []).forEach(function (c) {
        if (!out && c.fromQueue === qid && c.done !== true) out = c;
      });
    });
    return out;
  }

  /** 队列项 → 任务副本（小任务进度原样带上 —— 跨天续做） */
  function copyOf(it) {
    const c = { id: S().uid(), text: it.text, done: false, fromQueue: it.id };
    if (it.points != null) c.points = it.points;
    if (it.mode) c.mode = it.mode;
    if (it.standard) c.standard = it.standard;
    if (it.subs && it.subs.length) c.subs = JSON.parse(JSON.stringify(it.subs));
    if (it.groups && it.groups.length) c.groups = JSON.parse(JSON.stringify(it.groups));
    // 🌱 v91：间隔复习的排期（sp）和知识点（kps）必须跟着走 ——
    //   以前它们只活在副本上，副本一被收回/重建，排好的 3 轮复习就整块丢了
    if (it.sp) c.sp = JSON.parse(JSON.stringify(it.sp));
    if (it.kps) c.kps = JSON.parse(JSON.stringify(it.kps));
    return c;
  }

  /** 把副本上的改动写回队列项（不 save —— 调用方存） */
  function syncBack(copy) {
    const it = findIn(Q(), copy.fromQueue);
    if (!it) return;
    it.text = copy.text;
    // ⚠️ v87 修复：进度按「题名」合并回队列 —— 绝不删除队列里配置的小任务/任务组
    //  （以前 copy.subs 一空就 delete item.subs，编辑弹窗刚配好的小任务会被下一次实体化抹掉）
    (it.subs || []).forEach(function (s) {
      const cs = (copy.subs || []).filter(function (x) { return x.text === s.text; })[0];
      if (cs) s.done = cs.done;
    });
    (it.groups || []).forEach(function (g) {
      const cg = (copy.groups || []).filter(function (x) { return x.name === g.name; })[0];
      if (cg) (g.subs || []).forEach(function (s) {
        const cs = (cg.subs || []).filter(function (x) { return x.text === s.text; })[0];
        if (cs) s.done = cs.done;
      });
    });
    if (copy.points != null) it.points = copy.points;
    if (copy.mode) it.mode = copy.mode;
    if (copy.standard) it.standard = copy.standard;
    if (copy.sp) it.sp = JSON.parse(JSON.stringify(copy.sp));
    if (copy.kps) it.kps = JSON.parse(JSON.stringify(copy.kps));
  }

  /** 保证「当前条」在任务页上有一条未完成的真副本；不是当前条的旧副本收回队列 */
  function ensureMaterialized() {
    const d = S().data();
    if (!d || !Array.isArray(d.queue)) return false;
    const cur = d.queue[0] || null;
    const day = S().getDay(S().todayKey());
    if (!day || !day.tasks || !day.tasks.required) return false;
    const tid = timingId();
    let dirty = false;

    // ① 不是当前条的未完成副本 → 收回队列（⏱ 正在计时的绝不删，等下一轮再收）
    ['required', 'ideal', 'extra'].forEach(function (k) {
      const arr = day.tasks[k] || [];
      for (let i = arr.length - 1; i >= 0; i--) {
        const c = arr[i];
        if (!c.fromQueue || c.done === true) continue;
        if (cur && c.fromQueue === cur.id) continue;
        if (tid && c.id === tid) continue;
        syncBack(c);
        arr.splice(i, 1);
        dirty = true;
      }
    });

    if (cur) {
      const arr = day.tasks.required;
      // ② 同一条多个未完成副本 → 只留一个（优先留正在计时的那个）
      const copies = arr.filter(function (c) { return c.fromQueue === cur.id && c.done !== true; });
      const keep = copies.filter(function (c) { return c.id === tid; })[0] || copies[0] || null;
      copies.forEach(function (c) {
        if (c === keep) return;
        if (tid && c.id === tid) return;
        const j = arr.indexOf(c);
        if (j >= 0) { arr.splice(j, 1); dirty = true; }
      });
      // ③ 没有副本 → 造一个，插到必须栏顶部
      if (!keep) {
        arr.unshift(copyOf(cur));
        dirty = true;
      } else {
        // ④ 轻量同步：任务页上的改动（改名 / 小任务进度）写回队列项
        const snap = function () { return JSON.stringify([cur.text, cur.points, cur.mode, cur.standard, cur.subs, cur.groups]); };
        const before = snap();
        syncBack(keep);
        if (snap() !== before) dirty = true;
        // 🧲 v87：队列项是「配置权威」—— 它的小任务/任务组（刚从副本合并了进度）同步回副本。
        //   放在这里 = 每次实体化都强制对齐，编辑弹窗怎么改都不会丢。
        if (keep.text === cur.text) {
          if (cur.subs && cur.subs.length) keep.subs = JSON.parse(JSON.stringify(cur.subs));
          else if (keep.subs) { delete keep.subs; dirty = true; }
          if (cur.groups && cur.groups.length) keep.groups = JSON.parse(JSON.stringify(cur.groups));
          else if (keep.groups) { delete keep.groups; dirty = true; }
          if (cur.sp) keep.sp = JSON.parse(JSON.stringify(cur.sp));
          if (cur.kps) keep.kps = JSON.parse(JSON.stringify(cur.kps));
        }
      }
    }
    if (dirty) S().save();
    return dirty;
  }

  /** 结算前清场：未完成的队列副本静默收回队列（不进补记弹窗、不扣分、不顺延） */
  function settleSweep(day) {
    let n = 0;
    if (!day || !day.tasks) return 0;
    ['required', 'ideal', 'extra'].forEach(function (k) {
      const arr = day.tasks[k] || [];
      for (let i = arr.length - 1; i >= 0; i--) {
        const c = arr[i];
        if (c.fromQueue && c.done !== true) { syncBack(c); arr.splice(i, 1); n++; }
      }
    });
    return n;
  }

  /** 日历 📥 入队：整条任务（含小任务/任务组）排到队尾，进度重置（重做语义） */
  function enqueueTask(task) {
    if (!task || !task.text) return false;
    const it = { id: S().uid(), text: task.text, note: task.note || '', createdAt: new Date().toISOString() };
    if (task.points != null) it.points = task.points;
    if (task.mode) it.mode = task.mode;
    if (task.standard) it.standard = task.standard;
    if (task.subs && task.subs.length) it.subs = task.subs.map(function (s) {
      return { id: S().uid(), text: s.text, minutes: s.minutes || 0, points: s.points || 0, done: null };
    });
    if (task.groups && task.groups.length) it.groups = task.groups.map(function (g) {
      return { id: S().uid(), name: g.name, subs: (g.subs || []).map(function (s) {
        return { id: S().uid(), text: s.text, minutes: s.minutes || 0, points: s.points || 0, done: null };
      }) };
    });
    Q().push(it);
    S().save();
    render();
    return true;
  }

  /* ---------- 任务页打勾 → 队列完成（v82） ---------- */
  let pendingDone = null;   // 刚完成的队列项，等总结窗关掉后再弹「这条以后怎么处理」

  function qPoints() {
    const v = (S().settings() || {}).queuePoints;
    return (v == null ? 5 : +v) || 0;
  }

  /** 任务页上的队列副本被勾成「完成」→ 完成队列项、发队列分（下一条顶上等 runPending） */
  function onTaskDone(task) {
    const it = findIn(Q(), task.fromQueue);
    if (!it) return;
    syncBack(task);
    const i = idxOf(Q(), it.id);
    if (i < 0) return;
    lastDone = { id: it.id, idx: i, text: it.text, ledId: null };   // ↩ 手滑撤销用
    const fin = Q().splice(i, 1)[0];
    fin.doneDay = S().todayKey();
    fin.doneAt = new Date().toISOString();
    QD().unshift(fin);
    const pts = qPoints();
    if (pts > 0) {
      S().addLedger(S().todayKey(), 'earn-queue', { points: pts, note: '📋 队列完成：' + fin.text });
      const led = S().data().ledger;
      if (led && led.length) lastDone.ledId = led[led.length - 1].id;   // 撤销时退这一笔
    }
    S().save();
    pendingDone = fin;
    dropCopy(fin.id);   // 🧹 队列项已经进「已完成」了，镜像副本别留在任务页/日历里
    render();           // ⚠️ v91：必须立刻重画队列页 —— 「↩ 刚才点错了」那条和新的当前条都在这一帧上
    refreshBar();
  }

  /** 总结窗关闭之后调用：下一条顶上 + 刷新 + 弹「这条以后怎么处理」 */
  function runPending() {
    try { ensureMaterialized(); } catch (e) { /* 忽略 */ }
    render();
    if (!pendingDone) return;
    const it = pendingDone;
    pendingDone = null;
    let delivered = false;   // ⚠️ 必须每次调用都是新的 —— 放外面会让第二次完成永远不弹窗
    const deliver = function () {
      if (delivered) return;
      delivered = true;
      const pts = qPoints();
      App.ui.toast('✅ 做完了' + (pts > 0 ? '（+' + pts + ' 分）' : '') +
        (current() ? ' · 下一条顶上来了' : ' · 队列空了'), 3400);
      askAfterDone(it);
    };
    // 🌱 的「设知识点 / 排不满」弹窗先来 —— 它关掉后再来我们的（不抢弹窗）
    if (document.querySelector('#modal-root .modal-mask')) {
      const iv = setInterval(function () {
        if (!document.querySelector('#modal-root .modal-mask')) { clearInterval(iv); delivered = true; deliver(); }
      }, 500);
      setTimeout(function () { clearInterval(iv); deliver(); }, 15000);
    } else {
      deliver();
    }
  }

  /* ---------- 📥 从以前的日子搬任务（v84）----------
   * 以前没做完的任务散在日历里，一个个翻太麻烦。
   * 这里一次列出：过去每天没做完的 + 今天清单里「↩ 昨天没做完」的，
   * 点 📥 整任务排进队尾（小任务进度重置），原来那天就不留这条 —— 它归队列管。 */
  function pastUndone() {
    const today = S().todayKey();
    const days = (S().data() || {}).days || {};
    const out = [];
    Object.keys(days).sort().reverse().forEach(function (k) {
      if (k > today) return;
      const day = days[k];
      if (!day || !day.tasks) return;
      ['required', 'ideal', 'extra'].forEach(function (col) {
        (day.tasks[col] || []).forEach(function (t) {
          if (t.done || t.fromQueue || !String(t.text || '').trim()) return;
          if (k === today && !t.rolled) return;   // 今天的只收「↩ 昨天没做完」的
          out.push({ day: k, col: col, id: t.id, text: t.text,
                     subs: t.subs, groups: t.groups });
        });
      });
    });
    return out.slice(0, 60);
  }

  function removePastTask(day, col, id) {
    const d = S().data().days[day];
    if (!d || !d.tasks || !d.tasks[col]) return null;
    const arr = d.tasks[col];
    const i = arr.findIndex(function (t) { return t.id === id; });
    if (i < 0) return null;
    const t = arr.splice(i, 1)[0];
    S().save();
    return t;
  }

  function pastModal() {
    const list = pastUndone();
    let body;
    if (!list.length) {
      body = '<p class="hint" style="margin-top:0">以前没有挂着的没做完任务 🎉' +
        '（今天清单里「↩ 昨天没做完」的也算，会列在这里）</p>';
    } else {
      const byDay = {};
      list.forEach(function (x) { (byDay[x.day] = byDay[x.day] || []).push(x); });
      body = '<p class="hint" style="margin-top:0">这些是<b>以前没做完、一直挂着的</b>。' +
        '点 📥 排进队列末尾（整任务带过去，小任务进度重置），<b>原来那天就不留这条了</b> —— 它归队列管。</p>';
      Object.keys(byDay).sort().reverse().forEach(function (k) {
        body += '<div class="q-head" style="margin-top:10px"><span>' +
          (k === S().todayKey() ? '今天（↩ 昨天剩的）' : S().shortDateCN(k)) +
          '</span><span>' + byDay[k].length + ' 条</span></div>';
        byDay[k].forEach(function (x) {
          body += '<div class="q-row"><span class="q-text">' + esc(x.text) + subDetailHTML(x.subs, x.groups) + '</span>' +
            '<span class="q-acts"><button class="q-ib" data-act="pq-add" data-day="' + x.day +
            '" data-col="' + x.col + '" data-id="' + x.id + '" title="排进队列末尾">📥</button></span></div>';
        });
      });
      body += '<div class="btn-row" style="margin-top:12px">' +
        '<button class="btn btn-primary" data-act="pq-all">📥 全部排进队列（' + list.length + ' 条）</button></div>';
    }
    App.ui.openModal('📥 从以前的日子搬任务', body,
      '<button class="btn" data-act="pq-close">关闭</button>');
    App.ui.bindActions({
      'pq-add': function (el) {
        // bindActions 会把按钮元素当第一参数传进来（fn(this)）
        doEnqueue(el.dataset.day, el.dataset.col, el.dataset.id);
      },
      'pq-all': function () {
        // ⚠️ 自动结算会把没做完的任务沿日期链复制副本（9/17 原件 → 9/18 副本 → … → 今天），
        //    所以外表同名的一律视为**同一条任务**：只入队一次，其余副本全部清掉。
        // 按日期**从早到晚**：带小任务的原件先入队，后面的顺延链副本走嫁接/清理
        const list2 = pastUndone().slice().sort(function (a, b) { return a.day < b.day ? -1 : 1; });
        let n = 0, cleaned = 0;
        list2.forEach(function (x) {
          const exists = Q().some(function (q) { return q.text === x.text; });
          const t = removePastTask(x.day, x.col, x.id);
          if (!t) return;
          if (exists) {
            graftIfRicher(findIn(Q(), Q().filter(function (q) { return q.text === x.text; })[0].id), t);
            S().save();
            cleaned++;   // 队列里已经有了 → 数据嫁接后清掉这份副本，不重复入队
            return;
          }
          enqueueTask(t);
          n++;
        });
        render();
        pastModal();   // 保持弹窗打开，显示刷新后的（通常是空的）列表
        App.ui.toast('📥 搬了 ' + n + ' 条进队列' +
          (cleaned ? '（另有 ' + cleaned + ' 条同名副本顺手清掉了）' : '') +
          (pastUndone().length ? '' : ' —— 以前没有挂着的了 🎉'), 3600);
      },
      'pq-close': function () { App.ui.closeModal(); }
    });
  }

  /** 同名去重时，别把小任务弄丢：顺延链副本不带 subs/groups，原件带 —— 谁富用谁补谁 */
  function graftIfRicher(existing, incoming) {
    if (!existing || !incoming) return;
    if (!existing.subs && incoming.subs) existing.subs = incoming.subs;
    if (!existing.groups && incoming.groups) existing.groups = incoming.groups;
    if (existing.points == null && incoming.points != null) existing.points = incoming.points;
    if (!existing.mode && incoming.mode) existing.mode = incoming.mode;
    if (!existing.standard && incoming.standard) existing.standard = incoming.standard;
  }

  function doEnqueue(day, col, id) {
    const t = removePastTask(day, col, id);
    if (!t) { App.ui.toast('这条已经不在了'); pastModal(); return; }
    const exists = Q().some(function (q) { return q.text === t.text; });
    if (exists) {
      // 队列里已有同名（多半是它的顺延副本）→ 数据嫁接给队列那条，再清掉这份
      graftIfRicher(findIn(Q(), Q().filter(function (q) { return q.text === t.text; })[0].id), t);
      S().save();
      App.ui.toast('队列里已经有这条了，这份重复的顺手清掉了');
    } else {
      enqueueTask(t);
      App.ui.toast('📥 已排进队列末尾：' + t.text.slice(0, 14));
    }
    pastModal();   // 刷新弹窗列表
  }

  /* ---------- 写操作 ---------- */
  function addItem(text, note, subs, groups) {
    const it = { id: S().uid(), text: text, note: note || '', createdAt: new Date().toISOString() };
    if (subs && subs.length) it.subs = subs;
    if (groups && groups.length) it.groups = groups;
    Q().push(it);
    S().save();
    return it;
  }

  function addDaily(text, subs, groups) {
    const it = { id: S().uid(), text: text, days: {}, createdAt: new Date().toISOString() };
    // 🧩 v89：从队列搬过来 / 做完转过来的，把「里面有什么」一起带上（不然明细就丢了）
    if (subs && subs.length) it.subs = JSON.parse(JSON.stringify(subs)).map(function (s) {
      return { id: S().uid(), text: s.text, minutes: s.minutes || 0, points: s.points || 0, done: null };
    });
    if (groups && groups.length) it.groups = JSON.parse(JSON.stringify(groups)).map(function (g) {
      return { id: S().uid(), name: g.name, subs: (g.subs || []).map(function (s) {
        return { id: S().uid(), text: s.text, minutes: s.minutes || 0, points: s.points || 0, done: null };
      }) };
    });
    DY().push(it);
    S().save();
    return it;
  }

  function moveItem(id, dir) {
    const list = Q();
    const i = idxOf(list, id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= list.length) return false;
    const t = list[i]; list[i] = list[j]; list[j] = t;
    S().save();
    return true;
  }

  function moveToEnd(id) {
    const list = Q();
    const i = idxOf(list, id);
    if (i < 0 || i === list.length - 1) return;
    list.push(list.splice(i, 1)[0]);
    S().save();
  }

  /** 做完一条：从队列挪到「已完成」，记下今天、发积分，然后问一句要不要进每日必做
   *  v82：当前条已实体化成任务页的真任务 → 走 toggleTask 全流程（计时/听课/总结/积分都齐） */
  /** ✅ v91：点「做完了」先弹一次确认 —— 确认之后才是真完成，
   *  而且完成时会在队列页顶上留一条「↩ 点错了」随时能放回原位。 */
  function finish(id) {
    const it = findIn(Q(), id);
    if (!it) return;
    const copy = findCopyOf(id);
    if (copy && timingId() === copy.id) { App.ui.toast('这条正在计时，先结束计时再打勾'); return; }
    App.ui.confirm('「<b>' + esc(it.text) + '</b>」做完了？<br>' +
      '<span class="hint">点错了没关系 —— 完成之后队列页最上面会留一条「↩ 刚才点错了」，' +
      '能把它<b>放回原来的位置</b>。</span>',
      '✅ 做完了', function () { doFinish(id); });
  }

  function doFinish(id) {
    const cur0 = current();
    if (cur0 && cur0.id === id) {
      const copy = findCopyOf(id);
      if (copy && App.tasks && App.tasks.toggleTask) {
        if (timingId() === copy.id) { App.ui.toast('这条正在计时，先结束计时再打勾'); return; }
        App.tasks.toggleTask('required', copy.id);   // 完成后回调 onTaskDone → runPending
        return;
      }
    }
    const list = Q();
    const i = idxOf(list, id);
    if (i < 0) return;
    const it = list.splice(i, 1)[0];
    it.doneDay = S().todayKey();
    it.doneAt = new Date().toISOString();
    QD().unshift(it);

    const pts = +((S().settings() || {}).queuePoints == null ? 5 : S().settings().queuePoints) || 0;
    if (pts > 0) {
      S().addLedger(S().todayKey(), 'earn-queue', { points: pts, note: '📋 队列完成：' + it.text });
    }
    S().save();
    render();

    const nxt = current();
    App.ui.toast('✅ 做完了' + (pts > 0 ? '（+' + pts + ' 分）' : '') +
      (nxt ? ' · 下一条顶上来了' : ' · 队列空了'), 3400);
    askAfterDone(it);
  }

  function askAfterDone(it) {
    App.ui.openModal('✅ 做完了 · 这条以后怎么处理？',
      '<p class="hint" style="margin-top:0">「<b>' + esc(it.text) + '</b>」已经做完了（记在今天、进了「已完成」）。</p>' +
      '<p class="hint" style="margin-top:2px">📌 = 以后天天/定期看（复习、要背的）｜📅 = 过几天再做一次（错题、卷子）<br>' +
      '什么都不选也行 —— 它就留在「已完成」里。</p>',
      '<button class="btn btn-primary" data-act="daily">📌 加进「每日必做」</button>' +
      '<button class="btn" data-act="sched">📅 安排到某天再做</button>' +
      '<button class="btn" data-act="none">不用了</button>');
    App.ui.bindActions({
      daily: function () {
        App.ui.closeModal();
        addDaily(it.text, it.subs, it.groups);
        render();
        App.ui.toast('已加进「每日必做」📌');
      },
      sched: function () {
        App.ui.closeModal();
        schedModal(it.text, 'queueDone', it.id);
      },
      none: function () { App.ui.closeModal(); }
    });
  }

  function dToggle(id) {
    const it = findIn(DY(), id);
    if (!it) return;
    if (!it.days) it.days = {};
    const k = S().todayKey();
    if (it.days[k]) delete it.days[k]; else it.days[k] = Date.now();
    S().save();
    render();
  }

  /* ---------- 📅 安排到某一天（v78）----------
     复用日历那套 copyTaskToDay —— 安排过去的就是一条**普通任务**，
     落在那天的「必须 / 理想 / 拓展」某一栏，日历里点开那天就能看到、能改期。
     队列 / 已完成 / 每日必做 都走这一个弹窗。 */
  function addDays(k, n) {
    const p = String(k).split('-');
    const d = new Date(+p[0], +p[1] - 1, +p[2]);
    d.setDate(d.getDate() + n);
    return S().dateKey(d);
  }
  function dayLabel(k) {
    if (k === S().todayKey()) return '今天';
    if (k === S().tomorrowKey()) return '明天';
    return S().shortDateCN(k);
  }
  function colOptions(cur) {
    return [['required', '✅ 必须'], ['ideal', '⭐ 理想'], ['extra', '🌱 拓展']].map(function (c) {
      return '<option value="' + c[0] + '"' + (c[0] === cur ? ' selected' : '') + '>' + c[1] + '</option>';
    }).join('');
  }
  /** 从来源里彻底移除（队列 / 已完成 / 每日必做） */
  function removeFromSrc(kind, id) {
    const list = kind === 'daily' ? DY() : (kind === 'queueDone' ? QD() : Q());
    const i = idxOf(list, id);
    if (i >= 0) list.splice(i, 1);
  }

  function schedModal(text, kind, id) {
    const srcName = kind === 'daily' ? '「每日必做」' : (kind === 'queueDone' ? '「已完成」' : '「队列」');
    let pickKey = addDays(S().todayKey(), 3);
    let targetCol = 'required';
    let delSrc = true;   // 默认把这条从原处删掉 —— 不删就变成"两处都有"
    const modal = App.ui.openModal('📅 安排到某一天 · ' + esc(text).slice(0, 12),
      '<p class="hint" style="margin-top:0">把这条<b>排到某一天去做</b>。到那天它就在<b>日历</b>和那天的任务清单里' +
      '（跟日历里 🔁 那套是同一个地方，之后也能再改期）。</p>' +
      '<div class="field"><label>哪一天做</label>' +
      '<input type="date" id="q-sch-date" value="' + pickKey + '" style="width:180px" /></div>' +
      '<div class="field"><label>放到哪一栏</label>' +
      '<select id="q-sch-col" style="width:180px">' + colOptions(targetCol) + '</select></div>' +
      '<div class="field"><label>标准：要做到什么程度（选填，如：全对 / 8 分钟内解出）</label>' +
      '<input type="text" id="q-sch-std" style="width:100%" placeholder="写清楚标准，那天做的时候才知道够不够格" /></div>' +
      '<label style="display:flex;gap:8px;align-items:center;font-size:13.5px;cursor:pointer;margin-top:4px">' +
      '<input type="checkbox" id="q-sch-rm"' + (delSrc ? ' checked' : '') + ' style="width:16px;height:16px" /> ' +
      '同时把这条从 ' + srcName + ' 里<b>删掉</b>（不勾 = 两边都留一份）</label>',
      '<button class="btn btn-primary" data-act="ok">✔ 安排到 ' + dayLabel(pickKey) + '</button>' +
      '<button class="btn" data-act="cancel">取消</button>');
    const dateEl = modal.querySelector('#q-sch-date');
    const okBtn = modal.querySelector('[data-act="ok"]');
    dateEl.onchange = function () {
      pickKey = dateEl.value || pickKey;
      okBtn.textContent = '✔ 安排到 ' + dayLabel(pickKey);
    };
    const colEl = modal.querySelector('#q-sch-col');
    if (colEl) colEl.onchange = function () { targetCol = colEl.value || 'required'; };
    const rmEl = modal.querySelector('#q-sch-rm');
    if (rmEl) rmEl.onchange = function () { delSrc = rmEl.checked; };
    App.ui.bindActions({
      ok: function () {
        const std = (modal.querySelector('#q-sch-std').value || '').trim();
        if (dateEl.value) pickKey = dateEl.value;
        if (pickKey < S().todayKey()) { App.ui.toast('目标日期在过去啦，往后面挑一天'); return; }
        if (!App.calendar || !App.calendar.copyTaskToDay) { App.ui.toast('日历模块没加载，先刷新一下'); return; }
        const n = App.calendar.copyTaskToDay({ text: text }, 'required', pickKey, std, false, targetCol);
        if (!n) { App.ui.toast('那一天已经有一条同名任务了，没重复安排'); return; }
        if (delSrc) removeFromSrc(kind, id);
        S().save();
        App.ui.closeModal();
        render();
        App.ui.toast('📅 已安排到 ' + dayLabel(pickKey) + '：' + text.slice(0, 14) +
          (delSrc ? '（已从' + srcName + '删掉）' : '') + (std ? '（标准：' + std + '）' : ''));
      },
      cancel: function () { App.ui.closeModal(); }
    });
  }

  /* ---------- 弹窗 ---------- */
  function addModal(isDaily) {
    const title = isDaily ? '📌 加进「每日必做」' : '📋 往队列里加一条';
    const hint = isDaily
      ? '加进来的会每天出现在「每日必做」里 —— 适合复习、听力、单词这类每天都要碰的。'
      : '加进来的会排在队尾。以后就按顺序做 —— 不用再想「今天要完成几条」。';
    const ph = isDaily ? '比如：听力 10 分钟' : '比如：数学 · 导数第二讲';
    App.ui.openModal(title,
      '<p class="hint" style="margin-top:0">' + hint + '</p>' +
      '<div style="margin-top:10px"><label class="q-lab">内容</label>' +
      '<input id="q-add-text" class="q-input" type="text" placeholder="' + ph + '" /></div>' +
      (isDaily ? '' :
        '<div style="margin-top:8px"><label class="q-lab">备注（可选）</label>' +
        '<input id="q-add-note" class="q-input" type="text" placeholder="比如：约 40 分钟 / 讲义 P32" /></div>' +
        '<div style="margin-top:8px"><label class="q-lab">🌱 知识类型（选填，决定标不标「新知识 / 复习」）</label>' +
        '<select id="q-add-mode" class="q-input" style="width:100%">' + modeOptions('') + '</select></div>' +
        '<div style="margin-top:10px"><label class="q-lab">📝 小任务（选填，每行一个；要限时就写「题名|分钟」）</label>' +
        '<textarea id="q-add-subs" class="q-input" rows="3" style="width:100%;resize:vertical" placeholder="例题 1-3|10\n习题 5-8|20"></textarea></div>' +
        '<div style="margin-top:8px"><label class="q-lab">🧩 任务组（选填，打包小题整组做）</label>' +
        '<div id="q-add-groups"></div>' +
        '<button class="btn btn-small" type="button" id="q-add-gbtn">＋ 加一个任务组</button></div>'),
      '<button class="btn btn-primary" data-act="ok">加进去</button>' +
      '<button class="btn" data-act="cancel">取消</button>');
    const inp = App.ui.query('#q-add-text');
    if (inp) inp.focus();
    if (!isDaily) {
      // 动态任务组块：普通 onclick（bindActions 只绑打开时已存在的按钮）
      const gbtn = App.ui.query('#q-add-gbtn');
      if (gbtn) gbtn.onclick = function () {
        const box = document.getElementById('q-add-groups');
        box.insertAdjacentHTML('beforeend', groupBlockHTML('', ''));
        const blocks = box.querySelectorAll('.g-name');
        if (blocks.length) blocks[blocks.length - 1].focus();
      };
    }
    App.ui.bindActions({
      ok: function () {
        const t = (App.ui.query('#q-add-text').value || '').trim();
        if (!t) { App.ui.toast('先写点内容吧'); return; }
        if (isDaily) {
          addDaily(t);
        } else {
          const nt = App.ui.query('#q-add-note');
          const subs = parseSubLines(App.ui.query('#q-add-subs').value).map(newSub);
          const groups = readGroupBlocks('#modal-root');
          const nit = addItem(t, nt ? (nt.value || '').trim() : '', subs, groups);
          const nmd = (App.ui.query('#q-add-mode') || {}).value || '';
          if (nmd) nit.mode = nmd;
          S().save();
        }
        App.ui.closeModal();
        render();
      },
      cancel: function () { App.ui.closeModal(); }
    });
  }

  function editModal(id, isDaily) {
    const it = isDaily ? findIn(DY(), id) : findIn(Q(), id);
    if (!it) return;
    App.ui.openModal('✏️ 改这一条',
      '<div><label class="q-lab">内容</label>' +
      '<input id="q-ed-text" class="q-input" type="text" value="' + esc(it.text) + '" /></div>' +
      // 🧩 v89：每日必做里已经挂着小任务/任务组的（多是从队列搬过来的），也要能改/能清
      (isDaily && !(it.subs && it.subs.length) && !(it.groups && it.groups.length) ? '' :
       isDaily && (it.subs && it.subs.length || it.groups && it.groups.length) ?
        '<div style="margin-top:10px"><label class="q-lab">📝 小任务（每行一个；要限时就写「题名|分钟」。<b>改了会重置进度</b>）</label>' +
        '<textarea id="q-ed-subs" class="q-input" rows="3" style="width:100%;resize:vertical">' + esc(serializeSubLines(it.subs)) + '</textarea></div>' +
        '<div style="margin-top:8px"><label class="q-lab">🧩 任务组</label>' +
        '<div id="q-ed-groups">' +
        (it.groups || []).map(function (g) { return groupBlockHTML(g.name, serializeSubLines(g.subs)); }).join('') +
        '</div>' +
        '<button class="btn btn-small" type="button" id="q-ed-gbtn">＋ 加一个任务组</button></div>' :
        '<div style="margin-top:8px"><label class="q-lab">备注（可选）</label>' +
        '<input id="q-ed-note" class="q-input" type="text" value="' + esc(it.note || '') + '" /></div>' +
        '<div style="margin-top:8px"><label class="q-lab">🌱 知识类型</label>' +
        '<select id="q-ed-mode" class="q-input" style="width:100%">' + modeOptions(it.mode) + '</select></div>' +
        '<div style="margin-top:10px"><label class="q-lab">📝 小任务（每行一个；要限时就写「题名|分钟」。<b>改了会重置进度</b>）</label>' +
        '<textarea id="q-ed-subs" class="q-input" rows="3" style="width:100%;resize:vertical">' + esc(serializeSubLines(it.subs)) + '</textarea></div>' +
        '<div style="margin-top:8px"><label class="q-lab">🧩 任务组</label>' +
        '<div id="q-ed-groups">' +
        (it.groups || []).map(function (g) { return groupBlockHTML(g.name, serializeSubLines(g.subs)); }).join('') +
        '</div>' +
        '<button class="btn btn-small" type="button" id="q-ed-gbtn">＋ 加一个任务组</button></div>'),
      '<button class="btn btn-primary" data-act="ok">保存</button>' +
      '<button class="btn" data-act="cancel">取消</button>');
    {
      const gbtn = App.ui.query('#q-ed-gbtn');
      if (gbtn) gbtn.onclick = function () {
        const box = document.getElementById('q-ed-groups');
        box.insertAdjacentHTML('beforeend', groupBlockHTML('', ''));
      };
    }
    App.ui.bindActions({
      ok: function () {
        const t = (App.ui.query('#q-ed-text').value || '').trim();
        if (!t) { App.ui.toast('内容不能为空'); return; }
        it.text = t;
        if (!isDaily) {
          const nt = App.ui.query('#q-ed-note');
          if (nt) it.note = (nt.value || '').trim();
          const emd = (App.ui.query('#q-ed-mode') || {}).value || '';
          if (emd) it.mode = emd; else delete it.mode;
        }
        // 🧩 v89：明细栏在「有明细」或「不是每日必做」时都收一次（少了就把明细清空）
        const subsEl = App.ui.query('#q-ed-subs');
        const hasDetailUI = !!subsEl || !!App.ui.query('#q-ed-groups');
        if (hasDetailUI) {
          const ns = subsEl ? parseSubLines(subsEl.value).map(newSub) : [];
          const ng = readGroupBlocks('#modal-root');
          if (ns.length) it.subs = ns; else delete it.subs;
          if (ng.length) it.groups = ng; else delete it.groups;
        }
        // 📋 v82/v86：已实体化的副本要跟着改（文本 + 小任务/任务组一起），不然两个编辑口互相覆盖
        try {
          const day = S().getDay(S().todayKey());   // v88 修复：原来写成 S.todayKey() → TypeError 被 catch 吞掉，副本同步从来没跑过
          let touched = false;
          ['required', 'ideal', 'extra'].forEach(function (k) {
            (day.tasks[k] || []).forEach(function (c) {
              if (c.fromQueue === it.id && c.done !== true) {
                c.text = t;
                if (!isDaily) {
                  if (it.mode) c.mode = it.mode; else delete c.mode;
                  if (it.subs && it.subs.length) c.subs = JSON.parse(JSON.stringify(it.subs)); else delete c.subs;
                  if (it.groups && it.groups.length) c.groups = JSON.parse(JSON.stringify(it.groups)); else delete c.groups;
                }
                touched = true;
              }
            });
          });
          if (touched && App.tasks && App.tasks.renderAll) App.tasks.renderAll();
        } catch (e) { /* 同步失败不阻塞保存 */ }
        S().save();
        App.ui.closeModal();
        render();
      },
      cancel: function () { App.ui.closeModal(); }
    });
  }

  /* ---------- v88：队列 ↔ 每日必做 互换 + 知识类型标注 ---------- */
  /** 🏷 v91：属性徽标 —— **没有属性也标出来**（⚪ 普通），点一下就改。
   *  以前 mode 没设就什么都不显示，用户根本不知道自己忘了标，复习也就不会排。 */
  function mtag(it, kind, id) {
    const m = it.mode === 'new' ? ['mode-new', '📘 新知识']
      : (it.mode === 'review' ? ['mode-rev', '🔄 复习'] : ['mode-plain', '⚪ 普通']);
    return '<button class="mode-tag q-mtag ' + m[0] + '" data-act="q-mode" data-kind="' + (kind || 'queue') +
      '" data-id="' + (id || it.id) + '" title="点一下改属性：普通 / 新知识 / 复习">' + m[1] + '</button>';
  }

  /** 改属性的小弹窗（普通 / 新知识 / 复习 三选一） */
  function modePickModal(kind, id) {
    const list = kind === 'daily' ? DY() : (kind === 'done' ? QD() : Q());
    const it = findIn(list, id);
    if (!it) return;
    const opt = function (v, label, hint) {
      const cur = (it.mode || '') === v;
      return '<button class="btn' + (cur ? ' btn-primary' : '') + '" data-act="mp-set" data-v="' + v + '" style="margin:0 6px 6px 0;text-align:left">' +
        label + '<br><span class="hint" style="margin:0">' + hint + (cur ? ' · 当前' : '') + '</span></button>';
    };
    App.ui.openModal('🏷 这条是什么属性？',
      '<p class="hint" style="margin-top:0">「<b>' + esc(it.text) + '</b>」<br>' +
      '📘 <b>新知识</b>：完成时会引导你出题，并按遗忘曲线排当天 3 轮复习；' +
      '🔄 <b>复习</b>：只作标记（不排）；⚪ <b>普通</b>：两样都不做。</p>',
      '<div style="display:flex;flex-wrap:wrap">' + opt('', '⚪ 普通任务', '不排复习') +
      opt('new', '📘 新知识', '排 3 轮复习') + opt('review', '🔄 复习知识', '只作标记') + '</div>' +
      '<button class="btn" data-act="mp-cancel">不改了</button>');
    App.ui.bindActions({
      'mp-set': function (el) {
        const v = el.dataset.v || '';
        if (v) it.mode = v; else delete it.mode;
        // 同步到已实体化的副本（不然下一次 syncBack 会把旧值盖回来）
        try {
          const day = S().getDay(S().todayKey());
          ['required', 'ideal', 'extra'].forEach(function (k) {
            (day.tasks[k] || []).forEach(function (c) {
              if (c.fromQueue === it.id && c.done !== true) { if (v) c.mode = v; else delete c.mode; }
            });
          });
        } catch (e) { /* 忽略 */ }
        S().save();
        App.ui.closeModal();
        render();
        if (App.tasks && App.tasks.renderAll) App.tasks.renderAll();
        App.ui.toast(v === 'new' ? '📘 标成新知识 —— 完成时会排 3 轮复习'
          : (v === 'review' ? '🔄 标成复习知识（只作标记，不排复习）' : '⚪ 改成普通任务'));
      },
      'mp-cancel': function () { App.ui.closeModal(); }
    });
  }

  /** 把某条队列项在「今天」的镜像副本清掉（含已完成的那份） */
  function dropCopy(qid) {
    let n = 0;
    try {
      const day = S().getDay(S().todayKey());
      ['required', 'ideal', 'extra'].forEach(function (k) {
        const arr = day.tasks[k] || [];
        for (let i = arr.length - 1; i >= 0; i--) {
          if (arr[i].fromQueue === qid) { arr.splice(i, 1); n++; }
        }
      });
      if (n) S().save();
    } catch (e) { /* 忽略 */ }
    return n;
  }

  /* ---------- ↩ v91：手滑点错「做完了」也能放回来 ---------- */
  let lastDone = null;   // { id, idx, text, ledId }

  function undoLast() {
    if (!lastDone) return;
    const i = idxOf(QD(), lastDone.id);
    if (i < 0) { lastDone = null; render(); return; }
    const it = QD().splice(i, 1)[0];
    delete it.doneDay; delete it.doneAt;
    const at = Math.max(0, Math.min(lastDone.idx, Q().length));
    Q().splice(at, 0, it);
    if (lastDone.ledId && S().undoLastLedger) S().undoLastLedger(lastDone.ledId);   // 退掉那条队列分
    S().save();
    const t = lastDone.text;
    lastDone = null;
    render();
    App.ui.toast('↩ 放回来了：' + t.slice(0, 14) + '（回到第 ' + (at + 1) + ' 位）', 3000);
  }
  function modeOptions(cur) {
    cur = cur || '';
    return [['', '不标（普通任务）'], ['new', '📘 新知识（完成后按遗忘曲线复习）'],
            ['review', '🔄 复习知识（只作标记）']].map(function (m) {
      return '<option value="' + m[0] + '"' + (m[0] === cur ? ' selected' : '') + '>' + m[1] + '</option>';
    }).join('');
  }
  /** 队列 → 每日必做（整条搬过去，小任务/任务组配置一起带走，想搬回来还在） */
  function qToDaily(id) {
    const list = Q();
    const i = idxOf(list, id);
    if (i < 0) return;
    const it = list.splice(i, 1)[0];
    if (!it.days) it.days = {};
    DY().push(it);
    S().save();
    render();
    App.ui.toast('📌 已转成每日必做：' + it.text.slice(0, 14) + (i === 0 ? ' —— 队列下一条顶上来了' : ''));
  }
  /** 每日必做 → 队列（排到队尾） */
  function dToQueue(id) {
    const list = DY();
    const i = idxOf(list, id);
    if (i < 0) return;
    const it = list.splice(i, 1)[0];
    Q().push(it);
    S().save();
    render();
    App.ui.toast('📋 已排进队列末尾：' + it.text.slice(0, 14) + '（想调位置用 ↑ ↓）');
  }

  /* ---------- 渲染 ---------- */
  function rowQ(it, n) {
    return '<div class="q-row" data-id="' + it.id + '">' +
      '<span class="q-idx">' + n + '</span>' +
      '<span class="q-text">' + esc(it.text) + mtag(it, 'queue') + subDetailHTML(it.subs, it.groups) + '</span>' +
      '<span class="q-acts">' +
      '<button class="q-ib" data-act="q-done" data-id="' + it.id + '" title="做完了">✓</button>' +
      '<button class="q-ib" data-act="q-up" data-id="' + it.id + '" title="上移">↑</button>' +
      '<button class="q-ib" data-act="q-down" data-id="' + it.id + '" title="下移">↓</button>' +
      '<button class="q-ib" data-act="q-todaily" data-id="' + it.id + '" title="转成每日必做">📌</button>' +
      '<button class="q-ib" data-act="q-sched" data-id="' + it.id + '" title="安排到某一天做">📅</button>' +
      '<button class="q-ib" data-act="q-edit" data-id="' + it.id + '" title="改">✏️</button>' +
      '<button class="q-ib" data-act="q-del" data-id="' + it.id + '" title="删掉">🗑</button>' +
      '</span></div>';
  }

  function rowDone(it) {
    return '<div class="q-row q-row-done" data-id="' + it.id + '">' +
      '<span class="q-idx">✓</span>' +
      '<span class="q-text">' + esc(it.text) + mtag(it, 'done') + subDetailHTML(it.subs, it.groups) + '</span>' +
      '<span class="q-meta">' + (it.doneDay ? S().shortDateCN(it.doneDay) : '') + '</span>' +
      '<span class="q-acts">' +
      '<button class="q-ib" data-act="q-sched" data-kind="done" data-id="' + it.id + '" title="安排到某一天再做一次">📅</button>' +
      '<button class="q-ib" data-act="q-again" data-id="' + it.id + '" title="放回队列末尾">↻</button>' +
      '<button class="q-ib" data-act="q-deldone" data-id="' + it.id + '" title="从记录里删掉">🗑</button>' +
      '</span></div>';
  }

  function queueCard() {
    const list = Q();
    const done = QD();
    let h = '<div class="card q-card">';
    h += '<h2>📋 队列</h2>';
    h += '<p class="hint" style="margin-top:-2px">一串按顺序做的任务 —— 做完一条，下一条自己顶上。' +
      '<b>这里没有完成率</b>，只有「现在这条」。<br>' +
      '不想现在做？点 <b>📅</b> 把它<b>安排到某一天</b>去做（跟日历里 🔁 是同一套），或者 <b>↧</b> 排到队尾。</p>';

    if (lastDone) {
      h += '<div class="q-undo">↩ <b>刚才点错了？</b>「' + esc(lastDone.text) + '」已经完成' +
        (lastDone.idx > 0 ? '（原来在第 ' + (lastDone.idx + 1) + ' 位）' : '') +
        '<span class="q-undo-acts">' +
        '<button class="btn btn-small btn-primary" data-act="q-undo">↩ 放回原位</button>' +
        '<button class="btn btn-small" data-act="q-undo-x">不用了</button></span></div>';
    }
    if (!list.length) {
      h += '<div class="q-empty">队列是空的。<br>往里加一条，以后就按顺序做 —— 不用再想「今天要完成几条」。</div>';
    } else {
      const c = list[0];
      const copy = findCopyOf(c.id);
      h += '<div class="q-now">' +
        '<div class="q-now-tag">▶ 现在做这条</div>' +
        '<div class="q-now-mode">' + mtag(c, 'queue', c.id) + '</div>' +
        // 🧲 v85：直接嵌入完整任务行 —— 计时 / 🎧 听课三步 / 小任务·任务组 全在原地，不用去任务页
        (copy && App.tasks && App.tasks.taskRowHTML
          ? '<div class="task-col q-now-area" data-col="required" id="q-now-area">' +
            App.tasks.taskRowHTML('required', copy) + '</div>'
          : '<div class="q-now-text">' + esc(c.text) + '</div>' +
            (c.note ? '<div class="q-now-note">' + esc(c.note) + '</div>' : '')) +
        '<div class="q-now-acts">' +
        '<button class="btn btn-primary btn-small" data-act="q-done" data-id="' + c.id + '">✓ 做完了</button>' +
        '<button class="btn btn-small" data-act="q-todaily" data-id="' + c.id + '">📌 转每日必做</button>' +
        '<button class="btn btn-small" data-act="q-sched" data-id="' + c.id + '">📅 安排到某天</button>' +
        '<button class="btn btn-small" data-act="q-end" data-id="' + c.id + '">↧ 排到最后</button>' +
        '<button class="btn btn-small" data-act="q-edit" data-id="' + c.id + '">✏️ 改</button>' +
        '<button class="btn btn-small" data-act="q-del" data-id="' + c.id + '">🗑 删</button>' +
        '</div></div>';
    }

    h += '<div class="q-head"><span>接下来</span>' +
      '<span><button class="btn btn-small" data-act="pq-open" title="以前没做完的任务，一键搬进队列">📥 从以前搬任务</button> ' +
      '<button class="btn btn-small" data-act="q-add">+ 加一条</button></span></div>';

    if (list.length > 1) {
      for (let i = 1; i < list.length; i++) h += rowQ(list[i], i + 1);
    } else if (list.length === 1) {
      h += '<p class="hint">后面没有了 —— 想加就点上面的「+ 加一条」。</p>';
    }

    if (done.length) {
      h += '<div class="q-head"><span>已完成（' + done.length + '）</span>' +
        '<button class="btn btn-small" data-act="q-toggledone" title="点开能看见做过的，也能把哪条放回队列">' +
        (showDone ? '收起' : '展开（能放回队列）') + '</button></div>';
      if (showDone) {
        done.slice(0, 60).forEach(function (it) { h += rowDone(it); });
        if (done.length > 60) h += '<p class="hint">只显示最近 60 条。</p>';
      }
    }
    h += '</div>';
    return h;
  }

  function dailyCard() {
    const list = DY();
    const k = S().todayKey();
    let h = '<div class="card q-card">';
    h += '<h2>📌 每日必做</h2>';
    h += '<p class="hint" style="margin-top:-2px">每天都会出现的小事（复习、听力、单词）。打勾就行 —— ' +
      '<b>不算在完成率里</b>。<br>' +
      '某一条要挪到别的日子做？点它右边的 <b>📅</b>（安排到日历某一天）。</p>';

    if (!list.length) {
      h += '<div class="q-empty">还没有。<br>做完一条队列任务时可以顺手把它加进来当复习；也可以直接点下面「+ 加一条」。</div>';
    } else {
      const sorted = list.slice().sort(function (a, b) {
        return (dDone(a, k) ? 1 : 0) - (dDone(b, k) ? 1 : 0);
      });
      sorted.forEach(function (it) {
        const done = dDone(it, k);
        const st = dStreak(it);
        const meta = st > 1 ? '连续 ' + st + ' 天' : (done ? '今天已做' : '');
        h += '<div class="q-row' + (done ? ' q-row-done' : '') + '" data-id="' + it.id + '">' +
          '<button class="task-check' + (done ? ' checked' : '') + '" data-act="d-toggle" data-id="' + it.id + '">' +
          (done ? '✓' : '') + '</button>' +
          '<span class="q-text">' + esc(it.text) + mtag(it, 'daily') + subDetailHTML(it.subs, it.groups) + '</span>' +
          '<span class="q-meta">' + meta + '</span>' +
          '<span class="q-acts">' +
          '<button class="q-ib" data-act="d-toqueue" data-id="' + it.id + '" title="转入队列（按顺序做）">📋</button>' +
          '<button class="q-ib" data-act="d-sched" data-id="' + it.id + '" title="安排到某一天做">📅</button>' +
          '<button class="q-ib" data-act="d-edit" data-id="' + it.id + '" title="改">✏️</button>' +
          '<button class="q-ib" data-act="d-del" data-id="' + it.id + '" title="删掉">🗑</button>' +
          '</span></div>';
      });
    }
    h += '<div class="q-head"><span></span><span>' +
      '<button class="btn btn-small" data-act="dp-open" title="以前没做完的任务，提一条进来当每天的小事">📥 从以往提取</button> ' +
      '<button class="btn btn-small" data-act="d-add">+ 加一条</button></span></div>';
    h += '</div>';
    return h;
  }

  /** 📥 v87：每日必做的「从以往提取」—— 列出以前没做完的任务，提一条进来当每日小事 */
  function dailyPastModal() {
    const dyTexts = {};
    DY().forEach(function (x) { dyTexts[x.text] = true; });
    const list = pastUndone().filter(function (x) { return !dyTexts[x.text]; });
    let body;
    if (!list.length) {
      body = '<p class="hint" style="margin-top:0">以前没有可以提取的了 🎉' +
        '（已经加进「每日必做」的不会再出现）</p>';
    } else {
      const byDay = {};
      list.forEach(function (x) { (byDay[x.day] = byDay[x.day] || []).push(x); });
      body = '<p class="hint" style="margin-top:0">挑一条以前做过的，变成<b>每天都要碰的小事</b>。' +
        '原来那天的记录不动。</p>';
      Object.keys(byDay).sort().reverse().forEach(function (k) {
        body += '<div class="q-head" style="margin-top:10px"><span>' +
          (k === S().todayKey() ? '今天' : S().shortDateCN(k)) + '</span><span>' + byDay[k].length + ' 条</span></div>';
        byDay[k].forEach(function (x) {
          body += '<div class="q-row"><span class="q-text">' + esc(x.text) + subDetailHTML(x.subs, x.groups) + '</span>' +
            '<span class="q-acts"><button class="q-ib" data-act="dp-add" data-text="' + esc(x.text) +
            '" title="加进「每日必做」">📌</button></span></div>';
        });
      });
    }
    App.ui.openModal('📌 提取到「每日必做」', body,
      '<button class="btn" data-act="dp-close">关闭</button>');
    App.ui.bindActions({
      'dp-add': function (el) {
        const t = el.dataset.text;
        addDaily(t);
        App.ui.toast('📌 已加进「每日必做」：' + t.slice(0, 14));
        render();
        dailyPastModal();
      },
      'dp-close': function () { App.ui.closeModal(); }
    });
  }

  function render() {
    try { ensureMaterialized(); } catch (e) { /* 忽略 */ }
    const root = document.getElementById('queue-view');
    if (root) root.innerHTML = queueCard() + dailyCard();
    // 🧲 v85：嵌入的当前条 = 完整任务行 → 接上同一套事件委托，听课三步也要接
    const area = document.getElementById('q-now-area');
    if (area && App.tasks && App.tasks.bindTaskAreaEvents) App.tasks.bindTaskAreaEvents(area);
    if (App.lecture && App.lecture.bindInline) App.lecture.bindInline();
    refreshBar();
  }

  /** 任务页顶部那条：只说"现在做哪条"，一律不给分母 */
  function refreshBar() {
    const el = document.getElementById('queue-bar');
    if (!el) return;
    const st = S().settings();
    if (st && st.queueBarOn === false) { el.innerHTML = ''; return; }
    const k = S().todayKey();
    const c = current();
    const todo = DY().filter(function (x) { return !dDone(x, k); });
    if (!c && !todo.length) { el.innerHTML = ''; return; }

    let h = '<div class="q-bar">';
    if (c) {
      h += '<div class="q-bar-line"><span class="q-bar-tag">📋 现在做</span>' +
        '<span class="q-bar-text">' + esc(c.text) + '</span>' +
        '<button class="q-bar-go" data-act="go-queue">去队列 →</button></div>';
    }
    if (todo.length) {
      h += '<div class="q-bar-line"><span class="q-bar-tag">📌 今天的小事</span>' +
        '<span class="q-bar-text">' +
        todo.slice(0, 6).map(function (x) { return esc(x.text); }).join(' · ') +
        (todo.length > 6 ? ' 等' : '') +
        '</span>' +
        '<button class="q-bar-go" data-act="go-queue">去队列 →</button></div>';
    }
    h += '</div>';
    el.innerHTML = h;
  }

  /* ---------- 事件 ---------- */
  function onClick(e) {
    const b = e.target && e.target.closest ? e.target.closest('[data-act]') : null;
    if (!b || !b.dataset) return;
    const act = b.dataset.act;
    const id = b.dataset.id;

    if (act === 'go-queue') { App.app.switchView('queue'); return; }
    if (act === 'go-tasks') { App.app.switchView('tasks'); return; }
    if (act === 'pq-open') { pastModal(); return; }
    if (act === 'q-add') { addModal(false); return; }
    if (act === 'd-add') { addModal(true); return; }
    if (act === 'dp-open') { dailyPastModal(); return; }
    if (act === 'q-toggledone') { showDone = !showDone; render(); return; }
    if (act === 'q-done') { finish(id); return; }
    if (act === 'q-sched') {
      const isDone = b.dataset.kind === 'done';
      const it = isDone ? findIn(QD(), id) : findIn(Q(), id);
      if (it) schedModal(it.text, isDone ? 'queueDone' : 'queue', id);
      return;
    }
    if (act === 'd-sched') {
      const it = findIn(DY(), id);
      if (it) schedModal(it.text, 'daily', id);
      return;
    }
    if (act === 'q-up') { moveItem(id, -1); render(); return; }
    if (act === 'q-down') { moveItem(id, 1); render(); return; }
    if (act === 'q-end') { moveToEnd(id); render(); return; }
    if (act === 'q-todaily') { qToDaily(id); return; }
    if (act === 'd-toqueue') { dToQueue(id); return; }
    if (act === 'q-mode') { modePickModal(b.dataset.kind || 'queue', id); return; }
    if (act === 'q-undo') { undoLast(); return; }
    if (act === 'q-undo-x') { lastDone = null; render(); return; }
    if (act === 'q-edit') { editModal(id, false); return; }
    if (act === 'd-edit') { editModal(id, true); return; }
    if (act === 'd-toggle') { dToggle(id); return; }

    if (act === 'q-del') {
      const it = findIn(Q(), id); if (!it) return;
      App.ui.confirm('把「' + esc(it.text) + '」从队列里删掉？', '删掉', function () {
        const list = Q();
        const i = idxOf(list, id);
        if (i >= 0) list.splice(i, 1);
        S().save();
        render();
      });
      return;
    }
    if (act === 'q-deldone') {
      const it = findIn(QD(), id); if (!it) return;
      App.ui.confirm('把这条已完成记录删掉？（只删记录，不影响别的）', '删掉', function () {
        const list = QD();
        const i = idxOf(list, id);
        if (i >= 0) list.splice(i, 1);
        S().save();
        render();
      });
      return;
    }
    if (act === 'd-del') {
      const it = findIn(DY(), id); if (!it) return;
      App.ui.confirm('把「' + esc(it.text) + '」从每日必做里删掉？（以前打过的勾也一起没了）', '删掉', function () {
        const list = DY();
        const i = idxOf(list, id);
        if (i >= 0) list.splice(i, 1);
        S().save();
        render();
      });
      return;
    }
    if (act === 'q-again') {
      const d = QD();
      const i = idxOf(d, id);
      if (i < 0) return;
      const it = d.splice(i, 1)[0];
      delete it.doneDay;
      delete it.doneAt;
      Q().push(it);
      dropCopy(it.id);
      S().save();
      render();
      App.ui.toast('↻ 已放回队列末尾 —— 想调位置用 ↑ ↓');
      return;
    }
  }

  function init() {
    const root = document.getElementById('queue-view');
    if (root) root.addEventListener('click', onClick);
    const bar = document.getElementById('queue-bar');
    if (bar) bar.addEventListener('click', onClick);
    // ⏱ v82：60 秒兜底 —— 计时结束 / 跨天 / 其他入口改动后，把当前条重新实体化
    setInterval(function () {
      try {
        if (ensureMaterialized() && App.tasks && App.tasks.renderAll) App.tasks.renderAll();
        refreshBar();
      } catch (e) { /* 忽略 */ }
    }, 60000);
    render();
  }

  App.queue = {
    init: init,
    render: render,
    refreshBar: refreshBar,
    addItem: addItem,
    addDaily: addDaily,
    current: current,
    // v82 实体化
    ensureMaterialized: ensureMaterialized,
    settleSweep: settleSweep,
    enqueueTask: enqueueTask,
    onTaskDone: onTaskDone,
    runPending: runPending,
    findCopyOf: findCopyOf
  };
})();
