#!/usr/bin/env node
'use strict';
/**
 * 水培养护助手 v3 —— 多植株版（零依赖）
 *  · 植株可增删改：data/plants.json（各自独立的换水间隔、水位偏好、缓苗期、头像）
 *  · 上传/拍照 → 大模型看图 → 结构化意见入库
 *  · 记录：data/log.json   设置：data/settings.json
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = __dirname;
const PUBLIC = path.join(ROOT, 'public');
/* 数据目录：默认 ROOT/data；测试时可指向临时目录，避免动到真实数据
   （tools/e2e.js 就是这么做的：CARE_DATA_DIR=临时目录） */
const DATA = process.env.CARE_DATA_DIR ? path.resolve(process.env.CARE_DATA_DIR) : path.join(ROOT, 'data');
const PHOTOS = path.join(DATA, 'photos');
const LOG = path.join(DATA, 'log.json');
const CSV = path.join(DATA, 'log.csv');
const SETTINGS = path.join(DATA, 'settings.json');
const PLANTS_FILE = path.join(DATA, 'plants.json');
const PORT = Number(process.env.PORT || 8787);
const HOST_ENV = process.env.HOST || '';   // 留空=按设置里的 lanAccess 决定
const MAX_BODY = 40 * 1024 * 1024;

const TYPE_LABEL = { start: '开始记录', change: '换水', water: '补水', fertilize: '加肥', observe: '观察', ai: 'AI看图' };

/* ---------- 季节 ---------- */
const SEASONS = [
  { key: 'spring', label: '春季（3–5 月）', months: [3, 4, 5] },
  { key: 'summer', label: '夏季（6–8 月）', months: [6, 7, 8] },
  { key: 'autumn', label: '秋季（9–11 月）', months: [9, 10, 11] },
  { key: 'winter', label: '冬季（12–2 月）', months: [12, 1, 2] },
];
const MONTH2SEASON = {};
SEASONS.forEach((s) => s.months.forEach((m) => { MONTH2SEASON[m] = s.key; }));

/* ---------- 预设（换水间隔，单位：天） ---------- */
const PRESETS = {
  foliage: { label: '观叶植物（如意皇后 / 绿萝 / 龟背竹）', intervals: { spring: [5, 10], summer: [5, 5], autumn: [7, 7], winter: [10, 15] } },
  woody: { label: '木本 · 松柏类（罗汉松 / 榕树）', intervals: { spring: [7, 10], summer: [5, 7], autumn: [7, 10], winter: [15, 20] } },
  herb: { label: '草本花卉（草莓 / 薄荷 / 铜钱草）', intervals: { spring: [5, 7], summer: [4, 5], autumn: [5, 7], winter: [10, 14] } },
  succulent: { label: '多肉 / 仙人掌', intervals: { spring: [14, 21], summer: [10, 14], autumn: [14, 21], winter: [21, 30] } },
  custom: { label: '自定义（自己填）', intervals: null },
};

const DEFAULT_PLANTS = [
  {
    id: 'luohansong', name: '水培罗汉松', img: '/img/plant-luohansong.jpg', preset: 'woody',
    hint: '木质根，水位取低；明亮散射光，可略多光；生长慢', level: 'low', addedAt: '2026-10-04',
    intervals: {
      1: [15, 20], 2: [15, 20], 3: [7, 10], 4: [7, 10], 5: [7, 10], 6: [5, 7],
      7: [5, 7], 8: [5, 7], 9: [7, 10], 10: [7, 10], 11: [8, 12], 12: [15, 20],
    },
  },
  {
    id: 'hongyan', name: '水培红颜（如意皇后）', img: '/img/plant-hongyan.jpg', preset: 'foliage',
    hint: '天南星科观叶，忌阳光直射；斑纹鲜艳需明亮散射光', level: 'normal', addedAt: '2026-10-04',
    intervals: {
      1: [10, 15], 2: [10, 15], 3: [5, 10], 4: [5, 10], 5: [5, 10], 6: [5, 5],
      7: [5, 5], 8: [5, 5], 9: [5, 10], 10: [7, 7], 11: [8, 12], 12: [10, 15],
    },
  },
];

const DEFAULT_SETTINGS = {
  apiKey: '', baseUrl: 'https://api.deepseek.com', model: 'deepseek-flash', detail: 'high',
  remindDays: 2, lanAccess: false, temperature: 0.3, maxTokens: 1400, seedlingDays: 21,
};

