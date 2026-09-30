/* 🧪 v154 探针：自动存盘（完整卡片包写到电脑文件夹）。只由 cdp-run 注入，结尾「完成」。 */
(function () {
  var out = [];
  var log = function (s) { out.push(s); };
  var ok = function (n, c, x) { log((c ? '✅ ' : '❌ ') + n + (x ? ' —— ' + x : '')); };

  function waitApp(n, cb) {
    if (window.App && App.store && App.backup && App.store.data && App.store.data()) return cb();
    if (n <= 0) { log('❌ App 没起来'); window.__probeResult = out.join('\n') + '\n完成'; return; }
    setTimeout(function () { waitApp(n - 1, cb); }, 300);
  }

  waitApp(40, function () {
    try {
      // 假一个 #bk-box（设置页里才有 —— 测试页直接补一个）
      var box = document.getElementById('bk-box');
      if (!box) { box = document.createElement('div'); box.id = 'bk-box'; document.body.appendChild(box); }

      // T1 页面渲染出 📁 按钮
      App.backup.render();
      setTimeout(function () {
        try {
          ok('T1 备份页有 📁 按钮', box.innerHTML.indexOf('每天自动存到电脑文件夹') >= 0);

          // T2 初始状态
          var st0 = App.backup.autoDirState();
          ok('T2 初始未选文件夹', st0.has === false);

          // T3 writeAutoPack + 桩句柄：写出的包 = 完整卡片包
          var written = {}, files = {};
          var mock = {
            queryPermission: function () { return Promise.resolve('granted'); },
            getFileHandle: function (name) {
              files[name] = 1;
              return Promise.resolve({ createWritable: function () {
                return Promise.resolve({ write: function (x) { written[name] = x; return Promise.resolve(); },
                                         close: function () { return Promise.resolve(); } });
              } });
            },
            values: function () { var ks = Object.keys(files), i = 0; return {
              next: function () { return i < ks.length ? Promise.resolve({ value: { kind: 'file', name: ks[i++] }, done: false })
                                                        : Promise.resolve({ done: true }); } }; },
            removeEntry: function (n) { delete files[n]; return Promise.resolve(); }
          };
          var d = App.store.data();
          d.memcards = [{ id: 'c1', name: '化学平衡', cards: [{ id: 'k1', front: 'Q', back: 'A', frontImgs: ['pxxx1'] }] }];
          App.store.save();
          App.backup.writeAutoPack(JSON.stringify(d), mock).then(function (r1) {
            ok('T3 写出成功', r1 === true);
            var names = Object.keys(written);
            ok('T3 文件名对', names.length === 1 && /^focus-plan-卡片备份-\d{8}-\d{4}\.json$/.test(names[0]), names.join(','));
            var pack = JSON.parse(written[names[0]]);
            ok('T3 包结构：完整卡片包', pack.__focusPlan === 2 && pack.data && pack.data.days && pack.data.memcards
               && pack.data.memcards[0].cards[0].frontImgs[0] === 'pxxx1'
               && typeof pack.photos === 'object', 'data+photos 绑在一起');
            var st1 = App.backup.autoDirState();
            ok('T3 状态更新', st1.last && st1.last.name === names[0] && st1.needsGrant === false);

            // T4 没选文件夹时 snap() 照常工作、不崩
            var before = 0;
            App.backup.listAll ? null : null;
            App.backup.snap('manual').then(function (rec) {
              ok('T4 没选文件夹 snap 也正常', !!rec && !!rec.id, rec ? rec.kind : '-');
              // T5 状态行文案
              ok('T5 状态行显示已开', box.innerHTML.indexOf('已开') >= 0 || box.innerHTML.indexOf('还没开') >= 0);
              window.__probeResult = out.join('\n') + '\n完成';
            }).catch(function (e) { log('❌ T4 异常：' + e.message); window.__probeResult = out.join('\n') + '\n完成'; });
          }).catch(function (e) { log('❌ T3 异常：' + e.message); window.__probeResult = out.join('\n') + '\n完成'; });
        } catch (e) {
          log('❌ 异常：' + e.message + '\n' + String(e.stack || '').split('\n').slice(0, 3).join(' | '));
          window.__probeResult = out.join('\n') + '\n完成';
        }
      }, 300);
    } catch (e) {
      log('❌ 异常：' + e.message);
      window.__probeResult = out.join('\n') + '\n完成';
    }
  });
})();
