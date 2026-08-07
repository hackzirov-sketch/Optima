/**
 * Object storage check — `npm run check:storage`
 *
 * File uploads go straight from the browser to Cloudflare R2 on a presigned
 * URL, so four separate things have to line up and any one of them fails the
 * same way from the user's side ("couldn't upload"). This checks them one at a
 * time and says which one is wrong:
 *
 *   1. the five R2_* variables are present;
 *   2. the credentials actually sign a working PUT (the object is written and
 *      then deleted again);
 *   3. the bucket allows a cross-origin PUT from the app — without this the
 *      browser never even sends the request, however valid the signature;
 *   4. R2_PUBLIC_URL serves what was just written, and matches the host
 *      StorageService.assertOwnedAttachment will insist on later.
 *
 * Reads backend/.env — the file the API itself loads, since ConfigModule's
 * `envFilePath: '.env'` resolves against the working directory the server runs
 * in. A repository-root .env is read only as a fallback: having this script
 * check one file while the server reads another is how "configured correctly"
 * and "storage is not configured" ended up being reported at the same time.
 */
const { readFileSync, existsSync } = require('node:fs');
const { join } = require('node:path');
const { S3Client, PutObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

const ENV_PATHS = [
  join(__dirname, '..', '.env'), // backend/.env — what the server loads
  join(__dirname, '..', '..', '.env'), // repo root, fallback
];
const ORIGIN = process.env.FRONTEND_URL || 'http://localhost:5173';

function loadEnv() {
  const path = ENV_PATHS.find((candidate) => existsSync(candidate));
  if (!path) return { __source: '(no .env found)' };
  const parsed = Object.fromEntries(
    readFileSync(path, 'utf8')
      .split('\n')
      .filter((line) => line.includes('=') && !line.trim().startsWith('#'))
      .map((line) => [
        line.slice(0, line.indexOf('=')).trim(),
        line.slice(line.indexOf('=') + 1).trim(),
      ]),
  );
  return { ...parsed, __source: path };
}

const ok = (message) => console.log(`  ✅ ${message}`);
const bad = (message) => console.log(`  ❌ ${message}`);
const hint = (message) => console.log(`     → ${message}`);

async function main() {
  const env = { ...loadEnv(), ...process.env };
  let failed = false;

  console.log(`\nReading ${env.__source}`);
  console.log('\n1. Variables');
  // Provider-neutral first, falling back to the R2_* spelling — the same
  // resolution order the app itself uses.
  const pick = (...names) => names.map((n) => env[n]).find(Boolean);
  const settings = {
    accessKeyId: pick('S3_ACCESS_KEY_ID', 'R2_ACCESS_KEY_ID'),
    secretAccessKey: pick('S3_SECRET_ACCESS_KEY', 'R2_SECRET_ACCESS_KEY'),
    bucket: pick('S3_BUCKET', 'R2_BUCKET_NAME'),
    publicUrl: pick('S3_PUBLIC_URL', 'R2_PUBLIC_URL'),
    region: pick('S3_REGION', 'AWS_REGION') || (env.R2_ACCOUNT_ID ? 'auto' : undefined),
    endpoint:
      pick('S3_ENDPOINT') ||
      (env.R2_ACCOUNT_ID
        ? `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`
        : undefined),
  };
  for (const [name, current] of Object.entries(settings)) {
    if (name === 'endpoint') continue; // AWS has none, and that is correct
    if (current) ok(`${name}: ${name.includes('secret') || name.includes('access') ? 'set' : current}`);
    else {
      bad(`${name} is missing`);
      failed = true;
    }
  }
  ok(settings.endpoint ? `endpoint: ${settings.endpoint}` : 'endpoint: derived from region (AWS)');
  if (failed) {
    hint('Fill these in .env, then run this again.');
    process.exit(1);
  }

  const s3 = new S3Client({
    region: settings.region,
    ...(settings.endpoint ? { endpoint: settings.endpoint } : {}),
    credentials: {
      accessKeyId: settings.accessKeyId,
      secretAccessKey: settings.secretAccessKey,
    },
  });

  const key = `meeting-files/_check/${Date.now()}.txt`;
  const body = 'r2 check';
  let signedUrl;

  console.log('\n2. Credentials and bucket');
  try {
    signedUrl = await getSignedUrl(
      s3,
      new PutObjectCommand({
        Bucket: settings.bucket,
        Key: key,
        ContentType: 'text/plain',
      }),
      { expiresIn: 300 },
    );
    const put = await fetch(signedUrl, {
      method: 'PUT',
      headers: { 'Content-Type': 'text/plain' },
      body,
    });
    if (put.ok) ok(`presigned PUT accepted (${put.status})`);
    else {
      bad(`presigned PUT refused: ${put.status} ${await put.text()}`);
      hint('Check the token has Object Read & Write on this bucket.');
      failed = true;
    }
  } catch (error) {
    bad(`could not reach R2: ${error.message}`);
    hint('Check S3_REGION matches the bucket, and that the key has s3:PutObject on it.');
    process.exit(1);
  }

  console.log('\n3. Browser CORS');
  try {
    const preflight = await fetch(signedUrl, {
      method: 'OPTIONS',
      headers: {
        Origin: ORIGIN,
        'Access-Control-Request-Method': 'PUT',
        'Access-Control-Request-Headers': 'content-type',
      },
    });
    const allowed = preflight.headers.get('access-control-allow-origin');
    if (allowed === ORIGIN || allowed === '*')
      ok(`bucket allows PUT from ${ORIGIN}`);
    else {
      bad(`no CORS grant for ${ORIGIN} (got ${allowed ?? 'nothing'})`);
      hint('Apply docker/s3-cors.json to the bucket — see .env.example.');
      failed = true;
    }
  } catch (error) {
    bad(`preflight failed: ${error.message}`);
    failed = true;
  }

  console.log('\n4. Public URL');
  const publicUrl = `${settings.publicUrl.replace(/\/$/, '')}/${key}`;
  try {
    const get = await fetch(publicUrl);
    if (get.ok && (await get.text()) === body)
      ok(`${settings.publicUrl} serves uploaded objects`);
    else {
      bad(`${publicUrl} returned ${get.status}`);
      hint('S3_PUBLIC_URL must serve the bucket publicly (bucket policy / CloudFront), and match what the browser will fetch.');
      failed = true;
    }
  } catch (error) {
    bad(`${settings.publicUrl} is unreachable: ${error.message}`);
    hint('A placeholder like https://r2.example.dev will also make every attachment fail validation later.');
    failed = true;
  }

  await s3
    .send(new DeleteObjectCommand({ Bucket: settings.bucket, Key: key }))
    .catch(() => {});

  console.log(
    failed
      ? '\nSomething above needs fixing before uploads will work.\n'
      : '\nObject storage is configured correctly — uploads will work.\n',
  );
  process.exit(failed ? 1 : 0);
}

void main();
