const { Client } = require('pg');

const connectionString = 'postgresql://neondb_owner:npg_bq0Yiulr2Owk@ep-summer-bar-apcxauz6.c-7.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require';

async function testConnection(sslConfig, label) {
  console.log(`Testing connection for ${label}...`);
  const client = new Client({
    connectionString,
    ssl: sslConfig,
    connectionTimeoutMillis: 5000,
  });

  try {
    await client.connect();
    console.log(`✅ Success for ${label}!`);
    const res = await client.query('SELECT NOW()');
    console.log(`   Time from DB: ${res.rows[0].now}`);
    await client.end();
  } catch (err) {
    console.error(`❌ Failed for ${label}:`);
    console.error(err);
  }
}

async function run() {
  await testConnection(false, 'ssl: false (development config)');
  console.log('-------------------------------------------');
  await testConnection({ rejectUnauthorized: false }, 'ssl: { rejectUnauthorized: false } (production config)');
}

run();
