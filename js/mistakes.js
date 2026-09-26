/* ============================================================
 * mistakes.js — 📕 错题本（v129）
 *
 * 为什么要有它：v122 用户说过「有的错题我习惯一个月之后写出来，
 * 如果还能写出来就不管了」。这条流程值得一个专门的家：收题（拍照）
 * → 标学科/知识点/来源 → 隔阵子重做 → 写出来了才算结。
 *
 * 数据（懒初始化）：
 *   data.mistakes = [ { id, date, subject, source, desc, kp, note,
 *                       status:'todo'|'mastered'|'dropped',
 *                       redos:[{at, result:'ok'|'no'}],
 *                       photoIds:[], cardColId, cardId, at } ]
 *
 * 复用：
 *   · 照片走 memcards 的图片池（phPut/phGet，自动压缩）
 *   · 🃏 转设问卡：直接往 data.memcards 里「📕 错题 · <学科>」合集塞一张卡
 *   · 删除进回收站（trashPush kind='mistake'，可恢复）
 *   · 收题日期不允许是未来
 * ============================================================ */
(function () {
  'use strict';

  const App = (window.App = window.App || {});
  const S = function () { return App.store; };

  function D() {
    const d = S().data();
    if (!d) return [];
    if (!Array.isArray(d.mistakes)) d.mistakes = [];
    return d.mistakes;
  }
  function find(id) { return D().filter(function (x) { return x.id === id; })[0] || null; }

  function subjects() {
    return (App.memcards && App.memcards.subjects) ? App.memcards.subjects()
      : ['语文', '数学', '英语', '物理', '化学', '生物', '政治', '历史', '地理'];
  }

  const STATUS = {
    todo: { t: '待重做', c: '#e2545d' },
    mastered: { t: '已巩固', c: '#22a06b' },
    dropped: { t: '放弃', c: '#94a3b8' }
  };

  function add(o) {
    D().push({
      id: S().uid(), date: o.date, subject: o.subject, source: o.source || '',
      desc: o.desc, kp: o.kp || '', note: o.note || '',
      status: 'todo', redos: [], photoIds: o.photoIds || [], at: Date.now()
    });
    S().save();
  }
  function update(id, patch) {
    const m = find(id);
    if (!m) return;
    Object.keys(patch).forEach(function (k) { m[k] = patch[k]; });
    S().save();
  }
  function del(id) {
    const m = find(id);
    if (!m) return;
    if (App.tasks && App.tasks.trashPush) {
      App.tasks.trashPush({ kind: 'mistake', payload: JSON.parse(JSON.stringify(m)) });
      const d = S().data();
      d.mistakes.splice(d.mistakes.indexOf(m), 1);
      S().save();
    } else {
      const d = S().data();
      d.mistakes.splice(d.mistakes.indexOf(m), 1);
      S().save();
    }
  }
  /** 重做记一笔：写出来了 → 自动「已巩固」；没写出来 → 保持「待重做」 */
  function redo(id, result) {
    const m = find(id);
    if (!m) return;
    m.redos.push({ at: Date.now(), result: result });
    if (result === 'ok') m.status = 'mastered';
    else if (m.status === 'mastered') m.status = 'todo';
    S().save();
  }

  /* ---------- 🃏 转设问卡 ---------- */
  function toCard(id) {
    const mist = find(id);
    if (!mist) return;
    const mem = S().data().memcards = S().data().memcards || [];
    const name = '📕 错题 · ' + mist.subject;
    let col = mem.filter(function (c) { return c.name === name; })[0];
    if (!col) {
      col = {
        id: S().uid(), name: name, taskId: null, subId: null, course: '',
        subject: mist.subject, dayKey: S().todayKey(),
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), cards: []
      };
      mem.push(col);
    }
    const card = {
      id: S().uid(),
      front: mist.desc + (mist.kp ? '\n\n知识点：' + mist.kp : ''),
      back: mist.note || '（还没写正解 —— 到 🃏 卡片页把它补上）',
      at: Date.now(),
      frontImgs: (mist.photoIds || []).slice()
    };
    col.cards.push(card);
    mist.cardColId = col.id;
    mist.cardId = card.id;
    S().save();
    App.ui.toast('🃏 已转成设问卡（「' + name + '」合集），到 🃏 卡片页翻它');
  }

  /* ---------- 渲染 ---------- */
  let filterSub = '', filterStatus = '';
  function render() {
    if (typeof App.app !== 'undefined' && App.app.currentView() !== 'mistakes') return;
    const box = document.getElementById('mistakes-view');
    if (!box) return;
    const all = D();

    const nTodo = all.filter(function (m) { return m.status === 'todo'; }).length;
    const nMaster = all.filter(function (m) { return m.status === 'mastered'; }).length;

    if (!all.length) {
      box.innerHTML = '<div class="card"><h2>📕 错题本</h2>' +
        '<p class="hint">收错的题：拍照存题、标好学科和知识点，隔阵子重做 —— <b>写出来了才算结</b>。' +
        '收下的错题还能一键转成设问卡，接进复习系统。</p>' +
        '<button class="btn btn-primary" id="mk-add">＋ 收一道错题</button></div>';
      const b = box.querySelector('#mk-add');
      if (b) b.onclick = function () { addModal(); };
      return;
    }

    const subs = [];
    all.slice().sort(function (a, b) { return a.date < b.date ? 1 : -1; }).forEach(function (m) {
      if (subs.indexOf(m.subject) < 0) subs.push(m.subject);
    });
    if (filterSub && subs.indexOf(filterSub) < 0) filterSub = '';
    if (filterStatus && filterStatus !== 'all' && !STATUS[filterStatus]) filterStatus = '';

    const subChips = ['<button class="btn btn-small mk-chip' + (filterSub === '' ? ' on' : '') + '" data-msub="">全部</button>']
      .concat(subs.map(function (s2) {
        return '<button class="btn btn-small mk-chip' + (filterSub === s2 ? ' on' : '') + '" data-msub="' + S().esc(s2) + '">' + S().esc(s2) + '</button>';
      })).join('');
    const stChips = [['', '全部'], ['todo', '待重做'], ['mastered', '已巩固'], ['dropped', '放弃']].map(function (p) {
      return '<button class="btn btn-small mk-chip' + (filterStatus === p[0] ? ' on' : '') + '" data-mst="' + p[0] + '">' + p[1] + '</button>';
    }).join('');

    const list = all.filter(function (m) {
      if (filterSub && m.subject !== filterSub) return false;
      if (filterStatus && m.status !== filterStatus) return false;
      return true;
    }).sort(function (a, b) { return a.date < b.date ? 1 : -1; });

    box.innerHTML = '<div class="card"><h2>📕 错题本</h2>' +
      '<p class="hint">共 <b>' + all.length + '</b> 道 · <b style="color:var(--req)">待重做 ' + nTodo + '</b> · <b style="color:var(--extra)">已巩固 ' + nMaster + '</b>' +
      ' —— 隔阵子点「写出来了」自测一下，写出来了才算结。</p>' +
      '<div class="mk-toolbar"><button class="btn btn-small btn-primary" id="mk-add">＋ 收一道错题</button>' +
      '<span class="mk-chips">' + subChips + '</span><span class="mk-chips">' + stChips + '</span></div>' +
      (list.length ? '<div class="mk-list">' + list.map(function (m) { return rowHTML(m); }).join('') + '</div>'
        : '<p class="hint">这个筛选下没有错题。</p>') +
      '</div>';

    const b = box.querySelector('#mk-add');
    if (b) b.onclick = function () { addModal(); };
    box.querySelectorAll('[data-msub]').forEach(function (c) {
      c.onclick = function () { filterSub = c.dataset.msub; render(); };
    });
    box.querySelectorAll('[data-mst]').forEach(function (c) {
      c.onclick = function () { filterStatus = c.dataset.mst; render(); };
    });
    bindRows(box);
  }

  function rowHTML(m) {
    const st = STATUS[m.status] || STATUS.todo;
    const lastR = (m.redos && m.redos.length) ? m.redos[m.redos.length - 1] : null;
    const pid0 = (m.photoIds || []).filter(function (p) { return App.memcards && App.memcards.phGet(p); })[0] || '';
    const thumb = pid0
      ? '<img class="mk-thumb" src="' + App.memcards.phGet(pid0) + '" data-mkimg="' + m.id + '" alt="题图" />'
      : '';
    return '<div class="mk-row" data-mkid="' + m.id + '">' +
      '<span class="mk-status" style="background:' + st.c + '">' + st.t + '</span>' +
      '<div class="mk-main">' +
      '<div class="mk-desc">' + S().esc(m.desc) + '</div>' +
      '<div class="mk-meta">' + S().esc(m.subject) +
      (m.source ? ' · 来源：' + S().esc(m.source) : '') +
      (m.kp ? ' · 知识点：' + S().esc(m.kp) : '') +
      ' · 收于 ' + m.date +
      ((m.redos && m.redos.length)
        ? ' · 重做 ' + m.redos.length + ' 次（最近' + (lastR.result === 'ok' ? '✅' : '✗') + ' ' + S().fmtDateCN(S().dateKey(new Date(lastR.at))) + '）'
        : ' · 还没重做过') +
      (m.cardId ? ' · 🃏 已转卡' : '') +
      '</div></div>' + thumb +
      '<div class="mk-acts">' +
      '<button class="btn btn-small" data-mkact="ok" title="这次重做写出来了">✅</button>' +
      '<button class="btn btn-small" data-mkact="no" title="这次没写出来，还得再来">✗</button>' +
      (m.cardId ? '' : '<button class="btn btn-small" data-mkact="card" title="转成设问卡，接进复习">🃏</button>') +
      '<button class="btn btn-small" data-mkact="edit">✏️</button>' +
      '<button class="btn btn-small" data-mkact="del">🗑</button>' +
      '</div></div>';
  }

  function bindRows(box) {
    box.querySelectorAll('.mk-row').forEach(function (row) {
      const id = row.dataset.mkid;
      row.querySelectorAll('[data-mkact]').forEach(function (b) {
        b.onclick = function () {
          const act = b.dataset.mkact;
          if (act === 'ok') { redo(id, 'ok'); App.ui.toast('✅ 记一笔：这次写出来了 —— 状态改成「已巩固」'); render(); }
          else if (act === 'no') { redo(id, 'no'); App.ui.toast('✗ 记一笔：这次没写出来 —— 改天再来一遍'); render(); }
          else if (act === 'card') { toCard(id); render(); }
          else if (act === 'edit') { editModal(id); }
          else if (act === 'del') {
            const m = find(id);
            App.ui.confirm('删掉这道错题？（会先进回收站，能恢复）', '删掉', function () {
              del(id); render(); App.ui.toast('已进回收站，误删能恢复');
            });
          }
        };
      });
      const img = row.querySelector('[data-mkimg]');
      if (img) img.onclick = function () { photoModal(id); };
    });
  }

  function photoModal(id) {
    const m = find(id);
    if (!m) return;
    const imgs = (m.photoIds || []).map(function (pid) {
      return '<img src="' + App.memcards.phGet(pid) + '" style="max-width:100%;margin:6px 0;border-radius:10px;border:1px solid var(--line)" />';
    }).join('');
    App.ui.openModal('📷 题图（' + ((m.photoIds || []).length) + ' 张）', imgs || '<p class="hint">没有图</p>',
      '<button class="btn" data-act="cancel">关闭</button>');
    App.ui.bindActions({ cancel: App.ui.closeModal });
  }

  /* ---------- 录入 / 编辑 ---------- */
  let staged = [];   // 弹窗里刚传的图（取消时从图片池删掉，不留孤儿）
  function bindPhotoInput(modal) {
    const inp = modal.querySelector('#mk-file');
    if (!inp) return;
    inp.onchange = function () {
      // 🔴 v103 的坑：先把文件拷成普通数组，再清 value
      const files = [];
      for (let i = 0; i < inp.files.length; i++) files.push(inp.files[i]);
      inp.value = '';
      if (!files.length || !App.memcards) return;
      App.memcards.takeImages(files, function (ids, bad) {
        staged = staged.concat(ids);
        paintStaged(modal);
        if (ids.length) App.ui.toast('📷 已压缩收下 ' + ids.length + ' 张 —— 记得点「收下这道错题」才真的存进错题本');
        if (bad) App.ui.toast('有 ' + bad + ' 张读不出来（HEIC 先转成 JPG 再传）');
      });
    };
  }
  function paintStaged(modal) {
    const box = modal.querySelector('#mk-staged');
    if (!box) return;
    box.innerHTML = staged.map(function (pid) {
      return '<span class="mk-stage"><img src="' + App.memcards.phGet(pid) + '" />' +
        '<button class="mk-stage-x" data-mkstagex="' + pid + '">✕</button></span>';
    }).join('');
    box.querySelectorAll('[data-mkstagex]').forEach(function (x) {
      x.onclick = function () {
        const pid = x.dataset.mkstagex;
        staged = staged.filter(function (p) { return p !== pid; });
        if (App.memcards) App.memcards.phDel(pid);
        paintStaged(modal);
      };
    });
  }

  function addModal() {
    staged = [];
    const today = S().todayKey();
    const m = App.ui.openModal('📕 收一道错题', '' +
      '<div class="field-row">' +
      '<div class="field"><label>哪一科</label><input id="mk-sub" list="mk-sub-list" placeholder="如：化学" style="width:120px" />' +
      '<datalist id="mk-sub-list">' + subjects().map(function (s2) { return '<option value="' + S().esc(s2) + '"></option>'; }).join('') + '</datalist></div>' +
      '<div class="field"><label>收题日期</label><input type="date" id="mk-date" value="' + today + '" max="' + today + '" style="width:160px" /></div>' +
      '</div>' +
      '<div class="field"><label>题目（拍题或者把题干抄进来）</label><textarea id="mk-desc" style="width:100%;min-height:64px" placeholder="把题目描述 / 条件写进来；拍照的话文字可以简写"></textarea></div>' +
      '<div class="field"><label>📷 拍题（可多选；HEIC 先转 JPG）</label><input type="file" id="mk-file" accept="image/*" multiple style="width:100%" /><div id="mk-staged" class="mk-staged"></div></div>' +
      '<div class="field-row">' +
      '<div class="field"><label>来源（哪张卷子/哪本练习）</label><input id="mk-src" style="width:100%" placeholder="如：一轮复习卷 P3-16" /></div>' +
      '<div class="field"><label>知识点</label><input id="mk-kp" style="width:140px" placeholder="如：平衡常数" /></div>' +
      '</div>' +
      '<div class="field"><label>错因 / 正确思路（转成设问卡后它就是「答案」面）</label><textarea id="mk-note" style="width:100%;min-height:56px"></textarea></div>',
      '<button class="btn btn-primary" data-act="ok">收下这道错题</button>' +
      '<button class="btn" data-act="cancel">取消</button>');
    bindPhotoInput(m);
    paintStaged(m);
    App.ui.bindActions({
      ok: function () {
        const sub = m.querySelector('#mk-sub').value.trim();
        const desc = m.querySelector('#mk-desc').value.trim();
        const date = m.querySelector('#mk-date').value;
        if (!sub) { App.ui.toast('先写哪一科'); return; }
        if (!desc) { App.ui.toast('题目还没写（拍照也要简单说一句这是什么题）'); return; }
        if (!date) { App.ui.toast('收题日期还没选'); return; }
        if (date > today) { App.ui.toast('收题日期不能是还没到的日子'); return; }
        add({
          date: date, subject: sub, desc: desc,
          source: m.querySelector('#mk-src').value.trim(),
          kp: m.querySelector('#mk-kp').value.trim(),
          note: m.querySelector('#mk-note').value.trim(),
          photoIds: staged.slice()
        });
        staged = [];
        App.ui.closeModal(); render();
        App.ui.toast('📕 已收进错题本 —— 隔阵子回来点「✅ 写出来了」自测');
      },
      cancel: function () {
        staged.forEach(function (pid) { if (App.memcards) App.memcards.phDel(pid); });
        staged = [];
        App.ui.closeModal();
      }
    });
  }

  function editModal(id) {
    const m0 = find(id);
    if (!m0) return;
    const today = S().todayKey();
    const m = App.ui.openModal('✏️ 改这道错题', '' +
      '<div class="field-row">' +
      '<div class="field"><label>哪一科</label><input id="mk-sub" value="' + S().esc(m0.subject) + '" style="width:120px" /></div>' +
      '<div class="field"><label>状态</label><select id="mk-status" class="select-small">' +
      Object.keys(STATUS).map(function (k) { return '<option value="' + k + '"' + (m0.status === k ? ' selected' : '') + '>' + STATUS[k].t + '</option>'; }).join('') + '</select></div>' +
      '<div class="field"><label>收题日期</label><input type="date" id="mk-date" value="' + m0.date + '" max="' + today + '" style="width:160px" /></div>' +
      '</div>' +
      '<div class="field"><label>题目</label><textarea id="mk-desc" style="width:100%;min-height:64px">' + S().esc(m0.desc) + '</textarea></div>' +
      '<div class="field-row">' +
      '<div class="field"><label>来源</label><input id="mk-src" value="' + S().esc(m0.source || '') + '" style="width:100%" /></div>' +
      '<div class="field"><label>知识点</label><input id="mk-kp" value="' + S().esc(m0.kp || '') + '" style="width:140px" /></div>' +
      '</div>' +
      '<div class="field"><label>错因 / 正确思路</label><textarea id="mk-note" style="width:100%;min-height:56px">' + S().esc(m0.note || '') + '</textarea></div>' +
      '<p class="hint">题图要改的话：删了这道重新收，或者到 🃏 卡片页改转出来的那张卡。</p>',
      '<button class="btn btn-primary" data-act="ok">保存</button>' +
      '<button class="btn" data-act="cancel">取消</button>');
    App.ui.bindActions({
      ok: function () {
        const sub = m.querySelector('#mk-sub').value.trim();
        const desc = m.querySelector('#mk-desc').value.trim();
        const date = m.querySelector('#mk-date').value;
        if (!sub || !desc || !date) { App.ui.toast('有没填对的项'); return; }
        if (date > today) { App.ui.toast('收题日期不能是还没到的日子'); return; }
        update(id, {
          subject: sub, desc: desc, date: date,
          status: m.querySelector('#mk-status').value,
          source: m.querySelector('#mk-src').value.trim(),
          kp: m.querySelector('#mk-kp').value.trim(),
          note: m.querySelector('#mk-note').value.trim()
        });
        App.ui.closeModal(); render();
      },
      cancel: App.ui.closeModal
    });
  }

  App.mistakes = { render: render, addModal: addModal, editModal: editModal, toCard: toCard, redo: redo, add: add, update: update, del: del, D: D };
})();
