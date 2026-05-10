const http = require('http');

const data = JSON.stringify({
  name: "My Workspace",
  slug: "my-workspace"
});

const options = {
  hostname: 'localhost',
  port: 5001,
  path: '/api/v1/workspaces',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': data.length
    // Assuming no token is passed, it should throw TOKEN_INVALID.
    // If I want to pass a token, I need to create a user, verify, login, then use token.
  }
};

const req = http.request(options, res => {
  let body = '';
  res.on('data', d => { body += d; });
  res.on('end', () => { console.log('Status:', res.statusCode); console.log('Body:', body); });
});

req.on('error', error => {
  console.error(error);
});

req.write(data);
req.end();
