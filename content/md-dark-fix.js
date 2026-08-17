(function () {
  'use strict';

  const STYLE_ID = 'md-dark-fix-by-extension';
  if (document.getElementById(STYLE_ID)) return;

  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = getDarkModeCSS();
  document.head.appendChild(style);

  function getDarkModeCSS() {
    /* ================================================================
       CSS 规则按问题分类组织，全部使用 html.theme-dark 前缀限定作用域。
       优先级策略：
       - 普通覆盖：后注入的 <style> 天然覆盖同特异性的外部 CSS
       - 内联样式覆盖：使用 !important（仅针对 Vue 内联绑定的背景色）

       颜色统一通过 --mdfix-* 自定义属性管理，调色只需改下方变量块。
       ================================================================ */

    return /* css */`
/* ================================================================
   零、设计令牌（Design Tokens）
   ================================================================ */
html.theme-dark {
  /* 背景 */
  --mdfix-bg-base: #1a1d27;
  --mdfix-bg-surface: #1e2130;
  --mdfix-bg-preview: #212433;
  --mdfix-bg-elevated: #252836;
  --mdfix-bg-code: #161822;
  --mdfix-bg-fullscreen: #0e1018;
  /* 边框 */
  --mdfix-border: #2d3140;
  --mdfix-border-strong: #3d4055;
  --mdfix-border-hover: #555878;
  --mdfix-border-active: #666a8a;
  --mdfix-border-faint: #5a6080;
  /* 文字 */
  --mdfix-text-primary: #d4d6dd;
  --mdfix-text-body: #c8ccd6;
  --mdfix-text-secondary: #b0b3c0;
  --mdfix-text-muted: #959bb0;
  --mdfix-text-disabled: #7a8090;
  --mdfix-text-heading: #e8eaef;
  /* 强调 */
  --mdfix-accent: #7c8cff;
  --mdfix-accent-hover: #a0adff;
  --mdfix-code: #e8b86d;
  /* 图标 */
  --mdfix-icon: #8890a8;
  --mdfix-icon-bg-hover: #2d3048;
  --mdfix-icon-bg-selected: #353858;
}

/* ================================================================
   一、容器背景色修复
   ================================================================ */

/* 1.1 编辑器外壳 */
html.theme-dark .v-note-wrapper {
  background-color: var(--mdfix-bg-base) !important;
  border-color: var(--mdfix-border) !important;
  color: var(--mdfix-text-primary);
}

/* 1.2 工具栏 */
html.theme-dark .v-note-wrapper .v-note-op {
  background-color: var(--mdfix-bg-surface) !important;
  border-bottom-color: var(--mdfix-border) !important;
}

/* 1.3 编辑区（Vue 内联样式，必须 !important） */
html.theme-dark .v-note-wrapper .content-input-wrapper {
  background-color: var(--mdfix-bg-base) !important;
}

/* 1.4 预览区 */
html.theme-dark .v-note-wrapper .v-show-content {
  background-color: var(--mdfix-bg-preview) !important;
}

/* 1.5 沉浸阅读模式 */
html.theme-dark .v-note-wrapper .v-note-read-model {
  background-color: var(--mdfix-bg-base) !important;
}

/* ================================================================
   二、弹窗/面板背景色修复
   ================================================================ */

/* 2.1 标题下拉菜单 */
html.theme-dark .v-note-wrapper .popup-dropdown {
  background-color: var(--mdfix-bg-elevated) !important;
  border-color: var(--mdfix-border-strong) !important;
  box-shadow: 0 2px 12px 0 rgba(0, 0, 0, 0.4) !important;
}

/* 2.2 图片链接弹窗 */
html.theme-dark .v-note-wrapper .add-image-link {
  background-color: var(--mdfix-bg-elevated) !important;
}

/* 2.3 帮助面板 */
html.theme-dark .v-note-wrapper .v-note-help-show,
html.theme-dark .v-note-help-wrapper .v-note-help-content {
  background-color: var(--mdfix-bg-surface) !important;
  border-color: var(--mdfix-border-strong) !important;
}

/* 2.4 标题导航侧栏 */
html.theme-dark .v-note-wrapper .v-note-navigation-wrapper {
  background-color: rgba(30, 33, 48, 0.98) !important;
  border-left-color: var(--mdfix-border) !important;
  border-right-color: var(--mdfix-border) !important;
}

/* 2.5 帮助弹窗关闭按钮颜色 */
html.theme-dark .v-note-help-wrapper .v-note-help-content i {
  color: rgba(212, 214, 221, 0.7) !important;
}
html.theme-dark .v-note-help-wrapper .v-note-help-content i:hover {
  color: var(--mdfix-text-heading) !important;
}

/* ================================================================
   三、边框/分隔线颜色修复
   ================================================================ */

/* 3.1 工具栏分隔线 */
html.theme-dark .v-note-wrapper .op-icon-divider {
  border-left-color: var(--mdfix-border-strong) !important;
}

/* 3.2 导航侧栏标题底边 */
html.theme-dark .v-note-wrapper .v-note-navigation-title {
  border-bottom-color: var(--mdfix-border) !important;
}

/* ================================================================
   四、文字颜色修复
   ================================================================ */

/* 4.1 编辑区文字 */
html.theme-dark .v-note-wrapper .content-div,
html.theme-dark .v-note-wrapper .auto-textarea-input {
  color: var(--mdfix-text-primary) !important;
  caret-color: var(--mdfix-text-primary);
}

/* 4.2 下拉菜单文字 */
html.theme-dark .v-note-wrapper .dropdown-item {
  color: var(--mdfix-text-secondary) !important;
}

/* 4.3 导航标题文字 */
html.theme-dark .v-note-wrapper .v-note-navigation-title {
  color: var(--mdfix-text-primary) !important;
}

/* 4.4 导航目录中的标题 */
html.theme-dark .v-note-wrapper .v-note-navigation-content h1,
html.theme-dark .v-note-wrapper .v-note-navigation-content h2,
html.theme-dark .v-note-wrapper .v-note-navigation-content h3,
html.theme-dark .v-note-wrapper .v-note-navigation-content h4,
html.theme-dark .v-note-wrapper .v-note-navigation-content h5,
html.theme-dark .v-note-wrapper .v-note-navigation-content h6 {
  color: var(--mdfix-accent) !important;
}
html.theme-dark .v-note-wrapper .v-note-navigation-content h1:hover,
html.theme-dark .v-note-wrapper .v-note-navigation-content h2:hover,
html.theme-dark .v-note-wrapper .v-note-navigation-content h3:hover,
html.theme-dark .v-note-wrapper .v-note-navigation-content h4:hover,
html.theme-dark .v-note-wrapper .v-note-navigation-content h5:hover,
html.theme-dark .v-note-wrapper .v-note-navigation-content h6:hover {
  color: var(--mdfix-accent-hover) !important;
}

/* 4.5 图片链接弹窗文字 */
html.theme-dark .v-note-wrapper .add-image-link .title {
  color: var(--mdfix-text-primary) !important;
}
html.theme-dark .v-note-wrapper .add-image-link .input-wrapper {
  border-color: var(--mdfix-border-strong) !important;
  background-color: var(--mdfix-bg-base) !important;
}
html.theme-dark .v-note-wrapper .add-image-link .input-wrapper input {
  color: var(--mdfix-text-primary) !important;
  background-color: var(--mdfix-bg-base) !important;
}

/* ================================================================
   五、工具栏图标颜色修复
   ================================================================ */

/* 5.1 默认状态 */
html.theme-dark .v-note-wrapper .op-icon {
  color: var(--mdfix-icon) !important;
}

/* 5.2 悬停状态 */
html.theme-dark .v-note-wrapper .op-icon:hover {
  color: var(--mdfix-text-primary) !important;
  background-color: var(--mdfix-icon-bg-hover) !important;
}

/* 5.3 选中状态 */
html.theme-dark .v-note-wrapper .op-icon.selected {
  color: var(--mdfix-text-primary) !important;
  background-color: var(--mdfix-icon-bg-selected) !important;
}

/* ================================================================
   六、Markdown 渲染内容修复
   ================================================================ */

/* 6.1 标题 h1-h6 */
html.theme-dark .v-note-wrapper .markdown-body h1,
html.theme-dark .v-note-wrapper .markdown-body h2,
html.theme-dark .v-note-wrapper .markdown-body h3,
html.theme-dark .v-note-wrapper .markdown-body h4,
html.theme-dark .v-note-wrapper .markdown-body h5,
html.theme-dark .v-note-wrapper .markdown-body h6 {
  color: var(--mdfix-text-heading) !important;
  border-bottom-color: var(--mdfix-border-strong) !important;
}

/* 6.2 段落文字 */
html.theme-dark .v-note-wrapper .markdown-body {
  color: var(--mdfix-text-body);
}
html.theme-dark .v-note-wrapper .markdown-body p {
  color: var(--mdfix-text-body);
}

/* 6.3 链接 */
html.theme-dark .v-note-wrapper .markdown-body a {
  color: var(--mdfix-accent) !important;
}
html.theme-dark .v-note-wrapper .markdown-body a:hover {
  color: var(--mdfix-accent-hover) !important;
}

/* 6.4 行内代码 */
html.theme-dark .v-note-wrapper .markdown-body code {
  color: var(--mdfix-code);
  background-color: rgba(255, 255, 255, 0.08) !important;
}

/* 6.5 代码块 */
html.theme-dark .v-note-wrapper .markdown-body pre {
  background-color: var(--mdfix-bg-code) !important;
  border-color: var(--mdfix-border) !important;
}
html.theme-dark .v-note-wrapper .markdown-body pre code {
  color: var(--mdfix-text-primary);
  background-color: transparent !important;
}

/* 6.6 表格 */
html.theme-dark .v-note-wrapper .markdown-body table {
  border-color: var(--mdfix-border-strong) !important;
}
html.theme-dark .v-note-wrapper .markdown-body th,
html.theme-dark .v-note-wrapper .markdown-body td {
  border-color: var(--mdfix-border-strong) !important;
  color: var(--mdfix-text-body);
}
html.theme-dark .v-note-wrapper .markdown-body th {
  background-color: var(--mdfix-bg-elevated) !important;
}
html.theme-dark .v-note-wrapper .markdown-body tr {
  background-color: var(--mdfix-bg-surface);
  border-color: var(--mdfix-border-strong) !important;
}
html.theme-dark .v-note-wrapper .markdown-body tr:nth-child(2n) {
  background-color: #222538; /* 斑马纹略亮于 --mdfix-bg-surface */
}

/* 6.7 引用块 */
html.theme-dark .v-note-wrapper .markdown-body blockquote {
  color: var(--mdfix-text-muted);
  border-left-color: var(--mdfix-border-faint) !important;
  background-color: rgba(255, 255, 255, 0.03);
}

/* 6.8 分割线 */
html.theme-dark .v-note-wrapper .markdown-body hr {
  background-color: var(--mdfix-border-strong) !important;
  border-color: var(--mdfix-border-strong) !important;
}

/* 6.9 列表 */
html.theme-dark .v-note-wrapper .markdown-body li {
  color: var(--mdfix-text-body);
}

/* 6.10 图片（透明背景图片在暗色下边缘可见性问题不大，但加个微弱背景以防万一） */
html.theme-dark .v-note-wrapper .markdown-body img {
  background-color: transparent;
}

/* 6.11 强调和加粗 */
html.theme-dark .v-note-wrapper .markdown-body strong {
  color: var(--mdfix-text-heading);
}
html.theme-dark .v-note-wrapper .markdown-body em {
  color: var(--mdfix-text-body);
}

/* 6.12 删除线 */
html.theme-dark .v-note-wrapper .markdown-body del {
  color: var(--mdfix-text-disabled);
}

/* ================================================================
   七、字体问题修复
   ================================================================ */

/* 7.1 改进等宽字体栈：Cascadia Code 在 Windows 上对中文更友好，
       Consolas 回退，末尾用 Microsoft YaHei 保持中文可读 */
html.theme-dark .v-note-wrapper .auto-textarea-input,
html.theme-dark .v-note-wrapper .auto-textarea-block {
  font-family: "Cascadia Code", "Cascadia Mono", Consolas, "Courier New",
               "Microsoft YaHei", "WenQuanYi Micro Hei", monospace !important;
}

/* 7.2 预览区使用系统无衬线字体，确保中文基线对齐 */
html.theme-dark .v-note-wrapper .markdown-body {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI",
               "PingFang SC", "Microsoft YaHei", "Helvetica Neue",
               Helvetica, Arial, sans-serif;
}

/* 7.3 代码块和行内代码保持等宽但换用更清晰的字体 */
html.theme-dark .v-note-wrapper .markdown-body code,
html.theme-dark .v-note-wrapper .markdown-body pre {
  font-family: "Cascadia Code", "Cascadia Mono", Consolas, "Courier New",
               "Microsoft YaHei", "WenQuanYi Micro Hei", monospace !important;
}

/* ================================================================
   八、滚动条颜色修复
   ================================================================ */

/* 8.1 滚动条轨道 */
html.theme-dark .v-note-wrapper .scroll-style::-webkit-scrollbar {
  background-color: var(--mdfix-bg-base) !important;
}

/* 8.2 滚动条滑块 */
html.theme-dark .v-note-wrapper .scroll-style::-webkit-scrollbar-thumb {
  background-color: var(--mdfix-border-strong) !important;
  border-radius: 4px;
}

/* 8.3 滚动条滑块悬停 */
html.theme-dark .v-note-wrapper .scroll-style::-webkit-scrollbar-thumb:hover {
  background-color: var(--mdfix-border-hover) !important;
}

/* 8.4 滚动条滑块激活 */
html.theme-dark .v-note-wrapper .scroll-style::-webkit-scrollbar-thumb:active {
  background-color: var(--mdfix-border-active) !important;
}

/* ================================================================
   九、交互状态修复
   ================================================================ */

/* 9.1 下拉菜单项悬停 */
html.theme-dark .v-note-wrapper .dropdown-item:hover {
  color: var(--mdfix-text-primary) !important;
  background-color: var(--mdfix-icon-bg-hover) !important;
}

/* 9.2 图片弹窗按钮 */
html.theme-dark .v-note-wrapper .add-image-link .op-btn.cancel {
  border-color: var(--mdfix-border-hover) !important;
  color: var(--mdfix-text-muted) !important;
}
html.theme-dark .v-note-wrapper .add-image-link .op-btn.cancel:hover {
  color: var(--mdfix-text-primary) !important;
}

/* ================================================================
   十、输入区域补充修复
   ================================================================ */

/* 10.1 disabled 输入框（当前邮箱显示区） */
html.theme-dark .v-note-wrapper textarea:disabled {
  background-color: var(--mdfix-bg-elevated) !important;
  color: var(--mdfix-text-disabled) !important;
}

/* 10.2 placeholder 颜色 */
html.theme-dark .v-note-wrapper .auto-textarea-input::placeholder {
  color: var(--mdfix-border-faint) !important;
}

/* 10.3 聚焦状态 */
html.theme-dark .v-note-wrapper .auto-textarea-input:focus {
  outline-color: var(--mdfix-accent);
}

/* ================================================================
   十一、清除可能由外部主题导致的白色残留
   ================================================================ */

/* 11.1 图片查看器关闭按钮 */
html.theme-dark .v-note-img-wrapper i {
  color: rgba(212, 214, 221, 0.7) !important;
}
html.theme-dark .v-note-img-wrapper i:hover {
  color: var(--mdfix-text-heading) !important;
}

/* ================================================================
   十二、全屏模式下的编辑器颜色
   ================================================================ */

/* 12.1 全屏时编辑器撑满屏幕，背景需与页面其余部分一致 */
html.theme-dark .v-note-wrapper.fullscreen {
  background-color: var(--mdfix-bg-fullscreen) !important;
}
html.theme-dark .v-note-wrapper.fullscreen .v-note-op {
  background-color: var(--mdfix-bg-code) !important;
}
html.theme-dark .v-note-wrapper.fullscreen .v-note-edit,
html.theme-dark .v-note-wrapper.fullscreen .v-note-show {
  background-color: var(--mdfix-bg-base) !important;
}
`;
  }
})();
