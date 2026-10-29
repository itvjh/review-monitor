// Builds dashboard/views/icons.svg: a sprite with only the Lucide icons the dashboard uses (about 6 KB instead of the 540 KB full set).
// Run after adding an icon name to a view:  npm run build:icons
const fs = require('fs');
const path = require('path');

const views = path.join(__dirname, '..', 'dashboard', 'views');
const icons = path.join(__dirname, '..', 'node_modules', 'lucide-static', 'icons');

const used = new Set();
for (const f of fs.readdirSync(views).filter((n) => /\.(js|html)$/.test(n))) {
  const text = fs.readFileSync(path.join(views, f), 'utf8');
  for (const m of text.matchAll(/['"]([a-z][a-z0-9-]*)['"]|icons\.svg#([a-z][a-z0-9-]*)/g)) {
    const name = m[1] || m[2];
    if (fs.existsSync(path.join(icons, name + '.svg'))) used.add(name); // only words that are real icon names
  }
}

const symbols = [...used].sort().map((name) => {
  const svg = fs.readFileSync(path.join(icons, name + '.svg'), 'utf8');
  const inner = svg.slice(svg.indexOf('>', svg.indexOf('<svg')) + 1, svg.lastIndexOf('</svg>')).replace(/<!--[\s\S]*?-->/g, '').trim();
  return '<symbol id="' + name + '" viewBox="0 0 24 24">' + inner + '</symbol>';
});
fs.writeFileSync(path.join(views, 'icons.svg'), '<svg xmlns="http://www.w3.org/2000/svg">\n' + symbols.join('\n') + '\n</svg>\n');
console.log('icons.svg: ' + used.size + ' icons (' + [...used].join(', ') + ')');
