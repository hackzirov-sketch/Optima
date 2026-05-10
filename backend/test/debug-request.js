const axios = require('axios');

async function debug() {
  try {
    const res = await axios.post('http://localhost:5001/api/v1/auth/register', {
      fullName: 'Debug User',
      username: 'debug_user_' + Date.now(),
      email: 'debug_' + Date.now() + '@test.com',
      password: 'Password123!'
    });
    console.log('✅ Success:', res.status, res.data);
  } catch (error) {
    if (error.response) {
      console.log('❌ Error Status:', error.response.status);
      console.log('❌ Error Data:', JSON.stringify(error.response.data, null, 2));
    } else {
      console.log('❌ Error Message:', error.message);
    }
  }
}

debug();
