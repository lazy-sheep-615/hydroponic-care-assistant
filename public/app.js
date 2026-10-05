'use strict';
/* ============ 状态（植株从服务器动态读取） ============ */
let DB = null, SETTINGS = {}, PRESETS = {}, SEASONS = [
  { key: 'spring', label: '春季 3–5 月', months: [3, 4, 5] },
  { key: 'summer', label: '夏季 6–8 月', months: [6, 7, 8] },
  { key: 'autumn', label: '秋季 9–11 月', months: [9, 10, 11] },
  { key: 'winter', label: '冬季 12–2 月', months: [12, 1, 2] },
];
let ALL_PLANTS = [];                 // 含已移出
let plants = [];                     // 正在养护的
let plant = 'both', type = 'change';
let photos = [], manualPhotos = [], lastAnalysis = null;
let editingId = null, pendingAvatar = null;

const TYPE_LABEL = { start: '开始记录', change: '换水', water: '补水', fertilize: '加肥', observe: '观察', ai: 'AI看图' };
const SYMPTOMS = ['黄叶软烂', '新叶小色淡', '叶尖焦边', '水变绿', '瓶底沉积/藻', '根发黑发软', '泡棉发黑', '大量落叶', '无异常'];
const SYMPTOM_ADVICE = {
  '黄叶软烂': '叶发黄发软、水有臭味 → 多半烂根/缺氧：剪烂根、降低水位、勤换水、加强通风',
  '新叶小色淡': '新叶小、色淡、不长 → 缺肥或光太弱：换水时加 1/2 浓度营养液，移到明亮散射光处',
  '叶尖焦边': '叶片焦边发白 → 阳光直射晒伤：移到散射光处（红颜之类观叶尤其怕晒）',
  '水变绿': '水快速变绿 → 光照强+水中养分多：给瓶子下半段遮光、减营养液、勤换水',
  '瓶底沉积/藻': '瓶底有褐色沉积或绿藻 → 光照强+养分残留：瓶子下半段遮光、每次换水擦洗瓶壁、必要时缩短换水间隔',
  '根发黑发软': '根发黑、发软、有臭味 → 烂根：剪掉腐烂部分、换纯清水养 1～2 周、降低水位、加强通风',
  '泡棉发黑': '泡棉处发黑发软 → 水位过高泡棉受潮：立即降水、剪除腐烂部分、换清水',
  '大量落叶': '突然大量落叶 → 温差大/冷风/换水太猛：稳定温度、避开风口，换水用室温水',
};

/* ============ 图标 ============ */
const ICON = {
  ok: '<svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" fill="currentColor" opacity=".16"/><path d="M7.6 12.4l3 3 5.8-6.3" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  warn: '<svg viewBox="0 0 24 24" fill="none"><path d="M12 4.4 20.7 19H3.3L12 4.4z" fill="currentColor" opacity=".16"/><path d="M12 5.2 20 18.6H4L12 5.2z" stroke="currentColor" stroke-width="1.6"/><path d="M12 9.6v4.2M12 16.6v.2" stroke="currentColor" stroke-width="2.1" stroke-linecap="round"/></svg>',
  danger: '<svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" fill="currentColor" opacity=".16"/><path d="M12 7v6M12 16.6v.2" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>',
  info: '<svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" fill="currentColor" opacity=".16"/><path d="M12 11v6M12 7.4v.2" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>',
  camera: '<svg viewBox="0 0 24 24" fill="none"><path d="M4 8h3l1.4-2h7.2L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z" fill="currentColor"/><circle cx="12" cy="13.2" r="3.3" fill="#fff"/></svg>',
  leaf: '<svg viewBox="0 0 24 24" fill="none"><path d="M12 21c0-6 4.5-11 11-12-1 8-5.5 12-11 12z" fill="currentColor"/><path d="M12 21C12 12.5 8 7.5 2 5.5 3 15.5 7.5 21 12 21z" fill="currentColor" opacity=".6"/></svg>',
};
const ROWICON = {
  '水位': '<svg viewBox="0 0 24 24" fill="none"><path d="M12 3s7 7.6 7 11.5A7 7 0 0 1 5 14.5C5 10.6 12 3 12 3z" fill="currentColor"/></svg>',
  '水质': '<svg viewBox="0 0 24 24" fill="none"><path d="M3 9c3-2 6 2 9 0s6-2 9 0M3 15c3-2 6 2 9 0s6-2 9 0" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  '泡棉': '<svg viewBox="0 0 24 24" fill="none"><rect x="3" y="6" width="18" height="12" rx="2.5" stroke="currentColor" stroke-width="2"/><path d="M7.5 12h9" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  '根系': '<svg viewBox="0 0 24 24" fill="none"><path d="M12 3v9M12 12c0 4-4 5-4.5 9M12 12c0 4 4 5 4.5 9M12 8c-3 0-5 2-5 5M12 8c3 0 5 2 5 5" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/></svg>',
  '叶片': '<svg viewBox="0 0 24 24" fill="none"><path d="M12 21c0-6 4.5-11 11-12-1 8-5.5 12-11 12z" fill="currentColor"/><path d="M12 21C12 12.5 8 7.5 2 5.5 3 15.5 7.5 21 12 21z" fill="currentColor" opacity=".6"/></svg>',
  '瓶底': '<svg viewBox="0 0 24 24" fill="none"><path d="M6 4h12v13a3 3 0 0 1-3 3H9a3 3 0 0 1-3-3V4z" stroke="currentColor" stroke-width="1.9"/><path d="M6 14h12" stroke="currentColor" stroke-width="1.9"/></svg>',
  '症状': '<svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.9"/><path d="M12 7.5v5.5M12 16.4v.2" stroke="currentColor" stroke-width="2.1" stroke-linecap="round"/></svg>',
  '建议动作': '<svg viewBox="0 0 24 24" fill="none"><path d="M4 12.5l4.5 4.5L20 6.5" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  '下次换水': '<svg viewBox="0 0 24 24" fill="none"><rect x="3.5" y="5" width="17" height="16" rx="3" stroke="currentColor" stroke-width="1.9"/><path d="M8 3v4M16 3v4M3.5 10h17" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/></svg>',
  '需你确认': '<svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.9"/><path d="M9.6 9.6a2.6 2.6 0 1 1 3.3 2.5v1.4M12.9 16.5v.2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
  '识别到': '<svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="3.2" fill="currentColor"/><path d="M12 3.5v2.6M12 17.9v2.6M3.5 12h2.6M17.9 12h2.6" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/></svg>',
};

