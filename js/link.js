/* ============================================================
 * link.js — 时段衔接器：学完一段 → 休息 / 杂事 / 娱乐
 *           直接填结束时间 → 填状态/感想 → 自动记入时间轴
 * ============================================================ */
(function () {
  'use strict';

  const App = (window.App = window.App || {});
  const S = () => App.store;

  const TYPES = {
    rest:  { label: '😴 休息', cat: 'fun',  color: '#f59e0b', verb: '休息' },
    chore: { label: '🧹 处理杂事', cat: 'life', color: '#8a919c', verb: '处理杂事' },
    fun:   { label: '🎮 娱乐', cat: 'fun',  color: '#e2545d', verb: '娱乐' }
  };

  let pause = null; // {type, content, startKey, startMin, planned, startedAt}

  function render() {
    const card = document.getElementById('link-card');
    if (!card) return;
    if (!pause) {
      card.innerHTML = '';
      card.classList.add('hidden');
      return;
    }
    const t = TYPES[pause.type];
    card.classList.remove('hidden');
    card.innerHTML =
      '<div class="card" style="border-left:4px solid ' + t.color + '">' +
      '<h3>' + t.label + '中…</h3>' +
      '<p class="hint">从 ' + S().hhmmOf(pause.startMin) + ' 开始' +
      (pause.content ? ' · ' + S().esc(pause.content) : '') +
      (pause.planned ? ' · 计划 ' + S().fmtDur(pause.planned) : '') + '</p>' +
      '<button class="btn btn-primary btn-block" data-act="link-back">🔙 我回来了</button>' +
      '</div>';
    card.onclick = function (e) {
      if (e.target.closest('[data-act="link-back"]')) linkBack();
    };
  }

  /* ---------- 进入衔接 ---------- */
  function open() {
    const day = S().getDay(S().todayKey());
    if (!day || day.ended) { App.ui.toast('今天已结束，先开始新的一天吧'); return; }
    if (pause) { App.ui.toast('现在正在' + TYPES[pause.type].label.replace(/[😴🧹🎮 ]/g, '') + '中，先「我回来了」'); return; }
    const modal = App.ui.openModal('🔄 一段做完了，接下来', '' +
      '<p class="hint" style="margin-bottom:10px">学完一段，选择接下来做什么（先做别的事也行）。结束后直接记进时间轴，不用去时间轴里手点。</p>' +
      '<div class="btn-row">' +
      '<button class="btn btn-primary" data-act="t-rest">😴 休息</button>' +
      '<button class="btn" data-act="t-chore">🧹 处理杂事</button>' +
      '<button class="btn" data-act="t-fun">🎮 娱乐</button>' +
      '</div>',
      '<button class="btn" data-act="cancel">取消</button>');
    App.ui.bindActions({
      't-rest': function () { App.ui.closeModal(); formOpen('rest'); },
      't-chore': function () { App.ui.closeModal(); formOpen('chore'); },
      't-fun': function () { App.ui.closeModal(); formOpen('fun'); },
      cancel: App.ui.closeModal
    });
  }

  function formOpen(type) {
    const t = TYPES[type];
    const nowStr = S().hhmmOf(new Date().getHours() * 60 + new Date().getMinutes());
    const body = (type !== 'rest'
      ? '<div class="field"><label>要去做什么？（写一句）</label><input type="text" id="lk-content" placeholder="" /></div>'
      : '<div class="field"><label>打算休息多久（分钟，可留空）</label><input type="number" id="lk-plan" min="0" value="" placeholder="" /></div>') +
      '<div class="field"><label>开始时间</label><input type="time" id="lk-start" value="' + nowStr + '" /></div>';
    const modal = App.ui.openModal(t.label, body,
      '<button class="btn btn-primary" data-act="go">开始</button><button class="btn" data-act="cancel">取消</button>');
    App.ui.bindActions({
      go: function () {
        const content = modal.querySelector('#lk-content') ? modal.querySelector('#lk-content').value.trim() : '';
        if (type !== 'rest' && !content) { App.ui.toast('写一句要去做什么'); return; }
        const planEl = modal.querySelector('#lk-plan');
        const planned = planEl ? Math.max(0, +planEl.value || 0) : 0;
        const startVal = modal.querySelector('#lk-start').value || nowStr;
        pause = {
          type: type, content: content,
          startKey: S().todayKey(), startMin: S().minOfDay(startVal),
          planned: planned, startedAt: Date.now()
        };
        App.ui.closeModal();
        render();
        App.ui.toast('开始' + t.verb + '了，结束后点「🔙 我回来了」');
      },
      cancel: App.ui.closeModal
    });
  }

  /* ---------- 回来：填结束时间 + 状态/感想（可跳过 · 好好休息得积分） ---------- */
  function linkBack() {
    if (!pause) return;
    const p = pause;
    const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
    const strict = S().settings().recordMode === 'strict';
    let restState = null; // 'ok' 好好休息 | 'bad' 没休息好 | 'off' 中途跑去干别的

    const noteLabel = function () {
      if (p.type === 'rest' && strict) {
        if (restState === 'bad') return '写写消耗了什么 / 为什么没休息好';
        if (restState === 'off') return '写写为什么中途跑去干别的事了 + 解决办法';
        return '这段时间想到的 / 自洽的复盘（可选，能写就写，方便以后翻）';
      }
      return '这段时间的感想 / 记录（可选）';
    };
    const noteHint = p.type === 'rest' && strict && (restState === 'bad' || restState === 'off');

    const body = function () {
      return '<div class="field"><label>结束时间</label><input type="time" id="lk-end" value="' + S().hhmmOf(nowMin) + '" /></div>' +
        (p.type === 'rest' && strict
          ? '<div class="field"><label>这次休息得怎么样？（好好休息才有积分）</label>' +
            '<div class="btn-row">' +
            '<button class="btn btn-small' + (restState === 'ok' ? ' btn-primary' : '') + '" data-act="rest-ok">🙂 好好休息了</button>' +
            '<button class="btn btn-small' + (restState === 'off' ? ' btn-primary' : '') + '" data-act="rest-off">🧭 中途去干别的了</button>' +
            '<button class="btn btn-small' + (restState === 'bad' ? ' btn-primary' : '') + '" data-act="rest-bad">😞 没休息好</button>' +
            '</div>' +
            '<p class="hint">好好休息得积分；中途干别的/没休息好不得积分，而且要写原因+解决办法。</p></div>'
          : '') +
        '<div class="field"><label>' + noteLabel() + (noteHint ? ' <span style="color:#e2545d">（必填）</span>' : '') + '</label>' +
        '<textarea id="lk-note" placeholder="' + (p.type === 'rest' && strict && restState === 'ok' ? '比如：看了两条消息但没消耗、想通了某个题、休息时想到的点子…' : '') + '" style="width:100%;min-height:56px;border:1px solid #e5e8ec;border-radius:8px;padding:8px;font-size:13px;resize:vertical"></textarea></div>' +
        '<p class="hint">也可以选「⏭ 跳过这段」：这段不记录、不加时间轴，直接接着学。</p>';
    };

    function reopen() {
      const modal = App.ui.openModal('🔙 我回来了', body(),
        '<button class="btn btn-primary" data-act="link-ok">确认，记入时间轴</button>' +
        '<button class="btn" data-act="link-skip">⏭ 跳过这段，直接接着学</button>' +
        '<button class="btn" data-act="cancel">取消</button>', { wide: true, lock: false });
      const noteTa = modal.querySelector('#lk-note');
      App.ui.bindActions({
        'rest-ok': function () { restState = 'ok'; App.ui.closeModal(); reopen(); },
        'rest-bad': function () { restState = 'bad'; App.ui.closeModal(); reopen(); },
        'rest-off': function () { restState = 'off'; App.ui.closeModal(); reopen(); },
        'link-skip': function () {
          pause = null;
          render();
          App.ui.closeModal();
          App.ui.toast('⏭ 已跳过这段，直接接着学');
        },
        'link-ok': function () {
          const endVal = modal.querySelector('#lk-end').value || S().hhmmOf(nowMin);
          const endMin = S().minOfDay(endVal);
          const note = noteTa ? noteTa.value.trim() : '';
          if (p.type === 'rest' && strict && restState == null) { App.ui.toast('先选一下休息得怎么样'); return; }
          if (p.type === 'rest' && strict && (restState === 'bad' || restState === 'off') && !note) {
            App.ui.toast(restState === 'off' ? '写一句：为什么跑去干别的 + 解决办法' : '写一句消耗了什么'); return;
          }
          linkConfirm(p, endMin, note, restState);
          App.ui.closeModal();
        },
        cancel: App.ui.closeModal
      });
    }
    reopen();
  }

  function linkConfirm(p, endMin, note, restState) {
    const day = S().getDay(p.startKey);
    const t = TYPES[p.type];
    if (endMin < p.startMin) endMin = 1439; // 跨午夜截断
    const mins = Math.max(1, endMin - p.startMin);
    const label = t.label.replace(/[^\u4e00-\u9fa5a-zA-Z]/g, '');
    const content = (p.content ? label + '：' + p.content : label);
    day.timeline.push({
      id: S().uid(), start: p.startMin, end: endMin, minutes: mins,
      content: content, category: t.cat, countAsStudy: false,
      auto: false, source: 'link', note: note
    });
    // 严格模式的休息奖励（只有「好好休息」才有）
    if (p.type === 'rest' && S().settings().recordMode === 'strict' && restState === 'ok') {
      const pts = S().settings().restRewardPoints || 0;
      if (pts > 0) {
        S().addLedger(p.startKey, 'rest', { points: pts, note: '好好休息 +' + pts + '分' });
        App.ui.floatAt(document.getElementById('stat-points'), '+' + pts + '分');
      }
    }
    pause = null;
    render();
    S().save();
    if (typeof App.tasks !== 'undefined' && App.tasks.renderAll) App.tasks.renderAll();
    App.ui.toast('已记入时间轴：' + content + '（' + S().fmtDur(mins) + '）');
  }

  function endDayGuard() {
    // 结束今天前若正在休息，提醒先收回来
    if (pause) {
      App.ui.confirm('现在还在' + TYPES[pause.type].label.replace(/[😴🧹🎮 ]/g, '') + '中，确定直接结束今天？（这段不计入时间轴）', '结束今天', function () {
        pause = null;
        render();
        if (typeof App.tasks !== 'undefined' && App.tasks.endDay) App.tasks.endDay();
      });
      return true;
    }
    return false;
  }

  /* ---------- 🤖 AI 超时/弱点复盘（SiliconFlow） ---------- */
  function buildTodayData(dayKey) {
    const day = S().getDay(dayKey);
    if (!day) return null;
    const lines = [];
    ['required', 'ideal', 'extra'].forEach(function (k) {
      (day.tasks[k] || []).forEach(function (t) {
        const st = t.done ? (t.summary ? t.summary.text : '') : '（未完成）';
        lines.push('任务[' + k + '] ' + t.text + (t.done ? ' ✓' : ' ✗') + (st ? '  总结：' + st : ''));
        (t.subs || []).forEach(function (s) {
          lines.push('  小题 ' + s.text + ' 限' + s.minutes + 'min 完成=' + (s.done === true ? '✓' : (s.done === false ? '✗' : '未标记')) + (s.summary ? '  总结：' + s.summary : ''));
        });
        (t.groups || []).forEach(function (g) {
          lines.push('  组[' + g.name + ']');
          (g.subs || []).forEach(function (s) {
            lines.push('    小题 ' + s.text + ' 限' + s.minutes + 'min 完成=' + (s.done === true ? '✓' : (s.done === false ? '✗' : '未标记')) + (s.summary ? '  总结：' + s.summary : ''));
          });
        });
      });
    });
    (day.sessions || []).forEach(function (se) {
      lines.push('学习 ' + se.taskText + ' · ' + se.planContent + ' 计划' + se.planMinutes + 'min 实际' + se.actualMinutes + 'min' + (se.done === true ? '完成' : (se.done === false ? '未完成' : '')) + (se.note ? '  总结：' + se.note : ''));
    });
    (day.timeline || []).forEach(function (rec) {
      if (rec.note) lines.push('时间段「' + rec.content + '」的感想：' + rec.note);
    });
    if (day.review && day.review.text) lines.push('今日复盘：' + day.review.text);
    return lines.join('\n');
  }

  function summarizeToday() {
    const s = S().settings();
    const key = (s.aiKey || '').trim();
    if (!key) { App.ui.toast('先到「设置 → AI」填 SiliconFlow API Key'); return; }
    const text = buildTodayData(S().todayKey());
    if (!text) { App.ui.toast('今天还没有记录，先做点再去复盘 😄'); return; }
    const model = (s.aiModel || 'Qwen/Qwen2.5-7B-Instruct').trim();
    const sys = '你是一位专注学习的复盘教练。基于提供的今日记录，用中文输出一个 JSON 对象（不要 markdown 代码块），格式：{"summary":"一两句点评今天整体","overtime":[{"item":"任务或小题名","plan":"计划多少","actual":"实际多少","over":"超时分钟数","reason":"可能原因"}],"weak":["薄弱点1","薄弱点2"],"advice":"明天最该改进的一件事"}。没有超时则 overtime 为 []。文字口语化、不空洞。';
    const user = '今日记录：\n' + text;
    App.ui.toast('🤖 AI 正在分析…');
    fetch('https://api.siliconflow.cn/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key },
      body: JSON.stringify({
        model: model,
        messages: [{ role: 'system', content: sys }, { role: 'user', content: user }],
        temperature: 0.7, max_tokens: 1200, response_format: { type: 'json_object' }
      })
    }).then(function (r) {
      if (!r.ok) { if (r.status === 401) throw new Error('API Key 无效（401）'); if (r.status === 402) throw new Error('余额不足（402）'); throw new Error('HTTP ' + r.status); }
      return r.json();
    }).then(function (data) {
      const c = data && data.choices && data.choices[0] && data.choices[0].message ? data.choices[0].message.content : '';
      renderAiResult(c);
    }).catch(function (err) {
      App.ui.toast('AI 调用失败：' + err.message + '。浏览器直接调用常被跨域拦，可用桌面插件或代理');
    });
  }

  function renderAiResult(content) {
    let obj = null;
    try { obj = JSON.parse(String(content || '').replace(/```json|```/g, '').trim()); } catch (e) { /* fallback */ }
    if (!obj) {
      const m2 = App.ui.openModal('🤖 AI 今日复盘', '<div class="card"><p style="white-space:pre-wrap">' + S().esc(content || '无内容') + '</p></div>', '<button class="btn btn-primary" data-act="close">知道了</button>');
      App.ui.bindActions({ close: App.ui.closeModal });
      return;
    }
    const rows = (obj.overtime || []).map(function (o) {
      return '<tr><td>' + S().esc(o.item || '') + '</td><td>' + S().esc(o.plan || '') + '</td><td>' + S().esc(o.actual || '') + '</td><td style="color:#e2545d">' + S().esc(o.over || '') + '</td><td>' + S().esc(o.reason || '') + '</td></tr>';
    }).join('');
    const weak = (obj.weak || []).map(function (w) { return '<li>' + S().esc(w) + '</li>'; }).join('');
    const html = '<div class="card">' +
      '<p>' + S().esc(obj.summary || '') + '</p>' +
      (rows
        ? '<table style="width:100%;border-collapse:collapse;font-size:12.5px;margin-top:8px"><thead><tr><th style="text-align:left">项目</th><th>计划</th><th>实际</th><th>超时</th><th>可能原因</th></tr></thead><tbody>' + rows + '</tbody></table>'
        : '<p style="color:var(--primary)">🎯 今天没有超时，保持住这份节奏！</p>') +
      (weak ? '<div style="margin-top:8px"><b>薄弱点：</b><ul>' + weak + '</ul></div>' : '') +
      '<div style="margin-top:8px;padding:8px;background:rgba(34,160,107,0.1);border-radius:8px"><b>明天最该改进：</b> ' + S().esc(obj.advice || '') + '</div>' +
      '</div>';
    const m = App.ui.openModal('🤖 AI 今日复盘', html, '<button class="btn btn-primary" data-act="close">知道了</button>', { wide: true });
    App.ui.bindActions({ close: App.ui.closeModal });
  }

  function init() {
    const btn = document.getElementById('btn-link');
    if (btn) btn.onclick = open;
    const aiBtn = document.getElementById('btn-ai');
    if (aiBtn) aiBtn.onclick = summarizeToday;
  }

  App.link = {
    init: init, open: open, render: render, endDayGuard: endDayGuard,
    isPausing: function () { return !!pause; },
    summarizeToday: summarizeToday
  };
})();
