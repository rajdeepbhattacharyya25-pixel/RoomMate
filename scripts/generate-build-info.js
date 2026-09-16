#!/usr/bin/env node

import fs from 'fs';
import path from 'path';

// 1. Parse CLI flags
const args = process.argv.slice(2);
function getArg(flag, defaultValue = '') {
  const idx = args.indexOf(flag);
  if (idx !== -1 && args[idx + 1]) {
    return args[idx + 1];
  }
  return defaultValue;
}

const channel = (getArg('--channel') || process.env.VITE_APP_CHANNEL || 'staging').toLowerCase();

// 2. Read package.json version
const pkgPath = path.resolve('package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
const version = getArg('--version') || process.env.VITE_APP_VERSION || pkg.version || '1.0.1';

// 3. Read versionCode from android/app/build.gradle if available
let buildNumber = 2;
const buildArg = getArg('--build-number') || process.env.VITE_APP_BUILD_NUMBER;
if (buildArg) {
  buildNumber = parseInt(buildArg, 10);
} else {
  const gradlePath = path.resolve('android', 'app', 'build.gradle');
  if (fs.existsSync(gradlePath)) {
    const gradleContent = fs.readFileSync(gradlePath, 'utf-8');
    const match = gradleContent.match(/versionCode\s+(\d+)/);
    if (match && match[1]) {
      buildNumber = parseInt(match[1], 10);
    }
  }
}

// 4. Capture exact current timestamp
const now = new Date();
const buildTimestamp = now.toISOString();

// Format human-friendly IST date and time
const dateFormatter = new Intl.DateTimeFormat('en-IN', {
  timeZone: 'Asia/Kolkata',
  day: '2-digit',
  month: 'short',
  year: 'numeric',
});
const timeFormatter = new Intl.DateTimeFormat('en-IN', {
  timeZone: 'Asia/Kolkata',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
});

const buildDate = dateFormatter.format(now);
const buildTime = `${timeFormatter.format(now)} IST`;

console.log('------------------------------------------------------');
console.log('🛠️  GENERATING DYNAMIC BUILD METADATA');
console.log('------------------------------------------------------');
console.log(`📌 App Name:       RoomMate`);
console.log(`📌 Version:        ${version}`);
console.log(`📌 Build Number:   ${buildNumber}`);
console.log(`📌 Channel:        ${channel.toUpperCase()}`);
console.log(`🕒 Timestamp:      ${buildTimestamp}`);
console.log(`📅 Formatted Date: ${buildDate}`);
console.log(`⏰ Formatted Time: ${buildTime}`);
console.log('------------------------------------------------------\n');

// 5. Generate src/config/buildInfo.ts
const buildInfoTs = `// AUTO-GENERATED AT BUILD TIME BY scripts/generate-build-info.js
// DO NOT EDIT DIRECTLY. This file is regenerated on every build.

export interface BuildMetadata {
  appName: string;
  version: string;
  buildNumber: number;
  channel: 'staging' | 'production';
  buildTimestamp: string;
  buildDate: string;
  buildTime: string;
}

export const BUILD_INFO: BuildMetadata = {
  appName: 'RoomMate',
  version: '${version}',
  buildNumber: ${buildNumber},
  channel: '${channel}' as 'staging' | 'production',
  buildTimestamp: '${buildTimestamp}',
  buildDate: '${buildDate}',
  buildTime: '${buildTime}',
};

export default BUILD_INFO;
`;

const configDir = path.resolve('src', 'config');
fs.mkdirSync(configDir, { recursive: true });
fs.writeFileSync(path.join(configDir, 'buildInfo.ts'), buildInfoTs, 'utf-8');

// 6. Also generate dist/build-meta.json for build consumers (e.g. ota-publish.js)
const metaDir = path.resolve('.agents', 'scratch');
fs.mkdirSync(metaDir, { recursive: true });
fs.writeFileSync(
  path.join(metaDir, 'build-meta.json'),
  JSON.stringify(
    {
      appName: 'RoomMate',
      version,
      buildNumber,
      channel,
      buildTimestamp,
      buildDate,
      buildTime,
    },
    null,
    2
  ),
  'utf-8'
);

console.log('✅ Generated src/config/buildInfo.ts & scratch/build-meta.json');
