/* 🧪 v156 探针：做完自动订复习 + 可取消。
   ① 完课 → 自动订 now+30min（不再逼挑时间，无排期弹窗）
   ② 🌱 弹窗预填 → 一键就排这一次
   ③ 排期记录里 ✕ 取消一次待复习 */
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
      var t1 = { id: 'a1', text: '量气管原理及误差分析', mode: 'new', done: false };
      day.tasks.required = [t1];
      S.save();
      var t0 = Date.now();
      T.toggleTask('required', 'a1');
      var sv = document.querySelector('[data-act="sum-save"]');
      if (sv) sv.click();
      setTimeout(function () {
        try {
          var sp = t1.sp;
          ok('① 完课自动订好（sp 有一条）', !!sp && sp.planned.length === 1);
          if (sp && sp.planned.length) {
            var due = sp.planned[0].due;
            var mins = Math.round((due - Date.now()) / 60000);
            ok('① 订在 ~30 分钟后（当天）', mins >= 28 && mins <= 32, '约 ' + mins + ' 分钟后');
            ok('① 没甩到明天', new Date(due).toDateString() === new Date().toDateString());
          }
          ok('① 有提示（已自动帮你排好）', document.body.innerHTML.indexOf('已自动帮你排好') >= 0);
          // 知识点弹窗照旧；跳过
          var skip = document.querySelector('[data-act="kp-skip"]');
          if (skip) skip.click();
          setTimeout(function () {
            try {
              ok('① 不再逼挑时间（无排期弹窗）', document.body.innerHTML.indexOf('定下一次复习') < 0);
              // ② 🌱 弹窗预填
              try { App.app.switchView('tasks'); } catch (e) {}
              T.renderAll();
              setTimeout(function () {
                try {
                  var btn = document.querySelector('.task-row[data-id="a1"] [data-act="sr-plan"]');
                  ok('② 行上有 🌱', !!btn);
                  if (!btn) { window.__probeResult = out.join('\n') + '\n完成'; return; }
                  btn.click();
                  setTimeout(function () {
                    try {
                      var inp = document.querySelector('#srp-at');
                      ok('② 排期窗预填了时间', !!inp && !!inp.value, inp ? inp.value : '空');
                      var before = t1.sp.planned.length;
                      var okBtn = document.querySelector('[data-act="ok"]');
                      if (okBtn) okBtn.click();
                      setTimeout(function () {
                        try {
                          ok('② 一键排这一次（多了一条）', t1.sp.planned.length === before + 1);
                          // ③ 取消：重开 🌱，点 ✕ 取消
                          T.renderAll();
                          setTimeout(function () {
                            try {
                              var btn2 = document.querySelector('.task-row[data-id="a1"] [data-act="sr-plan"]');
                              if (btn2) btn2.click();
                              setTimeout(function () {
                                try {
                                  var cancelBtn = document.querySelector('[data-act="sr-cancel"]');
                                  ok('③ 待做轮有 ✕ 取消', !!cancelBtn);
                                  if (cancelBtn) {
                                    cancelBtn.click();
                                    var okC = document.querySelector('#modal-root [data-act="ok"], .modal [data-act="ok"]');
                                    if (okC) okC.click();
                                    setTimeout(function () {
                                      try {
                                        ok('③ 取消成功（少了一条）', t1.sp.planned.length === before,
                                          '现在 ' + t1.sp.planned.length + ' 条（应为 ' + before + '）');
                                        window.__probeResult = out.join('\n') + '\n完成';
                                      } catch (e) { log('❌' + e.message); window.__probeResult = out.join('\n') + '\n完成'; }
                                    }, 400);
                                  } else { window.__probeResult = out.join('\n') + '\n完成'; }
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
        } catch (e) { log('❌' + e.message); window.__probeResult = out.join('\n') + '\n完成'; }
      }, 400);
    } catch (e) { log('❌ 探针异常：' + e.message); window.__probeResult = out.join('\n') + '\n完成'; }
  });
})();
