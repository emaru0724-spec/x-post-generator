const fs = require('fs');
const path = require('path');

const CLIENTS_DIR = path.join(process.env.HOME, 'clients');
const LOCAL_DATA_DIR = path.join(__dirname, '..', 'data');
const LOCAL_CLIENT_NAME = '古着副業アカウント';

function getClients() {
  const clients = [];

  // 1. Built-in client from data/ directory
  if (fs.existsSync(path.join(LOCAL_DATA_DIR, 'テンプレート', 'x-post.md'))) {
    const personas = getLocalPersonas();
    const stockDir = path.join(LOCAL_DATA_DIR, 'ストック');
    const stockCount = countStockFiles(stockDir);
    clients.push({
      id: encodeURIComponent('__local__'),
      name: LOCAL_CLIENT_NAME,
      path: LOCAL_DATA_DIR,
      personaCount: personas.length,
      stockCount,
      isLocal: true,
    });
  }

  // 2. External clients from ~/clients/
  if (fs.existsSync(CLIENTS_DIR)) {
    const entries = fs.readdirSync(CLIENTS_DIR, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const clientDir = path.join(CLIENTS_DIR, entry.name);
      const templatePath = path.join(clientDir, '共有', 'テンプレート', 'x-post.md');
      if (!fs.existsSync(templatePath)) continue;

      const stockDir = path.join(clientDir, 'アウトプット', 'X投稿', 'ストック');
      const personas = getPersonas(stockDir);
      const stockCount = countStockFiles(stockDir);

      clients.push({
        id: encodeURIComponent(entry.name),
        name: entry.name,
        path: clientDir,
        personaCount: personas.length,
        stockCount,
      });
    }
  }

  return clients;
}

function resolveClientDir(clientName) {
  if (clientName === '__local__') return LOCAL_DATA_DIR;
  return path.join(CLIENTS_DIR, clientName);
}

function getPersonas(stockDir) {
  if (!fs.existsSync(stockDir)) return [];
  const entries = fs.readdirSync(stockDir, { withFileTypes: true });
  return entries.filter(e => e.isDirectory()).map(e => {
    const personaFile = path.join(stockDir, e.name, '_persona.md');
    let definition = null;
    if (fs.existsSync(personaFile)) {
      definition = fs.readFileSync(personaFile, 'utf-8');
    }
    return { name: e.name, definition };
  });
}

function getLocalPersonas() {
  const personaDir = path.join(LOCAL_DATA_DIR, 'ペルソナ');
  if (!fs.existsSync(personaDir)) return [];
  const entries = fs.readdirSync(personaDir, { withFileTypes: true });
  return entries.filter(e => e.isDirectory()).map(e => {
    const personaFile = path.join(personaDir, e.name, '_persona.md');
    let definition = null;
    if (fs.existsSync(personaFile)) {
      definition = fs.readFileSync(personaFile, 'utf-8');
    }
    return { name: e.name, definition };
  });
}

function countStockFiles(stockDir) {
  if (!fs.existsSync(stockDir)) return 0;
  let count = 0;
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) walk(path.join(dir, entry.name));
      else if (entry.name.endsWith('.md') && !entry.name.startsWith('_')) count++;
    }
  };
  walk(stockDir);
  return count;
}

function getClientConfig(clientName) {
  if (clientName === '__local__') {
    const read = (rel) => {
      const p = path.join(LOCAL_DATA_DIR, ...rel.split('/'));
      return fs.existsSync(p) ? fs.readFileSync(p, 'utf-8') : null;
    };
    return {
      brandVoice: read('ガイド/ブランドボイス.md'),
      target: read('ガイド/ターゲット.md'),
      template: read('テンプレート/x-post.md'),
      rubric: read('品質基準/採点ルブリック.md'),
    };
  }

  const clientDir = path.join(CLIENTS_DIR, clientName);
  const read = (rel) => {
    const p = path.join(clientDir, ...rel.split('/'));
    return fs.existsSync(p) ? fs.readFileSync(p, 'utf-8') : null;
  };

  return {
    brandVoice: read('共有/ガイド/ブランドボイス.md'),
    target: read('共有/ガイド/ターゲット.md'),
    template: read('共有/テンプレート/x-post.md'),
    rubric: read('共有/品質基準/採点ルブリック.md'),
  };
}

function getClientPersonas(clientName) {
  if (clientName === '__local__') return getLocalPersonas();
  const stockDir = path.join(CLIENTS_DIR, clientName, 'アウトプット', 'X投稿', 'ストック');
  return getPersonas(stockDir);
}

function getStockBaseDir(clientName) {
  if (clientName === '__local__') return path.join(LOCAL_DATA_DIR, 'ストック');
  return path.join(CLIENTS_DIR, clientName, 'アウトプット', 'X投稿', 'ストック');
}

function getPersonaBaseDir(clientName) {
  if (clientName === '__local__') return path.join(LOCAL_DATA_DIR, 'ペルソナ');
  return path.join(CLIENTS_DIR, clientName, 'アウトプット', 'X投稿', 'ストック');
}

module.exports = { getClients, getClientConfig, getClientPersonas, resolveClientDir, getStockBaseDir, getPersonaBaseDir, CLIENTS_DIR, LOCAL_DATA_DIR };
