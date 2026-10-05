# AGENTS.md — 水培养护助手（交给 AI 开发者的项目说明）

> 你（另一个 AI agent / 开发者）要接着改这个项目，请先花 3 分钟读完本文件。
> 读完请立刻跑一次 `node tools/e2e.js`，**必须全绿**再动手；改完再跑一次。
> 本文件末尾有「已知坑」和「可以做的改进」，都是踩过或想过的。

---

## 0. 这是什么

一个**只跑在用户本机**的水培植物养护助手。核心闭环：

```
拍照/上传照片 → 调多模态大模型看图 → 结构化结论入日志 → 规则引擎算出换水周期与提醒
```

- 用户是普通家庭养花人（不懂技术），界面全中文，操作要极简。
- 目前养护：水培罗汉松、水培红颜（如意皇后），**植株可增删改**。
- 大模型默认用 DeepSeek 的 `deepseek-flash`（官方支持图片输入，OpenAI 兼容接口）。

## 1. 技术栈与硬约束

| 项 | 约束 |
| --- | --- |
| 运行时 | Node.js ≥ 18（用到内置 `fetch`、`AbortSignal.timeout`）。**零依赖** |
| 依赖 | **不要**引入任何 npm 包、不要加 `package.json` 的 dependencies。要新功能就用 Node 内置模块自己写 |
| 前端 | 原生 HTML + CSS + ES5/ES6 原生 JS，**无框架、无构建步骤**。改完刷新页面即生效（静态文件带 `no-cache`） |
| 服务 | 只监听 `127.0.0.1`（设置里开 `lanAccess` 才监听 `0.0.0.0`） |
| 语言 | 所有界面文案、提示词、注释用**中文** |
| 时间 | 一律用**本地时间字符串** `YYYY-MM-DDTHH:mm`（不要 UTC / 不要带 Z）。排序就是字符串比较 |
| 数据 | `data/` 是**用户真实数据**，开发和测试都不准改它（测试用 `CARE_DATA_DIR` 指向临时目录） |

## 2. 目录与职责

```
水培助手\
├─ server.js              ★ 后端全部逻辑（HTTP + 数据读写 + 大模型调用 + 提示词）
├─ public\
│   ├─ index.html           页面结构（含两个抽屉：植株管理 #plantDrawer、设置 #drawer）
│   ├─ style.css            全部样式（设计变量在 :root）
│   ├─ app.js             ★ 前端全部逻辑（渲染、规则引擎、上传、AI 调用）
│   ├─ icon.ico             应用图标（make_icon.py 生成）
│   └─ img\                 界面装饰图（用用户自己的照片生成，make_decor_images.py）
├─ tools\                 ★ 自检工具（见第 8 节），改动前后都要跑
│   ├─ e2e.js               端到端自检（假模型 + 临时实例 + 断言）
│   ├─ ui-probe.js          界面逻辑自检（桩 DOM 跑真实 app.js）
│   ├─ fake-api.js          假大模型接口（不花钱，可手动点界面调）
│   └─ shot.ps1             无头浏览器截图（纯 ASCII，别加中文）
├─ data\                    运行时数据（**不要提交、不要手改**）
│   ├─ plants.json          植株档案
│   ├─ log.json             全部记录
│   ├─ log.csv              自动导出的表格版
│   ├─ settings.json        API Key 与偏好（含明文 Key，别外传）
│   └─ photos\              照片
├─ 启动养护助手.cmd         双击启动（Windows）
├─ open_app.ps1             用 Edge/Chrome 的 app 模式开窗口（纯 ASCII）
├─ make_icon.py             生成 icon.ico
├─ make_decor_images.py     生成 public/img 下的横幅与头像
├─ 养护卡.pdf               给用户看的 A4 养护卡（内容与本项目规则一致）
└─ 说明.md                  给用户看的中文使用说明
```

环境变量（测试用，正常使用不需要）：

