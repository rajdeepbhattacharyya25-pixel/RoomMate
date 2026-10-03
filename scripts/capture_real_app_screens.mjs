import { chromium } from 'playwright-core';
import fs from 'fs';
import path from 'path';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const OUTPUT_DIR = path.resolve('scratch/OpenMontage/remotion-composer/public/assets/roommate');

if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

// Copy official logo directly to Remotion composer assets as well
const officialLogoPath = path.resolve('public/logo.png');
const targetLogoPath = path.join(OUTPUT_DIR, 'logo.png');
if (fs.existsSync(officialLogoPath)) {
  fs.copyFileSync(officialLogoPath, targetLogoPath);
  console.log('Copied official logo to:', targetLogoPath);
}

// Also copy QR code
const qrPath = path.resolve('public/RoomMate-Scan-To-Download-QR.png');
const targetQrPath = path.join(OUTPUT_DIR, 'qr_code.png');
if (fs.existsSync(qrPath)) {
  fs.copyFileSync(qrPath, targetQrPath);
  console.log('Copied QR code to:', targetQrPath);
}

const mockResidentUser = {
  id: 'usr-rajdeep-lead',
  name: 'Rajdeep',
  email: 'rajdeep.roommate@gmail.com',
  phone: '+91 98765 43210',
  role: 'STUDENT',
  isSuspended: false,
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
};

const mockFlatmate1 = {
  id: 'usr-sneha-patel',
  name: 'Sneha Patel',
  email: 'sneha.patel@gmail.com',
  phone: '+91 98765 43211',
  role: 'STUDENT',
  isSuspended: false,
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
};

const mockFlatmate2 = {
  id: 'usr-amit-sharma',
  name: 'Amit Sharma',
  email: 'amit.sharma@gmail.com',
  phone: '+91 98765 43212',
  role: 'STUDENT',
  isSuspended: false,
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
};

const mockRoom = {
  id: 'room-flat-402',
  name: 'Flat 402 - Tech Hub',
  description: 'Shared 3BHK Apartment Expenses & Bills',
  adminId: 'usr-rajdeep-lead',
  joinPolicy: 'OPEN',
  invitePolicy: 'ALL_MEMBERS',
  inviteCode: 'FLAT402',
  qrCodeUrl: 'https://roommate.app/join/FLAT402',
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
};

const mockRoomMembers = [
  { id: 'mem-1', roomId: 'room-flat-402', userId: 'usr-rajdeep-lead', role: 'ADMIN', status: 'ACTIVE', joinedAt: '2026-09-01T00:00:00.000Z' },
  { id: 'mem-2', roomId: 'room-flat-402', userId: 'usr-sneha-patel', role: 'MEMBER', status: 'ACTIVE', joinedAt: '2026-09-01T00:00:00.000Z' },
  { id: 'mem-3', roomId: 'room-flat-402', userId: 'usr-amit-sharma', role: 'MEMBER', status: 'ACTIVE', joinedAt: '2026-09-01T00:00:00.000Z' },
];

const mockSharedExpenses = [
  {
    id: 'exp-groceries',
    roomId: 'room-flat-402',
    paidBy: 'usr-rajdeep-lead',
    title: 'Groceries, Vegetables & Milk',
    totalAmount: 1850,
    category: 'GROCERIES',
    splitMethod: 'EQUAL',
    participantUserIds: ['usr-rajdeep-lead', 'usr-sneha-patel', 'usr-amit-sharma'],
    expenseDate: '2026-10-01',
    createdAt: '2026-10-01T10:00:00.000Z',
    updatedAt: '2026-10-01T10:00:00.000Z',
  },
  {
    id: 'exp-wifi',
    roomId: 'room-flat-402',
    paidBy: 'usr-sneha-patel',
    title: 'Airtel Fiber 300Mbps Unlimited',
    totalAmount: 999,
    category: 'UTILITIES',
    splitMethod: 'EQUAL',
    participantUserIds: ['usr-rajdeep-lead', 'usr-sneha-patel', 'usr-amit-sharma'],
    expenseDate: '2026-09-28',
    createdAt: '2026-09-28T14:30:00.000Z',
    updatedAt: '2026-09-28T14:30:00.000Z',
  },
  {
    id: 'exp-electricity',
    roomId: 'room-flat-402',
    paidBy: 'usr-rajdeep-lead',
    title: 'Electricity & AC Meter Bill',
    totalAmount: 2400,
    category: 'RENT',
    splitMethod: 'EQUAL',
    participantUserIds: ['usr-rajdeep-lead', 'usr-sneha-patel', 'usr-amit-sharma'],
    expenseDate: '2026-09-25',
    createdAt: '2026-09-25T11:00:00.000Z',
    updatedAt: '2026-09-25T11:00:00.000Z',
  },
];

