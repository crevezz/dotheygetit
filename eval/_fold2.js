const fs = require('fs');
const path = require('path');
const f = path.join(__dirname, '..', 'public', 'app.js');
let a = fs.readFileSync(f, 'utf8');
const old = `return \`<div class="sresult lv-\${esc(lv)}" data-ailevel="\${esc(v.level || '')}">`;
const neu = `return \`<div class="sresult lv-\${esc(lv)}\${drawResults.folded && drawResults.folded.has(String(st.name)) ? ' folded' : ''}" data-ailevel="\${esc(v.level || '')}">`;
if (!a.includes(old)) { console.error('MISS'); process.exit(1); }
a = a.replace(old, neu);
fs.writeFileSync(f, a);
console.log('ok');
