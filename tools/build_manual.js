// node tools/build_manual.js —— 把完整創作者區塊套進 manual_body.html，產生 manual.html
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const tpl = fs.readFileSync(path.join(root, '..', '..', '互動遊戲', 'taiwan-bird-atlas', 'tools', 'manual_tpl.html'), 'utf8');
const m = tpl.match(/<section id="creator">[\s\S]*?<\/section>/);
if (!m) throw new Error('creator section not found');
const out = fs.readFileSync(path.join(__dirname, 'manual_body.html'), 'utf8').replace('{{CREATOR}}', () => m[0]);
fs.writeFileSync(path.join(root, 'manual.html'), out);
console.log('manual.html written', out.length);