const mockSplits = [
  { id: 'sp-1', expenseId: 'exp-groceries', userId: 'usr-rajdeep-lead', amount: 616.66, percentage: 33.33 },
  { id: 'sp-2', expenseId: 'exp-groceries', userId: 'usr-sneha-patel', amount: 616.67, percentage: 33.33 },
  { id: 'sp-3', expenseId: 'exp-groceries', userId: 'usr-amit-sharma', amount: 616.67, percentage: 33.34 },
  { id: 'sp-4', expenseId: 'exp-wifi', userId: 'usr-rajdeep-lead', amount: 333.00, percentage: 33.33 },
  { id: 'sp-5', expenseId: 'exp-wifi', userId: 'usr-sneha-patel', amount: 333.00, percentage: 33.33 },
  { id: 'sp-6', expenseId: 'exp-wifi', userId: 'usr-amit-sharma', amount: 333.00, percentage: 33.34 },
  { id: 'sp-7', expenseId: 'exp-electricity', userId: 'usr-rajdeep-lead', amount: 800.00, percentage: 33.33 },
  { id: 'sp-8', expenseId: 'exp-electricity', userId: 'usr-sneha-patel', amount: 800.00, percentage: 33.33 },
  { id: 'sp-9', expenseId: 'exp-electricity', userId: 'usr-amit-sharma', amount: 800.00, percentage: 33.34 },
];

const mockSettlements = [
  {
    id: 'set-1',
    roomId: 'room-flat-402',
    payerId: 'usr-amit-sharma',
    payeeId: 'usr-rajdeep-lead',
    amount: 500,
    paymentMethod: 'UPI',
    transactionRef: 'UPI-AXIS-9823419082',
    notes: 'Partial settlement for electricity bill',
    createdAt: '2026-09-29T16:00:00.000Z',
  }
];

const mockPersonalExpenses = [
  {
    id: 'pexp-1',
    userId: 'usr-rajdeep-lead',
    title: 'Semester Textbooks & Prep Material',
    amount: 1250,
    category: 'ACADEMICS',
    notes: 'Data Structures & Algorithms in C++',
    expenseDate: '2026-10-02',
    createdAt: '2026-10-02T09:00:00.000Z',
    updatedAt: '2026-10-02T09:00:00.000Z',
  },
  {
    id: 'pexp-2',
    userId: 'usr-rajdeep-lead',
    title: 'Campus Canteen & Cold Coffee',
    amount: 340,
    category: 'FOOD',
    notes: 'Quick study break with batchmates',
    expenseDate: '2026-10-01',
    createdAt: '2026-10-01T17:15:00.000Z',
    updatedAt: '2026-10-01T17:15:00.000Z',
  },
  {
    id: 'pexp-3',
    userId: 'usr-rajdeep-lead',
    title: 'Metro Pass Monthly Recharge',
    amount: 800,
    category: 'TRANSPORT',
    notes: 'Campus line blue metro card',
    expenseDate: '2026-09-30',
    createdAt: '2026-09-30T08:30:00.000Z',
    updatedAt: '2026-09-30T08:30:00.000Z',
  },
];

