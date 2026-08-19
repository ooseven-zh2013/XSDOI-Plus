// content.js —— 在新赛道OI页面注入/移除亚克力毛玻璃样式
// 与 popup 通过 chrome.storage.sync 通信，开关与透明度变化实时生效
// 语义：透明度(alpha)始终生效；开关(enabled)只控制「模糊」。
//   关掉开关 → 元素仍半透明（玻璃效果），仅去掉 backdrop-filter 模糊。
// 作用范围：卡片 .el-card、左侧菜单栏 #nav、顶部栏 .oj-topbar
(function () {
  'use strict';

  var STYLE_ID = 'xsdoi-acrylic';
  var DEFAULT_ENABLED = true;
  var DEFAULT_ALPHA = 0.55;

  var state = { enabled: DEFAULT_ENABLED, alpha: DEFAULT_ALPHA };

  function sanitizeAlpha(v) {
    var a = parseFloat(v);
    if (isNaN(a)) return DEFAULT_ALPHA;
    return Math.min(1, Math.max(0, a));
  }

  // lv-card 阶段卡：渐变色是内联动态传入的，纯 CSS 无法逐个转半透明，
  // 用 JS 读取 rgb 色值统一转成 rgba(带透明度)。
  var LV_COLOR_RE = /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*[\d.]+\s*)?\)/g;

  function applyLvCard(alpha) {
    var cards = document.querySelectorAll('.lv-card');
    var a = alpha.toFixed(2);
    for (var i = 0; i < cards.length; i++) {
      var bg = cards[i].style.background;
      if (!bg) continue;
      cards[i].style.background = bg.replace(LV_COLOR_RE, function (m, r, g, b) {
        return 'rgba(' + r + ', ' + g + ', ' + b + ', ' + a + ')';
      });
    }
  }

  function restoreLvCard() {
    var cards = document.querySelectorAll('.lv-card');
    for (var i = 0; i < cards.length; i++) {
      var bg = cards[i].style.background;
      if (!bg) continue;
      cards[i].style.background = bg.replace(LV_COLOR_RE, function (m, r, g, b) {
        return 'rgb(' + r + ', ' + g + ', ' + b + ')';
      });
    }
  }

  function buildCSS(alpha, enabled) {
    var a = alpha.toFixed(2);
    var rules = [];

    /* ===== 透明度（始终生效）===== */
    rules.push(
      /* 卡片 */
      '.el-card {',
      '  background-color: transparent !important;',
      '  border-color: rgba(255, 255, 255, 0.5) !important;',
      '}',
      '.el-card__header {',
      '  border-bottom-color: rgba(0, 0, 0, 0.05) !important;',
      '}',
      'html.theme-dark .el-card {',
      '  background-color: transparent !important;',
      '  border-color: rgba(255, 255, 255, 0.12) !important;',
      '}',
      'html.theme-dark .el-card__header {',
      '  border-bottom-color: rgba(255, 255, 255, 0.08) !important;',
      '}',
      /* 左侧菜单栏 #nav（右侧圆角） */
      '#nav, #nav .el-menu {',
      '  background-color: transparent !important;',
      '  border-radius: 0 12px 12px 0 !important;',
      '}',
      'html.theme-dark #nav, html.theme-dark #nav .el-menu {',
      '  background-color: transparent !important;',
      '}',
      /* 顶部栏 .oj-topbar（暗色用更高特异性覆盖网站的 !important；下方圆角） */
      '.oj-topbar {',
      '  background-color: transparent !important;',
      '  border-bottom: none !important;',
      '  border-radius: 0 0 12px 12px !important;',
      '}',
      'html.theme-dark .oj-topbar.oj-topbar {',
      '  background-color: transparent !important;',
      '  border-bottom: none !important;',
      '}',
      /* 标签页导航条（子列表 el-tabs） */
      '.el-tabs__nav-wrap {',
      '  background-color: transparent !important;',
      '  border: 1px solid rgba(255, 255, 255, 0.5) !important;',
      '  border-radius: 12px !important;',
      '}',
      '.el-tabs__nav-wrap::after {',
      '  background-color: transparent !important;',
      '}',
      'html.theme-dark .el-tabs__nav-wrap {',
      '  background-color: transparent !important;',
      '  border: 1px solid rgba(255, 255, 255, 0.12) !important;',
      '}',
      'html.theme-dark .el-tabs__nav-wrap::after {',
      '  background-color: transparent !important;',
      '}',
      /* border-card 标签页（题目详情页等，整体亚克力） */
      '.el-tabs--border-card {',
      '  background-color: transparent !important;',
      '  border-color: rgba(255, 255, 255, 0.5) !important;',
      '  border-radius: 12px !important;',
      '  overflow: hidden !important;',
      '}',
      '.el-tabs--border-card > .el-tabs__header {',
      '  background-color: transparent !important;',
      '  border-bottom: none !important;',
      '}',
      '.el-tabs--border-card .el-tabs__nav-wrap {',
      '  background-color: transparent !important;',
      '  border-radius: 12px 12px 0 0 !important;',
      '}',
      '.el-tabs--border-card .el-tabs__nav-wrap::after {',
      '  display: none !important;',
      '}',
      'html.theme-dark .el-tabs--border-card {',
      '  background-color: transparent !important;',
      '  border-color: rgba(255, 255, 255, 0.12) !important;',
      '}',
      'html.theme-dark .el-tabs--border-card > .el-tabs__header {',
      '  background-color: transparent !important;',
      '  border-bottom: none !important;',
      '}',
      'html.theme-dark .el-tabs--border-card .el-tabs__nav-wrap {',
      '  background-color: transparent !important;',
      '}',
      'html.theme-dark .el-tabs--border-card .el-tabs__nav-wrap::after {',
      '  display: none !important;',
      '}',
      /* 描述体 description-body（原本透明，加亚克力卡片外观） */
      '.description-body {',
      '  background-color: transparent !important;',
      '  border: 1px solid rgba(255, 255, 255, 0.5) !important;',
      '  border-radius: 12px !important;',
      '  padding: 16px !important;',
      '}',
      'html.theme-dark .description-body {',
      '  background-color: transparent !important;',
      '  border: 1px solid rgba(255, 255, 255, 0.12) !important;',
      '}',
      /* 余额统计块 ledger-sum（个人中心/钱包：当前余额/累计赚到/累计花掉） */
      '.ledger-sum, .ledger-sum > div {',
      '  background-color: transparent !important;',
      '}',
      '.ledger-sum {',
      '  border: 1px solid rgba(255, 255, 255, 0.5) !important;',
      '  border-radius: 12px !important;',
      '}',
      'html.theme-dark .ledger-sum, html.theme-dark .ledger-sum > div {',
      '  background-color: transparent !important;',
      '}',
      'html.theme-dark .ledger-sum {',
      '  border: 1px solid rgba(255, 255, 255, 0.12) !important;',
      '}',
      /* 公告卡片（内联 border:0px，补半透明边框） */
      '.el-card.is-never-shadow {',
      '  border: 1px solid rgba(255, 255, 255, 0.5) !important;',
      '}',
      'html.theme-dark .el-card.is-never-shadow {',
      '  border: 1px solid rgba(255, 255, 255, 0.12) !important;',
      '}',
      /* 公告列表项（加圆角 + 亚克力边框，保留左侧品牌色竖条） */
      '.announcement-container li {',
      '  border-radius: 12px !important;',
      '  border: 1px solid rgba(255, 255, 255, 0.5) !important;',
      '  border-left: 2px solid var(--primary) !important;',
      '}',
      'html.theme-dark .announcement-container li {',
      '  border: 1px solid rgba(255, 255, 255, 0.12) !important;',
      '  border-left: 2px solid var(--primary) !important;',
      '}',
      /* 隐藏分隔线（班级页 description 与公告之间的竖线） */
      '.separator.hidden-sm-and-down {',
      '  display: none !important;',
      '}',
      /* 页脚（底部横条，顶部圆角 + 亚克力边框） */
      '.fix-to-bottom, .mundb-footer {',
      '  background-color: transparent !important;',
      '  border-top: 1px solid rgba(255, 255, 255, 0.5) !important;',
      '}',
      '.fix-to-bottom {',
      '  border-radius: 12px 12px 0 0 !important;',
      '  overflow: hidden !important;',
      '}',
      'html.theme-dark .fix-to-bottom, html.theme-dark .mundb-footer {',
      '  background-color: transparent !important;',
      '  border-top: 1px solid rgba(255, 255, 255, 0.12) !important;',
      '}',
      /* 班级/群组卡片 group-card（已有 14px 圆角，补半透明背景 + 亚克力边框） */
      '.group-card {',
      '  background-color: transparent !important;',
      '  border: 1px solid rgba(255, 255, 255, 0.5) !important;',
      '}',
      '.group-cover {',
      '  background-color: transparent !important;',
      '}',
      'html.theme-dark .group-card {',
      '  background-color: transparent !important;',
      '  border: 1px solid rgba(255, 255, 255, 0.12) !important;',
      '}',
      'html.theme-dark .group-cover {',
      '  background-color: transparent !important;',
      '}',
      /* 比赛列表项（加圆角，匹配含 .contest-main 的 li） */
      'li:has(.contest-main) {',
      '  border-radius: 12px !important;',
      '  overflow: hidden !important;',
      '}',
      /* 主题切换按钮（圆形，仅留一圈亚克力边框） */
      '.theme-toggle {',
      '  border-color: rgba(255, 255, 255, 0.5) !important;',
      '}',
      'html.theme-dark .theme-toggle {',
      '  border-color: rgba(255, 255, 255, 0.12) !important;',
      '}',
      /* 步骤卡片 step-card（透明透出背景 + 亚克力边框） */
      '.step-card {',
      '  background: transparent !important;',
      '  border-color: rgba(255, 255, 255, 0.5) !important;',
      '}',
      'html.theme-dark .step-card {',
      '  background: transparent !important;',
      '  border-color: rgba(255, 255, 255, 0.12) !important;',
      '}',
      /* AI 教练主卡片 coach-hero（去掉品牌紫，透明透出背景 + 亚克力边框） */
      '.coach-hero {',
      '  background: transparent !important;',
      '  border: 1px solid rgba(255, 255, 255, 0.4) !important;',
      '}',
      /* 输入栏 hero-input-wrap（半透明白 + 毛玻璃） */
      '.hero-input-wrap {',
      '  background-color: transparent !important;',
      '}',
      'html.theme-dark .hero-input-wrap {',
      '  background-color: transparent !important;',
      '}',
      /* 输入框内部透明（暗色下 el-input__inner 有 var(--surface-2) 深色背景） */
      '.hero-input .el-input__inner {',
      '  background-color: transparent !important;',
      '}',
      /* 横向横幅 cross-banner（已有 12px 圆角，补半透明背景 + 亚克力边框） */
      '.cross-banner {',
      '  background: transparent !important;',
      '  border: 1px solid rgba(255, 255, 255, 0.5) !important;',
      '}',
      'html.theme-dark .cross-banner {',
      '  background: transparent !important;',
      '  border: 1px solid rgba(255, 255, 255, 0.12) !important;',
      '}',
      /* 难度等级卡片 level-card（内联彩色渐变改为透明 + 亚克力边框，用 !important 覆盖内联 style） */
      '.level-card {',
      '  background: transparent !important;',
      '  border: 1px solid rgba(255, 255, 255, 0.4) !important;',
      '}',
      /* 筛选标签 f-chip（半透明背景 + 亚克力边框，选中态保持蓝色） */
      '.f-chip {',
      '  background-color: transparent !important;',
      '  border-color: rgba(255, 255, 255, 0.5) !important;',
      '}',
      'html.theme-dark .f-chip {',
      '  background-color: transparent !important;',
      '  border-color: rgba(255, 255, 255, 0.12) !important;',
      '}',
      /* 知识点标签 k-chip（半透明背景） */
      '.k-chip {',
      '  background-color: transparent !important;',
      '}',
      'html.theme-dark .k-chip {',
      '  background-color: transparent !important;',
      '}',
      /* 关键词输入框 kw-input（半透明背景 + 亚克力边框） */
      '.kw-input .el-input__inner {',
      '  background-color: transparent !important;',
      '  border-color: rgba(255, 255, 255, 0.5) !important;',
      '}',
      'html.theme-dark .kw-input .el-input__inner {',
      '  background-color: transparent !important;',
      '  border-color: rgba(255, 255, 255, 0.12) !important;',
      '}',
      /* 随机跳题按钮（半透明背景 + 亚克力边框） */
      '.random-jump-btn {',
      '  background-color: transparent !important;',
      '  border-color: rgba(255, 255, 255, 0.5) !important;',
      '}',
      'html.theme-dark .random-jump-btn {',
      '  background-color: transparent !important;',
      '  border-color: rgba(255, 255, 255, 0.12) !important;',
      '}',
      /* 知识点搜索下拉框 k-search（半透明背景，保留虚线边框仅改颜色） */
      '.k-search .el-input__inner {',
      '  background-color: transparent !important;',
      '  border-color: rgba(255, 255, 255, 0.5) !important;',
      '}',
      'html.theme-dark .k-search .el-input__inner {',
      '  background-color: transparent !important;',
      '  border-color: rgba(255, 255, 255, 0.12) !important;',
      '}',
      /* 下拉面板（el-select 弹出选项框，半透明 + 毛玻璃） */
      '.el-select-dropdown {',
      '  background-color: transparent !important;',
      '  border-color: rgba(255, 255, 255, 0.5) !important;',
      '}',
      'html.theme-dark .el-select-dropdown {',
      '  background-color: transparent !important;',
      '  border-color: rgba(255, 255, 255, 0.12) !important;',
      '}',
      /* 题目表格 vxe-table：透明，透出页面背景渐变 + backdrop-filter 亚克力。
         不再给各层叠深色 tint（多层 rgba 叠加会变实心深黑，遮住背景光晕）。 */
      '.vxe-table--render-default,',
      '.vxe-table--render-default .vxe-table--body-wrapper,',
      '.vxe-table--render-default .vxe-table--header-wrapper,',
      '.vxe-table--render-default .vxe-body--row,',
      '.vxe-table--render-default .vxe-header--column {',
      '  background: transparent !important;',
      '}',
      /* 覆盖 vxe 默认 border 变体的 header-wrapper 背景（#f8f8f9/#fff，特异性 0,3,0） */
      '.vxe-table--render-default.border--default .vxe-table--header-wrapper,',
      '.vxe-table--render-default.border--full .vxe-table--header-wrapper,',
      '.vxe-table--render-default.border--outer .vxe-table--header-wrapper,',
      '.vxe-table--render-default.border--inner .vxe-table--header-wrapper {',
      '  background: transparent !important;',
      '}',
      /* 暗色：同样透明，覆盖网站 surface/surface-2 背景，让暗色背景光晕透出 */
      'html.theme-dark .vxe-table--render-default,',
      'html.theme-dark .vxe-table--render-default .vxe-table--body-wrapper,',
      'html.theme-dark .vxe-table--render-default .vxe-table--header-wrapper,',
      'html.theme-dark .vxe-table--render-default .vxe-body--row,',
      'html.theme-dark .vxe-table--render-default .vxe-header--column {',
      '  background: transparent !important;',
      '}',
      /* Element UI 表格 el-table（余额变动记录等）：容器透明化 + 亚克力边框，内部各层透明透出容器玻璃色 */
      '.el-table {',
      '  background: transparent !important;',
      '  border: 1px solid rgba(255, 255, 255, 0.5) !important;',
      '  border-radius: 12px !important;',
      '}',
      '.el-table .el-table__header-wrapper,',
      '.el-table .el-table__header,',
      '.el-table thead,',
      '.el-table .el-table__body-wrapper,',
      '.el-table .el-table__body,',
      '.el-table tr,',
      '.el-table th.el-table__cell,',
      '.el-table td.el-table__cell,',
      '.el-table .el-table__header-wrapper thead th.el-table__cell {',
      '  background: transparent !important;',
      '}',
      '.el-table--enable-row-hover .el-table__body tr:hover > td.el-table__cell {',
      '  background: transparent !important;',
      '}',
      'html.theme-dark .el-table {',
      '  background: transparent !important;',
      '  border: 1px solid rgba(255, 255, 255, 0.12) !important;',
      '}',
      'html.theme-dark .el-table .el-table__header-wrapper,',
      'html.theme-dark .el-table .el-table__header,',
      'html.theme-dark .el-table thead,',
      'html.theme-dark .el-table .el-table__body-wrapper,',
      'html.theme-dark .el-table .el-table__body,',
      'html.theme-dark .el-table tr,',
      'html.theme-dark .el-table th.el-table__cell,',
      'html.theme-dark .el-table td.el-table__cell,',
      'html.theme-dark .el-table .el-table__header-wrapper thead th.el-table__cell {',
      '  background: transparent !important;',
      '}',
      'html.theme-dark .el-table--enable-row-hover .el-table__body tr:hover > td.el-table__cell {',
      '  background: transparent !important;',
      '}',
      /* el-slider 滑块：轨道 runway 完全透明（去掉黑色背景条） */
      '.el-slider__runway {',
      '  background: transparent !important;',
      '}',
      'html.theme-dark .el-slider__runway {',
      '  background: transparent !important;',
      '}',
      /* 滑块按钮：玻璃珠效果（半透明 + 左上高光 + 玻璃边缘 + 立体阴影） */
      'html .el-slider .el-slider__button {',
      '  background:',
      '    radial-gradient(circle at 32% 28%, rgba(255, 255, 255, 0.95) 0%, rgba(255, 255, 255, 0.30) 40%, rgba(255, 255, 255, 0.06) 58%, rgba(255, 255, 255, 0) 78%),',
      '    rgba(255, 255, 255, 0.40) !important;',
      '  border: 1.5px solid rgba(255, 255, 255, 0.75) !important;',
      '  box-shadow: 0 3px 8px rgba(0, 0, 0, 0.22), inset 0 -2px 4px rgba(0, 0, 0, 0.08) !important;',
      '}',
      'html.theme-dark .el-slider .el-slider__button {',
      '  background:',
      '    radial-gradient(circle at 32% 28%, rgba(255, 255, 255, 0.9) 0%, rgba(255, 255, 255, 0.22) 40%, rgba(255, 255, 255, 0.05) 58%, rgba(255, 255, 255, 0) 78%),',
      '    rgba(255, 255, 255, 0.16) !important;',
      '  border: 1.5px solid rgba(255, 255, 255, 0.35) !important;',
      '  box-shadow: 0 3px 10px rgba(0, 0, 0, 0.5), inset 0 -2px 5px rgba(0, 0, 0, 0.25) !important;',
      '}',
      /* 滑块进度条：玻璃棒（映出背景色：主体更透明 + backdrop-filter 毛玻璃 + 去内阴影） */
      'html .el-slider .el-slider__bar {',
      '  background:',
      '    linear-gradient(180deg, rgba(255, 255, 255, 0.65) 0%, rgba(255, 255, 255, 0.18) 28%, rgba(255, 255, 255, 0) 46%, rgba(255, 255, 255, 0) 100%),',
      '    rgba(255, 255, 255, 0.18) !important;',
      '  -webkit-backdrop-filter: blur(5px) saturate(160%);',
      '  backdrop-filter: blur(5px) saturate(160%);',
      '  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.14) !important;',
      '}',
      'html.theme-dark .el-slider .el-slider__bar {',
      '  background:',
      '    linear-gradient(180deg, rgba(255, 255, 255, 0.55) 0%, rgba(255, 255, 255, 0.14) 28%, rgba(255, 255, 255, 0) 46%, rgba(255, 255, 255, 0) 100%),',
      '    rgba(255, 255, 255, 0.08) !important;',
      '  -webkit-backdrop-filter: blur(5px) saturate(160%);',
      '  backdrop-filter: blur(5px) saturate(160%);',
      '  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.28) !important;',
      '}',
      /* el-tag--dark 深色标签（倒计时等，无内联 style）：与其他卡片一致的亚克力。
         排除所有带内联 style 的 el-tag--dark（用户头衔、提交状态等彩色语义标签），
         那些只用圆角、保留内联彩色背景，不透明/不亚克力 */
      '.el-tag--dark:not([style]) {',
      '  background-color: transparent !important;',
      '  border-color: rgba(255, 255, 255, 0.5) !important;',
      '  -webkit-backdrop-filter: blur(8px) saturate(160%);',
      '  backdrop-filter: blur(8px) saturate(160%);',
      '}',
      'html.theme-dark .el-tag--dark:not([style]) {',
      '  background-color: transparent !important;',
      '  border-color: rgba(255, 255, 255, 0.12) !important;',
      '  -webkit-backdrop-filter: blur(8px) saturate(160%);',
      '  backdrop-filter: blur(8px) saturate(160%);',
      '}',
      /* 带内联彩色背景的 el-tag--dark（用户头衔「神犇/DALAO」、提交状态「Accepted」等）：
         只用圆角，保留内联彩色背景，不透明/不亚克力 */
      '.el-tag--dark[style] {',
      '  border-radius: 999px !important;',
      '}',
      /* AI 教练横幅 ai-banner：完全透明透出背景 + 毛玻璃（不保留品牌紫） */
      '.ai-banner {',
      '  background: transparent !important;',
      '  box-shadow: 0 6px 22px rgba(0, 0, 0, 0.12) !important;',
      '  -webkit-backdrop-filter: blur(12px) saturate(160%);',
      '  backdrop-filter: blur(12px) saturate(160%);',
      '}',
      'html.theme-dark .ai-banner {',
      '  background: transparent !important;',
      '  -webkit-backdrop-filter: blur(12px) saturate(160%);',
      '  backdrop-filter: blur(12px) saturate(160%);',
      '}',
      /* 代码编辑器工具栏（语言选择输入框 + 按钮 + 设置弹窗） */
      '.left-adjust .el-input__inner, #js-right-header .el-button, .el-popover {',
      '  background-color: transparent !important;',
      '  border-color: rgba(255, 255, 255, 0.5) !important;',
      '}',
      'html.theme-dark .left-adjust .el-input__inner, html.theme-dark #js-right-header .el-button, html.theme-dark .el-popover {',
      '  background-color: transparent !important;',
      '  border-color: rgba(255, 255, 255, 0.12) !important;',
      '}',
      /* 提交记录筛选栏：搜索框 vxe-input */
      '.vxe-input--inner {',
      '  background-color: transparent !important;',
      '  border-color: rgba(255, 255, 255, 0.5) !important;',
      '}',
      'html.theme-dark .vxe-input--inner {',
      '  background-color: transparent !important;',
      '  border-color: rgba(255, 255, 255, 0.12) !important;',
      '}',
      /* 状态下拉菜单 el-dropdown-menu（弹出浮层） */
      '.el-dropdown-menu {',
      '  background-color: transparent !important;',
      '  border-color: rgba(255, 255, 255, 0.5) !important;',
      '}',
      'html.theme-dark .el-dropdown-menu {',
      '  background-color: transparent !important;',
      '  border-color: rgba(255, 255, 255, 0.12) !important;',
      '}',
      /* 开关 el-switch：未选中态半透明，选中态保留品牌色 */
      '.el-switch__core {',
      '  background-color: rgba(220, 223, 230, ' + a + ') !important;',
      '  border-color: rgba(255, 255, 255, 0.5) !important;',
      '}',
      'html.theme-dark .el-switch__core {',
      '  border-color: rgba(255, 255, 255, 0.12) !important;',
      '}',
      /* 回到顶部按钮 el-backtop（圆形，加半透明背景 + 亚克力边框） */
      '.el-backtop {',
      '  background-color: transparent !important;',
      '  border: 1px solid rgba(255, 255, 255, 0.5) !important;',
      '}',
      'html.theme-dark .el-backtop {',
      '  background-color: transparent !important;',
      '  border: 1px solid rgba(255, 255, 255, 0.12) !important;',
      '}',
      /* 商城按钮 topbar-shop（胶囊形，透明背景 + 亚克力边框） */
      '.topbar-shop {',
      '  background: transparent !important;',
      '  border: 1px solid rgba(255, 255, 255, 0.5) !important;',
      '}',
      'html.theme-dark .topbar-shop {',
      '  background: transparent !important;',
      '  border: 1px solid rgba(255, 255, 255, 0.12) !important;',
      '}',
      /* 个人主页 hero 卡片 uh-hero（带极光层，半透明背景 + 亚克力边框，圆角 22px 同站） */
      '.uh-hero {',
      '  background-color: transparent !important;',
      '  border-color: rgba(255, 255, 255, 0.5) !important;',
      '  border-radius: 22px !important;',
      '}',
      'html.theme-dark .uh-hero {',
      '  background-color: transparent !important;',
      '  border-color: rgba(255, 255, 255, 0.12) !important;',
      '}',
      /* KPI 容器 uh-kpis（整条渐变背景，改半透明 + 亚克力边框） */
      '.uh-kpis {',
      '  background: transparent !important;',
      '  border-top-color: rgba(255, 255, 255, 0.5) !important;',
      '}',
      'html.theme-dark .uh-kpis {',
      '  background: transparent !important;',
      '  border-top-color: rgba(255, 255, 255, 0.12) !important;',
      '}',
      /* 信息标签 uh-chip（胶囊形，普通浅灰 / coin 金色，加半透明背景 + 亚克力边框） */
      '.uh-chip {',
      '  background-color: transparent !important;',
      '  border-color: rgba(255, 255, 255, 0.5) !important;',
      '}',
      'html.theme-dark .uh-chip {',
      '  background-color: transparent !important;',
      '  border-color: rgba(255, 255, 255, 0.12) !important;',
      '}',
      /* coin 类型保留金色调 */
      '.uh-chip.coin {',
      '  background-color: rgba(255, 250, 240, ' + a + ') !important;',
      '  border-color: rgba(246, 226, 184, 0.8) !important;',
      '}',
      'html.theme-dark .uh-chip.coin {',
      '  background-color: transparent !important;',
      '  border-color: rgba(255, 255, 255, 0.12) !important;',
      '}',
      /* 徽章条 series-strip（容器，渐变背景改半透明 + 亚克力边框） */
      '.series-strip {',
      '  background: transparent !important;',
      '  border-color: rgba(255, 255, 255, 0.5) !important;',
      '}',
      'html.theme-dark .series-strip {',
      '  background: transparent !important;',
      '  border-color: rgba(255, 255, 255, 0.12) !important;',
      '}',
      /* 徽章卡片 badge-cell（基础/locked 态，半透明背景 + 亚克力边框） */
      '.badge-cell {',
      '  background: transparent !important;',
      '  border-color: rgba(255, 255, 255, 0.5) !important;',
      '}',
      'html.theme-dark .badge-cell {',
      '  background: transparent !important;',
      '  border-color: rgba(255, 255, 255, 0.12) !important;',
      '}',
      /* earned 态：保留顶部彩色光晕，底层半透明 */
      '.badge-cell.earned {',
      '  background: radial-gradient(circle at 50% 17%, var(--badge-soft) 0, transparent 46%), transparent !important;',
      '}',
      'html.theme-dark .badge-cell.earned {',
      '  background: radial-gradient(circle at 50% 17%, var(--badge-soft) 0, transparent 46%), transparent !important;',
      '}',
      /* 差一道就升档 提示条 st-nudge（渐变背景改半透明 + 亚克力边框） */
      '.st-nudge {',
      '  background: transparent !important;',
      '  border-color: rgba(255, 255, 255, 0.5) !important;',
      '}',
      'html.theme-dark .st-nudge {',
      '  background: transparent !important;',
      '  border-color: rgba(255, 255, 255, 0.12) !important;',
      '}',
      /* 提示条内的 chip */
      '.st-nudge-chip {',
      '  background-color: transparent !important;',
      '  border-color: rgba(255, 255, 255, 0.5) !important;',
      '}',
      'html.theme-dark .st-nudge-chip {',
      '  background-color: transparent !important;',
      '  border-color: rgba(255, 255, 255, 0.12) !important;',
      '}',
      /* 题号面板 pid-panel（容器，半透明背景 + 亚克力边框） */
      '.pid-panel {',
      '  background-color: transparent !important;',
      '  border-color: rgba(255, 255, 255, 0.5) !important;',
      '}',
      'html.theme-dark .pid-panel {',
      '  background-color: transparent !important;',
      '  border-color: rgba(255, 255, 255, 0.12) !important;',
      '}',
      /* 题号标签 pid（保留左侧难度色竖条，只改其余三边和背景） */
      '.pid {',
      '  background-color: transparent !important;',
      '  border-top-color: rgba(255, 255, 255, 0.5) !important;',
      '  border-right-color: rgba(255, 255, 255, 0.5) !important;',
      '  border-bottom-color: rgba(255, 255, 255, 0.5) !important;',
      '}',
      'html.theme-dark .pid {',
      '  background-color: transparent !important;',
      '  border-top-color: rgba(255, 255, 255, 0.12) !important;',
      '  border-right-color: rgba(255, 255, 255, 0.12) !important;',
      '  border-bottom-color: rgba(255, 255, 255, 0.12) !important;',
      '}',
      /* 搜题号输入框 pid-search */
      '.pid-search .el-input__inner {',
      '  background-color: transparent !important;',
      '  border-color: rgba(255, 255, 255, 0.5) !important;',
      '}',
      'html.theme-dark .pid-search .el-input__inner {',
      '  background-color: transparent !important;',
      '  border-color: rgba(255, 255, 255, 0.12) !important;',
      '}',
      /* 学习路线图 rm-card（保留顶部彩色 accent 条，半透明背景 + 三边亚克力边框） */
      '.rm-card {',
      '  background-color: transparent !important;',
      '  border-left-color: rgba(255, 255, 255, 0.5) !important;',
      '  border-right-color: rgba(255, 255, 255, 0.5) !important;',
      '  border-bottom-color: rgba(255, 255, 255, 0.5) !important;',
      '}',
      'html.theme-dark .rm-card {',
      '  background-color: transparent !important;',
      '  border-left-color: rgba(255, 255, 255, 0.12) !important;',
      '  border-right-color: rgba(255, 255, 255, 0.12) !important;',
      '  border-bottom-color: rgba(255, 255, 255, 0.12) !important;',
      '}',
      /* is-active 态：保留选中紫色边框，只把渐变背景改半透明 */
      '.rm-card.is-active {',
      '  background: transparent !important;',
      '  border-left-color: var(--rm-accent) !important;',
      '  border-right-color: var(--rm-accent) !important;',
      '  border-bottom-color: var(--rm-accent) !important;',
      '}',
      'html.theme-dark .rm-card.is-active {',
      '  background: transparent !important;',
      '  border-left-color: var(--rm-accent) !important;',
      '  border-right-color: var(--rm-accent) !important;',
      '  border-bottom-color: var(--rm-accent) !important;',
      '}',
      /* 伴学页 hero 横幅 th-hero（去掉品牌紫，透明透出背景 + 亚克力边框） */
      '.th-hero {',
      '  background: transparent !important;',
      '  border: 1px solid rgba(255, 255, 255, 0.4) !important;',
      '}',
      'html.theme-dark .th-hero {',
      '  background: transparent !important;',
      '  border: 1px solid rgba(255, 255, 255, 0.4) !important;',
      '}',
      /* 伴学页 hero CTA 按钮（"从 C++ 开始"，原白底紫字，改半透明 + 亚克力边框） */
      '.th-hero-cta .el-button--primary {',
      '  background-color: transparent !important;',
      '  border-color: rgba(255, 255, 255, 0.6) !important;',
      '}',
      'html.theme-dark .th-hero-cta .el-button--primary {',
      '  background-color: transparent !important;',
      '  border-color: rgba(255, 255, 255, 0.15) !important;',
      '}',
      /* 伴学页阶段卡片 lv-card（内联彩色渐变改为透明 + 亚克力边框，用 !important 覆盖内联 style） */
      '.lv-card {',
      '  background: transparent !important;',
      '  border: 1px solid rgba(255, 255, 255, 0.4) !important;',
      '  box-sizing: border-box !important;',
      '}',
      /* 伴学页课程卡片 co-card（半透明背景 + 亚克力边框） */
      '.co-card {',
      '  background-color: transparent !important;',
      '  border-color: rgba(255, 255, 255, 0.5) !important;',
      '}',
      '.co-cover {',
      '  background-color: transparent !important;',
      '}',
      'html.theme-dark .co-card {',
      '  background-color: transparent !important;',
      '  border-color: rgba(255, 255, 255, 0.12) !important;',
      '}',
      'html.theme-dark .co-cover {',
      '  background-color: transparent !important;',
      '}',
      /* 商城商品卡片 goods-card（半透明背景 + 亚克力边框） */
      '.goods-card {',
      '  background-color: transparent !important;',
      '  border: 1px solid rgba(255, 255, 255, 0.5) !important;',
      '}',
      '.goods-thumb {',
      '  background-color: transparent !important;',
      '}',
      'html.theme-dark .goods-card {',
      '  background-color: transparent !important;',
      '  border: 1px solid rgba(255, 255, 255, 0.12) !important;',
      '}',
      'html.theme-dark .goods-thumb {',
      '  background-color: transparent !important;',
      '}',
      /* 商城分类标签 cate-chip（半透明背景 + 亚克力边框，active 保留蓝色） */
      '.cate-chip {',
      '  background-color: transparent !important;',
      '  border-color: rgba(255, 255, 255, 0.5) !important;',
      '}',
      'html.theme-dark .cate-chip {',
      '  background-color: transparent !important;',
      '  border-color: rgba(255, 255, 255, 0.12) !important;',
      '}',
      /* 商城顶部 hero shop-hero（去掉品牌紫，透明透出背景 + 亚克力边框） */
      '.shop-hero {',
      '  background: transparent !important;',
      '  border: 1px solid rgba(255, 255, 255, 0.4) !important;',
      '}',
      'html.theme-dark .shop-hero {',
      '  background: transparent !important;',
      '  border: 1px solid rgba(255, 255, 255, 0.4) !important;',
      '}',
      /* IntenseTraining 顶部 hero（去掉浅蓝紫渐变，透明透出背景 + 亚克力边框） */
      '.hero {',
      '  background: transparent !important;',
      '  border: 1px solid rgba(255, 255, 255, 0.5) !important;',
      '}',
      'html.theme-dark .hero {',
      '  background: transparent !important;',
      '  border: 1px solid rgba(255, 255, 255, 0.12) !important;',
      '}',
      /* 训练卡片 training-card（半透明背景 + 亚克力边框，保留顶部 accent 条） */
      '.training-card {',
      '  background-color: transparent !important;',
      '  border-color: rgba(255, 255, 255, 0.5) !important;',
      '}',
      'html.theme-dark .training-card {',
      '  background-color: transparent !important;',
      '  border-color: rgba(255, 255, 255, 0.12) !important;',
      '}',
      /* hero 里的标签 chip */
      '.hero-chip {',
      '  background-color: transparent !important;',
      '  border-color: rgba(255, 255, 255, 0.5) !important;',
      '}',
      'html.theme-dark .hero-chip {',
      '  background-color: transparent !important;',
      '  border-color: rgba(255, 255, 255, 0.12) !important;',
      '}',
      /* 学习路径步骤条 pathway-inner（半透明背景 + 亚克力边框） */
      '.pathway-inner {',
      '  background-color: transparent !important;',
      '  border-color: rgba(255, 255, 255, 0.5) !important;',
      '}',
      'html.theme-dark .pathway-inner {',
      '  background-color: transparent !important;',
      '  border-color: rgba(255, 255, 255, 0.12) !important;',
      '}',
      /* 创意工坊 hero ws-hero（去掉品牌紫，透明透出背景 + 亚克力边框） */
      '.ws-hero {',
      '  background: transparent !important;',
      '  border: 1px solid rgba(255, 255, 255, 0.4) !important;',
      '}',
      'html.theme-dark .ws-hero {',
      '  background: transparent !important;',
      '  border: 1px solid rgba(255, 255, 255, 0.4) !important;',
      '}',
      /* 创意工坊卡片 ws-card / ws-step（半透明背景 + 亚克力边框） */
      '.ws-card, .ws-step {',
      '  background-color: transparent !important;',
      '  border-color: rgba(255, 255, 255, 0.5) !important;',
      '}',
      'html.theme-dark .ws-card, html.theme-dark .ws-step {',
      '  background-color: transparent !important;',
      '  border-color: rgba(255, 255, 255, 0.12) !important;',
      '}',
      /* ws-how-item（去掉浅紫白/深紫背景，透明透出背景） */
      '.ws-how-item {',
      '  background: transparent !important;',
      '  border-color: rgba(255, 255, 255, 0.5) !important;',
      '}',
      'html.theme-dark .ws-how-item {',
      '  background: transparent !important;',
      '  border-color: rgba(255, 255, 255, 0.12) !important;',
      '}',
      /* ws-editor（边框亚克力，头部背景透明） */
      '.ws-editor {',
      '  border-color: rgba(255, 255, 255, 0.5) !important;',
      '}',
      '.ws-editor-head {',
      '  background-color: transparent !important;',
      '}',
      'html.theme-dark .ws-editor {',
      '  border-color: rgba(255, 255, 255, 0.12) !important;',
      '}',
      'html.theme-dark .ws-editor-head {',
      '  background-color: transparent !important;',
      '}',
      /* 集训队：查看大纲按钮 card-btn + 数字序号 path-index（去掉蓝紫渐变，透明 + 亚克力边框） */
      '.card-btn, .path-index {',
      '  background: transparent !important;',
      '  border: 1px solid rgba(255, 255, 255, 0.4) !important;',
      '}',
      'html.theme-dark .card-btn, html.theme-dark .path-index {',
      '  background: transparent !important;',
      '  border: 1px solid rgba(255, 255, 255, 0.4) !important;',
      '}',
      /* Group 我的班级按钮（el-button--warning，透明 + 亚克力边框） */
      '.find-group ~ .el-button--warning {',
      '  background: transparent !important;',
      '  border-color: rgba(255, 255, 255, 0.5) !important;',
      '}',
      'html.theme-dark .find-group ~ .el-button--warning {',
      '  background: transparent !important;',
      '  border-color: rgba(255, 255, 255, 0.12) !important;',
      '}',
      /* 顶栏消息图标 drop-msg（圆形透明按钮 + 亚克力边框） */
      '.drop-msg .el-dropdown-link {',
      '  width: 34px !important;',
      '  height: 34px !important;',
      '  margin-top: 13px !important;',
      '  justify-content: center !important;',
      '  border-radius: 50% !important;',
      '  background: transparent !important;',
      '  border: 1px solid rgba(255, 255, 255, 0.5) !important;',
      '}',
      'html.theme-dark .drop-msg .el-dropdown-link {',
      '  background: transparent !important;',
      '  border: 1px solid rgba(255, 255, 255, 0.12) !important;',
      '}',
      /* 创意工坊：AI起草题目按钮 ws-primary + 图标 ws-chip + 步骤圆形图标 ws-how-icon（去掉品牌紫，透明 + 亚克力边框） */
      '.ws-primary, .ws-chip, .ws-how-icon {',
      '  background: transparent !important;',
      '  border: 1px solid rgba(255, 255, 255, 0.4) !important;',
      '}',
      'html.theme-dark .ws-primary, html.theme-dark .ws-chip, html.theme-dark .ws-how-icon {',
      '  background: transparent !important;',
      '  border: 1px solid rgba(255, 255, 255, 0.4) !important;',
      '}',
      /* 创意工坊步骤数字圆点 ws-step-dot（默认半透明 + 亚克力边框） */
      '.ws-step-dot {',
      '  background-color: transparent !important;',
      '  border: 1px solid rgba(255, 255, 255, 0.5) !important;',
      '}',
      'html.theme-dark .ws-step-dot {',
      '  background-color: transparent !important;',
      '  border: 1px solid rgba(255, 255, 255, 0.12) !important;',
      '}',
      /* active 态：半透明紫渐变（保留紫色选中标识） */
      '.ws-step.active .ws-step-dot {',
      '  background: linear-gradient(135deg, rgba(91, 78, 232, ' + a + '), rgba(123, 92, 240, ' + a + ')) !important;',
      '  border: 1px solid rgba(255, 255, 255, 0.4) !important;',
      '  color: #fff !important;',
      '}',
      'html.theme-dark .ws-step.active .ws-step-dot {',
      '  background: linear-gradient(135deg, rgba(91, 78, 232, ' + a + '), rgba(123, 92, 240, ' + a + ')) !important;',
      '  border: 1px solid rgba(255, 255, 255, 0.4) !important;',
      '  color: #fff !important;',
      '}',
      /* done 态：半透明绿（保留完成标识） */
      '.ws-step.done .ws-step-dot {',
      '  background: rgba(87, 194, 125, ' + a + ') !important;',
      '  border: 1px solid rgba(255, 255, 255, 0.4) !important;',
      '  color: #fff !important;',
      '}',
      'html.theme-dark .ws-step.done .ws-step-dot {',
      '  background: rgba(87, 194, 125, ' + a + ') !important;',
      '  border: 1px solid rgba(255, 255, 255, 0.4) !important;',
      '  color: #fff !important;',
      '}',
      /* 关于与帮助页：白底卡片（半透明背景 + 亚克力边框） */
      '.glossary-card, .help-section, .dimension-card, .rated-card, .hub-tab, .help-nav-item {',
      '  background-color: transparent !important;',
      '  border-color: rgba(255, 255, 255, 0.5) !important;',
      '}',
      'html.theme-dark .glossary-card, html.theme-dark .help-section, html.theme-dark .dimension-card, html.theme-dark .rated-card, html.theme-dark .hub-tab, html.theme-dark .help-nav-item {',
      '  background-color: transparent !important;',
      '  border-color: rgba(255, 255, 255, 0.12) !important;',
      '}',
      /* 关于页渐变卡片 rating-adjust-card（渐变 #fbfcff→surface 改半透明） */
      '.rating-adjust-card {',
      '  background: transparent !important;',
      '  border-color: rgba(255, 255, 255, 0.5) !important;',
      '}',
      'html.theme-dark .rating-adjust-card {',
      '  background: transparent !important;',
      '  border-color: rgba(255, 255, 255, 0.12) !important;',
      '}',
      /* 关于页状态卡 status-card（保留 status 渐变与竖条，仅亚克力边框） */
      '.status-card {',
      '  border-color: rgba(255, 255, 255, 0.5) !important;',
      '}',
      'html.theme-dark .status-card {',
      '  border-color: rgba(255, 255, 255, 0.12) !important;',
      '}',
      /* 关于页 hero 横幅 help-hero（保留紫色 radial 光晕，底渐变改半透明） */
      '.help-hero {',
      '  background:',
      '    radial-gradient(760px 340px at 94% -20%, rgba(124, 58, 237, 0.18), transparent 62%),',
      '    radial-gradient(620px 320px at 2% 118%, rgba(79, 70, 229, 0.14), transparent 60%),',
      '    linear-gradient(135deg, rgba(255, 255, 255, ' + a + '), rgba(248, 248, 255, ' + a + ')) !important;',
      '  border-color: rgba(255, 255, 255, 0.5) !important;',
      '}',
      'html.theme-dark .help-hero {',
      '  background:',
      '    radial-gradient(760px 340px at 94% -20%, rgba(124, 58, 237, 0.18), transparent 62%),',
      '    radial-gradient(620px 320px at 2% 118%, rgba(79, 70, 229, 0.14), transparent 60%),',
      '    linear-gradient(135deg, rgba(23, 26, 36, ' + a + '), rgba(35, 35, 55, ' + a + ')) !important;',
      '  border-color: rgba(255, 255, 255, 0.12) !important;',
      '}',
      /* 关于页目录栏 help-toc（原 hsla 白 0.88，改跟随透明度） */
      '.help-toc {',
      '  background: transparent !important;',
      '  border-color: rgba(255, 255, 255, 0.5) !important;',
      '}',
      'html.theme-dark .help-toc {',
      '  background: transparent !important;',
      '  border-color: rgba(255, 255, 255, 0.12) !important;',
      '}',
      /* 关于页目录项 toc-item 激活态（去掉紫色渐变，改透明，靠文字色区分） */
      '.toc-item.is-active {',
      '  background: transparent !important;',
      '}',
      /* 关于页等级卡 tier-card / rating-tier-card（内联白渐变，改半透明跟随 alpha；保留 tier 色边框与圆点） */
      '.tier-card, .rating-tier-card {',
      '  background: transparent !important;',
      '}',
      'html.theme-dark .tier-card, html.theme-dark .rating-tier-card {',
      '  background: transparent !important;',
      '}',
      /* 关于页折叠状态卡 compact-status（白底 + 左侧 3px status 竖条，改半透明；保留竖条与 status 标签） */
      '.compact-status {',
      '  background-color: transparent !important;',
      '  border-color: rgba(255, 255, 255, 0.5) !important;',
      '}',
      'html.theme-dark .compact-status {',
      '  background-color: transparent !important;',
      '  border-color: rgba(255, 255, 255, 0.12) !important;',
      '}',
      /* 关于页综合分计算卡 score-formula（去掉品牌紫，透明透出背景 + 亚克力边框） */
      '.score-formula {',
      '  background: transparent !important;',
      '  border: 1px solid rgba(255, 255, 255, 0.4) !important;',
      '}',
      /* 关于页信用说明卡 credit-note（绿调渐变改半透明，保留绿色图标与文字） */
      '.credit-note {',
      '  background: transparent !important;',
      '  border-color: rgba(255, 255, 255, 0.5) !important;',
      '}',
      'html.theme-dark .credit-note {',
      '  background: transparent !important;',
      '  border-color: rgba(255, 255, 255, 0.12) !important;',
      '}',
      /* 关于页提示 callout help-callout（透明透出背景 + 亚克力边框，保留左侧品牌竖条） */
      '.help-callout {',
      '  background: transparent !important;',
      '  border-color: rgba(255, 255, 255, 0.5) !important;',
      '}',
      'html.theme-dark .help-callout {',
      '  background: transparent !important;',
      '  border-color: rgba(255, 255, 255, 0.12) !important;',
      '}',
      /* 关于页彩蛋 easter-egg（虚线边框 + 浅紫渐变改半透明，保留虚线边框） */
      '.easter-egg {',
      '  background: transparent !important;',
      '  border-color: rgba(255, 255, 255, 0.5) !important;',
      '}',
      'html.theme-dark .easter-egg {',
      '  background: transparent !important;',
      '  border-color: rgba(255, 255, 255, 0.12) !important;',
      '}',
      /* 关于页章节序号 section-index（去掉品牌紫，透明 + 亚克力边框） */
      '.section-index {',
      '  background: transparent !important;',
      '  border: 1px solid rgba(255, 255, 255, 0.4) !important;',
      '}',
      /* 分页器 pagination（页面选择，全站通用）：页码 + 上一页/下一页按钮透明（透出背景） */
      '.el-pagination.is-background .btn-prev, .el-pagination.is-background .btn-next, .el-pagination.is-background .el-pager li {',
      '  background: transparent !important;',
      '  border: 1px solid rgba(255, 255, 255, 0.5) !important;',
      '}',
      'html.theme-dark .el-pagination.is-background .btn-prev, html.theme-dark .el-pagination.is-background .btn-next, html.theme-dark .el-pagination.is-background .el-pager li {',
      '  background: transparent !important;',
      '  border: 1px solid rgba(255, 255, 255, 0.12) !important;',
      '}',
      /* 分页器激活页码（透明背景 + 蓝色文字/边框区分当前页） */
      '.el-pagination.is-background .el-pager li:not(.disabled).active {',
      '  background: transparent !important;',
      '  border: 1px solid rgba(64, 158, 255, 0.6) !important;',
      '  color: #409eff !important;',
      '}',
      'html.theme-dark .el-pagination.is-background .el-pager li:not(.disabled).active {',
      '  background: transparent !important;',
      '  border: 1px solid rgba(124, 140, 255, 0.6) !important;',
      '  color: #7c8cff !important;',
      '}',
      /* 分页器每页条数选择器：输入框透明 + 白边框（去掉黑/深色边框），下拉选项 hover 透明 */
      '.el-pagination .el-select .el-input__inner {',
      '  background: transparent !important;',
      '  border-color: rgba(255, 255, 255, 0.5) !important;',
      '}',
      'html.theme-dark .el-pagination .el-select .el-input__inner {',
      '  background: transparent !important;',
      '  border-color: rgba(255, 255, 255, 0.12) !important;',
      '}',
      '.el-select-dropdown__item.hover, .el-select-dropdown__item:hover {',
      '  background: transparent !important;',
      '}',
      /* 关于页步骤卡图标块 step-icon-wrap（透明 + 亚克力边框，保留紫色图标） */
      '.step-icon-wrap {',
      '  background: transparent !important;',
      '  border: 1px solid rgba(255, 255, 255, 0.5) !important;',
      '}',
      'html.theme-dark .step-icon-wrap {',
      '  background: transparent !important;',
      '  border: 1px solid rgba(255, 255, 255, 0.12) !important;',
      '}',
      /* 关于页步骤卡序号圆 step-no（透明 + 亚克力边框） */
      '.step-no {',
      '  background: transparent !important;',
      '  border-color: rgba(255, 255, 255, 0.5) !important;',
      '}',
      'html.theme-dark .step-no {',
      '  background: transparent !important;',
      '  border-color: rgba(255, 255, 255, 0.12) !important;',
      '}',
      /* 备赛页 hero 横幅 exam-hero（去掉品牌紫，透明透出背景 + 亚克力边框） */
      '.exam-hero {',
      '  background: transparent !important;',
      '  border: 1px solid rgba(255, 255, 255, 0.4) !important;',
      '}',
      /* 备赛页考试卡片 exam-card（白底改半透明 + 亚克力边框） */
      '.exam-card {',
      '  background: transparent !important;',
      '  border-color: rgba(255, 255, 255, 0.5) !important;',
      '}',
      'html.theme-dark .exam-card {',
      '  background: transparent !important;',
      '  border-color: rgba(255, 255, 255, 0.12) !important;',
      '}',
      /* 备赛页状态 chip exam-status（改半透明 + 用状态色边框区分） */
      '.exam-status {',
      '  background: transparent !important;',
      '  border: 1px solid currentColor !important;',
      '}',
      'html.theme-dark .exam-status {',
      '  background: transparent !important;',
      '  border: 1px solid currentColor !important;',
      '}',
      /* 备赛页分组计数胶囊 exam-group__count（改半透明 + 亚克力边框） */
      '.exam-group__count {',
      '  background: transparent !important;',
      '  border: 1px solid rgba(255, 255, 255, 0.5) !important;',
      '}',
      'html.theme-dark .exam-group__count {',
      '  background: transparent !important;',
      '  border: 1px solid rgba(255, 255, 255, 0.12) !important;',
      '}',
      /* 比赛题详情页：时间/空间限制框 question-intr（浅底 + 蓝色左边框，改半透明保留蓝条） */
      '.question-intr {',
      '  background: transparent !important;',
      '  border-color: rgba(255, 255, 255, 0.5) !important;',
      '  border-left: 2px solid #3498db !important;',
      '}',
      'html.theme-dark .question-intr {',
      '  background: transparent !important;',
      '  border-color: rgba(255, 255, 255, 0.12) !important;',
      '  border-left: 2px solid #3498db !important;',
      '}',
      /* 比赛题详情页：样例输入输出框 .example pre（浅灰底 + 虚线边框，改半透明） */
      '.example pre {',
      '  background: transparent !important;',
      '}',
      'html.theme-dark .example pre {',
      '  background: transparent !important;',
      '}',
      /* 比赛题详情页：复制Markdown按钮 #md-copy-btn（透明底 + 白色描边，与其他按钮一致） */
      '#md-copy-btn {',
      '  background: transparent !important;',
      '  border: 1px solid rgba(255, 255, 255, 0.5) !important;',
      '  border-radius: 6px !important;',
      '}',
      'html.theme-dark #md-copy-btn {',
      '  border-color: rgba(255, 255, 255, 0.12) !important;',
      '}',
      /* 文件 IO 弹层（el-popover）：复制Cpp格式按钮 xsoj-copy-cpp-btn（透明底 + 白色描边，与 #md-copy-btn 一致） */
      '.xsoj-copy-cpp-btn {',
      '  background: transparent !important;',
      '  border: 1px solid rgba(255, 255, 255, 0.5) !important;',
      '  border-radius: 6px !important;',
      '}',
      'html.theme-dark .xsoj-copy-cpp-btn {',
      '  border-color: rgba(255, 255, 255, 0.12) !important;',
      '}',
      /* 备份历史面板（编辑器自动保存扩展注入）：条目分隔线 + 按钮透明化（容器背景已纳入统一玻璃层 + blur） */
      '[data-backup-panel="1"] .bh-item {',
      '  border-bottom-color: rgba(0, 0, 0, 0.06) !important;',
      '}',
      'html.theme-dark [data-backup-panel="1"] .bh-item {',
      '  border-bottom-color: rgba(255, 255, 255, 0.08) !important;',
      '}',
      '[data-backup-panel="1"] .el-button--default {',
      '  background: transparent !important;',
      '  border-color: rgba(255, 255, 255, 0.5) !important;',
      '}',
      'html.theme-dark [data-backup-panel="1"] .el-button--default {',
      '  border-color: rgba(255, 255, 255, 0.12) !important;',
      '}',
      /* 题目详情页「你已经解决了该问题」提示 el-alert：缩小成紧凑标签（像 Accepted 状态标签，
         不撑满整列、去掉 28px 大图标和大内边距，避免在自测抽屉里挤压/遮挡按钮组） */
      '.el-alert--success.is-dark {',
      '  display: inline-flex !important;',
      '  width: auto !important;',
      '  max-width: 100% !important;',
      '  padding: 3px 12px !important;',
      '  border-radius: 999px !important;',
      '}',
      '.el-alert--success.is-dark .el-alert__icon {',
      '  font-size: 13px !important;',
      '  width: auto !important;',
      '  margin-right: 6px !important;',
      '}',
      '.el-alert--success.is-dark .el-alert__content {',
      '  display: block !important;',
      '  padding: 0 !important;',
      '}',
      '.el-alert--success.is-dark .el-alert__description {',
      '  margin: 0 !important;',
      '  font-size: 12px !important;',
      '  line-height: 1.5 !important;',
      '}',
      /* 编辑器自动保存扩展：自动备份下拉框 auto-backup-dropdown（透明 + 白色描边，与 el-select-dropdown 一致；
         容器已纳入统一玻璃层 + blur，此处覆盖原白底/深灰边框 + hover 去灰底；选中项蓝色文字保留）
         编辑器字体设置：font-dropdown / font-option 同规则 */
      '.auto-backup-dropdown, .font-dropdown {',
      '  background-color: transparent !important;',
      '  border-color: rgba(255, 255, 255, 0.5) !important;',
      '}',
      'html.theme-dark .auto-backup-dropdown, html.theme-dark .font-dropdown {',
      '  background-color: transparent !important;',
      '  border-color: rgba(255, 255, 255, 0.12) !important;',
      '}',
      '.auto-backup-option:hover, .font-option:hover {',
      '  background: transparent !important;',
      '}',
      'html.theme-dark .auto-backup-option:hover, html.theme-dark .font-option:hover {',
      '  background: transparent !important;',
      '}',
      /* 代码编辑器设置弹窗：各设置项折叠态输入框（主题/字体/Tab/自动备份下拉的 el-input__inner，显示「请选择」）
         透明化 + 白色描边，与展开的下拉列表一致 */
      '.setting-item-value .el-input__inner {',
      '  background: transparent !important;',
      '  border-color: rgba(255, 255, 255, 0.5) !important;',
      '}',
      'html.theme-dark .setting-item-value .el-input__inner {',
      '  background: transparent !important;',
      '  border-color: rgba(255, 255, 255, 0.12) !important;',
      '}',
      /* Markdown 表格（题目详情页数据范围/测试点表）：表头 th + 偶数行斑马纹透明化。
         容器是 class="hint-content markdown-body"，实际背景规则在 .hint-content table th / tr:nth-child(2n) */
      '.hint-content table th,',
      '.hint-content table tr:nth-child(2n),',
      '.markdown-body table th,',
      '.markdown-body table tr:nth-child(2n) {',
      '  background: transparent !important;',
      '}',
      /* 模态弹窗 el-dialog / el-message-box（白底改半透明 + 亚克力边框 + 毛玻璃） */
      '.el-dialog, .el-message-box {',
      '  background-color: transparent !important;',
      '  border-color: rgba(255, 255, 255, 0.5) !important;',
      '}',
      'html.theme-dark .el-dialog, html.theme-dark .el-message-box {',
      '  background-color: transparent !important;',
      '  border-color: rgba(255, 255, 255, 0.12) !important;',
      '}',
      /* AC 通过率进度条轨道 el-progress-bar__outer（浅灰轨改半透明；保留彩色填充条） */
      '.el-progress-bar__outer {',
      '  background-color: transparent !important;',
      '}',
      'html.theme-dark .el-progress-bar__outer {',
      '  background-color: transparent !important;',
      '}',
      /* 首页近期比赛卡片 cc-card（透明透出背景 + 亚克力边框） */
      '.cc-card {',
      '  background: transparent !important;',
      '  border-color: rgba(255, 255, 255, 0.5) !important;',
      '}',
      'html.theme-dark .cc-card {',
      '  background: transparent !important;',
      '  border-color: rgba(255, 255, 255, 0.12) !important;',
      '}',
      /* 比赛状态 pill cc-status-pill（透明背景 + 状态色边框区分） */
      '.cc-status-pill {',
      '  background: transparent !important;',
      '  border: 1px solid currentColor !important;',
      '}',
      'html.theme-dark .cc-status-pill {',
      '  background: transparent !important;',
      '  border: 1px solid currentColor !important;',
      '}',
      /* 比赛标签 cc-pill（私有赛/OI 等，透明背景 + 标签色边框区分） */
      '.cc-pill {',
      '  background: transparent !important;',
      '  border: 1px solid currentColor !important;',
      '}',
      'html.theme-dark .cc-pill {',
      '  background: transparent !important;',
      '  border: 1px solid currentColor !important;',
      '}',
      /* 比赛进度条：轨道透明 + 进度条透明玻璃棒（跟 slider 一致，去掉灰色轨道和绿色填充） */
      '.cc-progress {',
      '  background: transparent !important;',
      '}',
      'html.theme-dark .cc-progress {',
      '  background: transparent !important;',
      '}',
      '.cc-progress-bar {',
      '  background:',
      '    linear-gradient(180deg, rgba(255, 255, 255, 0.65) 0%, rgba(255, 255, 255, 0.18) 28%, rgba(255, 255, 255, 0) 46%, rgba(255, 255, 255, 0) 100%),',
      '    rgba(255, 255, 255, 0.18) !important;',
      '  -webkit-backdrop-filter: blur(5px) saturate(160%);',
      '  backdrop-filter: blur(5px) saturate(160%);',
      '  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.14) !important;',
      '}',
      'html.theme-dark .cc-progress-bar {',
      '  background:',
      '    linear-gradient(180deg, rgba(255, 255, 255, 0.55) 0%, rgba(255, 255, 255, 0.14) 28%, rgba(255, 255, 255, 0) 46%, rgba(255, 255, 255, 0) 100%),',
      '    rgba(255, 255, 255, 0.08) !important;',
      '  -webkit-backdrop-filter: blur(5px) saturate(160%);',
      '  backdrop-filter: blur(5px) saturate(160%);',
      '  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.28) !important;',
      '}'
    );

    /* ===== 统一玻璃层（始终生效）：所有顶层美化元素用中性玻璃色，透明度由 alpha 滑块控制 =====
       （放在末尾，用 !important + 后写覆盖前面各元素的 transparent 规则；
        内层（vxe-table 内部各层、分隔线、::after、状态圆点等）保持 transparent 透出这一层） */
    rules.push(
      '.el-card, #nav, .oj-topbar, .el-tabs__nav-wrap, .el-tabs--border-card, .description-body, .ledger-sum, .el-table, .fix-to-bottom, .group-card, .step-card, .hero-input-wrap, .coach-hero, .cross-banner, .level-card, .el-select-dropdown, .auto-backup-dropdown, .el-popover, .el-dropdown-menu, .el-backtop, .uh-hero, .series-strip, .th-hero, .lv-card, .co-card, .goods-card, .shop-hero, .training-card, .hero, .pathway-inner, .ws-hero, .ws-card, .ws-how-item, .glossary-card, .help-section, .dimension-card, .rated-card, .hub-tab, .help-nav-item, .rating-adjust-card, .help-toc, .tier-card, .rating-tier-card, .compact-status, .score-formula, .credit-note, .help-callout, .easter-egg, .exam-hero, .exam-card, .el-dialog, .el-message-box, .cc-card, .ai-banner, .m-message, [data-backup-panel="1"] {',
      '  background-color: rgba(255, 255, 255, ' + a + ') !important;',
      '}',
      'html.theme-dark .el-card, html.theme-dark #nav, html.theme-dark .oj-topbar.oj-topbar, html.theme-dark .el-tabs__nav-wrap, html.theme-dark .el-tabs--border-card, html.theme-dark .description-body, html.theme-dark .ledger-sum, html.theme-dark .el-table, html.theme-dark .fix-to-bottom, html.theme-dark .group-card, html.theme-dark .step-card, html.theme-dark .hero-input-wrap, html.theme-dark .coach-hero, html.theme-dark .cross-banner, html.theme-dark .level-card, html.theme-dark .el-select-dropdown, html.theme-dark .auto-backup-dropdown, html.theme-dark .el-popover, html.theme-dark .el-dropdown-menu, html.theme-dark .el-backtop, html.theme-dark .uh-hero, html.theme-dark .series-strip, html.theme-dark .th-hero, html.theme-dark .lv-card, html.theme-dark .co-card, html.theme-dark .goods-card, html.theme-dark .shop-hero, html.theme-dark .training-card, html.theme-dark .hero, html.theme-dark .pathway-inner, html.theme-dark .ws-hero, html.theme-dark .ws-card, html.theme-dark .ws-how-item, html.theme-dark .glossary-card, html.theme-dark .help-section, html.theme-dark .dimension-card, html.theme-dark .rated-card, html.theme-dark .hub-tab, html.theme-dark .help-nav-item, html.theme-dark .rating-adjust-card, html.theme-dark .help-toc, html.theme-dark .tier-card, html.theme-dark .rating-tier-card, html.theme-dark .compact-status, html.theme-dark .score-formula, html.theme-dark .credit-note, html.theme-dark .help-callout, html.theme-dark .easter-egg, html.theme-dark .exam-hero, html.theme-dark .exam-card, html.theme-dark .el-dialog, html.theme-dark .el-message-box, html.theme-dark .cc-card, html.theme-dark .ai-banner, html.theme-dark .m-message, html.theme-dark [data-backup-panel="1"] {',
      '  background-color: rgba(23, 26, 36, ' + a + ') !important;',
      '}',
      /* 亮色 + 暗色：body 补品牌渐变（始终生效，让透明度有颜色可透） */
      'html:not(.theme-dark) body {',
      '  background:',
      '    radial-gradient(1100px 500px at 100% -10%, rgba(124, 92, 240, 0.14), transparent 60%),',
      '    radial-gradient(900px 420px at -10% 0%, rgba(64, 158, 255, 0.12), transparent 55%),',
      '    #eef1f6 !important;',
      '}',
      'html.theme-dark body {',
      '  background:',
      '    radial-gradient(1100px 520px at 100% -10%, rgba(124, 140, 255, 0.20), transparent 62%),',
      '    radial-gradient(900px 440px at -10% -2%, rgba(90, 104, 224, 0.16), transparent 58%),',
      '    #0e1018 !important;',
      '}'
    );

    /* m-message 消息提示（「代码不能为空」等）：加圆角（背景已纳入统一玻璃层 + blur 列表） */
    rules.push(
      '.m-message {',
      '  border-radius: 8px !important;',
      '}'
    );

    /* ===== 自测弹窗 el-drawer（题目页右下角「测试用例/运行自测」抽屉）：完全排除美化，
           保持网站原样（不透明、不加圆角、不亚克力）===== */
    rules.push(
      '.el-drawer .el-tabs--border-card,',
      '.el-drawer .el-tabs__nav-wrap,',
      '.el-drawer .el-tabs--border-card .el-tabs__nav-wrap,',
      '.el-drawer .el-tabs--border-card > .el-tabs__header,',
      '.el-drawer .el-tag--dark {',
      '  background: revert !important;',
      '  border-radius: revert !important;',
      '  overflow: revert !important;',
      '  -webkit-backdrop-filter: none !important;',
      '  backdrop-filter: none !important;',
      '}',
      'html.theme-dark .el-drawer .el-tabs--border-card,',
      'html.theme-dark .el-drawer .el-tabs__nav-wrap,',
      'html.theme-dark .el-drawer .el-tabs--border-card .el-tabs__nav-wrap,',
      'html.theme-dark .el-drawer .el-tabs--border-card > .el-tabs__header,',
      'html.theme-dark .el-drawer .el-tag--dark {',
      '  background: revert !important;',
      '  border-radius: revert !important;',
      '  overflow: revert !important;',
      '  -webkit-backdrop-filter: none !important;',
      '  backdrop-filter: none !important;',
      '}'
    );

    /* ===== 模糊（仅开关开启时）===== */
    if (enabled) {
      rules.push(
        '.el-card, #nav, .oj-topbar, .el-tabs__nav-wrap, .el-tabs--border-card, .ledger-sum, .el-table, .fix-to-bottom, .group-card, .step-card, .hero-input-wrap, .coach-hero, .cross-banner, .level-card, .el-select-dropdown, .auto-backup-dropdown, .font-dropdown, .el-dropdown-menu, .el-backtop, .uh-hero, .series-strip, .th-hero, .lv-card, .co-card, .goods-card, .shop-hero, .training-card, .hero, .pathway-inner, .ws-hero, .ws-card, .ws-how-item, .glossary-card, .help-section, .dimension-card, .rated-card, .hub-tab, .help-nav-item, .rating-adjust-card, .status-card, .help-hero, .help-toc, .tier-card, .rating-tier-card, .compact-status, .score-formula, .credit-note, .help-callout, .easter-egg, .exam-hero, .exam-card, .el-dialog, .el-message-box, .cc-card, .m-message, [data-backup-panel="1"] {',
        '  -webkit-backdrop-filter: blur(20px) saturate(180%);',
        '  backdrop-filter: blur(20px) saturate(180%);',
        '}',
        /* popover 的毛玻璃改用 ::before 伪元素承载：若直接给 .el-popover 设 backdrop-filter，
           会形成 backdrop root，使嵌在它内部的下拉框（如 auto-backup-dropdown）的 backdrop-filter 失效；
           ::before 是伪元素（无子元素），不会阻断嵌套 backdrop-filter。 */
        '.el-popover::before {',
        '  content: \'\';',
        '  position: absolute;',
        '  top: 0;',
        '  left: 0;',
        '  right: 0;',
        '  bottom: 0;',
        '  border-radius: inherit;',
        '  -webkit-backdrop-filter: blur(20px) saturate(180%);',
        '  backdrop-filter: blur(20px) saturate(180%);',
        '  z-index: -1;',
        '  pointer-events: none;',
        '}'
      );
    }

    return rules.join('\n');
  }

  function apply() {
    var el = document.getElementById(STYLE_ID);

    // 完全无效果：不透明 + 无模糊 → 移除样式
    if (!state.enabled && state.alpha >= 0.999) {
      if (el) el.remove();
      restoreLvCard();
      return;
    }

    var css = buildCSS(state.alpha, state.enabled);
    if (el) {
      el.textContent = css;
    } else {
      var s = document.createElement('style');
      s.id = STYLE_ID;
      s.textContent = css;
      (document.head || document.documentElement).appendChild(s);
    }
    applyLvCard(state.alpha);
  }

  function loadAndApply() {
    try {
      chrome.storage.sync.get({ enabled: DEFAULT_ENABLED, alpha: DEFAULT_ALPHA }, function (data) {
        state.enabled = !!data.enabled;
        state.alpha = sanitizeAlpha(data.alpha);
        apply();
      });
    } catch (e) {
      state.enabled = DEFAULT_ENABLED;
      state.alpha = DEFAULT_ALPHA;
      apply();
    }
  }

  // 监听 popup 的开关 / 透明度变化，无需刷新页面即可生效
  try {
    chrome.storage.onChanged.addListener(function (changes, area) {
      if (area !== 'sync') return;
      if (changes.enabled) state.enabled = !!changes.enabled.newValue;
      if (changes.alpha) state.alpha = sanitizeAlpha(changes.alpha.newValue);
      apply();
    });
  } catch (e) { /* 忽略 */ }

  // document_start 时立即按存储状态应用，减少首屏闪烁
  loadAndApply();

  // lv-card 是 Vue 渲染后才出现的，用 MutationObserver 在出现时补应用背景
  (function watchLvCard() {
    if (typeof MutationObserver === 'undefined') return;
    var observer = new MutationObserver(function () {
      if (!(state.enabled === false && state.alpha >= 0.999)) {
        applyLvCard(state.alpha);
      }
    });
    var start = function () {
      observer.observe(document.documentElement || document.body, { childList: true, subtree: true });
    };
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', start);
    } else {
      start();
    }
  })();

})();
