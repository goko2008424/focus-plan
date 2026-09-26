// v126 探针：⚡ 快速添加 解析用例 + 弹窗链路
(function () {
  var out = [], errs = [];
  window.addEventListener('error', function (e) { errs.push(String(e.message)); });
  window.addEventListener('unhandledrejection', function (e) { errs.push('rej:' + e.reason); });
  function ok(name, c, x) { out.push((c ? 'PASS' : 'FAIL') + ' | ' + name + (x !== undefined ? ' | ' + x : '')); }
  function eq(name, a, b) { ok(name, a === b, 'got=' + a + ' want=' + b); }

  var tries = 0;
  function run() {
    tries++;
    if (!(window.App && App.tasks && App.tasks.quickParse)) { if (tries > 100) finish(); else setTimeout(run, 100); return; }
    try {
      var MON = (function(){ var t=new Date(); t.setHours(0,0,0,0); t.setDate(t.getDate()-((t.getDay()+6)%7));
        return t.getFullYear()+'-'+String(t.getMonth()+1).padStart(2,'0')+'-'+String(t.getDate()).padStart(2,'0'); })();
      ok('C0 种子自检', !!(App.store.data().days[MON] && App.store.data().days[MON].tasks.required.length), 'mon=' + MON);
      var P = App.tasks.quickParse;

      var r1 = P('明天下午背英语单词30分钟');
      eq('C1a 明天 offset', r1.offset, 1);
      eq('C1b 下午≈15点', r1.hour, 15);
      eq('C1c 近似标记', r1.hourApprox, true);
      eq('C1d 30分钟', r1.minutes, 30);
      eq('C1e 识出英语', r1.subject, '英语');
      eq('C1f 任务名加前缀', r1.title, '英语 · 背英语单词');

      var r2 = P('今天 数学卷子 1小时');
      eq('C2a 今天 offset', r2.offset, 0);
      eq('C2b 1小时', r2.minutes, 60);
      eq('C2c 数学不加前缀', r2.title, '数学卷子');

      var r3 = P('后天整理错题本');
      eq('C3a 后天', r3.offset, 2);
      eq('C3b 无学科', r3.subject, null);
      eq('C3c 任务名', r3.title, '整理错题本');

      var r4 = P('周五晚上 整理错题本');
      var expFri = (5 - new Date().getDay() + 7) % 7;
      eq('C4a 周五 offset', r4.offset, expFri);
      eq('C4b 晚上≈19点', r4.hour, 19);

      var r5 = P('背单词 45分钟');
      eq('C5a 45分钟', r5.minutes, 45);
      eq('C5b 任务名', r5.title, '背单词');

      var r6 = P('预习化学 2个半小时');
      eq('C6a 150分钟', r6.minutes, 150);
      eq('C6b 化学', r6.subject, '化学');

      var r7 = P('跟妈妈通电话');
      eq('C7a 全不识别', [r7.offset, r7.minutes, r7.hour, r7.subject].join(','), '0,,,');
      eq('C7b 原话为名', r7.title, '跟妈妈通电话');

      var r8 = P('周三 20:00 物理实验报告');
      var expWed = (3 - new Date().getDay() + 7) % 7;
      eq('C8a 周三', r8.offset, expWed);
      eq('C8b 20:00 整点', [r8.hour, r8.minute, r8.hourApprox].join(','), '20,0,false');
      eq('C8c 物理', r8.subject, '物理');

      var r9 = P('下周三 交作业');
      eq('C9a 下周三 = 本周+7', r9.offset, ((3 - new Date().getDay() + 7) % 7) + 7);

      var r10 = P('数学作业');
      eq('C10 开头就是学科不加前缀', [r10.subject, r10.title].join('|'), '数学|数学作业');

      var r11 = P('1个半小时跑步');
      eq('C11 90分钟', r11.minutes, 90);

      var r12 = P('半小时跳绳');
      eq('C12 30分钟', r12.minutes, 30);

      var r13 = P('二十分钟默写');
      eq('C13 中文数字 20', r13.minutes, 20);

      var r14 = P('中午12点半吃饭');
      eq('C14 12:30 精确', [r14.hour, r14.minute, r14.hourApprox].join(','), '12,30,false');

      var r15 = P('凌晨1点 背书');
      eq('C15 凌晨1点', r15.hour, 1);

      App.app.switchView('tasks');
      var qaBtn = document.querySelector('#task-columns [data-act="quick-add"]');
      ok('C16 工具条有 ⚡', !!qaBtn);
      qaBtn.click();
      var modal = document.querySelector('#modal-root .modal');
      ok('C17 弹窗开了', !!modal && !!modal.querySelector('#qa-text'));
      var inp = modal.querySelector('#qa-text');
      inp.value = '明天下午背英语单词30分钟';
      inp.dispatchEvent(new Event('input'));
      var prev = modal.querySelector('#qa-preview').innerHTML;
      ok('C18a 预览有明天', prev.indexOf('明天') >= 0);
      ok('C18b 预览有≈15:00', prev.indexOf('≈15:00') >= 0);
      ok('C18c 预览有30分钟', prev.indexOf('30分钟') >= 0);
      ok('C18d 预览有英语', prev.indexOf('英语') >= 0);
      eq('C18e 未来日期 3 个目标（无队列）', modal.querySelectorAll('.qa-t').length, 3);

      modal.querySelector('[data-act="qa-add"]').click();
      var tmk = App.store.tomorrowKey();
      var added = App.store.data().days[tmk].tasks.required.some(function (t) { return t.text === '英语 · 背英语单词'; });
      ok('C19 真加进了明天必须栏', added);
      ok('C19b 弹窗关了', !document.querySelector('#modal-root .modal'));

      App.tasks.quickAddModal();
      modal = document.querySelector('#modal-root .modal');
      inp = modal.querySelector('#qa-text');
      inp.value = '数学作业 20分钟';
      inp.dispatchEvent(new Event('input'));
      eq('C20 今天 4 个目标', modal.querySelectorAll('.qa-t').length, 4);
      var qChip = modal.querySelector('.qa-t[data-col="queue"]');
      qChip.click();
      ok('C21 队列 chip 选中', modal.querySelector('.qa-t[data-col="queue"]').classList.contains('on'));
      modal.querySelector('[data-act="qa-add"]').click();
      var qit = App.store.data().queue.filter(function (q) { return q.text === '数学作业'; });
      eq('C22 队列里有了 · 20分钟', qit.length === 1 && qit[0].minutes === 20, true);

      var qn0 = App.store.data().queue.length;
      App.tasks.quickAddModal();
      modal = document.querySelector('#modal-root .modal');
      inp = modal.querySelector('#qa-text');
      inp.value = '数学作业 20分钟';
      inp.dispatchEvent(new Event('input'));
      modal.querySelector('.qa-t[data-col="queue"]').click();
      modal.querySelector('[data-act="qa-add"]').click();
      eq('C23 同名不重复加', App.store.data().queue.length, qn0);

      App.tasks.quickAddModal();
      modal = document.querySelector('#modal-root .modal');
      inp = modal.querySelector('#qa-text');
      inp.value = '读英语绘本 15分钟';
      inp.dispatchEvent(new Event('input'));
      modal.querySelector('[data-act="qa-add"]').click();
      var tk = App.store.todayKey();
      ok('C24 今天必须栏有了', App.store.data().days[tk].tasks.required.some(function (t) { return t.text === '英语 · 读英语绘本'; }));
    } catch (e) { ok('PROBE-THREW', false, String((e && e.stack) || e)); }
    finish();
  }
  function finish() {
    var fails = out.filter(function (l) { return l.indexOf('FAIL') === 0; }).length;
    if (errs.length) out.push('JS-ERRORS: ' + errs.join(' ;; '));
    out.unshift((fails === 0 && errs.length === 0 ? 'ALL OK' : 'HAS FAIL') + ': ' + out.length + ' 条, 失败 ' + fails);
    window.__probeResult = out.join('\n') + ' 完成';
  }
  run();
})();