const SEED_LOG = { version: 3, createdAt: '2026-10-04', entries: [] };
const SEED_START = { id: 'seed-1', at: '2026-10-04T09:00', plant: 'both', type: 'start', data: {}, note: '购入并开始养护（起始基准，可删除）', photos: [] };

/* ---------- 基础工具 ---------- */
function ensureDirs() {
  for (const d of [DATA, PHOTOS, PUBLIC]) fs.mkdirSync(d, { recursive: true });
  if (!fs.existsSync(LOG)) fs.writeFileSync(LOG, JSON.stringify(SEED_LOG, null, 2), 'utf8');
  if (!fs.existsSync(SETTINGS)) fs.writeFileSync(SETTINGS, JSON.stringify(DEFAULT_SETTINGS, null, 2), 'utf8');
  if (!fs.existsSync(PLANTS_FILE)) {
    // 首次运行：写入两株默认植物，并保留一条起始记录
    fs.writeFileSync(PLANTS_FILE, JSON.stringify({ version: 1, plants: DEFAULT_PLANTS }, null, 2), 'utf8');
    const log = readJson(LOG, SEED_LOG);
    if (!(log.entries || []).length) { log.entries = [SEED_START]; fs.writeFileSync(LOG, JSON.stringify(log, null, 2), 'utf8'); }
  }
}
function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (e) { console.error('[warn] 读取失败 ' + path.basename(file) + ': ' + e.message); return JSON.parse(JSON.stringify(fallback)); }
}
const loadLog = () => { const l = readJson(LOG, SEED_LOG); if (!Array.isArray(l.entries)) l.entries = []; return l; };
const loadSettings = () => Object.assign({}, DEFAULT_SETTINGS, readJson(SETTINGS, DEFAULT_SETTINGS));
const saveSettings = (s) => fs.writeFileSync(SETTINGS, JSON.stringify(s, null, 2), 'utf8');

function loadPlants() {
  const d = readJson(PLANTS_FILE, { version: 1, plants: DEFAULT_PLANTS });
  let list = Array.isArray(d.plants) ? d.plants : DEFAULT_PLANTS;
  list = list.map((p) => Object.assign({
    preset: 'custom', level: 'normal', addedAt: new Date().toISOString().slice(0, 10), archived: false,
  }, p));
  return list;
}
const savePlants = (list) => fs.writeFileSync(PLANTS_FILE, JSON.stringify({ version: 1, plants: list }, null, 2), 'utf8');
const activePlants = () => loadPlants().filter((p) => !p.archived);

function csvCell(v) {
  const s = v === undefined || v === null ? '' : String(v);
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
function plantName(id, list) {
  if (id === 'both' || id === 'all') return '全部植株';
  const p = (list || loadPlants()).find((x) => x.id === id);
  return p ? p.name + (p.archived ? '（已移出）' : '') : id;
}
function writeCsv(db) {
  const head = ['时间', '植株', '类型', '水位', '水质', '烂根', '营养液(ml)', '浓度', '症状', 'AI结论', '紧急度', '备注', '照片'];
  const list = loadPlants();
  const rows = [...(db.entries || [])].sort((a, b) => String(a.at).localeCompare(String(b.at))).map((e) => {
    const d = e.data || {}, a = d.analysis || {};
    return [e.at, plantName(e.plant, list), TYPE_LABEL[e.type] || e.type, d.level || '', d.water || '', d.rot || '',
      d.ml || '', d.dose || '', (d.symptoms || []).join('/'), a.verdict || '', a.urgency || '',
      e.note || '', (e.photos || []).join(' ')].map(csvCell).join(',');
  });
  fs.writeFileSync(CSV, '\ufeff' + head.join(',') + '\n' + rows.join('\n') + '\n', 'utf8');
}
function saveLog(db) {
  db.entries = (db.entries || []).slice().sort((a, b) => String(a.at).localeCompare(String(b.at)));
  fs.writeFileSync(LOG, JSON.stringify(db, null, 2), 'utf8');
  writeCsv(db);
}
function json(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(obj));
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let n = 0; const chunks = [];
    req.on('data', (c) => { n += c.length; if (n > MAX_BODY) { reject(new Error('请求体过大（照片请压缩后再传）')); req.destroy(); return; } chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}
const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
function nowLocal(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
const dayOf = (s) => String(s || '').slice(0, 10);
function diffDays(a, b) {
  if (!a || !b) return null;
  return Math.round((new Date(dayOf(b) + 'T00:00') - new Date(dayOf(a) + 'T00:00')) / 86400000);
}
function lanAddress() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const i of list || []) if (i.family === 'IPv4' && !i.internal) out.push(i.address);
  }
  return out;
}
function intervalOf(plant, dateStr) {
  const month = Number(dayOf(dateStr).slice(5, 7));
  const iv = (plant.intervals || {})[month];
  if (Array.isArray(iv) && iv.length === 2) return [Number(iv[0]), Number(iv[1])];
  const s = (PRESETS[plant.preset] || PRESETS.foliage).intervals;
  return s ? s[MONTH2SEASON[month]] : [7, 10];
}

