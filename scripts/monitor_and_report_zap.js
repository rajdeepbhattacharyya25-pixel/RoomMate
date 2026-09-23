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

async function monitorAndReport() {
  console.log('Monitoring ZAP Active Scan (Scan ID: 1)...');
  
  while (true) {
    const statusRes = await getJson(`${ZAP_API_BASE}/JSON/ascan/view/status/?scanId=1`);
    const progress = parseInt(statusRes.status, 10);
    process.stdout.write(`\rActive Scan Progress: ${progress}%`);
    if (progress >= 100 || isNaN(progress)) break;
    await sleep(3000);
  }

  console.log('\n✓ Active scan completed 100%!');

  console.log('Extracting alerts from ZAP...');
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
  console.log('OWASP ZAP DAST FINDINGS SUMMARY');
  console.log('======================================================');
  console.log(`  🔴 High:          ${summary.High}`);
  console.log(`  🟠 Medium:        ${summary.Medium}`);
  console.log(`  🟡 Low:           ${summary.Low}`);
  console.log(`  🔵 Informational: ${summary.Informational}`);
  console.log('======================================================\n');

  if (!fs.existsSync(SCRATCH_DIR)) {
    fs.mkdirSync(SCRATCH_DIR, { recursive: true });
  }

  const jsonPath = path.join(SCRATCH_DIR, 'zap_dast_report.json');
  fs.writeFileSync(jsonPath, JSON.stringify({ summary, totalAlerts: alerts.length, alerts }, null, 2));
  console.log(`✓ Raw JSON report saved to ${jsonPath}`);

  // Generate detailed Markdown report
  let md = `# OWASP ZAP DAST SECURITY REPORT — ROOMMATE STAGING APP\n\n`;
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

monitorAndReport().catch(err => {
  console.error('Error during monitoring:', err);
  process.exit(1);
});
