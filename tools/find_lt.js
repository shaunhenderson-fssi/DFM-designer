const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, '..', 'example', 'CustDisp.dfm');
const txt = fs.readFileSync(file, 'utf8');
const lines = txt.split(/\r?\n/);
let decl = -1;
for (let i=0;i<lines.length;i++){
  if (/^\s*object\s+icLoyaltyCards\s*:\s*/.test(lines[i])) { decl = i; break; }
}
console.log('declIndex', decl+1);
let found = {};
let depth = 0;
for (let i = decl+1; i<lines.length; i++){
  const t = lines[i].trim();
  if (/^object\s+\w+\s*:\s*\w+/i.test(t)) { depth++; continue; }
  if (t === 'end') { if (depth===0) { console.log('stopping at', i+1); break; } depth--; continue; }
  const l = t.match(/^Left\s*=\s*(\d+)$/i);
  if (l) found.Left = l[1];
  const tt = t.match(/^Top\s*=\s*(\d+)$/i);
  if (tt) found.Top = tt[1];
}
console.log('found', found);