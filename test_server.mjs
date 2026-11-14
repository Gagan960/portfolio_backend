import { spawn } from 'child_process';
import http from 'http';

function request(options, body = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ statusCode: res.statusCode, data: JSON.parse(data || '{}') }));
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function run() {
  console.log('Starting Express server...');
  const server = spawn('node', ['server/server.js'], { stdio: 'pipe' });

  server.stdout.on('data', d => console.log('[Server stdout]:', d.toString().trim()));
  server.stderr.on('data', d => console.error('[Server stderr]:', d.toString().trim()));

  // Wait 1.5 seconds for server to start
  await new Promise(r => setTimeout(r, 1500));

  try {
    // 1. Health check
    console.log('Probing /api/health...');
    const health = await request({
      hostname: 'localhost',
      port: 5000,
      path: '/api/health',
      method: 'GET'
    });
    console.log('Health check result:', health);

    // 2. Test validation failure (missing fields)
    console.log('Testing /api/contact validation failure...');
    const valFail = await request({
      hostname: 'localhost',
      port: 5000,
      path: '/api/contact',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, { name: 'A' });
    console.log('Validation failure result:', valFail);

    // 3. Test honeypot trigger
    console.log('Testing /api/contact honeypot...');
    const hpTest = await request({
      hostname: 'localhost',
      port: 5000,
      path: '/api/contact',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, { name: 'Bot Name', hp_field: 'spam-bot' });
    console.log('Honeypot result:', hpTest);

    // 4. Test contact endpoint with full valid fields (with placeholder credentials)
    console.log('Testing /api/contact full payload with placeholder credentials...');
    const submitTest = await request({
      hostname: 'localhost',
      port: 5000,
      path: '/api/contact',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      name: 'Test Visitor',
      email: 'visitor@example.com',
      subject: 'Interview inquiry for Full Stack Engineer',
      message: 'Hello Gagan, I came across your portfolio and would love to connect about an opportunity.'
    });
    console.log('Submit test result:', submitTest);

  } catch (err) {
    console.error('Test error:', err);
  } finally {
    console.log('Stopping server...');
    server.kill();
    process.exit(0);
  }
}

run();

