// State
let clients = [];
let selectedClient = null;
let selectedPersona = null;
let generatedContent = '';
let currentPosts = [];

// Init
document.addEventListener('DOMContentLoaded', loadClients);

async function loadClients() {
  const res = await fetch('/api/clients');
  clients = await res.json();
  renderClientList();
}

function renderClientList() {
  const el = document.getElementById('client-list');
  el.innerHTML = clients.map(c => `
    <div class="client-item ${selectedClient?.id === c.id ? 'active' : ''}"
         onclick="selectClient('${c.id}')">
      <span>${c.name.split('｜')[0]}</span>
      <span class="count">${c.stockCount}</span>
    </div>
    ${selectedClient?.id === c.id ? `<div class="persona-list" id="persona-list-${c.id}"></div>` : ''}
  `).join('');

  if (selectedClient) loadPersonas();
}

async function selectClient(id) {
  selectedClient = clients.find(c => c.id === id);
  selectedPersona = null;
  document.getElementById('welcome').style.display = 'none';
  document.getElementById('main-content').style.display = 'block';
  renderClientList();
  loadStock();
}

async function loadPersonas() {
  if (!selectedClient) return;
  const res = await fetch(`/api/clients/${selectedClient.id}/personas`);
  const personas = await res.json();

  const listEl = document.getElementById(`persona-list-${selectedClient.id}`);
  if (!listEl) return;

  listEl.innerHTML = personas.map(p => `
    <div class="persona-item ${selectedPersona === p.name ? 'active' : ''}"
         onclick="event.stopPropagation(); selectPersona('${p.name}')">
      ${p.name} ${p.definition ? '✓' : ''}
    </div>
  `).join('');

  // Update persona select
  const select = document.getElementById('persona-select');
  select.innerHTML = '<option value="">（ペルソナなし）</option>' +
    personas.map(p => `<option value="${p.name}" ${selectedPersona === p.name ? 'selected' : ''}>${p.name}</option>`).join('');
}

function selectPersona(name) {
  selectedPersona = name;
  document.getElementById('persona-select').value = name;
  renderClientList();
  loadStock();
}

// Tabs
function switchTab(tab) {
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
  document.querySelectorAll('.tab-content').forEach(t => t.classList.toggle('active', t.id === `tab-${tab}`));

  if (tab === 'stock') loadStock();
  if (tab === 'calendar') loadCalendar();
}

// Generate
async function startGenerate() {
  if (!selectedClient) return;

  const persona = document.getElementById('persona-select').value || null;
  const days = parseInt(document.getElementById('days-select').value);
  const btn = document.getElementById('generate-btn');
  const output = document.getElementById('generate-output');
  const progress = document.getElementById('progress');
  const progressFill = document.getElementById('progress-fill');
  const status = document.getElementById('status');
  const saveBtn = document.getElementById('save-btn');
  const scoreSummary = document.getElementById('score-summary');

  btn.disabled = true;
  btn.textContent = '⏳ 生成中...';
  saveBtn.style.display = 'none';
  scoreSummary.style.display = 'none';
  progress.classList.add('active');
  progressFill.style.width = '30%';
  status.textContent = 'Claude APIに接続中...';
  output.innerHTML = '<div class="stream-output" id="stream-text"></div>';
  generatedContent = '';

  try {
    const response = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientId: selectedClient.id, persona, days }),
    });

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    const streamText = document.getElementById('stream-text');
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop();

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6);
        if (data === '[DONE]') continue;

        try {
          const event = JSON.parse(data);
          if (event.type === 'status') {
            status.textContent = event.message;
          } else if (event.type === 'chunk') {
            generatedContent += event.text;
            streamText.textContent = generatedContent;
            streamText.scrollTop = streamText.scrollHeight;
            progressFill.style.width = '60%';
          } else if (event.type === 'done') {
            generatedContent = event.fullText;
            progressFill.style.width = '100%';
          } else if (event.type === 'error') {
            status.textContent = '❌ エラー: ' + event.message;
          }
        } catch {}
      }
    }

    // Parse and display results
    status.textContent = '✅ 生成完了';
    progress.classList.remove('active');
    renderGeneratedResult(generatedContent);
    saveBtn.style.display = 'inline-block';

  } catch (e) {
    status.textContent = '❌ エラー: ' + e.message;
    progress.classList.remove('active');
  }

  btn.disabled = false;
  btn.textContent = '🚀 生成開始';
}

