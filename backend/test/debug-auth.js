const http = require('http');

function makeRequest(path, method, data, token) {
  return new Promise((resolve, reject) => {
    const headers = { 'Content-Type': 'application/json' };
    if (data) headers['Content-Length'] = Buffer.byteLength(data);
    if (token) headers['Authorization'] = 'Bearer ' + token;

    const req = http.request({ hostname: 'localhost', port: 5001, path, method, headers }, res => {
      let body = '';
      res.on('data', d => body += d);
      res.on('end', () => resolve({ status: res.statusCode, body }));
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

async function test() {
  console.log('1. Trying to login...');
  const loginData = JSON.stringify({
    email: 'elbek4561@gmail.com', // Change this to your existing verified user email
    password: 'Elbek@20091', // Change this to your user's password
  });

  const loginRes = await makeRequest('/api/v1/auth/login', 'POST', loginData);
  const loginParsed = JSON.parse(loginRes.body);

  if (loginRes.status !== 200) {
    console.log('Login failed!', loginParsed);
    console.log('Please change the email/password in test/debug.js to a valid VERIFIED user.');
    return;
  }

  console.log('Login successful! Token:', loginParsed.accessToken.substring(0, 20) + '...');

  console.log('\n2. Trying to create workspace...');
  const wsData = JSON.stringify({
    name: 'Test Workspace ' + Date.now(),
    slug: 'test-ws-' + Date.now()
  });

  const wsRes = await makeRequest('/api/v1/workspaces', 'POST', wsData, loginParsed.accessToken);
  console.log('Workspace creation status:', wsRes.status);
  console.log('Workspace creation response:', wsRes.body);
  
  if (wsRes.status === 201) {
    console.log('SUCCESS! Workspace created.');
  }
}

test();
