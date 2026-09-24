/* ============================================================
 * backup.js — 💾 自动备份（v113）
 *
 * 用户原话：「每天结束的时候自动按一份备份…可以更平一次，两三个小时就保留一份…
 *            超过几天之后就自动删除，防止数据丢失。」
 *
 * 存哪：**独立 IndexedDB**（focus-plan-backups），两个 store：
 *   meta = 轻量索引 {id, at, kind, dayKey, bytes, sig}（列表只读它，不用把几百 KB 全读出来）
 *   body = {id, json} 真正的数据快照
 * ⚠️ 为什么不塞 localStorage：主数据已经在那儿了（~5MB 上限），几十份快照会直接把配额顶爆。
 *
 * 三种 kind：
 *   daily  —— 每天结束/跨天时一份（用户要的"每天结束自动保存"）
 *   auto   —— 每 N 小时一份（默认 3 小时；内容没变就跳过、不占地方）
 *   manual —— 手动点「现在备份一份」/「恢复前自动留一份」
 *
 * 轮转（自动清理）：超过 bkKeepDays 天 → 删；总份数超过 bkMax → 删最老的。
 * **永远保留最近 bkMin(3) 份**，哪怕它已经很旧 —— 不能让轮转把备份清成 0。
 *
 * ⚠️ 图片本体不在这里：卡片里的图存在另一个 IDB（focus-plan-photos），备份只存卡片的
 *    文字与"图 id"。所以同一浏览器内恢复后图片照旧能用；但换设备/清站点数据时图片会一起没。
 * ============================================================ */
