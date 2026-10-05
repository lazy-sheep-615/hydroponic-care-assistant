#!/usr/bin/env node
'use strict';
/**
 * 端到端自检：起一个假大模型接口 + 起一个临时实例（独立数据目录），把核心功能跑一遍。
 *
 *   node tools/e2e.js
 *
 * 特点：
 *  · 不需要真实 API Key，不花钱
 *  · 用 CARE_DATA_DIR 指向临时目录，**不会动你的真实数据**
 *  · 结束时自动清理临时目录并关闭两个子进程
 *  · 全部通过退出码 0，有失败退出码 1（方便交给别的 agent / CI）
 */
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = path.resolve(__dirname, '..');
const NODE = process.execPath;
const PORT = Number(process.env.E2E_PORT || 8790);
const FAKE_PORT = PORT + 1;
const BASE = 'http://127.0.0.1:' + PORT;
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'care-e2e-'));
const REAL_LOG = path.join(ROOT, 'data', 'log.json');
const ONE_PX_PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==';

let fails = 0;
const check = (label, cond, extra) => {
  console.log((cond ? '  ✓ ' : '  ✗ ') + label + (extra !== undefined && extra !== '' ? '  ' + extra : ''));
  if (!cond) fails++;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function req(method, p, body) {
  const r = await fetch(BASE + p, {
    method,
    headers: body ? { 'content-type': 'application/json; charset=utf-8' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  let j = null;
  try { j = JSON.parse(text); } catch (e) { }
  return { status: r.status, ok: r.ok, json: j, text };
}
const get = (p) => req('GET', p);
const post = (p, b) => req('POST', p, b);

async function waitReady(ms = 20000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    try { const r = await get('/api/log'); if (r.ok) return true; } catch (e) { }
    await sleep(250);
  }
  return false;
}

const IV = {};
for (let m = 1; m <= 12; m++) IV[m] = [6, 9];

async function main() {
  const realLogBefore = fs.existsSync(REAL_LOG) ? fs.statSync(REAL_LOG).mtimeMs : null;

  console.log('启动假大模型接口（:' + FAKE_PORT + '）与临时实例（:' + PORT + '，数据目录 ' + DATA + '）');
  const fake = spawn(NODE, [path.join(ROOT, 'tools', 'fake-api.js')], { env: Object.assign({}, process.env, { FAKE_PORT: String(FAKE_PORT) }), stdio: 'ignore' });
  const srv = spawn(NODE, [path.join(ROOT, 'server.js')], {
    env: Object.assign({}, process.env, { PORT: String(PORT), CARE_DATA_DIR: DATA, HOST: '127.0.0.1' }),
    stdio: 'ignore',
  });
  const cleanup = () => { try { fake.kill(); } catch (e) { } try { srv.kill(); } catch (e) { } };
  process.on('exit', cleanup);

  try {
    if (!await waitReady()) { console.error('✗ 临时实例没起来'); process.exitCode = 1; return; }

    console.log('\n=== 1. 静态资源 ===');
    const idx = await get('/');
    check('首页 200 且是助手页面', idx.ok && idx.text.includes('水培养护助手'), idx.status);
    for (const f of ['/style.css', '/app.js', '/icon.ico']) {
      const r = await fetch(BASE + f);
      check('静态文件 ' + f, r.ok, r.status);
    }

    console.log('\n=== 2. 初始植株（首次运行自动生成两株默认）===');
    let pl = (await get('/api/plants')).json;
    check('默认两株', pl.plants.length === 2, pl.plants.map((p) => p.name).join(' / '));
    check('预设表齐全', Object.keys(pl.presets).length >= 5, Object.keys(pl.presets).join(','));
    check('季节表 4 个', pl.seasons.length === 4);

    console.log('\n=== 3. 新增植株 ===');
    const added = (await post('/api/plants', {
      op: 'add', plant: { name: '自检绿萝', hint: '耐阴；水位标准', preset: 'foliage', level: 'normal', addedAt: '2026-10-05', intervals: IV },
    })).json;
    const np = added.plant;
    check('新增成功', !!np.id, np.name);
    check('自动展开 12 个月间隔', Object.keys(np.intervals).length === 12);
    check('自动写入起始记录', added.entry && added.entry.type === 'start');
    check('列表变成 3 株', added.plants.length === 3);

    console.log('\n=== 4. 看图分析（指向假接口）===');
    await post('/api/settings', { baseUrl: 'http://127.0.0.1:' + FAKE_PORT, model: 'deepseek-flash', apiKey: 'sk-e2e' });
    const up = (await post('/api/photo', { dataUrl: 'data:image/png;base64,' + ONE_PX_PNG })).json;
    check('照片入库', up.ok && up.file.startsWith('photos/'), up.file);
    check('照片确实落到临时数据目录', fs.existsSync(path.join(DATA, up.file)));
    const an = (await post('/api/analyze', { plant: np.id, photos: [up.file], note: '自检备注' })).json;
    check('分析返回结构化结论', !!an.analysis && !!an.analysis.verdict, an.analysis && an.analysis.verdict);
    check('取回 token 统计', (an.usage || {}).total_tokens === 1486);

    const capPath = path.join(ROOT, 'tools', '_last_request.json');
    const cap = JSON.parse(fs.readFileSync(capPath, 'utf8'));
    const sys = cap.body.messages[0].content;
    check('鉴权头正确', cap.auth === 'Bearer sk-e2e', cap.auth);
    check('提示词里带上新植株', sys.includes('自检绿萝'));
    check('提示词里带上该株养护提示', sys.includes('耐阴'));
    check('提示词里用该株本月间隔', sys.includes('6~9 天'));
    check('提示词里同时列出其它株', sys.includes('罗汉松') && sys.includes('红颜'));
    check('图片以 base64 内联传出', cap.imageCount === 1, cap.imageCount + ' 张');
    check('用户备注一起传出', JSON.stringify(cap.body).includes('自检备注'));

    console.log('\n=== 5. 修改植株 ===');
    const upd = (await post('/api/plants', { op: 'update', id: np.id, patch: { name: '自检绿萝（改）', level: 'low', intervals: IV } })).json;
    check('名称已改', upd.plant.name === '自检绿萝（改）', upd.plant.name);
    check('水位偏好已改', upd.plant.level === 'low');
    const csv1 = (await get('/api/export.csv')).text;
    check('CSV 同步新名字', csv1.includes('自检绿萝（改）'));
    check('CSV 含 AI 结论列', csv1.includes('AI结论'));

    console.log('\n=== 6. 移出列表 → 恢复 ===');
    const arc = (await post('/api/plants', { op: 'delete', id: np.id })).json;
    check('已归档', arc.archived === true && arc.kept >= 2, '保留 ' + arc.kept + ' 条');
    const afterArc = (await get('/api/plants')).json.plants;
    check('列表仍保留该档案（含已移出标记）', afterArc.length === 3 && afterArc.some((p) => p.archived));
    const logAfterArc = (await get('/api/log')).json.db;
    check('历史记录没丢', logAfterArc.entries.some((e) => e.plant === np.id));
    check('CSV 标注“已移出”', (await get('/api/export.csv')).text.includes('（已移出）'));
    await post('/api/plants', { op: 'restore', id: np.id });
    check('恢复了', (await get('/api/plants')).json.plants.find((p) => p.id === np.id).archived === false);

    console.log('\n=== 7. 彻底删除 ===');
    const before = (await get('/api/log')).json.db.entries.length;
    const purged = (await post('/api/plants', { op: 'delete', id: np.id, purge: true })).json;
    const after = (await get('/api/log')).json.db.entries.length;
    check('记录一起删掉', after < before, before + ' → ' + after);
    check('回到 2 株', purged.plants.length === 2);
    check('原有两株完好', purged.plants.map((p) => p.id).sort().join(',') === 'hongyan,luohansong');

    console.log('\n=== 8. 界面逻辑自检（桩 DOM 跑真实 app.js）===');
    const ui = await new Promise((resolve) => {
      const child = spawn(NODE, [path.join(ROOT, 'tools', 'ui-probe.js'), BASE], { stdio: ['ignore', 'pipe', 'pipe'] });
      let out = '';
      child.stdout.on('data', (d) => { out += d; });
      child.stderr.on('data', (d) => { out += d; });
      child.on('close', (code) => resolve({ code, out }));
    });
    process.stdout.write(ui.out.replace(/^/gm, '') + '\n');
    check('界面自检通过', ui.code === 0, 'exit ' + ui.code);

    console.log('\n=== 9. 真实数据未被触碰 ===');
    const realLogAfter = fs.existsSync(REAL_LOG) ? fs.statSync(REAL_LOG).mtimeMs : null;
    check('data/log.json 未被修改', realLogBefore === realLogAfter);
  } finally {
    cleanup();
    await sleep(300);
    try { fs.rmSync(DATA, { recursive: true, force: true }); } catch (e) { }
    console.log('\n' + (fails ? `端到端自检：${fails} 项失败 ❌` : '端到端自检：全部通过 ✅'));
    process.exit(fails ? 1 : 0);
  }
}

main().catch((e) => { console.error('自检异常：', e); process.exit(1); });
