#!/usr/bin/env node
'use strict';
/**
 * 界面逻辑自检（不需要真浏览器）：
 * 用桩 DOM 加载真实的 public/app.js，跑一遍渲染与植株管理逻辑，逐项断言。
 *
 *   node tools/ui-probe.js http://127.0.0.1:8787
 *
 * 说明：它直接请求该地址的 /api/*，所以先启动 server.js（或让 e2e.js 代劳）。
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const BASE = (process.argv[2] || 'http://127.0.0.1:8787').replace(/\/+$/, '');
const ROOT = path.resolve(__dirname, '..');
const FIXED_DATE = '2026-10-05T12:00:00';   // 固定“今天”，避免断言随日期漂移

let fails = 0;
function check(label, cond, extra) {
  console.log((cond ? '  ✓ ' : '  ✗ ') + label + (extra !== undefined && extra !== '' ? '  ' + extra : ''));
  if (!cond) fails++;
}

/* ---------- 桩 DOM ---------- */
const store = {};
function mkEl(id) {
  return {
    id, innerHTML: '', textContent: '', value: '', checked: false, dataset: {}, disabled: false,
    files: [], style: {},
    classList: {
      _s: new Set(),
      add(c) { this._s.add(c); }, remove(c) { this._s.delete(c); }, contains(c) { return this._s.has(c); },
    },
    querySelectorAll() { return []; }, querySelector() { return null; }, closest() { return null; },
    addEventListener() { }, appendChild() { }, remove() { }, onclick: null, onchange: null,
  };
}
global.document = {
  getElementById: (id) => store[id] || (store[id] = mkEl(id)),
  createElement: () => mkEl('tmp'),
  querySelectorAll: () => [],
  addEventListener() { },
  body: { appendChild() { } },
  execCommand: () => true,
};
global.window = {};
/* Node 18+ 自带了只读的 globalThis.navigator，不能直接赋值；探针里也用不到它 */
try {
  if (!global.navigator || !global.navigator.clipboard) {
    Object.defineProperty(globalThis, 'navigator', {
      value: { clipboard: { writeText: async () => { } } }, configurable: true, writable: true,
    });
  }
} catch (e) { /* 忽略：app.js 只在点击"复制摘要"时才用到 clipboard */ }
global.confirm = () => false;
global.URL = global.URL || { createObjectURL: () => '', revokeObjectURL: () => { } };
const realFetch = global.fetch;
global.fetch = (u, o) => realFetch(u.startsWith('http') ? u : BASE + u, o);

const RealDate = Date;
const fixed = new RealDate(FIXED_DATE);
class FakeDate extends RealDate {
  constructor(...a) { if (a.length === 0) super(fixed.getTime()); else super(...a); }
  static now() { return fixed.getTime(); }
}
global.Date = FakeDate;

/* ---------- 载入真实前端脚本 ---------- */
let js = fs.readFileSync(path.join(ROOT, 'public', 'app.js'), 'utf8');
js += `
globalThis.__p = {
  openPlants, renderPlantList, renderCards, renderAdvice, renderResult, summaryText, statusFor,
  plantObj, setPlants: (v) => { plants = v; }, setAll: (v) => { ALL_PLANTS = v; },
  getState: () => ({ DB, plants, ALL_PLANTS, PRESETS }),
};`;
vm.runInThisContext(js);

const P = globalThis.__p;
const g = (id) => document.getElementById(id);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  console.log('界面逻辑自检 @ ' + BASE);

  // 等 load() 完成
  for (let i = 0; i < 60 && !P.getState().DB; i++) await sleep(100);
  const st = P.getState();
  check('读到了记录与植株', !!st.DB && st.plants.length >= 1, `植株 ${st.plants.length} 株 / 记录 ${(st.DB.entries || []).length} 条`);

  // 状态卡片
  P.renderCards();
  const cardsHTML = g('cards').innerHTML;
  check('每株都渲染出一张卡片', st.plants.every((p) => cardsHTML.includes(p.name)), `${st.plants.length} 张`);
  check('卡片里有头像或占位图', cardsHTML.includes('avatar'), '');

  // 规则引擎（固定今天 = 2026-10-05，10 月的建议间隔）
  const s0 = P.statusFor(st.plants[0].id);
  check('按该株自己的间隔取本月数值', Array.isArray(s0.iv) && s0.iv.length === 2, `[${s0.iv}]`);
  check('状态灯有合法取值', ['ok', 'warn', 'danger', 'info'].includes(s0.level), s0.level);
  check('缓苗期按各自的开始日期计算', typeof s0.seedlingLeft === 'number', s0.seedlingLeft + ' 天');

  // 建议列表
  P.renderAdvice();
  const adv = g('advice').innerHTML;
  check('今日建议有内容且带图标', adv.includes('<svg') && adv.includes('水位没过根系一半'), '');

  // 植株管理
  P.openPlants();
  await sleep(600);
  check('植株管理抽屉已打开', !g('plantDrawer').classList.contains('hidden'));
  const list = g('plantList').innerHTML;
  check('列表里有编辑按钮', (list.match(/data-act="edit"/g) || []).length === st.plants.length, `${(list.match(/data-act="edit"/g) || []).length} 个`);
  check('列表里有删除按钮', (list.match(/data-act="del"/g) || []).length === st.plants.length);
  check('预设下拉已填充选项', (g('pPreset').innerHTML.match(/<option/g) || []).length >= 4,
    (g('pPreset').innerHTML.match(/<option/g) || []).length + ' 个');
  check('季节间隔输入框有 8 个', (g('pIntervals').innerHTML.match(/data-season=/g) || []).length === 8,
    (g('pIntervals').innerHTML.match(/data-season=/g) || []).length + ' 个');
  check('表单处于“新增”状态', g('pFormTitle').textContent.includes('新增'), g('pFormTitle').textContent);

  // 空状态
  const backup = st.plants;
  P.setPlants([]); P.setAll([]);
  P.renderCards();
  check('没有植株时显示空状态与添加入口', g('cards').innerHTML.includes('还没有添加植株') && g('cards').innerHTML.includes('openPlants'));
  P.renderAdvice();
  check('没有植株时建议给出引导', g('advice').innerHTML.includes('还没有植株'));
  P.setPlants(backup); P.setAll(st.ALL_PLANTS);

  // AI 结论卡渲染
  P.renderResult({
    analysis: {
      verdict: '自检结论', urgency: 'watch', plants_seen: ['X'],
      water_level: { issue: '合适', reason: '自检依据' }, water_quality: '清澈', foam_wet: false,
      roots: { look: '自检根', rot_suspected: false, new_roots_visible: true },
      leaves: '自检叶', bottle: '自检瓶', symptoms: ['水变绿'], actions: ['自检动作一', '自检动作二'],
      next_change_days: 7, uncertain: ['自检待确认'],
    }, model: 'fake', usage: { total_tokens: 1 }, ms: 1000, entry: {},
  });
  const res = g('aiResult').innerHTML;
  check('结论卡显示结论与紧急度', res.includes('自检结论') && res.includes('留意'));
  check('结论卡逐项带图标', res.includes('水位') && res.includes('建议动作') && (res.match(/<svg/g) || []).length >= 6);
  check('结论卡列出建议动作', res.includes('自检动作一') && res.includes('自检动作二'));

  // 摘要
  const sum = P.summaryText();
  check('摘要包含每株的状态', st.plants.every((p) => sum.includes(p.name)), sum.split('\n')[0]);

  console.log(fails ? `\n界面自检：${fails} 项失败 ❌` : '\n界面自检：全部通过 ✅');
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error('界面自检异常：', e); process.exit(1); });
