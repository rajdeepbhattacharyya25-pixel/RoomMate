import https from 'https';

const BASE_URL = 'https://roommate26.vercel.app';

function fetchUrl(urlPath) {
  return new Promise((resolve, reject) => {
    const fullUrl = `${BASE_URL}${urlPath}`;
    const req = https.get(fullUrl, { headers: { 'User-Agent': 'RoomMate-SmokeTest/1.0' } }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: data
        });
      });
    });
    req.on('error', reject);
  });
}

async function runSmokeTests() {
  console.log('====================================================');
  console.log('PHASE 2C.10.1 PRODUCTION SMOKE TESTS');
  console.log(`Target: ${BASE_URL}`);
  console.log('====================================================\n');

  const results = {};

  // 1. Homepage & App Shell
  console.log('1. Checking Homepage (/) ...');
  const home = await fetchUrl('/');
  console.log(`   Status: HTTP ${home.statusCode}`);
  const hasAppRoot = home.body.includes('<div id="root">') || home.body.includes('<script type="module"');
  console.log(`   App root / scripts present: ${hasAppRoot ? 'YES' : 'NO'}`);
  results.homepage = { status: home.statusCode, hasAppRoot };

  // 2. Health Endpoint
  console.log('\n2. Checking /api/health ...');
  const health = await fetchUrl('/api/health');
  console.log(`   Status: HTTP ${health.statusCode}`);
  console.log(`   Body: ${health.body.trim()}`);
  results.health = { status: health.statusCode, body: health.body.trim() };

  // 3. Security Headers
  console.log('\n3. Inspecting Security Headers on Homepage ...');
  const headers = home.headers;
  const csp = headers['content-security-policy'] || 'NOT FOUND';
  const hsts = headers['strict-transport-security'] || 'NOT FOUND';
  const xcto = headers['x-content-type-options'] || 'NOT FOUND';
  const xfo = headers['x-frame-options'] || 'NOT FOUND';
  const referrer = headers['referrer-policy'] || 'NOT FOUND';

  console.log(`   Content-Security-Policy: ${csp.substring(0, 80)}...`);
  console.log(`   Strict-Transport-Security: ${hsts}`);
  console.log(`   X-Content-Type-Options: ${xcto}`);
  console.log(`   X-Frame-Options: ${xfo}`);
  console.log(`   Referrer-Policy: ${referrer}`);
  results.securityHeaders = { csp: csp !== 'NOT FOUND', hsts, xcto, xfo, referrer };

  // 4. Android App Links (assetlinks.json)
  console.log('\n4. Checking /.well-known/assetlinks.json ...');
  const assetlinks = await fetchUrl('/.well-known/assetlinks.json');
  console.log(`   Status: HTTP ${assetlinks.statusCode}`);
  let assetlinksValid = false;
  try {
    const json = JSON.parse(assetlinks.body);
    assetlinksValid = Array.isArray(json) && json.length > 0 && json[0].target?.package_name === 'io.campusflow.app';
    console.log(`   Package name: ${json[0]?.target?.package_name}`);
    console.log(`   Valid JSON schema: ${assetlinksValid ? 'YES' : 'NO'}`);
  } catch (e) {
    console.log(`   Failed to parse JSON: ${e.message}`);
  }
  results.assetlinks = { status: assetlinks.statusCode, valid: assetlinksValid };

  // 5. Auth / Routing entry points
  console.log('\n5. Checking SPA Routes (Auth & Features) ...');
  const routes = ['/login', '/register', '/expenses', '/rooms', '/notifications'];
  results.spaRoutes = {};
  for (const r of routes) {
    const res = await fetchUrl(r);
    const ok = res.statusCode === 200 && res.body.includes('<div id="root">');
    console.log(`   Route ${r}: HTTP ${res.statusCode} (App shell rendered: ${ok})`);
    results.spaRoutes[r] = { status: res.statusCode, ok };
  }

  console.log('\n====================================================');
  const allPassed = results.homepage.status === 200 &&
                    results.health.status === 200 &&
                    results.securityHeaders.csp &&
                    results.assetlinks.valid;
  console.log(`SMOKE TEST RESULT: ${allPassed ? 'PASS' : 'FAIL'}`);
  console.log('====================================================');
}

runSmokeTests().catch(err => {
  console.error('Smoke tests error:', err);
  process.exit(1);
});
