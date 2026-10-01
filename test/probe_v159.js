/* 🧪 v159 探针：专题归档。
   ① 新建专题 → 列表里有  ② 合集放进专题 → 计数对  ③ 筛选生效（只列该专题的合集）
   ④ 未分组筛选  ⑤ 页面有 📁 专题条和 📁 按钮 */
(function () {
  var out = [];
  var log = function (s) { out.push(s); };
  var ok = function (n, c, x) { log((c ? '✅ ' : '❌ ') + n + (x ? ' —— ' + x : '')); };
  function waitApp(n, cb) {
    if (window.App && App.store && App.memcards && App.store.data && App.store.data()) return cb();
    if (n <= 0) { log('❌ App 没起来'); window.__probeResult = out.join('\n') + '\n完成'; return; }
    setTimeout(function () { waitApp(n - 1, cb); }, 300);
  }
  waitApp(40, function () {
    try {
      var S = App.store, M = App.memcards;
      var today = S.todayKey();
      // 种子：三个合集，一个有专题
      S.data().memcards = [
        { id: 'c1', name: '平衡图像', subject: '化学', dayKey: today, topic: '化学平衡', cards: [{ id: 'k1', front: 'Q1', back: 'A1' }] },
        { id: 'c2', name: '速率常数', subject: '化学', dayKey: today, cards: [{ id: 'k2', front: 'Q2', back: 'A2' }] },
        { id: 'c3', name: '文言文实词', subject: '语文', dayKey: today, cards: [{ id: 'k3', front: 'Q3', back: 'A3' }] }
      ];
      S.data().topics = ['化学平衡'];
      S.save();
      M.curTopicSet('');

      // ① 新建专题
      M.addTopic('电化学');
      ok('① 新建专题进列表', M.topics().indexOf('电化学') >= 0 && M.topics().indexOf('化学平衡') >= 0, M.topics().join(','));

      // ② 计数
      ok('② 专题计数', M.topicN('化学平衡') === 1 && M.topicN('未命名的') === 0);

      // ③ 筛选：选「化学平衡」→ 只有 c1
      M.curTopicSet('化学平衡');
      var html = M.pageHTML();
      ok('③ 筛选生效（c1 在 c2 不在）', html.indexOf('平衡图像') >= 0 && html.indexOf('速率常数') < 0);
      ok('③ 选中态', html.indexOf('btn-primary" data-act="mc-topic-filter" data-v="化学平衡"') >= 0);

      // ④ 未分组筛选
      M.curTopicSet('__none__');
      html = M.pageHTML();
      ok('④ 未分组（c2/c3 在 c1 不在）', html.indexOf('速率常数') >= 0 && html.indexOf('文言文实词') >= 0 && html.indexOf('>平衡图像<') < 0);

      // ⑤ 全部 + 专题条 + 行上 📁
      M.curTopicSet('');
      html = M.pageHTML();
      ok('⑤ 专题条在', html.indexOf('📁 专题：') >= 0 && html.indexOf('＋ 新建专题') >= 0);
      ok('⑤ 行上有专题名和 📁 按钮', html.indexOf('📁 化学平衡') >= 0 && html.indexOf('data-act="card-topic"') >= 0);
      M.curTopicSet('');
    } catch (e) {
      log('❌ 探针异常：' + (e && e.message) + '\n' + String(e && e.stack || '').split('\n').slice(0, 3).join(' | '));
    }
    window.__probeResult = out.join('\n') + '\n完成';
  });
})();
