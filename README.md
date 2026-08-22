# XSDOI-Plus

新赛道 OI（xsdoi.com）一站式浏览器增强扩展（Manifest V3）。

在 OJ 平台上做题、改代码、看结果时提供一系列增强能力：从 AC 庆祝动画替换、页面美化，到代码自动备份、题目一键复制为 Markdown 等。

## 功能列表

| 功能 | 说明 | 设置入口 |
|---|---|---|
| 图标替换 | 隐藏页面 Logo 或替换为自定义图片（URL / 上传） | popup「图标替换」 |
| AC 动画替换 | AC 时用自定义图片 / 视频 / 文件夹随机替换默认烟花 | popup「AC 动画」 |
| 板块美化 | 卡片、菜单、顶栏亚克力毛玻璃外观，亮/暗色自适应 | popup「板块美化」 |
| 背景替换 | 页面背景换成图片 / gif / 视频 / 纯色 / 渐变，可配背景音乐 | popup「背景替换」 |
| 题目 Markdown 复制 | 题目页一键复制为 Markdown（含 LaTeX 公式、示例） | 题目页内按钮 |
| 自测结果复制 | 将自测结果（状态 / 编译 / 评测详情）复制为 Markdown | 自测结果区按钮 |
| 暗色模式修复 | 修复 Markdown 内容区在暗色模式下的显示问题 | 自动生效 |
| 代码自动备份 | 运行自测 / 提交评测时自动备份代码（OPFS 存储） | 编辑器「设置」弹层 + popup「代码备份」 |
| 代码语法检测 | 提交前检测代码语法 / 语义错误并高亮提示 | 自动生效 |
| 编辑器字体 | 设置编辑器字体（预设 / 上传自定义字体），适配提交详情页 | 编辑器「设置」弹层 |
| 文件 IO 复制 Cpp 格式 | 一键复制文件 IO 题的输入 / 输出文件名（Cpp 格式） | 题目「文件 IO」弹层 |
| 打字特效（Powermode） | 编辑器打字时粒子动画 + combo 计数 | popup「打字特效」 |
| 鼠标尾迹 | 光标彩色拖尾（圆点 / 带状） | popup「鼠标尾迹」 |
| 点击特效 | 鼠标左键点击时爆发粒子 / 图片 | popup「点击特效」 |
| 网页桌宠 | 可拖动的圆球小宠物，随机散步、边缘吸附，可放入自定义图片，由 popup 控制显隐 | popup「网页桌宠」 |

## 安装

Chrome / Edge：

1. 打开扩展管理页（`chrome://extensions` 或 `edge://extensions`）
2. 开启右上角「开发者模式」
3. 点击「加载已解压的扩展程序」，选择本仓库的 `XSDOI-Plus/` 目录
4. 打开 xsdoi.com 任意题目页即可生效；点击工具栏扩展图标打开设置面板

## 项目结构

```
XSDOI-Plus/
├── manifest.json          MV3 配置：权限、15+ 个 content script 注入点
├── constants.js           共享常量（AC / 背景 / 打字特效等默认配置与消息名）
├── background.js          service worker：媒体 IndexedDB 中转 + OPFS 代码备份 + 消息分发
├── idb.js                 IndexedDB 封装
├── md-core.js             Markdown 转换纯函数（UMD，可单测）
├── content/               注入页面的脚本（按功能拆分，见上表）
├── popup/                 扩展设置面板（左侧菜单 + 右侧设置）
├── assets/  fonts/  icons/ 静态资源
```

存储说明：

- `storage.sync`：各功能配置 / 开关（popup 与 content script 直接共享）
- IndexedDB（`ac-replacer-media` / `bg-replacer-media`）：AC 动画、背景的媒体 Blob（popup 直写，页面经 background 分片读取）
- OPFS（`backups/`）：代码自动备份（文件名 `题目ID-时间戳-原因.cpp.backup`）

## 开发指南

### 版本号规则

每次发布按变更类型更新 `manifest.json` 的 `version`：

| 变更类型 | 规则 |
|---|---|
| 更新功能 / bug 修复（patch） | `a.b.c` → `a.b.(c+1)` |
| 添加全新功能（minor） | `a.b.c` → `a.(b+1).0` |
| 大版本（major） | 仅当用户明确要求时，`a.b.c` → `(a+1).0.0` |

### 提交流程

完成功能变更后，依次执行：

1. 更新版本号（按上方规则改 `manifest.json` 的 `version`）
2. **同步更新本 README**：功能列表与本次变更对齐（新增功能加行、改动功能更新说明），并更新版本号示例
3. 提交：`git add -A && git commit -m "V{新版本号}" -m "{变更摘要}"`
4. 推送：`git push`（SSH remote）
5. 打包：用 PEM 密钥重新打包为 `XSDOI-Plus.crx`（保持扩展 ID 不变）

> 约定：每次改完 `manifest.json` 的 `version` 后自动执行第 3–5 步（commit + push + 打包），无需等待确认；GitHub release tag 由发布者手动创建，tag 与标题统一用大写 `V{版本号}`（如 `V3.2.7`）。

### 打包 crx

本机无 Chrome 时用 Edge 打包（扩展 ID 由 PEM 密钥决定，保持不变）：

```powershell
& "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" --pack-extension="<扩展目录>" --pack-extension-key="<PEM路径>" --no-message-box
```

生成位置在扩展目录的父目录，覆盖同名 `XSDOI-Plus.crx`。
