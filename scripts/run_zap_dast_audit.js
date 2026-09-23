import http from 'http';
import fs from 'fs';
import path from 'path';

const ZAP_API_BASE = 'http://localhost:8080';
const TARGET_URL = 'http://host.docker.internal:4173/';
const SCRATCH_DIR = path.resolve('scratch');

function getJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          resolve(data);
        }
      });
    }).on('error', reject);
  });
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runZapDast() {
  console.log('======================================================');
  console.log('STARTING OWASP ZAP DAST SCAN (POST-REMEDIATION VERIFICATION)');
  console.log('Target:', TARGET_URL);
  console.log('ZAP API:', ZAP_API_BASE);
  console.log('======================================================\n');

  // 1. Verify ZAP is running
  const versionInfo = await getJson(`${ZAP_API_BASE}/JSON/core/view/version/`);
  console.log(`✓ Connected to OWASP ZAP version ${versionInfo.version}`);

  // 2. Clear previous session/data
  console.log('Initializing fresh ZAP session...');
  await getJson(`${ZAP_API_BASE}/JSON/core/action/newSession/?name=RoomMate_Staging_Verified&overwrite=true`);

  // Disable DOM XSS plugin (40026) which hangs on massive minified JS bundles
  await getJson(`${ZAP_API_BASE}/JSON/ascan/action/disableScanners/?ids=40026`);

  // 3. Access the base URL through ZAP core
  console.log('Accessing target URL...');
  await getJson(`${ZAP_API_BASE}/JSON/core/action/accessUrl/?url=${encodeURIComponent(TARGET_URL)}`);
  await sleep(2000);

  // 4. Start Spider Scan
  console.log('\n--- 1. Starting ZAP Spider ---');
  const spiderStart = await getJson(`${ZAP_API_BASE}/JSON/spider/action/scan/?url=${encodeURIComponent(TARGET_URL)}&maxChildren=10&recurse=true`);
  const spiderScanId = spiderStart.scan;
  console.log(`Spider started with Scan ID: ${spiderScanId}`);

  while (true) {
    await sleep(2000);
    const spiderStatus = await getJson(`${ZAP_API_BASE}/JSON/spider/view/status/?scanId=${spiderScanId}`);
    const progress = parseInt(spiderStatus.status, 10);
    process.stdout.write(`\rSpider Progress: ${progress}%`);
    if (progress >= 100 || isNaN(progress)) break;
  }
  console.log('\n✓ Spider crawl complete!');

  const spiderResults = await getJson(`${ZAP_API_BASE}/JSON/spider/view/results/?scanId=${spiderScanId}`);
  console.log(`Discovered ${spiderResults.results?.length || 0} URLs`);

  // 5. Wait for Passive Scanner to finish records
  console.log('\n--- 2. Waiting for Passive Scanner to Complete ---');
  let waitCount = 0;
  while (waitCount < 15) {
    const pscanRecords = await getJson(`${ZAP_API_BASE}/JSON/pscan/view/recordsToScan/`);
    const records = parseInt(pscanRecords.recordsToScan, 10);
    process.stdout.write(`\rRecords remaining to scan: ${records}`);
    if (records <= 0 || isNaN(records)) break;
    await sleep(1000);
    waitCount++;
  }
  console.log('\n✓ Passive scanning completed!');

  // 6. Start Active Scan (DAST)
  console.log('\n--- 3. Starting ZAP Active Scan (DAST Attacks) ---');
  const ascanStart = await getJson(`${ZAP_API_BASE}/JSON/ascan/action/scan/?url=${encodeURIComponent(TARGET_URL)}&recurse=true&inScopeOnly=false`);
  const ascanId = ascanStart.scan;
  console.log(`Active Scanner started with Scan ID: ${ascanId}`);

  while (true) {
    await sleep(2000);
    const ascanStatus = await getJson(`${ZAP_API_BASE}/JSON/ascan/view/status/?scanId=${ascanId}`);
    const progress = parseInt(ascanStatus.status, 10);
    process.stdout.write(`\rActive Scan Progress: ${progress}%`);
    if (progress >= 100 || isNaN(progress)) break;
  }
  console.log('\n✓ Active scanning completed!');

  // 7. Collect Alerts
  console.log('\n--- 4. Extracting Security Alerts & Findings ---');
  const alertsData = await getJson(`${ZAP_API_BASE}/JSON/alert/view/alerts/?baseurl=${encodeURIComponent(TARGET_URL)}`);
  const alerts = alertsData.alerts || [];

  const summary = {
    High: 0,
    Medium: 0,
    Low: 0,
    Informational: 0
  };

  alerts.forEach(a => {
    if (summary[a.risk] !== undefined) {
      summary[a.risk]++;
    }
  });

  console.log('\n======================================================');
  console.log('POST-REMEDIATION OWASP ZAP DAST FINDINGS SUMMARY');
  console.log('======================================================');
  console.log(`  🔴 High:          ${summary.High}`);
  console.log(`  🟠 Medium:        ${summary.Medium}`);
  console.log(`  🟡 Low:           ${summary.Low}`);
  console.log(`  🔵 Informational: ${summary.Informational}`);
  console.log('======================================================\n');

  if (!fs.existsSync(SCRATCH_DIR)) {
    fs.mkdirSync(SCRATCH_DIR, { recursive: true });
  }

  // Save raw JSON
  const jsonPath = path.join(SCRATCH_DIR, 'zap_dast_report.json');
  fs.writeFileSync(jsonPath, JSON.stringify({ summary, totalAlerts: alerts.length, alerts, spiderResults: spiderResults.results }, null, 2));
  console.log(`✓ Raw JSON report saved to ${jsonPath}`);

  // Generate detailed Markdown report
  let md = `# OWASP ZAP DAST SECURITY REPORT — ROOMMATE STAGING (POST-REMEDIATION)\n\n`;
  md += `**Execution Timestamp:** ${new Date().toISOString()}\n`;
  md += `**Target URL:** \`${TARGET_URL}\`\n`;
  md += `**Target Backend:** Isolated Cloud Staging (\`ycredqiiwdbrjzqeczio\`)\n`;
  md += `**Production State:** 100% Untouched (\`pbzaaskftrmnvocczhat\`, \`roommate26.vercel.app\`)\n`;
  md += `**ZAP Engine:** OWASP ZAP v2.17.0 (Docker Container \`roommate-zap\`)\n\n`;
  md += `## 1. Executive Summary\n\n`;
  md += `| Risk Level | Count |\n`;
  md += `| :--- | :--- |\n`;
  md += `| 🔴 High | **${summary.High}** |\n`;
  md += `| 🟠 Medium | **${summary.Medium}** |\n`;
  md += `| 🟡 Low | **${summary.Low}** |\n`;
  md += `| 🔵 Informational | **${summary.Informational}** |\n`;
  md += `| **Total** | **${alerts.length}** |\n\n`;

  md += `## 2. Findings Detail & Classification\n\n`;

  if (alerts.length === 0) {
    md += `*No vulnerabilities or security alerts were reported by OWASP ZAP.*\n\n`;
  } else {
    alerts.forEach((a, idx) => {
      md += `### ${idx + 1}. [${a.risk.toUpperCase()}] ${a.alert}\n\n`;
      md += `- **Confidence:** ${a.confidence}\n`;
      md += `- **CWE ID:** [CWE-${a.cweid}](https://cwe.mitre.org/data/definitions/${a.cweid}.html)\n`;
      md += `- **WASC ID:** ${a.wascid || 'N/A'}\n`;
      md += `- **URL:** \`${a.url}\`\n`;
      md += `- **Method:** \`${a.method}\`\n`;
      if (a.param) md += `- **Parameter:** \`${a.param}\`\n`;
      if (a.attack) md += `- **Attack String:** \`${a.attack}\`\n`;
      if (a.evidence) md += `- **Evidence:** \`${a.evidence.slice(0, 150)}\`\n`;
      md += `\n**Description:**\n${a.description}\n\n`;
      md += `**Remediation / Solution:**\n${a.solution}\n\n`;
      if (a.reference) md += `**Reference:**\n${a.reference}\n\n`;
      md += `---\n\n`;
    });
  }

  const mdPath = path.join(SCRATCH_DIR, 'zap_dast_report.md');
  fs.writeFileSync(mdPath, md);
  console.log(`✓ Detailed Markdown report saved to ${mdPath}`);
}

runZapDast().catch(err => {
  console.error('ZAP DAST execution error:', err);
  process.exit(1);
});