/* ---------- 状态计算 ---------- */
function statusFor(entries, plant, today, seedlingDays) {
  const es = (entries || []).filter((e) => e.plant === plant.id || e.plant === 'both' || e.plant === 'all');
  const lastOf = (types) => { const f = es.filter((e) => types.includes(e.type)); return f.length ? f[f.length - 1] : null; };
  const last = lastOf(['change', 'start']);
  const lastChange = lastOf(['change']);
  const iv = intervalOf(plant, today);
  const days = last ? diffDays(last.at, today) : null;
  let level = 'info', text = '还没有记录，先记一次吧';
  if (days != null) {
    if (days >= Math.round(iv[1] * 1.5)) { level = 'danger'; text = `已超期 ${days} 天没换水，尽快换`; }
    else if (days >= iv[1]) { level = 'warn'; text = `该换水了（已经 ${days} 天）`; }
    else if (days >= iv[0]) { level = 'warn'; text = `可以换了（已经 ${days} 天），建议 ${iv[1] - days} 天内换`; }
    else { level = 'ok'; text = `正常，还有约 ${iv[0] - days} 天到你平时的间隔`; }
  }
  const base = lastChange || last;
  const watersSince = base ? es.filter((e) => e.type === 'water' && String(e.at) > String(base.at)).length : 0;
  return {
    plant, iv, days, level, text, last, lastChange, watersSince,
    pct: days == null ? 0 : Math.min(100, Math.round(days / iv[1] * 100)),
    lastWater: lastOf(['water']), lastFert: lastOf(['fertilize']), lastObs: lastOf(['observe', 'ai']),
    seedlingLeft: Math.max(0, (seedlingDays || 21) - (diffDays(plant.addedAt, today) || 0)),
  };
}

