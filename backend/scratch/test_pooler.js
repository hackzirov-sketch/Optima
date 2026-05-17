const { Client } = require('pg');

async function testConnection(port, password, label) {
  console.log(`Testing connection for ${label} on port ${port} with password: ${password}...`);
  const client = new Client({
    user: 'postgres.favwwruvfxelwepxufst',
    host: 'aws-1-ap-southeast-2.pooler.supabase.com',
    database: 'postgres',
    password: password,
    port: port,
    ssl: false,
    connectionTimeoutMillis: 30000,
  })

  try {
    await client.connect();
    console.log(`✅ Success for ${label} with password ${password}!`);
    const res = await client.query('SELECT NOW()');
    console.log(`   Time from DB: ${res.rows[0].now}`);
    await client.end();
    return true;
  } catch (err) {
    console.error(`❌ Failed for ${label}: ${err.message}`);
    return false;
  }
}

async function run() {
  const passwords = [
    '123@iotuma@321',
    '123@321',
    '123@21',
  ];

  for (const pwd of passwords) {
    const success = await testConnection(5432, pwd, 'Session Mode Pooler');
    if (success) {
      console.log(`🎉 Found correct password: ${pwd}`);
      break;
    }
    console.log('-------------------------------------------');
  }
}

run();