| 变量 | 作用 |
| --- | --- |
| `PORT` | 监听端口，默认 8787 |
| `CARE_DATA_DIR` | 数据目录，默认 `./data`。`tools/e2e.js` 用它指向临时目录 |
| `HOST` | 强制绑定地址（`127.0.0.1` / `0.0.0.0`） |
| `FAKE_PORT` | `tools/fake-api.js` 的端口，默认 8799 |
| `E2E_PORT` | `tools/e2e.js` 里临时实例的端口，默认 8790 |

## 3. 数据模型

### data/plants.json

```jsonc
{
  "version": 1,
  "plants": [{
    "id": "luohansong",              // 唯一 id（新植株用 newId() 生成）
    "name": "水培罗汉松",             // 界面显示名
    "hint": "木质根，水位取低……",      // 会一起塞进大模型提示词
    "img": "/img/plant-luohansong.jpg", // 头像（可为 null；上传的图存 /photos/xxx.jpg）
    "preset": "woody",               // 预设键：foliage/woody/herb/succulent/custom
    "level": "low",                  // 水位偏好：low（取低）| normal（标准）
    "addedAt": "2026-10-04",         // 开始养护日期，缓苗期从这天起算
    "archived": false,               // true = 已移出列表，但档案与历史保留
    "intervals": { "1": [15,20], "2": [15,20], /* … */ "12": [15,20] }
  }]
}
```

- `intervals`：**12 个月**各一个 `[最少天数, 最多天数]`，判定换水到期用它。
- 界面按**季节**（春夏秋冬各 3 个月）编辑，保存时把该季节 3 个月写成同一组值。
- `PRESETS`（server.js 顶部）给 4 种预设 + 自定义，`expandPreset()` 把季节展开成 12 个月。

### data/log.json

```jsonc
{
  "version": 3,
  "entries": [{
    "id": "…", "at": "2026-10-05T20:53",   // 本地时间字符串
    "plant": "luohansong",                  // 植株 id；"both" = 全部植株
    "type": "start|change|water|fertilize|observe|ai",
    "data": { /* 见下 */ },
    "note": "备注", "photos": ["photos/xxx.jpg"],
    "savedAt": "2026-10-05T12:53:00.000Z"   // ISO，仅内部用
  }]
}
```

各 type 的 `data`：

| type | 字段 |
| --- | --- |
| `start` | 无（新增植株时自动写入一条） |
| `change` | `level` 标准/偏高/偏低、`water` 清澈/微浑/浑浊有味、`rot` 未检查/无需剪/已剪除、`ml`、`dose` |
| `water` | `level` 补到标准线/只补了一点/水位还够，没补 |
| `fertilize` | `ml`、`dose`、`how` |
| `observe` | `symptoms`（数组）、`level`、`water` |
| `ai` | `analysis`（大模型解析出的对象，见第 6 节）、`model`、`usage`、`ms`；解析失败时是 `analysisRaw` |

### data/settings.json

```jsonc
{
  "apiKey": "",                              // 明文存在本机；接口返回时只回 "••••••••xxxx"
  "baseUrl": "https://api.deepseek.com",     // 不含 /chat/completions
  "model": "deepseek-flash",                 // 必须支持图片输入
  "detail": "high",                          // high | low
  "remindDays": 2,                           // 几天没拍照就提醒
  "seedlingDays": 21,                        // 缓苗期天数（所有植株共用）
  "lanAccess": false,                        // 手机局域网访问（改完要重启）
  "temperature": 0.3, "maxTokens": 1400
}
```