/* ---------- 大模型提示词 ---------- */
function buildMessages(plants, entries, cfg, plantId, photosB64, note, today) {
  const target = (plantId === 'both' || plantId === 'all') ? plants : plants.filter((p) => p.id === plantId);
  const month = Number(dayOf(today).slice(5, 7));
  const season = MONTH2SEASON[month];

  const lines = target.map((p) => {
    const st = statusFor(entries, p, today, cfg.seedlingDays);
    return `- ${p.name}：${p.hint || '（无特别说明）'}；水位偏好：${p.level === 'low' ? '取低（根颈必须露在空气里）' : '标准（没过根系一半）'}；`
      + `距上次换水 ${st.days == null ? '无记录' : st.days + ' 天'}（本月建议 ${st.iv.join('~')} 天）；`
      + `本次换水后已补水 ${st.watersSince} 次；上次补水 ${st.lastWater ? dayOf(st.lastWater.at) : '无'}；`
      + `上次加肥 ${st.lastFert ? dayOf(st.lastFert.at) : '无'}；缓苗期${st.seedlingLeft > 0 ? '还剩 ' + st.seedlingLeft + ' 天' : '已结束'}。`;
  }).join('\n');

  const recent = [...(entries || [])].reverse().slice(0, 12).map((e) => {
    const d = e.data || {}, bits = [];
    if (d.level) bits.push('水位' + d.level);
    if (d.water) bits.push('水质' + d.water);
    if (d.rot) bits.push('烂根' + d.rot);
    if (d.ml) bits.push('营养液' + d.ml + 'ml');
    if (d.symptoms) bits.push('症状' + (d.symptoms || []).join('、'));
    if (d.analysis && d.analysis.verdict) bits.push('上次AI结论：' + d.analysis.verdict);
    return `  ${e.at.replace('T', ' ')} ${plantName(e.plant)} ${TYPE_LABEL[e.type] || e.type} ${bits.join(' ')} ${e.note || ''}`.trim();
  }).join('\n');

  const others = plants.filter((p) => !target.some((t) => t.id === p.id));
  const sys = `你是一位资深的水培植物养护师，正在帮用户检查他养的水培植物。今天是 ${today}（第 ${month} 月，${season === 'spring' ? '春' : season === 'summer' ? '夏' : season === 'autumn' ? '秋' : '冬'}季）。\n`
    + `【容器】玻璃瓶 + 木盖 + 带槽内胆定植篮 + 岩棉(泡棉)固定，水位只淹到根的下半段。\n`
    + `【铁律】\n`
    + `1. 水位"没过根系一半"：根的上半截和泡棉必须露在空气里；泡棉一旦接触水面 = 水位过高。\n`
    + `2. 补水只加水，不加营养液；连续补水 2 次后第 3 次必须整瓶换水。\n`
    + `3. 换水间隔以每株自己的设定为准（下面已给出本月建议）。\n`
    + `4. 缓苗期内只用清水，绝不能加营养液；服盆后每次换水按说明书 1/2 浓度加（1 升水 0.5~1 ml），宁淡勿浓。\n`
    + `5. 健康根＝硬挺有弹性、白色/乳白/淡黄/木质褐；烂根＝发黑、半透明、软烂一捏成泥、有臭味。\n`
    + `6. 症状→处理：叶黄发软+水臭=烂根(剪烂根/降水/勤换水/通风)；新叶小色淡=缺肥或光弱；叶尖焦边=暴晒；水变绿=光强+养分多(遮光/减肥/勤换水)；大量落叶=温差或换水太猛；泡棉发黑=水位过高。\n`
    + `7. 自来水需晾 1~2 天散氯，或直接用纯净水；水温接近室温。木本/多肉类比观叶植物更怕长期缺氧，水位要更低。\n`
    + `\n【本次要检查的植株】\n${target.map((p) => '- ' + p.name + '：' + (p.hint || '')).join('\n')}`
    + (others.length ? `\n\n【其它在养植株（照片里若出现，请一并认出来）】\n${others.map((p) => '- ' + p.name + '：' + (p.hint || '')).join('\n')}` : '')
    + `\n\n【系统已算出的当前状态】\n${lines}\n\n【最近的养护历史（新→旧）】\n${recent || '（无）'}`;

  const ask = `请仔细看我上传的 ${photosB64.length} 张照片（同一批拍的，可能包含不止一株，请自己分辨哪张照片是哪一株，依据是各株的形态特征）。`
    + (note ? `\n用户补充说明：${note}` : '')
    + `\n\n请逐项评估并只输出一个 JSON 对象（不要 Markdown 代码块、不要任何多余文字），字段与取值如下：
{
  "verdict": "一句话结论（不超过40字）",
  "urgency": "ok 或 watch 或 urgent",
  "plants_seen": ["你在照片里认出的植株名称"],
  "water_level": {"issue": "合适 或 偏高 或 偏低 或 看不清", "reason": "判断依据：水面与根/泡棉的相对位置"},
  "water_quality": "清澈 或 微浑 或 浑浊 或 看不清",
  "foam_wet": true 或 false 或 "看不清",
  "roots": {"look": "根的粗细颜色外观描述", "rot_suspected": true 或 false, "new_roots_visible": true 或 false},
  "leaves": "叶片状态的观察",
  "bottle": "瓶底/瓶壁有没有沉积、藻、悬浮物",
  "symptoms": ["观察到的问题，没有就空数组"],
  "actions": ["具体可执行的动作，最多4条，按优先级排序"],
  "next_change_days": 数字（建议几天后换水，按上面给出的间隔规则）,
  "uncertain": ["照片看不清、需要用户自己用手摸或用鼻子闻才能确认的点"]
}

要求：只写你在照片里真实看到的东西；看不清就明确写"看不清"并放进 uncertain，绝不编造。`;

  const content = [{ type: 'text', text: ask }];
  for (const b64 of photosB64) content.push({ type: 'image_url', image_url: { url: 'data:image/jpeg;base64,' + b64, detail: cfg.detail || 'high' } });
  return [{ role: 'system', content: sys }, { role: 'user', content }];
}

function parseAnalysis(text) {
  if (!text) return null;
  let t = String(text).trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  const s = t.indexOf('{'), e = t.lastIndexOf('}');
  if (s >= 0 && e > s) t = t.slice(s, e + 1);
  try { return JSON.parse(t); } catch (err) { return null; }
}