/* ============ 小工具 ============ */
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const pad = (n) => String(n).padStart(2, '0');
const dayOf = (s) => String(s || '').slice(0, 10);
function todayStr() { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function localNowInput() { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`; }
function diffDays(a, b) { return Math.round((new Date(dayOf(b) + 'T00:00') - new Date(dayOf(a) + 'T00:00')) / 86400000); }
const plantObj = (id) => ALL_PLANTS.find((p) => p.id === id);
function plantName(id) {
  if (id === 'both' || id === 'all') return '全部植株';
  const p = plantObj(id);
  return p ? p.name + (p.archived ? '（已移出）' : '') : id;
}
function toast(msg) { const t = $('toast'); t.textContent = msg; t.classList.add('on'); setTimeout(() => t.classList.remove('on'), 2800); }
function busy(el, on, text) { el.disabled = on; if (text !== undefined) el.innerHTML = on ? '<span class="spin"></span>' + text : text; }
async function api(path, opts) {
  const r = await fetch(path, opts);
  const j = await r.json().catch(() => ({ ok: false, error: 'HTTP ' + r.status }));
  if (!r.ok || j.ok === false) throw new Error(j.error || ('HTTP ' + r.status));
  return j;
}
const postJson = (path, body) => api(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

/* ============ 规则引擎（按每株自己的间隔） ============ */
function entriesFor(id) { return (DB.entries || []).filter((e) => e.plant === id || e.plant === 'both' || e.plant === 'all'); }
function lastOf(id, types) { const f = entriesFor(id).filter((e) => types.includes(e.type)); return f.length ? f[f.length - 1] : null; }
function intervalOf(p, dstr) {
  const month = Number(dayOf(dstr).slice(5, 7));
  const iv = (p.intervals || {})[month];
  if (Array.isArray(iv) && iv.length === 2) return [Number(iv[0]), Number(iv[1])];
  const s = (PRESETS[p.preset] || PRESETS.foliage || {}).intervals;
  const season = (SEASONS.find((x) => x.months.includes(month)) || SEASONS[0]).key;
  return s ? s[season] : [7, 10];
}
function statusFor(id) {
  const p = plantObj(id);
  if (!p) return { id, iv: [7, 10], days: null, level: 'info', text: '植株不存在', pct: 0, watersSince: 0, seedlingLeft: 0 };
  const today = todayStr();
  const last = lastOf(id, ['change', 'start']);
  const lastChange = lastOf(id, ['change']);
  const iv = intervalOf(p, today);
  const days = last ? diffDays(last.at, today) : null;
  let level = 'info', text = '还没有记录，先记一次吧';
  if (days != null) {
    if (days >= Math.round(iv[1] * 1.5)) { level = 'danger'; text = `已超期 ${days} 天没换水，尽快换`; }
    else if (days >= iv[1]) { level = 'warn'; text = `该换水了（已经 ${days} 天）`; }
    else if (days >= iv[0]) { level = 'warn'; text = `可以换了（已经 ${days} 天），建议 ${iv[1] - days} 天内换`; }
    else { level = 'ok'; text = `正常，还有约 ${iv[0] - days} 天到你平时的间隔`; }
  }
  const base = lastChange || last;
  const watersSince = base ? entriesFor(id).filter((e) => e.type === 'water' && String(e.at) > String(base.at)).length : 0;
  const lastWater = lastOf(id, ['water']), lastFert = lastOf(id, ['fertilize']), lastObs = lastOf(id, ['observe', 'ai']);
  return {
    id, p, last, lastChange, days, iv, level, text,
    pct: days == null ? 0 : Math.min(100, Math.round(days / iv[1] * 100)),
    watersSince, lastWater, lastFert, lastObs,
    waterDays: lastWater ? diffDays(lastWater.at, today) : null,
    fertDays: lastFert ? diffDays(lastFert.at, today) : null,
    seedlingLeft: Math.max(0, (SETTINGS.seedlingDays || 21) - (diffDays(p.addedAt, today) || 0)),
  };
}

/* ============ 渲染 ============ */
function renderHeader() {
  const lastAi = (DB.entries || []).filter((e) => e.type === 'ai').pop();
  const sinceAi = lastAi ? diffDays(lastAi.at, todayStr()) : null;
  $('today').textContent = `今天 ${todayStr()}　正在养护 ${plants.length} 株　共 ${(DB.entries || []).length} 条记录`
    + (lastAi ? `　|　上次看图 ${sinceAi === 0 ? '今天' : sinceAi + ' 天前'}` : '');

  const b = $('banner');
  if (!plants.length) {
    b.className = 'banner warn';
    b.innerHTML = ICON.leaf + '<div><b>还没有植株</b>，点右上角「🌿 植株」添加一株，之后就能拍照让 AI 看了。</div>';
    b.classList.remove('hidden');
  } else if (!SETTINGS.hasKey) {
    b.className = 'banner warn';
    b.innerHTML = ICON.warn + '<div><b>还没配置 API Key</b>，AI 看图功能用不了 → 点右上角「⚙ 设置」填入 DeepSeek 的 Key（充值 10 元能用很久）。</div>';
    b.classList.remove('hidden');
  } else if (sinceAi == null || sinceAi >= (SETTINGS.remindDays || 2)) {
    b.className = 'banner info';
    b.innerHTML = ICON.camera + `<div><b>该拍照记录了</b>：${sinceAi == null ? '还没有 AI 记录' : '距上次看图 ' + sinceAi + ' 天'}。拍 2 张照片传上来，AI 看完会给出意见。</div>`;
    b.classList.remove('hidden');
  } else { b.classList.add('hidden'); }
}

function renderCards() {
  if (!plants.length) {
    $('cards').innerHTML = `<div class="card" style="grid-column:1/-1;text-align:center;padding:34px 20px">
      <div style="width:54px;height:54px;margin:0 auto 12px;color:var(--green-m)">${ICON.leaf}</div>
      <h2 style="margin-bottom:6px">还没有添加植株</h2>
      <div class="muted" style="margin-bottom:14px">添加后，每一株都会有自己的换水周期和缓苗期</div>
      <button class="primary" onclick="openPlants()">+ 添加第一株</button>
    </div>`;
    return;
  }
  $('cards').style.gridTemplateColumns = plants.length > 2 ? 'repeat(auto-fill,minmax(320px,1fr))' : '';
  $('cards').innerHTML = plants.map((p) => {
    const s = statusFor(p.id);
    const avatar = p.img ? `<img class="avatar" src="${esc(p.img)}" alt="">` : `<div class="avatar ph">${ICON.leaf}</div>`;
    return `<div class="card plant-card ${s.level}">
      <div class="plant-top">
        ${avatar}
        <div class="plant-title"><span class="plant-label">我的水培植物</span><h2>${esc(p.name)}</h2></div>
        <button class="mini" onclick="openPlants('${p.id}')" title="编辑这株">编辑</button>
      </div>
      <div class="plant-body">
        <p class="plant-hint">${esc(p.hint || '（没有填写养护提示）')}</p>
        <div class="plant-main-stat">
          <div><span class="stat-label">距离上次换水</span><strong>${s.days == null ? '—' : s.days}</strong><span class="stat-unit">天</span></div>
          <div class="stat-side"><span>建议间隔</span><b>${s.iv[0]}～${s.iv[1]} 天</b><small>上次换水 ${s.last ? esc(s.last.at.slice(5, 16).replace('T', ' ')) : '—'}</small></div>
        </div>
        <div class="bar ${s.level}"><i style="width:${s.pct}%"></i></div>
        <div class="badge ${s.level}">${esc(s.text)}</div>
        <div class="plant-facts">
          <div><span>上次补水</span><b>${s.lastWater ? esc(dayOf(s.lastWater.at)) + (s.waterDays != null ? `（${s.waterDays} 天前）` : '') : '—'}</b></div>
          <div><span>本轮已补水</span><b>${s.watersSince} 次${s.watersSince >= 2 ? ' · 下次整瓶换水' : ''}</b></div>
          <div><span>上次加肥</span><b>${s.lastFert ? esc(dayOf(s.lastFert.at)) + (s.fertDays != null ? `（${s.fertDays} 天前）` : '') : '—'}</b></div>
          <div><span>缓苗期</span><b>${s.seedlingLeft > 0 ? `还剩 ${s.seedlingLeft} 天（只加清水）` : '已结束，可加营养液'}</b></div>
        </div>
      </div>
    </div>`;
  }).join('');
}

function isStale(s) { return !!(s.lastObs && s.last && s.last.type === 'change' && String(s.lastObs.at) < String(s.last.at)); }

function renderAdvice() {
  const out = [];
  if (!plants.length) out.push({ l: 'info', t: '还没有植株，先点右上角「🌿 植株」添加一株。' });
  plants.forEach((p) => {
    const s = statusFor(p.id);
    if (s.days == null) { out.push({ l: 'info', t: `${p.name}：还没有记录，先记一次「换水」，我就能开始算周期。` }); return; }
    if (s.level === 'danger') out.push({ l: 'danger', t: `${p.name}：已经 ${s.days} 天没换水，超过建议上限 ${s.iv[1]} 天，请尽快整瓶换水，并检查有没有发黑发软的烂根。` });
    else if (s.level === 'warn' && s.days >= s.iv[1]) out.push({ l: 'warn', t: `${p.name}：到了建议换水时间（${s.days} 天 ≥ ${s.iv[1]} 天），这两天换掉。` });
    else if (s.level === 'warn') out.push({ l: 'warn', t: `${p.name}：已经 ${s.days} 天，进入可换水区间（建议 ${s.iv[0]}～${s.iv[1]} 天），方便的话这两天换掉。` });
    else out.push({ l: 'ok', t: `${p.name}：换水周期正常（${s.days} 天 / 建议 ${s.iv[0]}～${s.iv[1]} 天）。` });
    if (s.watersSince >= 2) out.push({ l: 'warn', t: `${p.name}：本次换水后只补水已经 ${s.watersSince} 次 —— 连续补水 2 次后第 3 次必须整瓶换水。` });
    if (s.seedlingLeft > 0) out.push({ l: 'info', t: `${p.name}：还在缓苗期（还剩 ${s.seedlingLeft} 天），换水只用清水，别加营养液。` });
    else {
      const lc = s.lastChange;
      const fertAfter = (DB.entries || []).some((e) => e.type === 'fertilize' && (e.plant === s.id || e.plant === 'both') && lc && String(e.at) > String(lc.at));
      if (lc && !fertAfter) out.push({ l: 'warn', t: `${p.name}：这次换水还没有加营养液记录 —— 按 1/2 浓度加（1 升水 0.5～1 ml），宁淡勿浓。` });
    }
    if (s.waterDays != null && s.waterDays >= 5) out.push({ l: 'warn', t: `${p.name}：已经 ${s.waterDays} 天没补水了，去看水位线，降到"泡不到一半根"就补到线。` });
    const stale = isStale(s);
    const when = stale ? '换水前观察到' : '上次观察到';
    const tail = stale ? '（换水后请再确认一次）' : '';
    if (s.lastObs && s.lastObs.data) {
      (s.lastObs.data.symptoms || []).filter((x) => SYMPTOM_ADVICE[x]).forEach((x) =>
        out.push({ l: 'danger', t: `${p.name} ${when}「${x}」：${SYMPTOM_ADVICE[x]}${tail}` }));
      if (s.lastObs.data.level === '偏高') out.push({ l: 'warn', t: `${p.name}：${when}水位偏高 —— 倒掉一些水，让根的上半截和泡棉露出空气。${tail}` });
      if (s.lastObs.data.level === '偏低') out.push({ l: 'warn', t: `${p.name}：${when}水位偏低 —— 补到标准线，别让根干着。${tail}` });
    }
    const ai = (DB.entries || []).filter((e) => e.type === 'ai' && (e.plant === s.id || e.plant === 'both')).pop();
    if (ai && ai.data && ai.data.analysis) {
      const a = ai.data.analysis;
      if (a.urgency === 'urgent') out.push({ l: 'danger', t: `${p.name}：AI 看图判定「尽快处理」—— ${a.verdict || ''}` });
      else if (a.urgency === 'watch') out.push({ l: 'warn', t: `${p.name}：AI 看图提示留意 —— ${a.verdict || ''}` });
      if (a.water_level && a.water_level.issue && !/合适|看不清/.test(a.water_level.issue))
        out.push({ l: 'warn', t: `${p.name}：AI 看水位「${a.water_level.issue}」—— ${a.water_level.reason || ''}` });
      if (a.roots && a.roots.rot_suspected) out.push({ l: 'danger', t: `${p.name}：AI 疑似看到烂根 —— ${(a.roots.reason || a.roots.look || '')}（请用手摸一下确认：发软一捏成泥、有臭味就要剪掉）` });
    }
  });
  out.push({ l: 'info', t: '通用：水位没过根系一半，泡棉不接触水面；补水只加水不加肥；用晾过 1～2 天的自来水或纯净水，水温接近室温。' });
  $('advice').innerHTML = out.map((o) => `<li class="${o.l}">${ICON[o.l] || ICON.info}<div>${esc(o.t)}</div></li>`).join('');
}

function aiContentHTML(e) {
  const d = e.data || {}, a = d.analysis;
  if (!a) return esc(d.analysisRaw ? String(d.analysisRaw).slice(0, 80) + '…' : '（无解析结果）');
  const syms = (a.symptoms || []).filter(Boolean);
  return `${esc(a.verdict || '')}`
    + (a.urgency ? ` <span class="chip grey">${esc({ ok: '正常', watch: '留意', urgent: '尽快处理' }[a.urgency] || a.urgency)}</span>` : '')
    + (syms.length ? ' ' + syms.map((s) => `<span class="chip">${esc(s)}</span>`).join('') : '');
}

function renderHistory() {
  const es = [...(DB.entries || [])].reverse().slice(0, 60);
  $('hist').innerHTML = es.map((e) => {
    const d = e.data || {}, bits = [];
    if (d.level) bits.push('水位：' + d.level);
    if (d.water) bits.push('水质：' + d.water);
    if (d.rot) bits.push('烂根：' + d.rot);
    if (d.ml) bits.push('营养液：' + d.ml + ' ml');
    if (d.dose) bits.push(d.dose);
    if (d.symptoms) bits.push((d.symptoms || []).join('、'));
    const pics = (e.photos || []).map((p) => `<img class="thumb" src="/${esc(p)}" data-full="/${esc(p)}">`).join('');
    const content = e.type === 'ai'
      ? aiContentHTML(e) + ` <a href="#" data-view="${e.id}" style="font-size:12px">查看全文</a>`
      : esc(bits.join('；'));
    return `<tr>
      <td>${esc(e.at.replace('T', ' '))}</td>
      <td>${esc(plantName(e.plant))}</td>
      <td><span class="tag ${e.type}">${TYPE_LABEL[e.type] || e.type}</span></td>
      <td>${content}</td>
      <td>${esc(e.note || '')}</td>
      <td>${pics}</td>
      <td class="act"><button data-del="${e.id}">删除</button></td>
    </tr>`;
  }).join('') || '<tr><td colspan="7" class="muted">还没有任何记录</td></tr>';
  $('histInfo').textContent = `共 ${(DB.entries || []).length} 条记录` + (es.length < 60 ? '' : '，此处显示最近 60 条');
  [...$('hist').querySelectorAll('[data-del]')].forEach((b) => b.onclick = async () => {
    if (!confirm('删除这条记录？')) return;
    await postJson('/api/log', { op: 'delete', id: b.dataset.del });
    toast('已删除'); await load();
  });
  [...$('hist').querySelectorAll('[data-view]')].forEach((b) => b.onclick = (ev) => {
    ev.preventDefault();
    const e = (DB.entries || []).find((x) => x.id === b.dataset.view);
    if (e && e.data && e.data.analysis) {
      renderResult({ analysis: e.data.analysis, model: e.data.model, usage: e.data.usage, ms: e.data.ms, entry: e });
      $('aiResult').scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  });
}

const URGENCY = { ok: ['正常', 'ok'], watch: ['留意', 'watch'], urgent: ['尽快处理', 'urgent'] };
function renderResult(r) {
  const a = r.analysis;
  if (!a) {
    $('aiResult').innerHTML = `<div class="result urgent"><div class="head">AI 返回的不是标准 JSON</div>
      <div class="body"><div class="muted">原文（已存进记录）：</div><pre style="white-space:pre-wrap;font-size:12.5px">${esc(String(r.raw || '').slice(0, 2000))}</pre></div></div>`;
    return;
  }
  const [label, cls] = URGENCY[a.urgency] || ['—', 'ok'];
  const rows = [];
  const push = (k, v) => { if (v) rows.push(`<div class="row"><div class="k">${ROWICON[k] || ''}${k}</div><div>${v}</div></div>`); };
  if (a.water_level) push('水位', `<b>${esc(a.water_level.issue || '')}</b>　${esc(a.water_level.reason || '')}`);
  push('水质', esc(a.water_quality || ''));
  if (a.foam_wet !== undefined) push('泡棉', a.foam_wet === true ? '<b style="color:var(--warn)">沾到水了（水位偏高）</b>' : (a.foam_wet === false ? '是干的 ✓' : esc(String(a.foam_wet))));
  if (a.roots) {
    const bits = [esc(a.roots.look || '')];
    if (a.roots.rot_suspected) bits.push('<b style="color:var(--warn)">疑似烂根</b>');
    if (a.roots.new_roots_visible) bits.push('<b style="color:var(--ok)">看到新根 ✓</b>');
    push('根系', bits.join('　'));
  }
  push('叶片', esc(a.leaves || ''));
  push('瓶底', esc(a.bottle || ''));
  if ((a.plants_seen || []).length) push('识别到', esc((a.plants_seen || []).join('、')));
  if ((a.symptoms || []).length) push('症状', a.symptoms.map((s) => `<span class="chip">${esc(s)}</span>`).join(''));
  const acts = (a.actions || []).filter(Boolean);
  if (acts.length) push('建议动作', `<ol>${acts.map((x) => `<li>${esc(x)}</li>`).join('')}</ol>`);
  if (a.next_change_days) push('下次换水', `约 <b>${esc(a.next_change_days)}</b> 天后（${new Date(Date.now() + a.next_change_days * 86400000).toISOString().slice(5, 10)}）`);
  if ((a.uncertain || []).length) push('需你确认', (a.uncertain || []).map((x) => `<span class="chip grey">${esc(x)}</span>`).join(''));
  $('aiResult').innerHTML = `<div class="result ${cls}">
    <div class="head"><span>${esc(a.verdict || 'AI 判断')}</span><span class="badge ${cls}">${label}</span></div>
    <div class="body">${rows.join('')}
      <div class="muted" style="margin-top:10px">模型 ${esc(r.model || '')}${r.ms ? '　耗时 ' + Math.round(r.ms / 1000) + ' 秒' : ''}${r.usage ? '　tokens ' + (r.usage.total_tokens || '') : ''}</div>
    </div></div>`;
}

/* ============ 图片 ============ */
function loadImageFromFile(file) {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); res(img); };
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('这个格式浏览器打不开（iPhone 的 HEIC 请先转成 JPG，或截图后再传）')); };
    img.src = url;
  });
}
async function fileToJpegDataUrl(file, maxSide = 1600, q = 0.88) {
  const img = await loadImageFromFile(file);
  const s = Math.min(1, maxSide / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width * s)), h = Math.max(1, Math.round(img.height * s));
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  c.getContext('2d').drawImage(img, 0, 0, w, h);
  return c.toDataURL('image/jpeg', q);
}
async function addFiles(fileList) {
  const files = [...fileList].slice(0, 4 - photos.length);
  if (!files.length) { toast('最多 4 张照片'); return; }
  $('aiMsg').innerHTML = '<span class="spin"></span>正在处理照片…';
  for (const f of files) {
    try {
      const dataUrl = await fileToJpegDataUrl(f);
      const r = await postJson('/api/photo', { dataUrl });
      photos.push(r.file);
      $('thumbs').innerHTML = photos.map((p) => `<img src="/${esc(p)}" data-full="/${esc(p)}">`).join('');
    } catch (e) { toast('照片处理失败：' + e.message); }
  }
  $('aiMsg').textContent = '';
  bindThumbs();
}
function bindThumbs() {
  document.querySelectorAll('[data-full]').forEach((el) => el.onclick = () => {
    const box = document.createElement('div'); box.className = 'lightbox';
    box.innerHTML = `<img src="${el.dataset.full}">`;
    box.onclick = () => box.remove();
    document.body.appendChild(box);
  });
}
async function shootPhoto() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { toast('这个环境不能用摄像头，请用上传或粘贴'); return; }
  let stream;
  try { stream = await navigator.mediaDevices.getUserMedia({ video: { width: 1920, height: 1080 } }); }
  catch (e) { toast('打不开摄像头：' + e.message + '（用上传或 Ctrl+V 粘贴也可以）'); return; }
  const box = document.createElement('div'); box.className = 'lightbox';
  box.innerHTML = `<div style="text-align:center"><video autoplay playsinline style="max-width:88vw;max-height:78vh;border-radius:8px;background:#000"></video>
    <div style="margin-top:10px"><button id="snap" class="primary">拍照</button> <button id="cancel">取消</button></div></div>`;
  document.body.appendChild(box);
  const v = box.querySelector('video'); v.srcObject = stream;
  const stop = () => { stream.getTracks().forEach((t) => t.stop()); box.remove(); };
  box.querySelector('#cancel').onclick = stop;
  box.querySelector('#snap').onclick = async () => {
    const c = document.createElement('canvas'); c.width = v.videoWidth; c.height = v.videoHeight;
    c.getContext('2d').drawImage(v, 0, 0);
    const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.9));
    stop();
    await addFiles([new File([blob], 'camera.jpg', { type: 'image/jpeg' })]);
  };
}

/* ============ AI 分析 ============ */
async function analyze() {
  if (!plants.length) { toast('先在「植株」里添加一株'); return; }
  if (!photos.length) { toast('先上传照片'); return; }
  const btn = $('btnAnalyze');
  busy(btn, true, '分析中…（约 10～30 秒）');
  $('aiMsg').innerHTML = '<span class="spin"></span>AI 正在看图，请稍等…';
  $('aiResult').innerHTML = '';
  try {
    const r = await postJson('/api/analyze', { plant, photos, note: $('note').value });
    lastAnalysis = r.analysis;
    renderResult(r);
    $('quick').classList.remove('hidden');
    $('note').value = '';
    photos = []; $('thumbs').innerHTML = '';
    await load();
    toast(r.analysis ? '已记录 AI 判断' : 'AI 返回格式异常，已原文存进记录');
  } catch (e) {
    $('aiResult').innerHTML = `<div class="result urgent"><div class="head">分析失败</div>
      <div class="body">${esc(e.message)}<div class="muted" style="margin-top:6px">检查：设置里的 API Key、模型名（<code>deepseek-flash</code>）、网络。</div></div></div>`;
  } finally {
    busy(btn, false, 'AI 分析并记录');
    $('aiMsg').textContent = '';
  }
}

/* ============ 植株管理 ============ */
function plantIntervalLine(p) {
  return SEASONS.map((s) => {
    const iv = (p.intervals || {})[s.months[0]] || [7, 10];
    return `${s.label.slice(0, 2)} ${iv[0]}${iv[1] === iv[0] ? '' : '~' + iv[1]}`;
  }).join(' · ');
}
function renderPlantList() {
  const act = ALL_PLANTS.filter((p) => !p.archived);
  const arch = ALL_PLANTS.filter((p) => p.archived);
  const rowOf = (p, isArch) => {
    const n = (DB.entries || []).filter((e) => e.plant === p.id).length;
    const av = p.img ? `<img class="pthumb" src="${esc(p.img)}" alt="">` : `<div class="pthumb ph">${ICON.leaf}</div>`;
    return `<div class="prow${isArch ? ' arch' : ''}">
      ${av}
      <div class="pinfo">
        <b>${esc(p.name)}</b>${isArch ? ' <span class="chip grey">已移出</span>' : ''}
        <div class="muted">${esc(plantIntervalLine(p))}</div>
        <div class="muted">${p.addedAt ? '开始养护 ' + esc(p.addedAt) : ''}${p.addedAt ? ' · ' : ''}${n} 条记录</div>
      </div>
      <div class="pacts" data-id="${p.id}">
        ${isArch
          ? `<button data-act="restore">恢复</button><button data-act="purge">彻底删除</button>`
          : `<button data-act="edit">编辑</button><button data-act="del">删除</button>`}
      </div>
    </div>`;
  };
  $('plantList').innerHTML =
    (act.map((p) => rowOf(p, false)).join('') || '<div class="muted" style="padding:8px 0">还没有植株，填下面的表单添加一株。</div>')
    + (arch.length ? `<div class="muted" style="margin:10px 0 4px">已移出列表（历史记录保留）</div>` + arch.map((p) => rowOf(p, true)).join('') : '');

  [...$('plantList').querySelectorAll('.pacts button')].forEach((b) => b.onclick = async () => {
    const id = b.closest('.pacts').dataset.id;
    const act2 = b.dataset.act;
    if (act2 === 'edit') { fillPlantForm(plantObj(id)); return; }
    if (act2 === 'restore') { await postJson('/api/plants', { op: 'restore', id }); toast('已恢复'); await load(); openPlants(); return; }
    if (act2 === 'del') {
      const p = plantObj(id);
      const n = (DB.entries || []).filter((e) => e.plant === id).length;
      const box = b.closest('.pacts');
      box.innerHTML = `<span class="muted" style="font-size:12px">${n ? n + ' 条记录：' : ''}</span>
        <button data-x="archive" style="border-color:#e0c98a">仅移出列表</button>
        <button data-x="purge" style="border-color:#e9b5b0;color:#ab2419">连记录一起删</button>
        <button data-x="cancel">取消</button>`;
      [...box.querySelectorAll('button')].forEach((x) => x.onclick = async () => {
        if (x.dataset.x === 'cancel') { renderPlantList(); return; }
        const r = await postJson('/api/plants', { op: 'delete', id, purge: x.dataset.x === 'purge' });
        toast(x.dataset.x === 'purge' ? `已删除，连同 ${r.purged || 0} 条记录` : `已移出列表${r.kept ? '，保留 ' + r.kept + ' 条历史记录' : ''}`);
        if (plant === id) plant = 'both';
        await load(); openPlants();
      });
      return;
    }
    if (act2 === 'purge') {
      if (!confirm('彻底删除这株植物？历史记录也会一起删掉，不能恢复。')) return;
      await postJson('/api/plants', { op: 'delete', id, purge: true });
      toast('已彻底删除'); await load(); openPlants();
    }
  });
}
function renderSeasonFields(values) {
  $('pIntervals').innerHTML = SEASONS.map((s) => {
    const v = values[s.key] || [7, 10];
    return `<label class="f">${s.label}
      <span style="display:flex;gap:6px;align-items:center">
        <input type="number" min="1" max="90" data-season="${s.key}" data-i="0" value="${v[0]}" style="width:100%">
        <span class="muted">～</span>
        <input type="number" min="1" max="120" data-season="${s.key}" data-i="1" value="${v[1]}" style="width:100%">
      </span></label>`;
  }).join('');
}
function seasonValuesOf(p) {
  const out = {};
  SEASONS.forEach((s) => { out[s.key] = ((p.intervals || {})[s.months[0]] || [7, 10]).slice(); });
  return out;
}
function fillPlantForm(p) {
  editingId = p ? p.id : null;
  pendingAvatar = p && p.img && p.img.startsWith('/photos/') ? p.img : null;
  $('pFormTitle').textContent = p ? '编辑：' + p.name : '新增植株';
  $('pName').value = p ? p.name : '';
  $('pHint').value = p ? (p.hint || '') : '';
  $('pAdded').value = p ? (p.addedAt || todayStr()) : todayStr();
  $('pLevel').value = p ? (p.level || 'normal') : 'normal';
  $('pPreset').value = p ? (p.preset || 'custom') : 'foliage';
  const sv = p ? seasonValuesOf(p) : Object.assign({}, PRESETS.foliage.intervals);
  renderSeasonFields(sv);
  const av = p && p.img ? `<img src="${esc(p.img)}" style="height:56px;border-radius:12px">` : '<span class="muted">未设置，将显示叶子图标</span>';
  $('pAvatarPreview').innerHTML = av;
  $('pMsg').textContent = '';
}
function openPlants(id) {
  $('plantDrawer').classList.remove('hidden');
  api('/api/plants').then((r) => {
    ALL_PLANTS = r.plants; PRESETS = r.presets; if (r.seasons) SEASONS = r.seasons;
    $('pPreset').innerHTML = Object.keys(PRESETS).map((k) => `<option value="${k}">${esc(PRESETS[k].label)}</option>`).join('');
    renderPlantList();
    fillPlantForm(id ? plantObj(id) : null);
  }).catch((e) => toast('读取植株失败：' + e.message));
}
window.openPlants = openPlants;

/* ============ 手动记录 ============ */
function seg(id, items, cur, onPick) {
  $(id).innerHTML = items.map((it) => `<button data-v="${it.v}" class="${it.v === cur ? 'on' : ''}">${esc(it.t)}</button>`).join('');
  [...$(id).querySelectorAll('button')].forEach((b) => b.onclick = () => onPick(b.dataset.v));
}
function renderFields() {
  const f = [];
  if (type === 'change') {
    f.push(['level', '水位', 'select', ['标准', '偏高', '偏低']]);
    f.push(['water', '水质', 'select', ['清澈', '微浑', '浑浊有味']]);
    f.push(['rot', '烂根处理', 'select', ['未检查', '无需剪', '已剪除']]);
    f.push(['ml', '加营养液(ml)', 'number', '']);
    f.push(['dose', '浓度', 'select', ['1/2 浓度', '1/3 浓度', '全浓度', '未加']]);
  } else if (type === 'water') {
    f.push(['level', '补水情况', 'select', ['补到标准线', '只补了一点', '水位还够，没补']]);
  } else if (type === 'fertilize') {
    f.push(['ml', '用量(ml)', 'number', '']);
    f.push(['dose', '浓度', 'select', ['1/2 浓度', '1/3 浓度', '全浓度']]);
    f.push(['how', '方式', 'select', ['换水时加入', '直接滴入瓶里']]);
  } else if (type === 'observe') {
    f.push(['symptoms', '症状（可多选）', 'checks', SYMPTOMS]);
    f.push(['level', '水位', 'select', ['标准', '偏高', '偏低']]);
    f.push(['water', '水质', 'select', ['清澈', '微浑', '浑浊有味']]);
  }
  $('fields').innerHTML = f.map(([k, label, kind, opt]) => {
    if (kind === 'select') return `<label class="f">${label}<select data-k="${k}">${opt.map((o) => `<option>${o}</option>`).join('')}</select></label>`;
    if (kind === 'number') return `<label class="f">${label}<input type="number" step="0.1" min="0" data-k="${k}" placeholder="可不填"></label>`;
    return `<label class="f">${label}<span class="checks" data-k="${k}">${opt.map((o) => `<label><input type="checkbox" value="${o}">${o}</label>`).join('')}</span></label>`;
  }).join('');
}
function collect() {
  const data = {};
  [...$('fields').querySelectorAll('[data-k]')].forEach((el) => {
    const k = el.dataset.k;
    if (el.classList.contains('checks')) {
      const v = [...el.querySelectorAll('input:checked')].map((i) => i.value);
      if (v.length) data[k] = v;
    } else if (el.value !== '') data[k] = el.value;
  });
  return data;
}

/* ============ 摘要 ============ */
function summaryText() {
  const lines = [`【水培养护日志摘要】${todayStr()}`];
  plants.forEach((p) => {
    const s = statusFor(p.id);
    lines.push(`· ${p.name}：上次换水 ${s.last ? dayOf(s.last.at) : '—'}（${s.days == null ? '—' : s.days} 天），建议 ${s.iv[0]}~${s.iv[1]} 天，状态：${s.text}；本次换水后已补水 ${s.watersSince} 次；缓苗期${s.seedlingLeft > 0 ? '还剩 ' + s.seedlingLeft + ' 天' : '已结束'}。`);
  });
  if (!plants.length) lines.push('· （还没有添加植株）');
  const recent = [...(DB.entries || [])].reverse().slice(0, 6);
  if (recent.length) {
    lines.push('最近记录：');
    recent.forEach((e) => {
      const d = e.data || {}, a = d.analysis || {}, bits = [];
      if (d.level) bits.push('水位' + d.level);
      if (d.water) bits.push('水质' + d.water);
      if (d.ml) bits.push('营养液' + d.ml + 'ml');
      if (d.symptoms) bits.push(d.symptoms.join('、'));
      if (a.verdict) bits.push('AI：' + a.verdict);
      lines.push(`  ${e.at.replace('T', ' ')} ${plantName(e.plant)} ${TYPE_LABEL[e.type] || e.type} ${bits.join(' ')} ${e.note || ''}`.trim());
    });
  }
  lines.push('（数据取自本地养护助手，请据此给出意见）');
  return lines.join('\n');
}

/* ============ 设置 ============ */
async function openSettings() {
  try {
    const r = await api('/api/settings');
    SETTINGS = Object.assign({}, r.settings);
    $('setKey').value = ''; $('setKey').placeholder = r.settings.hasKey ? '已保存（' + r.settings.apiKey + '），留空表示不修改' : 'sk-...';
    $('setBase').value = r.settings.baseUrl || 'https://api.deepseek.com';
    $('setModel').value = r.settings.model || 'deepseek-flash';
    $('setDetail').value = r.settings.detail || 'high';
    $('setRemind').value = r.settings.remindDays || 2;
    $('setSeed').value = r.settings.seedlingDays || 21;
    $('setLan').checked = !!r.settings.lanAccess;
    $('lanInfo').textContent = (r.lan || []).length ? '手机上传地址（勾选并重启后可用）：' + r.lan.join('　') : '';
    $('testResult').innerHTML = '';
  } catch (e) { toast('读取设置失败：' + e.message); }
  $('drawer').classList.remove('hidden');
}

/* ============ 载入 ============ */
async function load() {
  const [log, set, pl] = await Promise.all([api('/api/log'), api('/api/settings'), api('/api/plants')]);
  DB = log.db;
  SETTINGS = Object.assign({}, set.settings);
  ALL_PLANTS = pl.plants;
  PRESETS = pl.presets;
  if (pl.seasons) SEASONS = pl.seasons;
  plants = ALL_PLANTS.filter((p) => !p.archived);
  if (plant !== 'both' && !plants.some((p) => p.id === plant)) plant = 'both';
  renderHeader(); renderCards(); renderAdvice(); renderHistory(); bindThumbs(); refreshSegs();
  return { log, set, pl };
}

function refreshSegs() {
  const items = [{ v: 'both', t: plants.length > 1 ? '全部一起' : '全部' }, ...plants.map((p) => ({ v: p.id, t: p.name.replace(/^水培/, '') }))];
  const cur = plant;
  seg('segPlant', items, cur, (v) => { plant = v; refreshSegs(); });
  seg('segPlant2', items, cur, (v) => { plant = v; refreshSegs(); });
}

function init() {
  $('at').value = localNowInput();
  $('at').value = localNowInput();
  const typeItems = ['change', 'water', 'fertilize', 'observe'].map((t) => ({ v: t, t: TYPE_LABEL[t] }));
  const drawType = () => seg('segType', typeItems, type, (v) => { type = v; drawType(); renderFields(); });
  drawType(); renderFields();

  /* —— AI 区 —— */
  $('drop').onclick = (e) => { if (e.target.id !== 'btnCam') $('file').click(); };
  $('file').onchange = async (ev) => { await addFiles(ev.target.files); ev.target.value = ''; };
  ['dragenter', 'dragover'].forEach((t) => $('drop').addEventListener(t, (e) => { e.preventDefault(); $('drop').classList.add('over'); }));
  ['dragleave', 'drop'].forEach((t) => $('drop').addEventListener(t, (e) => { e.preventDefault(); $('drop').classList.remove('over'); }));
  $('drop').addEventListener('drop', (e) => addFiles(e.dataTransfer.files));
  document.addEventListener('paste', (e) => {
    const items = [...((e.clipboardData || {}).items || [])].filter((i) => i.type.startsWith('image/'));
    if (items.length) addFiles(items.map((i) => i.getAsFile()).filter(Boolean));
  });
  $('btnCam').onclick = (e) => { e.stopPropagation(); shootPhoto(); };
  $('btnAnalyze').onclick = analyze;

  [...$('quick').querySelectorAll('button')].forEach((b) => b.onclick = async () => {
    const q = b.dataset.q;
    const symptoms = (lastAnalysis && lastAnalysis.symptoms) || [];
    let e;
    if (q === 'change') e = { plant, type: 'change', data: { level: '标准', water: '清澈', dose: '未加' }, note: 'AI 拍照后一键确认' };
    else if (q === 'water') e = { plant, type: 'water', data: { level: '补到标准线' }, note: 'AI 拍照后一键确认' };
    else if (q === 'fertilize') e = { plant, type: 'fertilize', data: { dose: '1/2 浓度' }, note: 'AI 拍照后一键确认' };
    else e = { plant, type: 'observe', data: symptoms.length ? { symptoms } : { symptoms: ['无异常'] }, note: '今天没有操作，仅拍照核对' };
    try { await postJson('/api/log', { op: 'add', entry: e }); toast('已记录：' + (TYPE_LABEL[e.type] || '')); $('quick').classList.add('hidden'); await load(); }
    catch (err) { toast('记录失败：' + err.message); }
  });

  /* —— 植株管理 —— */
  $('btnPlants').onclick = () => openPlants();
  $('pClose').onclick = () => $('plantDrawer').classList.add('hidden');
  $('plantDrawer').onclick = (e) => { if (e.target.id === 'plantDrawer') $('plantDrawer').classList.add('hidden'); };
  $('pNew').onclick = () => fillPlantForm(null);
  $('pPreset').onchange = () => {
    const pr = PRESETS[$('pPreset').value];
    if (pr && pr.intervals) renderSeasonFields(pr.intervals);
  };
  $('pAvatar').onchange = async (ev) => {
    const f = ev.target.files[0];
    if (!f) return;
    try {
      const d = await fileToJpegDataUrl(f, 600, 0.9);
      const r = await postJson('/api/photo', { dataUrl: d });
      pendingAvatar = '/' + r.file;
      $('pAvatarPreview').innerHTML = `<img src="${pendingAvatar}" style="height:56px;border-radius:12px">`;
    } catch (e) { toast('头像上传失败：' + e.message); }
    ev.target.value = '';
  };
  $('pSave').onclick = async () => {
    const name = $('pName').value.trim();
    if (!name) { toast('请填写植株名称'); return; }
    const iv = {};
    SEASONS.forEach((s) => {
      const a = Number($(`pIntervals`).querySelector(`[data-season="${s.key}"][data-i="0"]`).value) || 7;
      const b = Number($('pIntervals').querySelector(`[data-season="${s.key}"][data-i="1"]`).value) || a;
      s.months.forEach((m) => { iv[m] = [Math.min(a, b), Math.max(a, b)]; });
    });
    const payload = {
      name, hint: $('pHint').value.trim(), addedAt: $('pAdded').value || todayStr(),
      level: $('pLevel').value, preset: $('pPreset').value, intervals: iv, img: pendingAvatar,
    };
    $('pMsg').textContent = '保存中…';
    try {
      if (editingId) await postJson('/api/plants', { op: 'update', id: editingId, patch: payload });
      else await postJson('/api/plants', { op: 'add', plant: payload });
      toast(editingId ? '已保存修改' : '已添加植株');
      await load(); openPlants();
    } catch (e) { $('pMsg').textContent = ''; toast('保存失败：' + e.message); }
  };

  /* —— 手动记录 —— */
  $('photo').onchange = async (ev) => {
    const files = [...ev.target.files].slice(0, 3 - manualPhotos.length);
    for (const f of files) {
      try { const d = await fileToJpegDataUrl(f); const r = await postJson('/api/photo', { dataUrl: d }); manualPhotos.push(r.file); }
      catch (e) { toast('照片上传失败：' + e.message); }
    }
    ev.target.value = '';
    $('preview').innerHTML = manualPhotos.map((p) => `<img class="thumb" src="/${esc(p)}" data-full="/${esc(p)}">`).join('');
    bindThumbs();
  };
  $('btnSave').onclick = async () => {
    const entry = { at: $('at').value || localNowInput(), plant, type, data: collect(), note: $('note2').value, photos: manualPhotos };
    $('saveMsg').textContent = '保存中…';
    try {
      await postJson('/api/log', { op: 'add', entry });
      $('note2').value = ''; manualPhotos = []; $('preview').innerHTML = '';
      $('saveMsg').textContent = '已保存 ✓'; setTimeout(() => $('saveMsg').textContent = '', 2500);
      toast('已记录：' + plantName(plant) + ' ' + TYPE_LABEL[type]);
      await load();
    } catch (e) { $('saveMsg').textContent = ''; toast('保存失败：' + e.message); }
  };

  /* —— 设置 —— */
  $('btnSettings').onclick = openSettings;
  $('btnCloseSet').onclick = () => $('drawer').classList.add('hidden');
  $('drawer').onclick = (e) => { if (e.target.id === 'drawer') $('drawer').classList.add('hidden'); };
  $('btnSaveSet').onclick = async () => {
    const body = {
      apiKey: $('setKey').value.trim(), baseUrl: $('setBase').value.trim(), model: $('setModel').value.trim(),
      detail: $('setDetail').value, remindDays: Number($('setRemind').value) || 2,
      seedlingDays: Number($('setSeed').value) || 21, lanAccess: $('setLan').checked,
    };
    try {
      const r = await postJson('/api/settings', body);
      SETTINGS = Object.assign({}, r.settings);
      toast('已保存' + (r.needRestart ? '（局域网开关需重启程序生效）' : ''));
      $('drawer').classList.add('hidden'); await load();
    } catch (e) { toast('保存失败：' + e.message); }
  };
  $('btnTest').onclick = async () => {
    const btn = $('btnTest'); busy(btn, true, '测试中…');
    $('testResult').innerHTML = '';
    try {
      const r = await postJson('/api/test', { apiKey: $('setKey').value.trim(), baseUrl: $('setBase').value.trim(), model: $('setModel').value.trim() });
      $('testResult').innerHTML = r.ok
        ? `<div style="color:var(--ok)">✓ ${esc(r.note || '连接正常')}${r.reply ? '（' + esc(r.reply) + '）' : ''}</div>`
          + (r.models && r.models.length ? `<div style="margin-top:6px">可用模型：<br>${r.models.map((m) => `<code>${esc(m)}</code>`).join(' ')}</div>` : '')
          + (r.warn ? `<div style="color:var(--warn);margin-top:6px">${esc(r.warn)}</div>` : '')
        : `<div style="color:var(--warn)">✗ ${esc(r.error || '连接失败')}</div>`;
    } catch (e) { $('testResult').innerHTML = `<div style="color:var(--warn)">✗ ${esc(e.message)}</div>`; }
    finally { busy(btn, false, '测试连接'); }
  };

  $('btnCopy').onclick = async () => {
    const text = summaryText();
    try { await navigator.clipboard.writeText(text); toast('摘要已复制，粘到对话里发我即可'); }
    catch (e) {
      const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select();
      document.execCommand('copy'); ta.remove(); toast('摘要已复制');
    }
  };

  load().catch((e) => toast('读取数据失败：' + e.message));
}
init();
