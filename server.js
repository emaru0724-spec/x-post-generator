const express = require('express');
const path = require('path');
const { getClients, getClientConfig, getClientPersonas } = require('./lib/client-scanner');
const { listStockFiles, readStockFile, saveStock } = require('./lib/stock-manager');
const { createPersona, updatePersona, getPersonaDefinition } = require('./lib/persona-manager');
const { generate } = require('./lib/generator');

const app = express();
const PORT = 3462;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// --- Clients ---
app.get('/api/clients', (req, res) => {
  try {
    res.json(getClients());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/clients/:id/config', (req, res) => {
  try {
    const name = decodeURIComponent(req.params.id);
    res.json(getClientConfig(name));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// --- Personas ---
app.get('/api/clients/:id/personas', (req, res) => {
  try {
    const name = decodeURIComponent(req.params.id);
    res.json(getClientPersonas(name));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/clients/:id/personas', (req, res) => {
  try {
    const clientName = decodeURIComponent(req.params.id);
    const { name, definition } = req.body;
    if (!name) return res.status(400).json({ error: 'name required' });
    res.json(createPersona(clientName, name, definition || ''));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.put('/api/clients/:id/personas/:name', (req, res) => {
  try {
    const clientName = decodeURIComponent(req.params.id);
    const personaName = decodeURIComponent(req.params.name);
    const { definition } = req.body;
    res.json(updatePersona(clientName, personaName, definition));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/clients/:id/personas/:name/definition', (req, res) => {
  try {
    const clientName = decodeURIComponent(req.params.id);
    const personaName = decodeURIComponent(req.params.name);
    const def = getPersonaDefinition(clientName, personaName);
    res.json({ definition: def });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// --- Stock ---
app.get('/api/stock/:id', (req, res) => {
  try {
    const name = decodeURIComponent(req.params.id);
    const persona = req.query.persona || null;
    res.json(listStockFiles(name, persona));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/stock/:id/:file', (req, res) => {
  try {
    const name = decodeURIComponent(req.params.id);
    const file = decodeURIComponent(req.params.file);
    const persona = req.query.persona || null;
    const content = readStockFile(name, persona, file);
    if (!content) return res.status(404).json({ error: 'not found' });
    res.json({ content });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/stock/:id', (req, res) => {
  try {
    const name = decodeURIComponent(req.params.id);
    const { persona, content } = req.body;
    if (!content) return res.status(400).json({ error: 'content required' });
    const result = saveStock(name, persona, content);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// --- Generate (SSE) ---
app.post('/api/generate', async (req, res) => {
  const { clientId, persona, days } = req.body;
  if (!clientId) return res.status(400).json({ error: 'clientId required' });

  const clientName = decodeURIComponent(clientId);

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  try {
    for await (const event of generate(clientName, persona, days || 7)) {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    }
  } catch (e) {
    res.write(`data: ${JSON.stringify({ type: 'error', message: e.message })}\n\n`);
  }

  res.write(`data: [DONE]\n\n`);
  res.end();
});

// --- SPA fallback ---
app.get('/{*path}', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`\n  🖊  筆 PostCraft — X投稿ジェネレーター`);
  console.log(`  http://localhost:${PORT}\n`);
});