const completeDatabaseState = {
  users: [mockResidentUser, mockFlatmate1, mockFlatmate2],
  subscriptions: [],
  subscriptionEvents: [],
  rooms: [mockRoom],
  roomMembers: mockRoomMembers,
  roomInvitations: [],
  roomJoinRequests: [],
  personalExpenses: mockPersonalExpenses,
  sharedExpenses: mockSharedExpenses,
  expenseSplits: mockSplits,
  settlementPayments: mockSettlements,
  auditLogs: [],
  notifications: [],
  bugReports: [],
  featureSuggestions: [],
  contactRequests: [],
  announcements: [],
  settings: {
    appName: 'RoomMate',
    supportEmail: 'admin@roommate.app',
    supportPhone: '+91 98765 43210',
    googleAuthEnabled: true,
    emailVerificationRequired: false,
    sessionTimeoutMinutes: 1440,
    maxRoomMembers: 12,
    defaultJoinPolicy: 'APPROVAL_REQUIRED',
    defaultInvitePolicy: 'ALL_MEMBERS',
    qrExpirationHours: 72,
    maxExpenseAmount: 200000,
    defaultSplitMethod: 'EQUAL',
    currencyCode: 'INR',
    globalNotificationsEnabled: true,
    maintenanceMode: false,
    maintenanceMessage: '',
  },
  systemIncidents: [],
};

import crypto from 'crypto';

// Generate 100% cryptographically valid resident token matching jwtService.ts
function generateRealResidentToken(user) {
  const origin = 'http://localhost:5173';
  const secret = `roommate_resident_auth_${origin}`;
  
  const header = {
    alg: 'HS256',
    typ: 'JWT',
  };
  
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    sub: user.id,
    email: user.email,
    name: user.name,
    role: 'RESIDENT',
    roomId: 'room-flat-402',
    biometricVerified: true,
    iat: now,
    exp: now + 30 * 24 * 60 * 60,
    iss: 'roommate-vault-auth',
    jti: 'jti_' + Math.random().toString(36).substring(2, 12) + '_' + Date.now(),
  };

  const encodedHeader = Buffer.from(JSON.stringify(header)).toString('base64url');
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const data = `${encodedHeader}.${encodedPayload}`;
  
  const signature = crypto.createHmac('sha256', secret).update(data).digest('base64url');
  return `${data}.${signature}`;
}

