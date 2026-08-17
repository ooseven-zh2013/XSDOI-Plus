// ============================================================
// 左侧导航切换逻辑：点击菜单项切换右侧面板
// ============================================================
(function () {
  'use strict';

  var navItems = document.querySelectorAll('.nav-item');
  var views = document.querySelectorAll('.view');

  navItems.forEach(function (item) {
    item.addEventListener('click', function () {
      var view = item.getAttribute('data-view');

      navItems.forEach(function (n) { n.classList.remove('active'); });
      views.forEach(function (v) { v.classList.remove('active'); });

      item.classList.add('active');
      var target = document.getElementById('view-' + view);
      if (target) target.classList.add('active');
    });
  });
})();