async function callLLM(cfg, messages) {
  const url = String(cfg.baseUrl || '').replace(/\/+$/, '') + '/chat/completions';
  const t0 = Date.now();
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + cfg.apiKey },
    body: JSON.stringify({
      model: cfg.model, messages,
      temperature: Number(cfg.temperature) || 0.3,
      max_tokens: Number(cfg.maxTokens) || 1400, stream: false,
    }),
    signal: AbortSignal.timeout(180000),
  });
  const text = await res.text();
  let data = null;
  try { data = JSON.parse(text); } catch (e) { }
  if (!res.ok) {
    const msg = (data && data.error && (data.error.message || data.error.code)) || text.slice(0, 400);
    throw new Error(`接口返回 ${res.status}：${msg}`);
  }
  const content = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
  return { content: content || '', usage: (data && data.usage) || null, model: (data && data.model) || cfg.model, ms: Date.now() - t0 };
}

/* ---------- HTTP ---------- */
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.ico': 'image/x-icon', '.pdf': 'application/pdf', '.svg': 'image/svg+xml',
};
const safeJoin = (base, rel) => { const p = path.normalize(path.join(base, rel)); return p.startsWith(base) ? p : null; };
function serveFile(res, file, type) {
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('未找到文件'); return; }
    res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-cache' }); res.end(buf);
  });
}
function savePhoto(dataUrl, baseName) {
  const m = /^data:image\/(png|jpe?g|webp);base64,(.+)$/i.exec(dataUrl || '');
  if (!m) throw new Error('只支持 png / jpg / webp 图片');
  const ext = /jpe?g/i.test(m[1]) ? 'jpg' : m[1].toLowerCase();
  const name = (baseName || nowLocal().replace(/[-:T]/g, '')) + '-' + newId() + '.' + ext;
  fs.writeFileSync(path.join(PHOTOS, name), Buffer.from(m[2], 'base64'));
  return 'photos/' + name;
}
function b64OfPhoto(rel) {
  const clean = String(rel || '').replace(/^\/+/, '');
  const p = clean.startsWith('photos/') ? safeJoin(PHOTOS, clean.slice('photos/'.length)) : safeJoin(ROOT, clean);
  if (!p || !fs.existsSync(p)) throw new Error('找不到照片：' + rel);
  return fs.readFileSync(p).toString('base64');
}

function normalizePlant(body, base) {
  const p = Object.assign({}, base || {});
  if (body.name !== undefined) p.name = String(body.name).slice(0, 40).trim();
  if (body.hint !== undefined) p.hint = String(body.hint).slice(0, 300).trim();
  if (body.level !== undefined) p.level = body.level === 'low' ? 'low' : 'normal';
  if (body.preset !== undefined) p.preset = PRESETS[body.preset] ? body.preset : 'custom';
  if (body.addedAt !== undefined) p.addedAt = dayOf(body.addedAt) || p.addedAt;
  if (body.img !== undefined) p.img = body.img ? String(body.img) : null;
  if (body.intervals && typeof body.intervals === 'object') {
    const iv = {};
    for (let m = 1; m <= 12; m++) {
      const v = body.intervals[m] || body.intervals[String(m)];
      if (Array.isArray(v) && v.length === 2) {
        const a = Math.max(1, Math.min(90, Number(v[0]) || 7)), b = Math.max(a, Math.min(120, Number(v[1]) || a));
        iv[m] = [a, b];
      }
    }
    if (Object.keys(iv).length === 12) p.intervals = iv;
  }
  return p;
}

