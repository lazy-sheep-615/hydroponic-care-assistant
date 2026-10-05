#!/usr/bin/env node
'use strict';
/**
 * 假的大模型接口（OpenAI 兼容），用于本地开发/自检，不消耗真实额度。
 *
 *   node tools/fake-api.js                 # 监听 8799
 *   FAKE_PORT=9000 node tools/fake-api.js  # 换端口
 *
 * 用法（手动点界面调试）：
 *   1) node tools/fake-api.js
 *   2) 把界面「设置」里的 Base URL 改成 http://127.0.0.1:8799，Key 随便填
 *   3) 正常传照片点分析，会立刻返回一份固定结论
 *
 * 每次请求的 messages 会写进 tools/_last_request.json，方便检查提示词。
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.FAKE_PORT || 8799);
const CAP = path.join(__dirname, '_last_request.json');

const ANALYSIS = {
  verdict: '水位合适，根色正常，未见烂根',
  urgency: 'watch',
  plants_seen: ['（假接口固定值）'],
  water_level: { issue: '合适', reason: '水面大约在根团中部，上半截根与泡棉在空气中' },
  water_quality: '清澈',
  foam_wet: false,
  roots: { look: '根细、褐色木质化，未见白色新根', rot_suspected: false, new_roots_visible: false },
  leaves: '叶片颜色正常，未见黄化或焦边',
  bottle: '瓶底干净，无沉积与绿藻',
  symptoms: ['瓶底沉积/藻'],
  actions: ['保持当前水位，不要加水到没过泡棉', '3 天后同一角度再拍一张对比', '缓苗期内只用清水', '给瓶子下半段遮光'],
  next_change_days: 7,
  uncertain: ['根是否硬挺有弹性、有没有异味，需要手摸和闻'],
};

http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => { body += c; });
  req.on('end', () => {
    if (req.url.includes('/models')) {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ object: 'list', data: [{ id: 'deepseek-flash' }, { id: 'deepseek-chat' }] }));
      return;
    }
    if (req.url.includes('/chat/completions')) {
      let parsed = {};
      try { parsed = JSON.parse(body || '{}'); } catch (e) { }
      try {
        fs.writeFileSync(CAP, JSON.stringify({
          url: req.url, auth: req.headers.authorization,
          model: parsed.model,
          imageCount: (parsed.messages || []).flatMap((m) => (Array.isArray(m.content) ? m.content : []))
            .filter((c) => c.type === 'image_url').length,
          body: parsed,
        }, null, 2), 'utf8');
      } catch (e) { }
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({
        id: 'fake-' + Date.now(), model: parsed.model || 'fake',
        choices: [{ index: 0, message: { role: 'assistant', content: JSON.stringify(ANALYSIS) }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 1310, completion_tokens: 176, total_tokens: 1486 },
      }));
      return;
    }
    res.writeHead(404, { 'content-type': 'application/json' });
    res.end('{"error":{"message":"not found"}}');
  });
}).listen(PORT, '127.0.0.1', () => console.log('假大模型接口已启动 http://127.0.0.1:' + PORT));