## 4. HTTP 接口

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/log` | 返回 `{db:{entries}, today, serverTime, lan}` |
| GET | `/api/plants` | 返回 `{plants, presets, seasons, seedlingDays}`（**含已移出的**） |
| POST | `/api/plants` | `{op:'add'\|'update'\|'delete'\|'restore', …}`；`delete` 默认归档，`purge:true` 才连记录删 |
| GET | `/api/settings` | Key 打码返回 |
| POST | `/api/settings` | 保存；传 `clearKey:true` 清空 Key |
| POST | `/api/photo` | `{dataUrl}` → 存进 `data/photos/`，返回 `{file:"photos/xxx.jpg"}` |
| POST | `/api/analyze` | `{plant, photos[], note}` → 调大模型、解析、写一条 `ai` 记录 |
| POST | `/api/test` | 试 `/models`，失败再试一次极短对话；返回可用模型列表 |
| POST | `/api/log` | `{op:'add'\|'delete'\|'update'}` 手动记录 |
| GET | `/api/export.csv` | 导出 CSV（带 BOM，Excel 直接打开） |
| GET | `/` `/style.css` `/app.js` `/icon.ico` `/img/*` `/photos/*` `/card.pdf` | 静态资源 |

**错误约定**：统一 `{ok:false, error:"中文原因"}`；成功 `{ok:true, …}`。

## 5. 前端结构（public/app.js）

关键全局变量：

| 变量 | 含义 |
| --- | --- |
| `DB` | `log.json` 内容（`DB.entries`） |
| `ALL_PLANTS` | 全部植株（含已移出的） |
| `plants` | 正在养护的植株（`ALL_PLANTS` 过滤掉 archived） |
| `plant` | 当前选中的记录对象：植株 id 或 `'both'`（=全部） |
| `type` | 当前手动记录类型 |
| `photos` / `manualPhotos` | AI 用 / 手动记录用的已上传照片路径 |
| `PRESETS` / `SEASONS` | 从 `/api/plants` 拿到的预设与季节定义 |
| `editingId` / `pendingAvatar` | 植株管理表单的编辑态 |

关键函数：`load()`（拉三个接口后统一渲染）、`statusFor(id)`（规则引擎）、`renderHeader/Cards/Advice/History/Result`、
`openPlants()/renderPlantList()/fillPlantForm()`、`addFiles()/analyze()`、`seg()`（分段按钮）。

约定：

- DOM 一律 `$('id')` 取；**新增元素必须在 index.html 加 id，并在 app.js 里引用**（`tools/e2e.js` 会检查引用完整性）。
- 所有插入的文本都要过 `esc()`，不要直接把模型返回的字符串塞进 innerHTML（模型输出不可信）。
- 界面渲染是「全量重绘」风格：改完数据就 `await load()`，不要做局部 patch。

**规则引擎（`statusFor` / `renderAdvice`）里的业务规则**（改业务逻辑看这里，`server.js` 的 `buildMessages` 里有一份对应描述）：

1. 换水周期 = 该株 `intervals[当月]`；已达下限=可换、超上限=该换、超上限 1.5 倍=已超期。
2. 缓苗期 = `settings.seedlingDays - (今天 - plant.addedAt)`，期间**只加清水不加营养液**。
3. 连续补水计数：该株最后一次换水之后的 `water` 记录数 ≥2 → 提醒下次必须整瓶换水。
4. 症状 → 建议的映射表 `SYMPTOM_ADVICE`。
5. 换水前的观察若早于最近一次换水，会标注「换水前观察到（换水后请再确认一次）」。

## 6. 大模型集成

- 只支持 **OpenAI 兼容**的 `POST {baseUrl}/chat/completions`，头 `Authorization: Bearer <key>`。
- 图片以 **base64 data URL** 内联，且**只能放在 `user` 消息**里：

```jsonc
{ "type": "image_url", "image_url": { "url": "data:image/jpeg;base64,…", "detail": "high" } }
```

- 提示词在 `server.js` 的 `buildMessages()`：system 里是养护铁律 + 每株的当前状态 + 最近历史；user 里是要模型看的照片与输出要求。
- **结构化输出契约**（模型必须只回这个 JSON，`parseAnalysis()` 会剥掉 ```json 围栏再解析）：

```jsonc
{
  "verdict": "一句话结论",
  "urgency": "ok|watch|urgent",
  "plants_seen": ["认出的植株名"],
  "water_level": { "issue": "合适|偏高|偏低|看不清", "reason": "依据" },
  "water_quality": "清澈|微浑|浑浊|看不清",
  "foam_wet": true,                      // 或 false / "看不清"
  "roots": { "look": "描述", "rot_suspected": false, "new_roots_visible": false },
  "leaves": "描述", "bottle": "描述",
  "symptoms": ["…"],
  "actions": ["最多 4 条，按优先级"],
  "next_change_days": 7,
  "uncertain": ["照片看不清、需要人工确认的点"]
}
```

改动提示词时请保持字段名不变（前端 `renderResult()` 依赖它）；要加字段就同时改前端的映射与 `URGENCY`/`ROWICON`。

## 7. 已知坑（都踩过）

1. **两个抽屉共用样式**：`#drawer` 与 `#plantDrawer` 必须一起写选择器。曾经只写了 `#drawer`，导致植株管理面板不浮动、挤在页面底部。
2. **下拉框要自己填 option**：`<select id="pPreset"></select>` 里的选项是 `openPlants()` 里用 `PRESETS` 填的，漏了就是空下拉。
3. **照片的两种路径**：磁盘上是 `data/photos/xxx.jpg`，而记录里存、URL 用的是 `photos/xxx.jpg`。`b64OfPhoto()` 负责映射，改路径逻辑时别漏。
4. **`.ps1` 必须纯 ASCII**：Windows PowerShell 5.1 会把**无 BOM 的 UTF-8** 脚本按 GBK 读，中文字面量会乱码（比较、匹配全失效）。`open_app.ps1`、`tools/shot.ps1` 都是纯 ASCII，请保持。
5. **`.cmd` 里别在 for/括号块里用 `%ProgramFiles(x86)%`**：括号会破坏解析。浏览器启动逻辑已挪到 `open_app.ps1`。
6. **无头截图看不到固定浮层**：`--virtual-time-budget` 对 `setTimeout` + `position:fixed` 抽屉不可靠。要看浮层样式，用 `tools/ui-probe.js` 的思路**抓真实 DOM 拼静态页**再截图。
7. **子进程用 `stdio:'ignore'`**：本项目在受限沙箱里跑过，管道（pipe）会 EPERM。`tools/e2e.js` 因此不用管道读子进程输出，只有 UI 探针用 pipe（只在普通环境用）。
8. **前端不缓存**：静态文件都带 `Cache-Control: no-cache`，但浏览器可能仍缓存过；调试时用 `Ctrl+F5`。
9. **`data/settings.json` 里有明文 Key**：任何日志、截图、提交都不要带它。

## 8. 怎么验证（改完必跑）

```powershell
# 1) 端到端自检（假模型 + 临时数据目录，不花钱、不动真实数据）
node tools/e2e.js

# 2) 界面逻辑自检（单独跑，需先启动服务）
node server.js          # 另开一个窗口
node tools/ui-probe.js http://127.0.0.1:8787

# 3) 手动点界面调试（不消耗真实额度）
node tools/fake-api.js                       # 另开窗口，监听 8799
#   界面「设置」→ Base URL 改成 http://127.0.0.1:8799，Key 随便填 → 正常传图点分析
#   每次请求的完整 messages 会写到 tools/_last_request.json，方便检查提示词

# 4) 视觉自查
powershell -NoProfile -ExecutionPolicy Bypass -File tools\shot.ps1 -Url http://127.0.0.1:8787/ -Out shots\home.png
```

`tools/e2e.js` 覆盖：静态资源、默认植株、新增/修改/归档/恢复/彻底删除、CSV 同步、
提示词注入（新植株名称/提示/本月间隔/其它株）、图片内联、图片入库落盘、界面逻辑、以及**真实数据未被改动**。

## 9. 可以做的改进（用户提过或明显缺的）

- [ ] 让模型**自动判断照片是哪一株**（现在要在"检查哪株"里手选；提示词里已给出各株特征，模型有能力做）
- [ ] 记录可编辑（现在只能删除重记）
- [ ] 到期提醒推到 Windows 通知 / 计划任务（现在只在页面顶部显示横幅）
- [ ] 同一株的历史照片按角度对比（生长/根况变化）
- [ ] 一株多瓶、或一株多个位置
- [ ] 导出「养护报告」PDF/Markdown
- [ ] 把 `data/` 加一层简单备份（每次启动备份上一版 log.json）

## 10. 改完请顺手做

1. `node tools/e2e.js` 全绿。
2. 若改了数据格式 / 接口 / 提示词契约，**同步更新本文件**。
3. 若改了用户可见的行为，更新 `说明.md`。
4. 不要提交 `data/`、`tools/_last_request.json`、任何截图产物。
