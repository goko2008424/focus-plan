/* 🧪 v155 探针：新知识任务完成后到底弹不弹「定下一次复习」。
   ① 正常流：mode=new 完课 → 总结窗 → 知识点窗 → 排期窗
   ② 已有 sp 的再勾 → 现在是静默（要改成有提示）
   ③ 已完成的任务被 ✏️ 改成 new → 现在也是静默（要补弹） */
(function () {
  var out = [];
  var log = function (s) { out.push(s); };
  var ok = function (n, c, x) { log((c ? '✅ ' : '❌ ') + n + (x ? ' —— ' + x : '')); };
  function waitApp(n, cb) {
    if (window.App && App.store && App.tasks && App.store.data && App.store.data()) return cb();
    if (n <= 0) { log('❌ App 没起来'); window.__probeResult = out.join('\n') + '\n完成'; return; }
    setTimeout(function () { waitApp(n - 1, cb); }, 300);
  }
  function modalText() {
    var m = document.querySelector('.modal, [class*=modal]');
    return m ? m.textContent : '';
  }
  waitApp(40, function () {
    try {
      var S = App.store, T = App.tasks;
      var today = S.todayKey();
      var day = S.getDay(today);
      // 种子：一条新知识任务
      var t1 = { id: 'n1', text: '无机物实验探究设计', mode: 'new', done: false };
      day.tasks.required = [t1];
      S.save();
      T.toggleTask('required', 'n1');           // 勾上
      ok('① 勾后弹总结窗', document.body.innerHTML.indexOf('写个任务总结') >= 0);
      // 保存总结（触发 onDone → srRunPending）
      var save = document.querySelector('[data-act="sum-save"]');
      if (save) save.click();
      setTimeout(function () {
        try {
          var txt1 = document.body.innerHTML;
          ok('① 知识点窗出现', txt1.indexOf('设几个知识点') >= 0, '实际：' + (txt1.indexOf('设几个知识点') >= 0 ? '有' : '无'));
          var skip = document.querySelector('[data-act="kp-skip"]');
          if (skip) skip.click();
          setTimeout(function () {
            try {
              var txt2 = document.body.innerHTML;
              ok('① 排期窗出现（定下一次复习）', txt2.indexOf('定下一次复习') >= 0);
              // 关掉排期窗
              var cancel = document.querySelector('[data-act="cancel"]');
              if (cancel) cancel.click();
              // ② 已有 sp 的任务再勾 → 取消完成再勾上
              var t2 = { id: 'n2', text: '已有计划的课', mode: 'new', done: false,
                         sp: { planned: [{ n: 1, gap: 30, due: Date.now() + 3600000, done: null, at: null, need: 1, hits: [] }], at: Date.now() } };
              day.tasks.required.push(t2); S.save();
              T.toggleTask('required', 'n2');
              var sv2 = document.querySelector('[data-act="sum-save"]');
              if (sv2) sv2.click();
              setTimeout(function () {
                try {
                  ok('② 已有 sp 的勾完也有提示（不静默）', document.body.innerHTML.indexOf('已经排过') >= 0 || document.body.innerHTML.indexOf('复习计划') >= 0,
                     document.body.innerHTML.indexOf('已经排过') >= 0 ? '有提示' : '仍是静默');
                  window.__probeResult = out.join('\n') + '\n完成';
                } catch (e) { log('❌' + e.message); window.__probeResult = out.join('\n') + '\n完成'; }
              }, 400);
            } catch (e) { log('❌' + e.message); window.__probeResult = out.join('\n') + '\n完成'; }
          }, 400);
        } catch (e) { log('❌' + e.message); window.__probeResult = out.join('\n') + '\n完成'; }
      }, 400);
    } catch (e) { log('❌ 探针异常：' + e.message); window.__probeResult = out.join('\n') + '\n完成'; }
  });
})();
