// ============================================================
// 板块美化（亚克力）选择器配置 —— 集中维护，加选择器即可生效
// 与 content/board-beautify.js 配合：buildCSS 遍历这些数组自动生成
//   - 玻璃层半透明白背景（亮 rgba(255,255,255,α) / 暗 rgba(23,26,36,α)）
//   - 毛玻璃模糊 backdrop-filter: blur(20px) saturate(180%)
// 三个数组含义：
//   acrylic   完整亚克力（玻璃层 + 模糊），绝大多数顶层卡片/面板放这里
//   glassOnly 只加玻璃层半透明白、不模糊（如 .description-body）
//   blurOnly  只模糊、不加玻璃层（保留自定义背景，如 .status-card/.help-hero 渐变）
// 注意：透明背景与亚克力白边（边框）仍逐元素写在 board-beautify.js 的
//       buildCSS 里，因为各元素白边方式/圆角个性化（0.4/0.5/无边框/border-top 等），
//       无法用统一规则表达。想给新元素加完整亚克力：
//         1) 在 board-beautify.js 加一条「透明 + 白边 + 圆角」规则
//         2) 把选择器加进下方 acrylic 数组
// ============================================================
(function (global) {
  'use strict';
  global.XSDOI_ACRYLIC = {
  acrylic: [
    '.el-card',
    '#nav',
    '.oj-topbar',
    '.el-tabs__nav-wrap',
    '.el-tabs--border-card',
    '.ledger-sum',
    '.el-table',
    '.vxe-table--render-default',
    '.contest-rank-search',
    '.contest-rank-config',
    '.ct-lib',
    '.ct-card',
    '.ct-hero',
    '.fix-to-bottom',
    '.group-card',
    '.step-card',
    '.hero-input-wrap',
    '.coach-hero',
    '.cross-banner',
    '.level-card',
    '.el-select-dropdown',
    '.auto-backup-dropdown',
    '.el-dropdown-menu',
    '.el-backtop',
    '.uh-hero',
    '.series-strip',
    '.th-hero',
    '.lv-card',
    '.lv-banner',
    '.lv-mock',
    '.lv-season',
    '.lv-train-card',
    '.topic-row',
    '.lv-trial',
    '.cos-card',
    '.type-chip',
    '.el-tabs__item.is-active',
    '.co-card',
    '.goods-card',
    '.shop-hero',
    '.training-card',
    '.hero',
    '.pathway-inner',
    '.ws-hero',
    '.ws-card',
    '.ws-how-item',
    '.glossary-card',
    '.help-section',
    '.dimension-card',
    '.rated-card',
    '.hub-tab',
    '.help-nav-item',
    '.rating-adjust-card',
    '.help-toc',
    '.tier-card',
    '.rating-tier-card',
    '.compact-status',
    '.score-formula',
    '.credit-note',
    '.help-callout',
    '.easter-egg',
    '.exam-hero',
    '.exam-card',
    '.el-dialog',
    '.el-message-box',
    '.cc-card',
    '.m-message',
    '.el-tag--dark.el-popover__reference',
    '.el-input__count',
    '.el-input__count-inner',
    '[data-backup-panel="1"]',
  ],
  glassOnly: [
    '.description-body',
    '.el-popover',
    '.ai-banner',
  ],
  blurOnly: [
    '.font-dropdown',
    '.status-card',
    '.help-hero',
  ],
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