(function () {
  'use strict';

  const App = (window.App = window.App || {});
  const S = function () { return App.store; };
  const esc = function (s) { return S().esc(s); };

  const DB = 'focus-plan-backups';
  const VER = 1;
  const ST_META = 'meta';
  const ST_BODY = 'body';
  const DEF = { on: true, everyH: 3, keepDays: 7, max: 60, min: 3 };
  const LAST_KEY = 'focusPlan.lastBackupAt';   // 只是给"最后一次"文案用的冗余记录（真值以 meta 为准）

  /* ---------- IndexedDB ---------- */
  let dbp = null;
  function idb() {
    if (dbp) return dbp;
    dbp = new Promise(function (resolve, reject) {
      if (!('indexedDB' in window)) { reject(new Error('这个浏览器没有 IndexedDB')); return; }
      const rq = indexedDB.open(DB, VER);
      rq.onupgradeneeded = function () {
        const db = rq.result;
        if (!db.objectStoreNames.contains(ST_META)) db.createObjectStore(ST_META, { keyPath: 'id' });
        if (!db.objectStoreNames.contains(ST_BODY)) db.createObjectStore(ST_BODY, { keyPath: 'id' });
      };
      rq.onsuccess = function () { resolve(rq.result); };
      rq.onerror = function () { reject(rq.error || new Error('打不开备份库')); };
    });
    return dbp;
  }
  function tx(store, mode, fn) {
    return idb().then(function (db) {
      return new Promise(function (resolve, reject) {
        const t = db.transaction(store, mode);
        const st = t.objectStore(store);
        let out;
        try { out = fn(st); } catch (e) { reject(e); return; }
        t.oncomplete = function () { resolve(out && out.result !== undefined ? out.result : out); };
        t.onerror = function () { reject(t.error); };
        t.onabort = function () { reject(t.error || new Error('事务被中断')); };
      });
    });
  }
  function metaAll() {
    return tx(ST_META, 'readonly', function (st) { return st.getAll(); })
      .then(function (list) {
        return (list || []).sort(function (a, b) { return b.at - a.at; });
      });
  }
  function metaPut(rec) { return tx(ST_META, 'readwrite', function (st) { st.put(rec); }); }
  function bodyPut(rec) { return tx(ST_BODY, 'readwrite', function (st) { st.put(rec); }); }
  function bodyGet(id) {
    return tx(ST_BODY, 'readonly', function (st) { return st.get(id); }).then(function (r) { return r || null; });
  }
  /** 同时删 meta + body（两个 store 一个事务） */
  function dropReal(ids) {
    if (!ids || !ids.length) return Promise.resolve(0);
    return idb().then(function (db) {
      return new Promise(function (resolve, reject) {
        const t = db.transaction([ST_META, ST_BODY], 'readwrite');
        const m = t.objectStore(ST_META), b = t.objectStore(ST_BODY);
        ids.forEach(function (id) { m.delete(id); b.delete(id); });
        t.oncomplete = function () { resolve(ids.length); };
        t.onerror = function () { reject(t.error); };
      });
    });
  }

  /* ---------- 配置 ---------- */
  function cfg() {
    const st = S().settings() || {};
    const num = function (v, d) { const n = +v; return isFinite(n) && n > 0 ? n : d; };
    return {
      on: st.bkOn !== false,
      everyH: num(st.bkEveryH, DEF.everyH),
      keepDays: num(st.bkKeepDays, DEF.keepDays),
      max: num(st.bkMax, DEF.max),
      min: DEF.min
    };
  }
  /** 第一次打开时把默认值写进 settings（这样设置页里能看到、也能改） */
  function ensureDefaults() {
    const st = S().settings();
    let dirty = false;
    if (st.bkOn === undefined) { st.bkOn = DEF.on; dirty = true; }
    if (st.bkEveryH === undefined) { st.bkEveryH = DEF.everyH; dirty = true; }
    if (st.bkKeepDays === undefined) { st.bkKeepDays = DEF.keepDays; dirty = true; }
    if (st.bkMax === undefined) { st.bkMax = DEF.max; dirty = true; }
    if (dirty) S().save();
  }

  /* ---------- 小工具 ---------- */
  function sig(str) {
    let h = 5381;
    for (let i = 0; i < str.length; i++) h = ((h * 33) ^ str.charCodeAt(i)) >>> 0;
    return str.length + '-' + h.toString(36);
  }
  function kb(n) {
    const x = +n || 0;
    return x < 1024 ? (x + ' B') : (x < 1048576 ? (x / 1024).toFixed(0) + ' KB' : (x / 1048576).toFixed(1) + ' MB');
  }
  function dayKeyOf(ms) {
    const d = new Date(ms);
    return d.getFullYear() + '-' + S().pad2(d.getMonth() + 1) + '-' + S().pad2(d.getDate());
  }
  function clockOf(ms) {
    const d = new Date(ms);
    return S().pad2(d.getHours()) + ':' + S().pad2(d.getMinutes());
  }
  /** 「今天 15:02」「昨天 22:10」「9月21日 08:00」 */
  function when(ms) {
    const k = dayKeyOf(ms), t = S().todayKey();
    if (k === t) return '今天 ' + clockOf(ms);
    const y = new Date(); y.setDate(y.getDate() - 1);
    if (k === S().dateKey(y)) return '昨天 ' + clockOf(ms);
    const d = new Date(ms);
    return (d.getMonth() + 1) + '月' + d.getDate() + '日 ' + clockOf(ms);
  }
  function ago(ms) {
    const m = Math.round((Date.now() - ms) / 60000);
    if (m < 1) return '刚刚';
    if (m < 60) return m + ' 分钟前';
    const h = Math.floor(m / 60);
    if (h < 24) return h + ' 小时前';
    return Math.floor(h / 24) + ' 天前';
  }
  const KIND_NAME = { daily: '每天一份', auto: '定时一份', manual: '手动一份' };
  function kindTag(m) {
    const cls = m.kind === 'daily' ? 'bk-k-daily' : (m.kind === 'manual' ? 'bk-k-man' : 'bk-k-auto');
    return '<span class="bk-kind ' + cls + '">' + (KIND_NAME[m.kind] || '备份') + '</span>';
  }

  /* ---------- 备份 / 轮转 ---------- */
  let lastList = [];
  let busy = false;

  /** 存一份（kind: daily / auto / manual）。返回记录或 null（跳过时） */
  function snap(kind, forceDayKey) {
    if (busy) return Promise.resolve(null);
    const c = cfg();
    if (!c.on && kind !== 'manual' && kind !== 'restore') return Promise.resolve(null);
    busy = true;
    return idb().then(function () {
      const str = JSON.stringify(S().data());
      const s = sig(str);
      return metaAll().then(function (all) {
        lastList = all;
        const lastOfKind = all.filter(function (x) { return x.kind === kind; })[0];
        // 定时那份：内容没变 → 跳过（不然每 3 小时堆一份一模一样的）
        if (kind === 'auto' && lastOfKind && lastOfKind.sig === s) { busy = false; return null; }
        // 每天那份：同一天已经有了 → 跳过
        const dk = forceDayKey || S().todayKey();
        if (kind === 'daily' && all.some(function (x) { return x.kind === 'daily' && x.dayKey === dk; })) {
          busy = false; return null;
        }
        const rec = {
          id: String(Date.now()) + '-' + Math.random().toString(36).slice(2, 6),
          at: Date.now(), kind: kind, dayKey: dk, bytes: str.length, sig: s
        };
        return metaPut(rec)
          .then(function () { return bodyPut({ id: rec.id, json: str }); })
          .then(function () { return prune(); })
          .then(function () {
            try { localStorage.setItem(LAST_KEY, String(rec.at)); } catch (e) { /* 忽略 */ }
            busy = false;
            render();
            return rec;
          });
      });
    }).catch(function (e) {
      busy = false;
      try { App.ui.toast('备份没存成：' + ((e && e.message) || e), 4600); } catch (e2) {}
      return null;
    });
  }

  /** 轮转：过期删 + 超量删；永远留下最近 min 份 */
  function prune() {
    const c = cfg();
    return metaAll().then(function (all) {
      lastList = all;
      const cut = Date.now() - c.keepDays * 86400000;
      const kill = [];
      all.forEach(function (m, i) {
        if (i < c.min) return;                       // 最近 3 份永不删
        if (i >= c.max) { kill.push(m.id); return; } // 份数超了 → 删最老的
        if (m.at < cut) kill.push(m.id);             // 超过保留天数 → 删
      });
      if (!kill.length) return 0;
      return dropReal(kill).then(function (n) {
        return metaAll().then(function (a2) { lastList = a2; return n; });
      });
    });
  }

  /* ---------- 恢复 / 导出 / 删除 ---------- */
  function restore(id) {
    return bodyGet(id).then(function (b) {
      if (!b || !b.json) { App.ui.toast('这份备份的内容找不到了（可能被清理了）', 4200); return false; }
      let obj = null;
      try { obj = JSON.parse(b.json); } catch (e) { App.ui.toast('这份备份读不出来，可能坏了'); return false; }
      // 先给"现在这份"留个底，恢复错了还能倒回来
      return snap('manual').then(function () {
        const ok = S().restoreFrom(obj);
        if (!ok) { App.ui.toast('恢复失败：文件结构不对'); return false; }
        App.ui.toast('♻ 已恢复 —— 正在重新加载…', 4200);
        setTimeout(function () { try { location.reload(); } catch (e) {} }, 900);
        return true;
      });
    });
  }

  function download(name, text) {
    try {
      const blob = new Blob([text], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = name;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
      return true;
    } catch (e) { return false; }
  }
  function exportOne(id) {
    return bodyGet(id).then(function (b) {
      if (!b || !b.json) { App.ui.toast('这份备份的内容找不到了'); return false; }
      const m = (lastList || []).filter(function (x) { return x.id === id; })[0];
      const nm = 'focus-plan-备份-' + (m ? m.dayKey : S().todayKey()) + '-' + (m ? clockOf(m.at).replace(':', '') : '') + '.json';
      const ok = download(nm, b.json);
      App.ui.toast(ok ? ('⬇ 已存成文件：' + nm) : '这个浏览器不让下载，试试换成 Edge/Chrome', 4600);
      return ok;
    });
  }

  /* ---------- 界面 ---------- */
  function rowHTML(m, withAll) {
    return '<div class="bk-item" data-id="' + m.id + '">' +
      '<span class="bk-when">' + esc(when(m.at)) + '</span>' +
      kindTag(m) +
      '<span class="bk-size">' + kb(m.bytes) + '</span>' +
      '<span class="bk-ago">' + esc(ago(m.at)) + '</span>' +
      '<span class="bk-acts">' +
      '<button class="btn btn-small" data-bk-act="restore" data-id="' + m.id + '" title="把数据换回这一份">♻ 恢复</button>' +
      '<button class="btn btn-small" data-bk-act="file" data-id="' + m.id + '" title="存成一个 .json 文件（可以放到别的地方）">⬇ 存文件</button>' +
      (withAll ? '<button class="btn btn-small btn-danger" data-bk-act="del" data-id="' + m.id + '">🗑</button>' : '') +
      '</span></div>';
  }

  function statusHTML() {
    const c = cfg();
    const last = (lastList || [])[0];
    return (c.on ? '<b class="bk-on">✅ 自动备份开着</b>' : '<b class="bk-off">⏸ 自动备份关着</b>') +
      ' · 每 <b>' + c.everyH + '</b> 小时一份 · 保留 <b>' + c.keepDays + '</b> 天' +
      (last ? '　·　最后一次：<b>' + esc(when(last.at)) + '</b>（' + esc(ago(last.at)) + '）' : '　·　还没有备份');
  }
  function hintHTML() {
    const c = cfg();
    return '💡 备份存在<b>这个浏览器</b>里（每天一份 + 每 ' + c.everyH + ' 小时一份，' + c.keepDays +
      ' 天后自动清理，永远留最近 3 份）。<br>' +
      '⚠️ 要防「整台电脑/浏览器出事」，还得偶尔点一下「⬇ 把最新一份存成文件」，把 json 放到网盘或 U 盘里；' +
      '卡片里的<b>图片本体</b>不在备份内（在同一浏览器的图片库里），换设备不会跟着走。';
  }
  /** 只刷新状态行与说明（改设置项时用 —— 不整块重画，免得把用户正在操作的控件换掉） */
  function refreshStatus() {
    const box = document.getElementById('bk-box');
    if (!box) return;
    const top = box.querySelector('.bk-top');
    if (top) top.innerHTML = statusHTML();
    const hint = box.querySelector('.bk-hint');
    if (hint) hint.innerHTML = hintHTML();
  }

  function render() {
    const box = document.getElementById('bk-box');
    if (!box) return;
    const c = cfg();
    idb().then(metaAll).then(function (all) {
      lastList = all;
      const total = all.reduce(function (n, x) { return n + (x.bytes || 0); }, 0);
      const last = all[0];
      box.innerHTML =
        '<div class="bk-top">' + statusHTML() + '</div>' +
        '<div class="bk-row">' +
        '<label class="bk-lab"><input type="checkbox" data-bk="on"' + (c.on ? ' checked' : '') + ' /> 自动备份</label>' +
        '<label class="bk-lab">每 <select data-bk="everyH">' +
        [2, 3, 4, 6, 8].map(function (h) { return '<option value="' + h + '"' + (h === c.everyH ? ' selected' : '') + '>' + h + '</option>'; }).join('') +
        '</select> 小时一份</label>' +
        '<label class="bk-lab">保留 <input type="number" data-bk="keepDays" min="1" max="90" value="' + c.keepDays + '" style="width:64px" /> 天</label>' +
        '</div>' +
        '<div class="btn-row">' +
        '<button class="btn btn-small btn-primary" data-bk-act="now">💾 现在备份一份</button>' +
        '<button class="btn btn-small" data-bk-act="file" data-id="' + (last ? last.id : '') + '"' + (last ? '' : ' disabled') + '>⬇ 把最新一份存成文件</button>' +
        '<button class="btn btn-small" data-bk-act="prune">🧹 清理过期的</button>' +
        '<button class="btn btn-small" data-bk-act="all">🗂 看全部（' + all.length + ' 份 · ' + kb(total) + '）</button>' +
        '</div>' +
        (all.length
          ? '<div class="bk-list">' + all.slice(0, 4).map(function (m) { return rowHTML(m, false); }).join('') +
            (all.length > 4 ? '<p class="hint" style="margin:4px 0 0">还有 ' + (all.length - 4) + ' 份 —— 点「🗂 看全部」。</p>' : '') +
            '</div>'
          : '<p class="hint" style="margin:6px 0 0">还没有备份。点「💾 现在备份一份」立刻存一份。</p>') +
        '<p class="hint bk-hint" style="margin:8px 0 0">' + hintHTML() + '</p>';
    }).catch(function (e) {
      box.innerHTML = '<p class="hint">备份功能在这个浏览器里用不了：' + esc((e && e.message) || e) + '</p>';
    });
  }

  function allModal() {
    idb().then(metaAll).then(function (all) {
      lastList = all;
      const body = all.length
        ? '<p class="hint" style="margin-top:0">一共 ' + all.length + ' 份。恢复会把现在的数据<b>整个换成</b>那一份（动手前会自动先存一份"恢复前"的）。</p>' +
          '<div class="bk-list bk-list-all">' + all.map(function (m) { return rowHTML(m, true); }).join('') + '</div>'
        : '<p class="hint">还没有备份。</p>';
      App.ui.openModal('🗂 全部备份（' + all.length + ' 份）', body,
        '<button class="btn btn-primary" data-bk-act="now">💾 现在备份一份</button>' +
        '<button class="btn" data-bk-act="close">关闭</button>');
      render();
    });
  }

  function bind() {
    const box = document.getElementById('bk-box');
    if (!box || box.dataset.bkBound) return;
    box.dataset.bkBound = '1';
    box.addEventListener('click', function (e) {
      const b = e.target.closest ? e.target.closest('[data-bk-act]') : null;
      if (!b) return;
      const act = b.dataset.bkAct, id = b.dataset.id || '';
      if (act === 'now') { snap('manual').then(function (r) { if (r) App.ui.toast('💾 已备份一份（' + when(r.at) + '）'); }); return; }
      if (act === 'file') { if (id) exportOne(id); return; }
      if (act === 'prune') {
        prune().then(function (n) { App.ui.toast(n ? ('🧹 清掉 ' + n + ' 份过期备份') : '🧹 没有过期的'); render(); });
        return;
      }
      if (act === 'all') { allModal(); return; }
      if (act === 'close') { App.ui.closeModal(); return; }
      if (act === 'restore') {
        const m = (lastList || []).filter(function (x) { return x.id === id; })[0] || {};
        App.ui.confirm('把数据恢复到这一份备份？<br><span class="hint">' + esc(when(m.at || Date.now())) +
          ' · ' + kb(m.bytes) + '<br>⚠️ 现在的数据会被<b>整个替换</b>掉（动手前会自动先存一份"恢复前"的备份，所以还能倒回来）。</span>',
          '♻ 恢复', function () { restore(id); });
        return;
      }
      if (act === 'del') {
        App.ui.confirm('删掉这份备份？', '删掉', function () {
          dropReal([id]).then(function () { App.ui.toast('🗑 删掉了'); render(); });
        });
      }
    });
    box.addEventListener('change', function (e) {
      const t = e.target;
      if (!t || !t.dataset || !t.dataset.bk) return;
      const st = S().settings();
      const k = t.dataset.bk;
      if (k === 'on') st.bkOn = !!t.checked;
      else if (k === 'everyH') st.bkEveryH = +t.value || DEF.everyH;
      else if (k === 'keepDays') st.bkKeepDays = Math.max(1, Math.min(90, +t.value || DEF.keepDays));
      S().save();
      const c = cfg();
      App.ui.toast(k === 'on' ? (c.on ? '✅ 自动备份开着' : '⏸ 自动备份关着') :
        (k === 'everyH' ? ('每 ' + c.everyH + ' 小时备份一份') : ('保留最近 ' + c.keepDays + ' 天的备份')), 3200);
      // ⚠️ 别在这里 render()：整块重画会把用户正在点的那个控件从 DOM 里换掉
      //   （2026-09-23 测试里就踩到：勾完复选框重画后，手里的节点已经不在页面上了）
      refreshStatus();
    });
  }

  /* ---------- 启动 ---------- */
  let booted = false;
  function init() {
    if (booted) return;
    booted = true;
    ensureDefaults();
    bind();
    render();
    idb().then(function () {
      return metaAll();
    }).then(function (all) {
      lastList = all;
      const c = cfg();
      const today = S().todayKey();
      // ① 第一次用：立刻来一份（不用等到明天）
      if (!all.length) return c.on ? snap('daily') : Promise.resolve(null);
      // ② 跨天补录："刚过去的那一天"还没存过 → 补一份（标在昨天）
      //    ⚠️ 这样"每天结束一份"才真的一天不落：昨天结算过就有昨天的，没结算也会有这一份兜住。
      //    同一天不重复（snap 内部会挡）。
      if (!c.on) return Promise.resolve(null);
      const y = new Date(); y.setDate(y.getDate() - 1);
      const yKey = S().dateKey(y);
      if (!all.some(function (x) { return x.kind === 'daily' && x.dayKey === yKey; })) {
        return snap('daily', yKey);
      }
      return Promise.resolve(null);
    }).then(function () {
      // ③ 每 N 小时一份：每分钟检查一次（很便宜），到点才真存
      setInterval(function () {
        try {
          const c = cfg();
          if (!c.on) return;
          const lastAuto = (lastList || []).filter(function (x) { return x.kind === 'auto'; })[0];
          const lastAny = (lastList || [])[0];
          if (!lastAuto && !lastAny) { snap('auto'); return; }
          const base = lastAuto ? lastAuto.at : lastAny.at;
          if (Date.now() - base >= c.everyH * 3600000) snap('auto');
        } catch (e) { /* 忽略 */ }
      }, 60000);
      // ④ 跨天检查：应用一直开着跨过零点 → 第二天一开就把"昨天"那份补上
      setInterval(function () {
        try {
          if (!cfg().on) return;
          const y = new Date(); y.setDate(y.getDate() - 1);
          const yKey = S().dateKey(y);
          if (lastList.some(function (x) { return x.kind === 'daily' && x.dayKey === yKey; })) return;
          snap('daily', yKey);
        } catch (e) { /* 忽略 */ }
      }, 60000);
      // ⑤ 每天结束（结算）时由 tasks.js 调 snap('daily')；
      //    这里再兜一次：离开页面前把今天那份补上
      window.addEventListener('pagehide', function () {
        try {
          if (!cfg().on) return;
          // 离开页面前：把"今天"这份补上（当天还没存过的话）
          const today = S().todayKey();
          if (lastList.some(function (x) { return x.kind === 'daily' && x.dayKey === today; })) return;
          snap('daily', today);
        } catch (e) { /* 忽略 */ }
      });
    }).catch(function () { /* 备份坏了也不该影响主程序 */ });
  }

  App.backup = {
    init: init,
    render: render,
    snap: snap,
    prune: prune,
    list: function () { return (lastList || []).slice(); },
    refetch: function () { return metaAll().then(function (a) { lastList = a; render(); return a; }); },
    restore: restore,
    exportOne: exportOne,
    remove: function (id) { return dropReal([id]); },
    cfg: cfg,
    refreshStatus: refreshStatus,
    _metaAll: metaAll,
    _bodyGet: bodyGet,
    when: when, kb: kb
  };
})();
