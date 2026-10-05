# CLAUDE.md

**本项目一切说明都在 `AGENTS.md`，请先完整读它。**

要点速览（细节见 AGENTS.md）：

- 零依赖 Node 单体应用，无构建步骤；**不要引入任何 npm 包**。
- 后端 `server.js`（HTTP + 数据 + 大模型 + 提示词）；前端 `public/{index.html,style.css,app.js}`。
- 数据在 `data/`：`plants.json`（植株档案）、`log.json`（记录）、`settings.json`（含明文 API Key）。
- **`data/` 是用户真实数据，开发与测试都不准改动**；测试请用 `CARE_DATA_DIR` 指向临时目录。
- 时间是本地字符串 `YYYY-MM-DDTHH:mm`；界面文案全中文。
- 改动前后都必须跑 `node tools/e2e.js`，必须全绿。
- 最常踩的坑：`#drawer` 与 `#plantDrawer` 要一起写样式；下拉框的 option 要显式填充；
  照片磁盘路径 `data/photos/x.jpg` 与引用路径 `photos/x.jpg` 的映射在 `b64OfPhoto()`；
  `*.ps1` 必须纯 ASCII（PowerShell 5.1 会按 GBK 读无 BOM 的 UTF-8）。
