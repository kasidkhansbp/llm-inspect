process.env.ANTHROPIC_BASE_URL = 'http://127.0.0.1:8787';

const Anthropic = require('@anthropic-ai/sdk');
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

async function main() {
  console.log('Sending request through llm-inspect proxy...');

  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 100,
    system: 'You are a helpful assistant.',
    messages: [{ role: 'user', content: 'Say hello in one sentence.' }],
  });

  console.log('Response:', response.content[0].text);
  console.log('Check the dashboard at http://127.0.0.1:8788');
}

main().catch(console.error);
