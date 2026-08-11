const fs = require('fs');
const path = require('path');
const dfmParser = require(path.join(__dirname, '..', 'out', 'dfmParser.js'));

const file = path.join(__dirname, '..', 'example', 'CustDisp.dfm');
const txt = fs.readFileSync(file, 'utf8');
const comps = dfmParser.parseDfm(txt);

function findByName(list, name) {
  for (const c of list) {
    if (c.name === name) return c;
    const nested = findByName(c.children, name);
    if (nested) return nested;
  }
  return null;
}

const comp = findByName(comps, 'icLoyaltyCards');
console.log('found:', !!comp);
if (comp) {
  console.log('className:', comp.className);
  console.log('properties.Left:', comp.properties.Left);
  console.log('properties.Top:', comp.properties.Top);
  console.log('properties.Images exists:', !!comp.properties.Images);
  try {
    const imgs = JSON.parse(comp.properties.Images || '[]');
    console.log('images length:', imgs.length);
    console.log('first image sample keys:', imgs[0] ? Object.keys(imgs[0]).slice(0,10) : 'none');
  } catch (e) {
    console.log('images parse error', e && e.message);
  }
}
// Show context lines for the component if present
if (comp) {
  console.log('lineNumber:', comp.lineNumber, 'endLine:', comp.endLine);
  const allLines = txt.split(/\r?\n/);
  const start = Math.max(0, comp.lineNumber - 3);
  const end = Math.min(allLines.length - 1, comp.endLine + 3);
  console.log('---- DFM context ----');
  for (let i = start; i <= end; i++) {
    console.log((i+1).toString().padStart(6)+':', allLines[i]);
  }
  console.log('---- end context ----');
}