function renderGeneratedResult(content) {
  const output = document.getElementById('generate-output');

  // Try to extract scoring table
  const tableMatch = content.match(/\|[^|]*#[^|]*\|[^]*?\n(?=\n)/);
  const posts = parsePostSections(content);
  currentPosts = posts;

  // Show summary stats
  const summary = document.getElementById('score-summary');
  const scores = posts.map(p => p.score).filter(Boolean);
  const sCount = posts.filter(p => p.rank === 'S').length;
  const aCount = posts.filter(p => p.rank === 'A').length;

  if (scores.length > 0) {
    document.getElementById('stat-total').textContent = posts.length;
    document.getElementById('stat-s').textContent = sCount;
    document.getElementById('stat-a').textContent = aCount;
    document.getElementById('stat-avg').textContent = (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1);
    summary.style.display = 'block';
  }

  // Build score table + preview
  let html = '';

  if (posts.length > 0) {
    html += `<table class="score-table"><thead><tr>
      <th>#</th><th>Day</th><th>型</th><th>ランク</th><th>合計</th><th>プレビュー</th>
    </tr></thead><tbody>`;

    posts.forEach((p, i) => {
      const rankClass = p.rank === 'S' ? 'rank-s' : p.rank === 'A' ? 'rank-a' : 'rank-b';
      const preview = p.body.slice(0, 40) + '...';
      html += `<tr onclick="showPost(${i})">
        <td>${i + 1}</td>
        <td>${p.day}</td>
        <td>${p.type}</td>
        <td><span class="rank-badge ${rankClass}">${p.rank}(${p.score})</span></td>
        <td>${p.score}/50</td>
        <td style="color:var(--text2); font-size:12px;">${escapeHtml(preview)}</td>
      </tr>`;
    });
    html += '</tbody></table>';
  }

  // Also show raw output
  html += `<details style="margin-top:16px;">
    <summary style="cursor:pointer; color:var(--text2); font-size:12px;">生テキスト表示</summary>
    <div class="stream-output" style="margin-top:8px;">${escapeHtml(content)}</div>
  </details>`;

  output.innerHTML = html;
}

function parsePostSections(content) {
  const posts = [];
  const sections = content.split(/(?=^### Day)/m);

  for (const section of sections) {
    const headerMatch = section.match(/^### (Day\d+)\s*[-–—]\s*Type\s*(\w).*?(\d+:\d+)/);
    if (!headerMatch) continue;

    const [, day, type, time] = headerMatch;
    const bodyLines = section.split('\n').slice(1);
    const scoreLineIdx = bodyLines.findIndex(l => /^スコア[:：]/.test(l));

    let body, score = null, rank = null;
    if (scoreLineIdx !== -1) {
      body = bodyLines.slice(0, scoreLineIdx).join('\n').trim();
      const scoreLine = bodyLines[scoreLineIdx];
      const scoreMatch = scoreLine.match(/(\d+)\/50.*?([SA-D])ランク|([SA-D])\((\d+)/i);
      if (scoreMatch) {
        score = parseInt(scoreMatch[1] || scoreMatch[4]);
        rank = scoreMatch[2] || scoreMatch[3];
      }
    } else {
      body = bodyLines.join('\n').replace(/---\s*$/, '').trim();
    }

    // Fallback: try to get score from table
    if (!score) {
      const tableMatch = content.match(new RegExp(`\\|\\s*\\d+\\s*\\|\\s*${day}\\s*\\|\\s*${type}[^|]*\\|\\s*([SA-D])\\((\\d+)\\)`));
      if (tableMatch) {
        rank = tableMatch[1];
        score = parseInt(tableMatch[2]);
      }
    }

    const typeLabel = type === 'A' ? '朝' : type === 'B' ? '昼' : '夜';
    posts.push({ day, type: `${type}${typeLabel}`, time, body, score, rank: rank || '?' });
  }

  return posts;
}

function showPost(index) {
  const post = currentPosts[index];
  if (!post) return;

  const rankClass = post.rank === 'S' ? 'rank-s' : post.rank === 'A' ? 'rank-a' : 'rank-b';
  document.getElementById('post-modal-title').textContent = `${post.day} - Type ${post.type}（${post.time}）`;
  document.getElementById('post-modal-score').className = `rank-badge ${rankClass}`;
  document.getElementById('post-modal-score').textContent = `${post.rank}(${post.score}/50)`;
  document.getElementById('post-modal-body').textContent = post.body;
  document.getElementById('post-modal').classList.add('active');
}

function closePostModal() {
  document.getElementById('post-modal').classList.remove('active');
}

function copyPost() {
  const body = document.getElementById('post-modal-body').textContent;
  navigator.clipboard.writeText(body);
  const btn = document.querySelector('#post-modal .btn-primary');
  btn.textContent = '✅ コピーしました';
  setTimeout(() => btn.textContent = '📋 コピー', 1500);
}

// Save
async function saveToStock() {
  if (!selectedClient || !generatedContent) return;

  const persona = document.getElementById('persona-select').value || null;
  // Build header
  const days = document.getElementById('days-select').value;
  const totalPosts = currentPosts.length;
  const sCount = currentPosts.filter(p => p.rank === 'S').length;
  const aCount = currentPosts.filter(p => p.rank === 'A').length;
  const today = new Date().toISOString().slice(0, 10);

  let header = `# ${persona || selectedClient.name.split('｜')[0]} X投稿ストック ${today}（${days}日分・${totalPosts}本）\n\n`;
  const content = header + generatedContent;

  const res = await fetch(`/api/stock/${selectedClient.id}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ persona, content }),
  });

  const result = await res.json();
  const btn = document.getElementById('save-btn');
  btn.textContent = `✅ 保存完了: ${result.fileName}`;
  setTimeout(() => btn.textContent = '💾 ストックに保存', 2000);
}

// Stock
async function loadStock() {
  if (!selectedClient) return;
  const res = await fetch(`/api/stock/${selectedClient.id}`);
  const files = await res.json();

  const listEl = document.getElementById('stock-list');
  if (files.length === 0) {
    listEl.innerHTML = '<div class="empty-state"><div class="icon">📂</div><p>ストックはまだありません</p></div>';
    return;
  }

  listEl.innerHTML = files.map(f => `
    <div class="stock-item" onclick="viewStock('${encodeURIComponent(f.name)}', ${f.persona ? `'${f.persona}'` : 'null'})">
      <div>
        <div class="name">${f.persona ? `[${f.persona}] ` : ''}${f.name}</div>
      </div>
      <div class="meta">
        <span>${f.postCount}本</span>
        ${f.sCount ? `<span style="color:var(--rank-s)">S:${f.sCount}</span>` : ''}
        ${f.aCount ? `<span style="color:var(--rank-a)">A:${f.aCount}</span>` : ''}
      </div>
    </div>
  `).join('');

  document.getElementById('stock-viewer').style.display = 'none';
  listEl.style.display = 'block';
}

async function viewStock(fileName, persona) {
  const name = decodeURIComponent(fileName);
  const url = `/api/stock/${selectedClient.id}/${fileName}${persona ? `?persona=${encodeURIComponent(persona)}` : ''}`;
  const res = await fetch(url);
  const data = await res.json();

  document.getElementById('stock-list').style.display = 'none';
  document.getElementById('stock-viewer').style.display = 'block';
  document.getElementById('stock-content').textContent = data.content;
}

function closeStockViewer() {
  document.getElementById('stock-viewer').style.display = 'none';
  document.getElementById('stock-list').style.display = 'block';
}

// Calendar
async function loadCalendar() {
  if (!selectedClient) return;
  const res = await fetch(`/api/stock/${selectedClient.id}`);
  const files = await res.json();

  // Get the latest stock file to show in calendar
  const calView = document.getElementById('calendar-view');

  if (files.length === 0) {
    calView.innerHTML = '<div class="empty-state"><div class="icon">📅</div><p>カレンダーに表示するストックがありません</p></div>';
    return;
  }

  // Load the latest file
  const latest = files[0];
  const url = `/api/stock/${selectedClient.id}/${encodeURIComponent(latest.name)}${latest.persona ? `?persona=${encodeURIComponent(latest.persona)}` : ''}`;
  const data = await (await fetch(url)).json();
  const posts = parsePostSections(data.content);

  if (posts.length === 0) {
    calView.innerHTML = '<div class="empty-state"><div class="icon">📅</div><p>投稿データをパースできませんでした</p></div>';
    return;
  }

  // Group by day
  const days = {};
  posts.forEach(p => {
    if (!days[p.day]) days[p.day] = [];
    days[p.day].push(p);
  });

  const dayNames = ['日', '月', '火', '水', '木', '金', '土'];
  const startDate = new Date(latest.name.match(/\d{4}-\d{2}-\d{2}/)?.[0] || new Date());

  let html = '<div class="calendar-grid">';
  dayNames.forEach(d => html += `<div class="cal-header">${d}</div>`);

  const dayKeys = Object.keys(days).sort();
  dayKeys.forEach((dayKey, i) => {
    const date = new Date(startDate);
    date.setDate(date.getDate() + i);
    const dateStr = `${date.getMonth() + 1}/${date.getDate()}`;

    html += `<div class="cal-cell">
      <div class="date">${dateStr}（${dayNames[date.getDay()]}）</div>`;

    days[dayKey].forEach(p => {
      const timeClass = p.type.includes('A') ? 'morning' : p.type.includes('B') ? 'noon' : 'night';
      const timeLabel = p.type.includes('A') ? '朝' : p.type.includes('B') ? '昼' : '夜';
      html += `<div class="cal-post" title="${escapeHtml(p.body.slice(0, 100))}">
        <span class="time-tag ${timeClass}">${timeLabel}</span>
        ${escapeHtml(p.body.slice(0, 20))}...
      </div>`;
    });

    html += '</div>';
  });

  // Fill remaining cells if needed
  const remaining = 7 - dayKeys.length;
  for (let i = 0; i < remaining; i++) {
    html += '<div class="cal-cell" style="opacity:0.3;"><div class="date">—</div></div>';
  }

  html += '</div>';
  html += `<p style="margin-top:12px; font-size:11px; color:var(--text2);">表示中: ${latest.persona ? `[${latest.persona}] ` : ''}${latest.name}</p>`;
  calView.innerHTML = html;
}

// Persona Modal
function openPersonaModal() {
  if (!selectedClient) {
    alert('先にクライアントを選択してください');
    return;
  }
  document.getElementById('persona-modal-title').textContent = '新規ペルソナ作成';
  document.getElementById('persona-name').value = '';
  document.getElementById('persona-name').disabled = false;
  document.getElementById('persona-def').value = '';
  document.getElementById('persona-modal').classList.add('active');
}

function closePersonaModal() {
  document.getElementById('persona-modal').classList.remove('active');
}

async function savePersona() {
  const name = document.getElementById('persona-name').value.trim();
  const definition = document.getElementById('persona-def').value;

  if (!name) { alert('ペルソナ名を入力してください'); return; }
  if (!selectedClient) return;

  await fetch(`/api/clients/${selectedClient.id}/personas`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, definition }),
  });

  closePersonaModal();
  loadPersonas();
}

// Utils
function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
