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

  // 完整亚克力（玻璃层 + 模糊），按页面 / 功能分组
  acrylic: [
    // —— 通用框架：导航 / 卡片 / 表格 / 弹窗 / 下拉 ——
    '.el-card',                              // 通用卡片
    '#nav',                                  // 左侧菜单栏
    '.oj-topbar',                            // 顶部栏
    '.el-tabs__nav-wrap',                    // 标签页导航条
    '.el-tabs--border-card',                 // 题目详情页标签
    '.el-tabs__item.is-active',              // 激活标签
    '.el-table',                             // Element 表格
    '.vxe-table--render-default',            // 题目列表表格
    '.el-select-dropdown',                   // 下拉
    '.el-dropdown-menu',                     // 下拉菜单
    '.el-dialog',                            // 弹窗
    '.el-message-box',                       // 消息框
    '.el-backtop',                           // 返回顶部
    '.m-message',                            // 消息提示（「代码不能为空」等）
    '.el-tag--dark.el-popover__reference',   // 深色标签（倒计时等）
    '.el-input__count',                      // 输入字数统计
    '.el-input__count-inner',                // 输入字数统计内层
    '.fix-to-bottom',                        // 页脚横条
    '.cross-banner',                         // 横向横幅
    '.hero',                                 // 通用 hero
    '.hero-input-wrap',                      // 输入栏（半透明白 + 毛玻璃）

    // —— 首页 / 个人中心 / 钱包 ——
    '.ledger-sum',                           // 余额统计块（当前余额/累计赚到/累计花掉）
    '.cc-card',                              // 近期比赛卡片

    // —— 个人主页 ——
    '.uh-hero',                              // 个人主页 hero（带极光层）
    '.series-strip',                         // 徽章条

    // —— 班级 / AI 教练 / 难度 ——
    '.group-card',                           // 班级/群组卡片
    '.step-card',                            // 步骤卡片
    '.coach-hero',                           // AI 教练主卡片
    '.level-card',                           // 难度等级卡片

    // —— 竞赛排行榜 ——
    '.contest-rank-search',                  // 排行榜搜索框
    '.contest-rank-config',                  // 排行榜「榜单设置」按钮

    // —— 代码速打页 ——
    '.ct-lib',                               // 代码速打页卡片
    '.ct-card',                              // 代码速打页卡片
    '.ct-hero',                              // 代码速打页 hero（紫色）
    '.auto-backup-dropdown',                 // 编辑器自动备份下拉

    // —— 伴学页 ——
    '.th-hero',                              // 伴学页 hero 横幅
    '.lv-card',                              // 伴学页阶段卡片
    '.lv-banner',                            // 伴学页学习路线横幅
    '.lv-mock',                              // 伴学页模拟练习卡
    '.lv-season',                            // 伴学页赛季卡
    '.lv-train-card',                        // 伴学页训练知识点卡
    '.topic-row',                            // 伴学页知识点列表项
    '.lv-trial',                             // 伴学页备考金标徽章
    '.co-card',                              // 伴学页课程卡片
    '.pathway-inner',                        // 学习路径步骤条

    // —— OI币商城 / 训练 ——
    '.cos-card',                             // OI币商城皮肤卡
    '.type-chip',                            // OI币商城筛选 chip
    '.goods-card',                           // 商城商品卡片
    '.shop-hero',                            // 商城顶部 hero
    '.training-card',                        // 训练卡片

    // —— 创意工坊 ——
    '.ws-hero',                              // 创意工坊 hero
    '.ws-card',                              // 创意工坊卡片
    '.ws-how-item',                          // 创意工坊步骤项

    // —— 关于与帮助页 ——
    '.glossary-card',                        // 词汇表卡片
    '.help-section',                         // 帮助分区
    '.dimension-card',                       // 维度卡片
    '.rated-card',                           // 评分卡片
    '.hub-tab',                              // 中心 tab
    '.help-nav-item',                        // 帮助导航项
    '.rating-adjust-card',                   // 等级调整渐变卡片
    '.help-toc',                             // 帮助目录栏
    '.tier-card',                            // 等级卡
    '.rating-tier-card',                     // 评级等级卡
    '.compact-status',                       // 折叠状态卡
    '.score-formula',                        // 综合分计算卡
    '.credit-note',                          // 信用说明卡
    '.help-callout',                         // 提示 callout
    '.easter-egg',                           // 彩蛋

    // —— 备赛页 ——
    '.exam-hero',                            // 备赛页 hero 横幅
    '.exam-card',                            // 备赛页考试卡片

    // —— 其他注入 ——
    '[data-backup-panel="1"]',               // 编辑器自动备份历史面板
  ],

  // 只加玻璃层半透明白、不模糊
  glassOnly: [
    '.description-body',                     // 题目描述体（原本透明，加亚克力卡片外观）
    '.el-popover',                           // popover（模糊走 ::before 伪元素，见 board-beautify.js）
    '.ai-banner',                            // AI 横幅（自带 blur(12px)，这里只补玻璃层）
  ],

  // 只模糊、不加玻璃层（保留自定义背景）
  blurOnly: [
    '.font-dropdown',                        // 编辑器字体下拉（透明透出，只模糊）
    '.status-card',                          // 关于页状态卡（保留 status 渐变与竖条）
    '.help-hero',                            // 关于页 hero（保留紫色 radial 光晕）
  ],

  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
