const https = require('https');

const API_KEY = process.env.ANTHROPIC_API_KEY;

const requestBody = {
  model: 'claude-haiku-4-5-20251001',
  max_tokens: 100,
  system: 'You are a helpful assistant.',
  messages: [
    { role: 'user', content: 'Say hello in one sentence.' }
  ]
};

console.log('=== REQUEST ===');
console.log('POST https://api.anthropic.com/v1/messages');
console.log('Headers:');
console.log('  x-api-key: sk-ant-...(redacted)');
console.log('  anthropic-version: 2023-06-01');
console.log('  content-type: application/json');
console.log('Body:');
console.log(JSON.stringify(requestBody, null, 2));

const bodyStr = JSON.stringify(requestBody);

const options = {
  host: 'api.anthropic.com',
  port: 443,
  path: '/v1/messages',
  method: 'POST',
  headers: {
    'x-api-key': API_KEY,
    'anthropic-version': '2023-06-01',
    'content-type': 'application/json',
    'content-length': Buffer.byteLength(bodyStr),
  },
};

const req = https.request(options, (res) => {
  const chunks = [];
  res.on('data', c => chunks.push(c));
  res.on('end', () => {
    const response = JSON.parse(Buffer.concat(chunks).toString());
    console.log('\n=== RESPONSE ===');
    console.log('Status:', res.statusCode);
    console.log(JSON.stringify(response, null, 2));
  });
});

req.write(bodyStr);
req.end();
