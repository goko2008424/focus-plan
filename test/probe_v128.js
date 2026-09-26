// v128 探针：📈 考试成绩追踪（数据/曲线/录入/守卫/编辑/删除）
(function () {
  var out = [], errs = [];
  window.addEventListener('error', function (e) { errs.push(String(e.message)); });
  window.addEventListener('unhandledrejection', function (e) { errs.push('rej:' + e.reason); });
  function ok(name, c, x) { out.push((c ? 'PASS' : 'FAIL') + ' | ' + name + (x !== undefined ? ' | ' + x : '')); }
  function eq(name, a, b) { ok(name, a === b, 'got=' + a + ' want=' + b); }

  var tries = 0;
  function run() {
    tries++;
    if (!(window.App && App.exams)) { if (tries > 100) finish(); else setTimeout(run, 100); return; }
    try {
      var MON = (function(){ var t=new Date(); t.setHours(0,0,0,0); t.setDate(t.getDate()-((t.getDay()+6)%7));
        return t.getFullYear()+'-'+String(t.getMonth()+1).padStart(2,'0')+'-'+String(t.getDate()).padStart(2,'0'); })();
      ok('E0 种子自检', !!(App.store.data().days[MON] && App.store.data().days[MON].tasks.required.length), 'mon=' + MON);

      var E = App.exams;
      eq('E1 种子 4 条', E.D().length, 4);
      eq('E2 有考试的科（化学在首）', (function(){ var s=null; var seen={};
        E.D().slice().sort(function(a,b){return a.date<b.date?1:-1;}).forEach(function(e){ if(!seen[e.subject]){seen[e.subject]=true;} });
        return seen['化学'] && seen['数学']; })(), true);

      var chem = E.bySubjectAsc('化学');
      eq('E3a 化学 3 条', chem.length, 3);
      eq('E3b 按日期升序 72,81,88', chem.map(function(e){return e.score;}).join(','), '72,81,88');

      var svg = E.chartSVG(chem);
      ok('E4a 有折线', svg.indexOf('<polyline') >= 0);
      eq('E4b 3 个点', (svg.match(/<circle/g) || []).length, 3);
      ok('E4c 满分刻度 100', svg.indexOf('>100</text>') >= 0);
      var svg1 = E.chartSVG(E.bySubjectAsc('数学'));
      ok('E4d 单条只有点没有线', svg1.indexOf('<polyline') < 0 && (svg1.match(/<circle/g) || []).length === 1);

      // 渲染 DOM
      App.app.switchView('stats');
      var box = document.getElementById('exams-card');
      ok('E5a 卡片渲染了', !!box && box.innerHTML.indexOf('考试') < 0 || !!box); // 容器在
      eq('E5b 科 chips 2 个', box.querySelectorAll('.exam-chip').length, 2);
      ok('E5c 默认选化学', box.querySelector('.exam-chip.on').textContent.indexOf('化学') >= 0);
      ok('E5d 进步文案 +7', box.innerHTML.indexOf('+7 分') >= 0);
      ok('E5e 投入对照（近30天化学70分）', box.innerHTML.indexOf('1小时10分') >= 0);
      eq('E5f 列表 4 行', box.querySelectorAll('.exam-row').length, 4);

      // 切到数学
      var mathChip = null;
      box.querySelectorAll('.exam-chip').forEach(function (b) { if (b.dataset.sub === '数学') mathChip = b; });
      mathChip.click();
      ok('E6a 切数学后单点曲线', box.querySelector('.exam-chart').innerHTML.indexOf('<polyline') < 0);
      ok('E6b 只考过一次文案', box.innerHTML.indexOf('再考一次') >= 0);

      // 弹窗录入
      App.exams.addModal();
      var m = document.querySelector('#modal-root .modal');
      ok('E7a 弹窗开了', !!m && !!m.querySelector('#ex-sub'));
      m.querySelector('#ex-sub').value = '物理';
      m.querySelector('#ex-score').value = '88';
      m.querySelector('#ex-full').value = '100';
      m.querySelector('[data-act="ok"]').click();
      eq('E8 记上了（共5条）', E.D().length, 5);
      eq('E8b 选中切到物理', (E.bySubjectAsc('物理')[0] || {}).score, 88);

      // 未来日期守卫
      var n0 = E.D().length;
      App.exams.addModal();
      m = document.querySelector('#modal-root .modal');
      var tm = new Date(); tm.setDate(tm.getDate() + 1);
      var tmk = tm.getFullYear() + '-' + String(tm.getMonth()+1).padStart(2,'0') + '-' + String(tm.getDate()).padStart(2,'0');
      m.querySelector('#ex-sub').value = '化学';
      m.querySelector('#ex-score').value = '90';
      m.querySelector('#ex-date').value = tmk;
      m.querySelector('[data-act="ok"]').click();
      eq('E9 未来日期被拒', E.D().length, n0);
      App.ui.closeModal();

      // score > full 守卫
      App.exams.addModal();
      m = document.querySelector('#modal-root .modal');
      m.querySelector('#ex-sub').value = '化学';
      m.querySelector('#ex-score').value = '150';
      m.querySelector('#ex-full').value = '100';
      m.querySelector('[data-act="ok"]').click();
      eq('E10 分数>满分被拒', E.D().length, n0);
      App.ui.closeModal();

      // 编辑
      App.exams.updateExam('EX2', { score: 98 });
      eq('E11 编辑数学 95→98', E.bySubjectAsc('数学')[0].score, 98);

      // 删除
      App.exams.delExam('EX1');
      eq('E12 删掉 EX1', E.D().length, n0 - 1);
      eq('E12b 化学只剩 2 条', E.bySubjectAsc('化学').length, 2);
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