async function api(req, res, pathname) {
  const db = loadLog();
  const cfg = loadSettings();
  const today = nowLocal().slice(0, 10);
  const plants = loadPlants();

  if (req.method === 'GET' && pathname === '/api/log') {
    json(res, 200, { ok: true, db, today, serverTime: nowLocal(), lan: lanAddress().map((ip) => `http://${ip}:${PORT}`) });
    return true;
  }

  /* ---- 植株管理 ---- */
  if (req.method === 'GET' && pathname === '/api/plants') {
    json(res, 200, { ok: true, plants, presets: PRESETS, seasons: SEASONS, seedlingDays: cfg.seedlingDays });
    return true;
  }

  if (req.method === 'POST' && pathname === '/api/plants') {
    let body; try { body = JSON.parse(await readBody(req)); } catch (e) { json(res, 400, { ok: false, error: '数据解析失败' }); return true; }
    const list = loadPlants();

    if (body.op === 'add') {
      const p = normalizePlant(body.plant || {}, {
        id: newId(), preset: 'foliage', level: 'normal', archived: false, img: null,
        addedAt: today, hint: '',
      });
      if (!p.name) { json(res, 400, { ok: false, error: '请填写植株名称' }); return true; }
      if (!p.intervals) p.intervals = expandPreset(p.preset);
      list.push(p); savePlants(list);
      // 自动写一条起始记录，周期计算立刻生效
      const entry = {
        id: newId(), at: (p.addedAt || today) + 'T09:00', plant: p.id, type: 'start', data: {},
        note: '新增植株，开始养护', photos: [], savedAt: new Date().toISOString(),
      };
      db.entries.push(entry); saveLog(db);
      json(res, 200, { ok: true, plant: p, plants: list, entry });
      return true;
    }

    if (body.op === 'update') {
      const i = list.findIndex((x) => x.id === body.id);
      if (i < 0) { json(res, 404, { ok: false, error: '找不到这株植物' }); return true; }
      const p = normalizePlant(body.patch || {}, list[i]);
      if (!p.name) { json(res, 400, { ok: false, error: '名称不能为空' }); return true; }
      if (!p.intervals) p.intervals = expandPreset(p.preset);
      list[i] = p; savePlants(list);
      writeCsv(db);
      json(res, 200, { ok: true, plant: p, plants: list });
      return true;
    }

    if (body.op === 'delete') {
      const i = list.findIndex((x) => x.id === body.id);
      if (i < 0) { json(res, 404, { ok: false, error: '找不到这株植物' }); return true; }
      const p = list[i];
      const mine = (db.entries || []).filter((e) => e.plant === p.id).length;
      if (body.purge) {
        // 连同记录一起删除
        db.entries = db.entries.filter((e) => e.plant !== p.id);
        const multi = db.entries.filter((e) => e.plant === 'both');
        list.splice(i, 1);
        // 只剩一株时，把"全部"记录归到剩下那株，避免变成孤儿
        if (list.filter((x) => !x.archived).length === 1) {
          const only = list.find((x) => !x.archived);
          multi.forEach((e) => { e.plant = only.id; });
        }
        savePlants(list); saveLog(db);
        json(res, 200, { ok: true, purged: mine, plants: list });
        return true;
      }
      // 默认：移出列表，保留历史（名称仍可显示）
      list[i] = Object.assign({}, p, { archived: true, archivedAt: today });
      savePlants(list); writeCsv(db);
      json(res, 200, { ok: true, archived: true, kept: mine, plants: list });
      return true;
    }

    if (body.op === 'restore') {
      const i = list.findIndex((x) => x.id === body.id);
      if (i < 0) { json(res, 404, { ok: false, error: '找不到这株植物' }); return true; }
      list[i] = Object.assign({}, list[i], { archived: false });
      savePlants(list);
      json(res, 200, { ok: true, plants: list });
      return true;
    }

    json(res, 400, { ok: false, error: '未知操作' });
    return true;
  }

  if (req.method === 'GET' && pathname === '/api/settings') {
    const masked = Object.assign({}, cfg, { apiKey: cfg.apiKey ? '••••••••' + cfg.apiKey.slice(-4) : '', hasKey: !!cfg.apiKey });
    json(res, 200, { ok: true, settings: masked, lan: lanAddress().map((ip) => `http://${ip}:${PORT}`), port: PORT });
    return true;
  }

  if (req.method === 'POST' && pathname === '/api/settings') {
    let body; try { body = JSON.parse(await readBody(req)); } catch (e) { json(res, 400, { ok: false, error: '数据解析失败' }); return true; }
    const next = Object.assign({}, cfg);
    for (const k of ['baseUrl', 'model', 'detail', 'remindDays', 'lanAccess', 'temperature', 'maxTokens', 'seedlingDays']) {
      if (body[k] !== undefined) next[k] = body[k];
    }
    if (typeof body.apiKey === 'string' && body.apiKey && !/^•+/.test(body.apiKey)) next.apiKey = body.apiKey.trim();
    if (body.clearKey) next.apiKey = '';
    saveSettings(next);
    json(res, 200, { ok: true, settings: Object.assign({}, next, { apiKey: next.apiKey ? '••••••••' + next.apiKey.slice(-4) : '' }), needRestart: body.lanAccess !== undefined && body.lanAccess !== cfg.lanAccess });
    return true;
  }

  if (req.method === 'GET' && pathname === '/api/export.csv') {
    writeCsv(db); res.writeHead(200, { 'Content-Type': 'text/csv; charset=utf-8' }); res.end(fs.readFileSync(CSV)); return true;
  }

  if (req.method === 'POST' && pathname === '/api/photo') {
    let body; try { body = JSON.parse(await readBody(req)); } catch (e) { json(res, 400, { ok: false, error: '照片数据解析失败' }); return true; }
    try { json(res, 200, { ok: true, file: savePhoto(body.dataUrl) }); }
    catch (e) { json(res, 400, { ok: false, error: e.message }); }
    return true;
  }

  if (req.method === 'POST' && pathname === '/api/test') {
    const c = Object.assign({}, cfg);
    const b = await readBody(req).then((t) => (t ? JSON.parse(t) : {})).catch(() => ({}));
    if (b.apiKey && !/^•+/.test(b.apiKey)) c.apiKey = b.apiKey.trim();
    if (b.baseUrl) c.baseUrl = b.baseUrl;
    if (b.model) c.model = b.model;
    if (!c.apiKey) { json(res, 200, { ok: false, error: '还没填 API Key' }); return true; }
    const base = String(c.baseUrl).replace(/\/+$/, '');
    const out = { ok: false, models: [] };
    try {
      const r = await fetch(base + '/models', { headers: { Authorization: 'Bearer ' + c.apiKey }, signal: AbortSignal.timeout(30000) });
      if (r.ok) {
        const d = await r.json().catch(() => ({}));
        out.models = (d.data || []).map((m) => m.id).filter(Boolean);
        out.ok = true;
        out.note = '密钥可用' + (out.models.length ? `，可用模型 ${out.models.length} 个` : '');
        if (out.models.length && !out.models.includes(c.model)) out.warn = `注意：模型列表里没有 "${c.model}"，请从上面挑一个填入`;
      } else out.error = `GET /models 返回 ${r.status}`;
    } catch (e) { out.error = '连接失败：' + e.message; }
    if (!out.ok) {
      try {
        const r = await callLLM(Object.assign({}, c, { maxTokens: 8 }), [{ role: 'user', content: 'ping' }]);
        out.ok = true; out.note = '对话接口可用（/models 不可用）'; out.reply = (r.content || '').slice(0, 40); delete out.error;
      } catch (e) { out.error = (out.error ? out.error + '；' : '') + e.message; }
    }
    json(res, 200, out);
    return true;
  }

  if (req.method === 'POST' && pathname === '/api/analyze') {
    let body; try { body = JSON.parse(await readBody(req)); } catch (e) { json(res, 400, { ok: false, error: '数据解析失败' }); return true; }
    const act = plants.filter((p) => !p.archived);
    if (!act.length) { json(res, 400, { ok: false, error: '还没有添加任何植株，先去「植株管理」加一株' }); return true; }
    let plantId = body.plant || (act.length ? act[0].id : 'both');
    if (plantId !== 'both' && plantId !== 'all' && !act.some((p) => p.id === plantId)) plantId = act[0].id;
    const photos = Array.isArray(body.photos) ? body.photos.slice(0, 4) : [];
    if (!photos.length) { json(res, 400, { ok: false, error: '请先上传至少一张照片' }); return true; }
    if (!cfg.apiKey) { json(res, 400, { ok: false, error: '还没填 API Key：点右上角「设置」填入 DeepSeek 的 Key' }); return true; }

    let b64s;
    try { b64s = photos.map(b64OfPhoto); } catch (e) { json(res, 400, { ok: false, error: e.message }); return true; }

    const messages = buildMessages(act, db.entries, cfg, plantId, b64s, body.note || '', today);
    let r;
    try { r = await callLLM(cfg, messages); }
    catch (e) { json(res, 502, { ok: false, error: '调用大模型失败：' + e.message }); return true; }

    const analysis = parseAnalysis(r.content);
    const entry = {
      id: newId(), at: body.at || nowLocal(), plant: plantId, type: 'ai',
      data: { analysis, analysisRaw: analysis ? undefined : r.content, model: r.model, usage: r.usage, ms: r.ms },
      note: body.note || '', photos, savedAt: new Date().toISOString(),
    };
    db.entries.push(entry); saveLog(db);
    json(res, 200, { ok: true, analysis, raw: analysis ? undefined : r.content, entry, model: r.model, usage: r.usage, ms: r.ms });
    return true;
  }

  if (req.method === 'POST' && pathname === '/api/log') {
    let body; try { body = JSON.parse(await readBody(req)); } catch (e) { json(res, 400, { ok: false, error: '数据解析失败' }); return true; }
    if (body.op === 'add') {
      const e = body.entry || {};
      if (!e.type) { json(res, 400, { ok: false, error: '缺少记录类型' }); return true; }
      const entry = {
        id: newId(), at: e.at || nowLocal(), plant: e.plant || 'both', type: e.type,
        data: e.data || {}, note: (e.note || '').toString().slice(0, 500),
        photos: Array.isArray(e.photos) ? e.photos.slice(0, 6) : [], savedAt: new Date().toISOString(),
      };
      db.entries.push(entry); saveLog(db);
      json(res, 200, { ok: true, entry, count: db.entries.length });
      return true;
    }
    if (body.op === 'delete') {
      const before = db.entries.length;
      db.entries = db.entries.filter((e) => e.id !== body.id); saveLog(db);
      json(res, 200, { ok: true, removed: before - db.entries.length, count: db.entries.length });
      return true;
    }
    if (body.op === 'update') {
      const e = db.entries.find((x) => x.id === body.id);
      if (!e) { json(res, 404, { ok: false, error: '记录不存在' }); return true; }
      if (typeof body.note === 'string') e.note = body.note.slice(0, 500);
      if (body.at) e.at = body.at;
      if (body.plant) e.plant = body.plant;
      saveLog(db); json(res, 200, { ok: true, entry: e });
      return true;
    }
    json(res, 400, { ok: false, error: '未知操作' });
    return true;
  }

  return false;
}