async function capture() {
  console.log('Launching Chrome from:', CHROME_PATH);
  const browser = await chromium.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const context = await browser.newContext({
    viewport: { width: 430, height: 932 },
    deviceScaleFactor: 2.5,
    isMobile: true,
    hasTouch: true
  });

  const page = await context.newPage();

  // 1. First visit to set localStorage
  console.log('Navigating to origin to seed database state...');
  await page.goto('http://localhost:5173', { waitUntil: 'domcontentloaded' });

  const residentToken = generateRealResidentToken(mockResidentUser);
  console.log('Generated token for', mockResidentUser.name);

  // Evaluate localStorage initialization
  await page.evaluate(({ dbState, user, token }) => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem('roommate_saas_db_v1', JSON.stringify(dbState));
    localStorage.setItem('roommate_jwt_resident_token', token);
    localStorage.setItem('roommate_app_lock_enabled', 'false');
    localStorage.setItem('campusflow_app_lock_enabled', 'false');
    localStorage.setItem('roommate_vault_pin', '1234');
    localStorage.setItem(`roommate_vault_pin_${user.id}`, '1234');
    localStorage.setItem('roommate_theme', 'dark'); // sleek dark mode aesthetic
  }, { dbState: completeDatabaseState, user: mockResidentUser, token: residentToken });

  // Reload to let MobileLogin or App pick up state
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  // Capture Login Screen (Real UI with official logo, dark theme or light)
  const loginPath = path.join(OUTPUT_DIR, 'real_screen_login.png');
  await page.screenshot({ path: loginPath });
  console.log('Captured Login:', loginPath);

  // Now perform actual sign-in via the UI
  console.log('Filling PIN and signing in...');
  try {
    // Fill PIN input
    const pinInputs = await page.$$('input[type="password"], input[type="tel"], input[maxlength="1"], input[inputmode="numeric"]');
    if (pinInputs.length >= 4) {
      // 4 digit pin boxes
      await pinInputs[0].fill('1');
      await pinInputs[1].fill('2');
      await pinInputs[2].fill('3');
      await pinInputs[3].fill('4');
    } else {
      const singlePin = await page.$('input[placeholder*="PIN"], input[placeholder*="Passcode"]');
      if (singlePin) {
        await singlePin.fill('1234');
      }
    }

    const signInBtn = await page.$('button:has-text("Sign In to RoomMate")') || await page.$('button[type="submit"]');
    if (signInBtn) {
      await signInBtn.click();
      await page.waitForTimeout(2500);
    }
  } catch (e) {
    console.log('Sign in interaction note:', e.message);
  }

  // Check if we are logged in or on dashboard
  const currentText = await page.evaluate(() => document.body.innerText);
  console.log('Current page snippet:', currentText.slice(0, 200).replace(/\n/g, ' '));

  // If still on login, let's inject a valid signed token directly using the app's secret
  if (currentText.includes('Resident Sign In')) {
    console.log('Injecting session token directly to bypass login form...');
    await page.evaluate(({ user }) => {
      // Create a valid resident token by invoking window or crafting token
      const enc = new TextEncoder();
      // Use origin-based key that jwtService derives
      const origin = window.location.origin;
      const secret = `roommate_resident_auth_${origin}`;

      function sha256Bytes(input) {
        // Simple synchronous SHA-256 for capture script
        // Or store user in session
      }
    }, { user: mockResidentUser });
  }

  // 1. Capture Dashboard view (Home tab)
  const homeTab = await page.$('button[aria-label="Dashboard"]') || await page.$('button[aria-label="Home"]') || await page.$('button:has-text("Home")');
  if (homeTab) {
    await homeTab.click();
    await page.waitForTimeout(1000);
  }
  const dashPath = path.join(OUTPUT_DIR, 'real_screen_dashboard.png');
  await page.screenshot({ path: dashPath });
  console.log('Captured Dashboard:', dashPath);

  // 2. Tab: Personal Vault
  const vaultTab = await page.$('button[aria-label="Personal Vault"]') || await page.$('button:has-text("Vault")');
  if (vaultTab) {
    console.log('Clicking Vault tab...');
    await vaultTab.click();
    await page.waitForTimeout(1200);
    const vaultPath = path.join(OUTPUT_DIR, 'real_screen_vault.png');
    await page.screenshot({ path: vaultPath });
    console.log('Captured Vault:', vaultPath);
  }

  // 3. Tab: Rooms / Shared Ledger
  const roomsTab = await page.$('button[aria-label="Rooms"]') || await page.$('button:has-text("Rooms")') || await page.$('button:has-text("Ledger")');
  if (roomsTab) {
    console.log('Clicking Rooms tab...');
    await roomsTab.click();
    await page.waitForTimeout(1500);
    const ledgerPath = path.join(OUTPUT_DIR, 'real_screen_ledger.png');
    await page.screenshot({ path: ledgerPath });
    console.log('Captured Ledger:', ledgerPath);
  }

  // 4. Click Settle via UPI button inside the Ledger
  console.log('Clicking Settle via UPI button...');
  const settleViaUpiBtn = await page.$('button:has-text("Settle via UPI")');
  if (settleViaUpiBtn) {
    await settleViaUpiBtn.click();
    await page.waitForTimeout(1000);

    // Try clicking "Show UPI QR Code" to display the QR code
    const showQrBtn = await page.$('button:has-text("Show UPI QR Code")');
    if (showQrBtn) {
      console.log('Expanding UPI QR Code...');
      await showQrBtn.click();
      await page.waitForTimeout(800);
    }

    const upiPath = path.join(OUTPUT_DIR, 'real_screen_upi.png');
    await page.screenshot({ path: upiPath });
    console.log('Captured Real UPI Modal:', upiPath);
  } else {
    console.log('Could not find Settle via UPI button, checking alternatives...');
  }

  await browser.close();
  console.log('All real app captures finished!');
}

capture().catch(err => {
  console.error('Capture error:', err);
  process.exit(1);
});
