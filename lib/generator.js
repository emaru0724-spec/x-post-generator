const Anthropic = require('@anthropic-ai/sdk');
const { getClientConfig } = require('./client-scanner');
const { getPersonaDefinition } = require('./persona-manager');

const client = new Anthropic();

function buildPrompt(clientName, persona, days) {
  const config = getClientConfig(clientName);
  const personaDef = persona ? getPersonaDefinition(clientName, persona) : null;
  const totalPosts = days * 3;

  let prompt = `あなたはコンテンツ制作部のエースライターです。

## 品質基準
${config.rubric || '（なし）'}

## ブランドボイス
${config.brandVoice || '（なし）'}

## ターゲット
${config.target || '（なし）'}

## 制作テンプレート
${config.template || '（なし）'}
`;

  if (personaDef) {
    prompt += `
## ペルソナ設定
${personaDef}
`;
  } else if (persona) {
    prompt += `
## ペルソナ設定
名前: ${persona}
（詳細定義なし。このペルソナとして自然な投稿を作成してください）
`;
  }

  prompt += `
## タスク
${persona ? `「${persona}」というペルソナとして、` : ''}${days}日分のX投稿を生成してください。
1日あたり3本（型A朝7:00 / 型B昼12:00 / 型C夜20:00〜21:00）。
合計${totalPosts}本を採点表付きで出力してください。
B(35)以下の投稿は自動リライトしてA(40)以上にすること。

## 出力フォーマット（厳守）

まず採点結果テーブルを出力:

| # | Day | 型 | ランク | 合計 | フック | 共感 | ボイス | 具体性 | CTA |
|---|-----|----|--------|------|--------|------|--------|--------|-----|
| 1 | Day1 | A朝 | A(43) | 43/50 | 9 | 9 | 9 | 8 | 8 |
...

全${totalPosts}本 A以上。S: X本 / A: Y本

---

次に各投稿本文を出力:

### Day1 - Type A（朝7:00）

（投稿本文）

スコア: 43/50（Aランク）

---

### Day1 - Type B（昼12:00）

（投稿本文）

スコア: 42/50（Aランク）

---

（以降、Day${days}まで繰り返し）
`;

  return prompt;
}

async function* generate(clientName, persona, days) {
  const prompt = buildPrompt(clientName, persona, days);

  yield { type: 'status', message: 'Claude APIに接続中...' };

  const stream = await client.messages.stream({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 16000,
    messages: [{ role: 'user', content: prompt }],
  });

  let fullText = '';
  let chunkBuffer = '';

  for await (const event of stream) {
    if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
      const text = event.delta.text;
      fullText += text;
      chunkBuffer += text;

      // Send chunks periodically
      if (chunkBuffer.length > 100) {
        yield { type: 'chunk', text: chunkBuffer };
        chunkBuffer = '';
      }
    }
  }

  // Flush remaining buffer
  if (chunkBuffer) {
    yield { type: 'chunk', text: chunkBuffer };
  }

  yield { type: 'done', fullText };
}

module.exports = { generate, buildPrompt };
