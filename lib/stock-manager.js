const fs = require('fs');
const path = require('path');
const { getStockBaseDir } = require('./client-scanner');

function getStockDir(clientName, persona) {
  const base = getStockBaseDir(clientName);
  return persona ? path.join(base, persona) : base;
}

function listStockFiles(clientName, persona) {
  const dir = getStockDir(clientName, persona);
  if (!fs.existsSync(dir)) return [];

  const files = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.isDirectory()) {
      const subFiles = fs.readdirSync(path.join(dir, entry.name))
        .filter(f => f.endsWith('.md') && !f.startsWith('_'))
        .map(f => ({
          name: f,
          persona: entry.name,
          path: path.join(dir, entry.name, f),
          ...parseStockMeta(path.join(dir, entry.name, f)),
        }));
      files.push(...subFiles);
    } else if (entry.name.endsWith('.md') && !entry.name.startsWith('_')) {
      files.push({
        name: entry.name,
        persona: null,
        path: path.join(dir, entry.name),
        ...parseStockMeta(path.join(dir, entry.name)),
      });
    }
  }

  return files.sort((a, b) => b.name.localeCompare(a.name));
}

function parseStockMeta(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');
    const postCount = lines.filter(l => /^###\s+Day/.test(l)).length;
    let sCount = 0, aCount = 0;
    for (const line of lines) {
      if (/\|\s*S\s*\(/.test(line)) sCount++;
      if (/\|\s*A\s*\(/.test(line)) aCount++;
    }
    return { postCount, sCount, aCount };
  } catch {
    return { postCount: 0, sCount: 0, aCount: 0 };
  }
}

function readStockFile(clientName, persona, fileName) {
  const dir = getStockDir(clientName, persona);
  const filePath = path.join(dir, fileName);
  if (!fs.existsSync(filePath)) return null;
  return fs.readFileSync(filePath, 'utf-8');
}

function saveStock(clientName, persona, content) {
  const dir = getStockDir(clientName, persona);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const today = new Date().toISOString().slice(0, 10);
  const fileName = `${today}_weekly.md`;
  let finalPath = path.join(dir, fileName);
  let suffix = 2;
  while (fs.existsSync(finalPath)) {
    finalPath = path.join(dir, `${today}_weekly_${suffix}.md`);
    suffix++;
  }

  fs.writeFileSync(finalPath, content, 'utf-8');
  return { path: finalPath, fileName: path.basename(finalPath) };
}

module.exports = { listStockFiles, readStockFile, saveStock };
