const http = require('http');

async function debugWorkspace() {
  // 1. Create a fake user
  const email = 'testuser_' + Date.now() + '@example.com';
  const registerData = JSON.stringify({
    fullName: 'Test User',
    username: 'testuser_' + Date.now(),
    email,
    password: 'Password123!',
  });

  console.log('Registering user...');
  const resReg = await makeRequest('/api/v1/auth/register', 'POST', registerData);
  console.log('Register response:', resReg.body);
  
  // Need to bypass email verification. Let's do a trick: 
  // We can't easily without db access, wait, the user said they did it.
  // I will just read the db. Oh wait, I don't have db connection here.
  // I will just use a fake token? No, that will give TOKEN_INVALID.
}

function makeRequest(path, method, data, token) {
  return new Promise((resolve, reject) => {
    const headers = { 'Content-Type': 'application/json' };
    if (data) headers['Content-Length'] = data.length;
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

debugWorkspace();