/* 把预设展开成 12 个月 */
function expandPreset(key) {
  const s = (PRESETS[key] || PRESETS.foliage).intervals;
  if (!s) return DEFAULT_PLANTS[0].intervals;
  const out = {};
  SEASONS.forEach((se) => se.months.forEach((m) => { out[m] = s[se.key].slice(); }));
  return out;
}

ensureDirs();
saveLog(loadLog());
savePlants(loadPlants());

const listenHost = HOST_ENV || (loadSettings().lanAccess ? '0.0.0.0' : '127.0.0.1');
const server = http.createServer(async (req, res) => {
  const u = new URL(req.url || '/', 'http://localhost');
  const pathname = decodeURIComponent(u.pathname);
  try {
    if (pathname.startsWith('/api/')) {
      const handled = await api(req, res, pathname);
      if (!handled) json(res, 404, { ok: false, error: '接口不存在' });
      return;
    }
    if (pathname === '/' || pathname === '/index.html') { serveFile(res, path.join(PUBLIC, 'index.html'), MIME['.html']); return; }
    if (pathname === '/card.pdf') { serveFile(res, path.join(ROOT, '养护卡.pdf'), MIME['.pdf']); return; }
    let file = null;
    if (pathname.startsWith('/photos/')) file = safeJoin(PHOTOS, pathname.slice('/photos/'.length));
    else file = safeJoin(PUBLIC, pathname.slice(1));
    if (!file || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('未找到：' + pathname); return;
    }
    serveFile(res, file, MIME[path.extname(file).toLowerCase()] || 'application/octet-stream');
  } catch (err) {
    json(res, 500, { ok: false, error: String((err && err.message) || err) });
  }
});

server.listen(PORT, listenHost, () => {
  const cfg = loadSettings();
  const act = activePlants();
  console.log('');
  console.log('  ==================================================');
  console.log('   水培养护助手 v3 已启动');
  console.log('   本机地址:   http://127.0.0.1:' + PORT);
  if (cfg.lanAccess) lanAddress().forEach((ip) => console.log('   手机可访问: http://' + ip + ':' + PORT));
  console.log('   已养护:     ' + (act.length ? act.map((p) => p.name).join('、') : '（还没有植株）'));
  console.log('   大模型:     ' + (cfg.apiKey ? cfg.model + '（已配置 Key）' : '尚未配置 API Key'));
  console.log('   关闭此窗口即停止（数据不会丢）');
  console.log('  ==================================================');
  console.log('');
});
server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') console.error(`\n[错误] 端口 ${PORT} 已被占用：请先关掉已启动的助手窗口。\n`);
  else console.error('[错误]', e.message);
  process.exit(1);
});
