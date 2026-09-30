/* 🧪 v155b 探针：三个静默角落堵上没
   ② 已有 sp 的完课 → 有提示  ③ 先做完后改成新知识 → 补弹排期窗  ④ 以前天做的 → 明说去哪排 */
(function () {
  var out = [];
  var log = function (s) { out.push(s); };
  var ok = function (n, c, x) { log((c ? '✅ ' : '❌ ') + n + (x ? ' —— ' + x : '')); };
  function waitApp(n, cb) {
    if (window.App && App.store && App.tasks && App.app && App.store.data && App.store.data()) return cb();
    if (n <= 0) { log('❌ App 没起来'); window.__probeResult = out.join('\n') + '\n完成'; return; }
    setTimeout(function () { waitApp(n - 1, cb); }, 300);
  }
  waitApp(40, function () {
    try {
      var S = App.store, T = App.tasks;
      var today = S.todayKey();
      var day = S.getDay(today);
      day.tasks.required = [];
      // ② 已有 sp
      var t2 = { id: 'n2', text: '已有计划的课', mode: 'new', done: false,
                 sp: { planned: [{ n: 1, gap: 30, due: Date.now() + 3600000, done: null, at: null, need: 1, hits: [] }], at: Date.now() } };
      day.tasks.required.push(t2); S.save();
      T.toggleTask('required', 'n2');
      var sv = document.querySelector('[data-act="sum-save"]');
      if (sv) sv.click();
      setTimeout(function () {
        try {
          ok('② 已有 sp 完课有提示', document.body.innerHTML.indexOf('以前排过复习计划') >= 0);
          // ③ 先做完、再改成新知识（任务页 ✏️ 编辑）
          var t3 = { id: 'n3', text: '先做完再标的课', done: true, summary: { done: true, text: '', at: new Date().toISOString() } };
          day.tasks.required.push(t3); S.save();
          try { App.app.switchView('tasks'); } catch (e) { try { App.app.switchView('任务'); } catch (e2) {} }
          T.renderAll();
          setTimeout(function () {
            try {
              var row = document.querySelector('.task-row[data-id="n3"] .task-text');
              ok('③ 任务页找到这条', !!row);
              if (!row) { window.__probeResult = out.join('\n') + '\n完成'; return; }
              row.click();   // data-act=edit → 编辑弹窗
              setTimeout(function () {
                try {
                  var sel = document.querySelector('#edit-mode');
                  ok('③ 编辑弹窗开了（有类型下拉）', !!sel);
                  if (!sel) { window.__probeResult = out.join('\n') + '\n完成'; return; }
                  sel.value = 'new';
                  var saveBtn = document.querySelector('[data-act="save"]');
                  saveBtn.click();
                  setTimeout(function () {
                    try {
                      ok('③ 改成新知识后当场补弹排期窗', document.body.innerHTML.indexOf('定下一次复习') >= 0);
                      var cancel = document.querySelector('[data-act="cancel"]');
                      if (cancel) cancel.click();
                      // ④ 以前天做完的
                      var y = new Date(); y.setDate(y.getDate() - 2);
                      var t4 = { id: 'n4', text: '前天做完的课', done: true, doneDay: S.dateKey(y),
                                 summary: { done: true, text: '', at: y.toISOString() } };
                      day.tasks.required.push(t4); S.save();
                      T.renderAll();
                      setTimeout(function () {
                        try {
                          var row4 = document.querySelector('.task-row[data-id="n4"] .task-text');
                          if (row4) row4.click();
                          setTimeout(function () {
                            try {
                              var sel4 = document.querySelector('#edit-mode');
                              if (sel4) { sel4.value = 'new'; document.querySelector('[data-act="save"]').click(); }
                              setTimeout(function () {
                                try {
                                  ok('④ 以前天做的明说去哪排', document.body.innerHTML.indexOf('自己排一次') >= 0 || document.body.innerHTML.indexOf('点行上的') >= 0);
                                  window.__probeResult = out.join('\n') + '\n完成';
                                } catch (e) { log('❌' + e.message); window.__probeResult = out.join('\n') + '\n完成'; }
                              }, 400);
                            } catch (e) { log('❌' + e.message); window.__probeResult = out.join('\n') + '\n完成'; }
                          }, 400);
                        } catch (e) { log('❌' + e.message); window.__probeResult = out.join('\n') + '\n完成'; }
                      }, 400);
                    } catch (e) { log('❌' + e.message); window.__probeResult = out.join('\n') + '\n完成'; }
                  }, 400);
                } catch (e) { log('❌' + e.message); window.__probeResult = out.join('\n') + '\n完成'; }
              }, 400);
            } catch (e) { log('❌' + e.message); window.__probeResult = out.join('\n') + '\n完成'; }
          }, 500);
        } catch (e) { log('❌' + e.message); window.__probeResult = out.join('\n') + '\n完成'; }
      }, 400);
    } catch (e) { log('❌ 探针异常：' + e.message); window.__probeResult = out.join('\n') + '\n完成'; }
  });
})();
