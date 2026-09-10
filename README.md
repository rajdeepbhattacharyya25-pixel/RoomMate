# RoomMate 🏠💳

> **Student-First Expense & Shared Room Ledger SaaS Platform**  
> Built for PGs, hostels, shared flats, and college roommates. Seamlessly separating private individual finances from transparent household group ledgers.

[![React 19](https://img.shields.io/badge/React-19.2-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-6.x-646CFF?logo=vite&logoColor=white)](https://vitejs.dev/)
[![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL%20RLS-3ECF8E?logo=supabase&logoColor=white)](https://supabase.com/)
[![Capacitor](https://img.shields.io/badge/Capacitor-Android%20Native-119EFF?logo=capacitor&logoColor=white)](https://capacitorjs.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

---

## 🌟 Overview & Problem Statement

College students and young professionals sharing rented rooms, hostels, or PGs struggle with:
1. **Financial Privacy Leaks**: General expense apps force all spending into the open or lack group settlement tools. RoomMate cleanly separates your **Personal Vault** (private daily expenses, tuition, clothing, personal snacks) from the **Room Ledger** (Wi-Fi, rent, LPG cylinders, groceries).
2. **Fractional Penny Split Mismatches**: Dividing odd amounts (e.g., ₹100 among 3 roommates) frequently loses paise or creates cumulative rounding discrepancies. RoomMate implements an exact remainder penny allocation engine.
3. **Circular Debt Clutter**: Person A owes B, B owes C, and C owes A. RoomMate automatically runs pairwise mutual debt offsetting to minimize transactional friction.
4. **Late Joiner Unfairness**: A roommate moving in halfway through the semester should not inherit past electricity bills. RoomMate features point-in-time membership isolation.
5. **Settlement Disputes & Verification**: RoomMate provides native UPI deep-link intent generation, QR codes, and a receipt upload & approval workflow.

---

## 🚀 Key Features

### 1. 🔒 Personal Vault (Zero-Knowledge Privacy)
- Track personal discretionary spending categorized by Food, Academic, Transit, Shopping, and Personal Care.
- Complete privacy guarantee: roommates cannot see your Personal Vault items or private budgets.
- Monthly breakdown, spending trends, and export options.

### 2. 👥 Shared Room Ledger (Mathematical Accuracy)
- **Penny-Exact Equal Splits**: Remainder cents/paise are sequentially assigned to preserve exact totals (`∑ shares == totalAmount`).
- **Custom Splits**: Split by exact amounts, percentages, or custom shares.
- **Two-Way Pairwise Offsetting**: Mutual obligations between roommates automatically collapse into a single net balance.
- **Point-in-Time Isolation**: Historical expenses are strictly isolated to active members at the moment the expense was logged.

### 3. 💸 UPI Payment Intent & Proof Verification
- Generate 1-tap UPI deep-links (`upi://pay?pa=...&pn=...&am=...&cu=INR`) opening GPay, PhonePe, or Paytm directly with the exact settled amount.
- Dynamic UPI QR code generation for desktop-to-mobile scanning.
- Settlement proof upload with status lifecycle: `PENDING_VERIFICATION` → `VERIFIED` / `REJECTED`.

### 4. ⚡ Offline-First Architecture & Supabase Cloud Sync
- Operates 100% offline using reactive local storage caching.
- Hybrid synchronization engine with live Supabase PostgreSQL backend, Row Level Security (RLS), and Realtime subscription broadcasts.

### 5. 🛡️ SuperAdmin Portal & Telemetry
- Global platform oversight: active rooms, total users, system-wide transaction volume, and dispute resolution.
- Live PostgreSQL RLS security audit suite with automated testing.

### 6. 📱 Android Native App (Capacitor)
- Native biometrics (Fingerprint / Face ID unlock).
- Native haptic feedback and safe area edge-to-edge layouts.
- Dynamic splash screen and status bar styling.

---

## 🛠️ Technology Stack

| Layer | Technologies |
|-------|--------------|
| **Frontend Core** | React 19, TypeScript, Vite |
| **Styling & UI** | Vanilla CSS Tokens, Lucide Icons, Canvas Confetti |
| **Backend & Database** | Supabase PostgreSQL 15, Row Level Security (RLS), Realtime Channels |
| **Mobile Runtime** | Capacitor 8 (Android SDK, Biometrics, Haptics, Network) |
| **Quality & Linter** | Oxlint, TypeScript strict mode |
| **Hosting & CI/CD** | Vercel SPA deployment (`vercel.json`) |

---

## 📁 Repository Structure

```
├── android/                    # Capacitor Android native project & Gradle files
├── docs/                       # Architectural plans & feature design specifications
├── public/                     # Static web assets, SVGs, and webmanifest
├── src/
│   ├── assets/                 # Brand imagery and media
│   ├── components/             # React application views & modules
│   │   ├── desktop/            # Desktop-optimized responsive views
│   │   ├── mobile/             # Mobile-native responsive views (Bottom navigation, drawers)
│   │   ├── Navbar.tsx          # Navigation header & room switcher
│   │   ├── PersonalVault.tsx   # Private personal expense tracker
│   │   ├── RoomLedger.tsx      # Shared room expenses & settlements
│   │   ├── UnifiedDashboard.tsx# Combined financial overview
│   │   ├── SuperAdminPortal.tsx# Platform administrator oversight & RLS audits
│   │   └── SecurityTestModal.tsx# Automated ledger engine test suite modal
│   ├── lib/
│   │   ├── auth/               # User authentication & session management
│   │   ├── ledger/             # Core financial math & split calculation engines
│   │   │   ├── engine.ts       # Mathematical split algorithms & pairwise offsetting
│   │   │   └── engine.test.ts  # Automated test assertions
│   │   ├── native/             # Biometrics & native mobile bridges
│   │   ├── payments/           # UPI intent deep-link & QR code generators
│   │   ├── platform/           # Responsive device & screen detection
│   │   ├── storage/            # LocalStorage fallback & reactive database
│   │   └── supabase/           # Supabase client & real-time sync connector
│   ├── types/                  # Shared TypeScript interfaces & Supabase DB types
│   ├── App.tsx                 # Root application controller
│   └── main.tsx                # Application bootstrap entry point
├── supabase/
│   └── migrations/             # SQL schema migrations, functions, & RLS policies
├── capacitor.config.ts         # Capacitor native container configuration
├── package.json                # Project dependencies & scripts
├── tsconfig.json               # TypeScript configuration
└── vite.config.ts              # Vite bundler configuration
```

---

## 🚦 Getting Started

### Prerequisites
- **Node.js**: v18.0 or higher
- **npm** or **pnpm**
- **Git**

### Installation

1. **Clone the repository**:
   ```bash
   git clone https://github.com/rajdeepbhattacharyya25-pixel/RoomMate.git
   cd RoomMate
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Configure Environment Variables**:
   Copy the example environment file:
   ```bash
   cp .env.example .env
   ```
   Add your Supabase project credentials (or keep defaults to run in offline local demo mode):
   ```env
   VITE_SUPABASE_URL=https://your-project.supabase.co
   VITE_SUPABASE_ANON_KEY=your-anon-key
   VITE_USE_LIVE_SUPABASE=true
   ```

4. **Start the development server**:
   ```bash
   npm run dev
   ```
   Open `http://localhost:5173` in your browser.

---

## 🗄️ Database Setup (Supabase)

To link RoomMate to a live Supabase instance:
1. Create a new Supabase project at [database.new](https://database.new).
2. Navigate to the SQL Editor in Supabase Studio.
3. Run the migrations in sequence from `supabase/migrations/`:
   - `20260909_init_student_expense_schema.sql` (Creates core tables: `profiles`, `rooms`, `room_members`, `shared_expenses`, `expense_splits`, `settlement_payments`, `personal_expenses`, `settlement_proofs`).
   - `20260909_room_debt_functions.sql` (Installs pairwise debt recalculation functions).
   - `20260910_superadmin_rls.sql` (Configures Row Level Security and SuperAdmin policies).

---

## 📱 Mobile App (Android Native Build)

RoomMate includes full Capacitor Android integration:

```bash
# Build web production bundle and sync with Android
npm run cap:build

# Open native Android Studio project
npm run cap:android
```

From Android Studio, you can run the app directly on an Android emulator or physical device connected via USB/ADB.

---

## 🧪 Testing & Verification

The core financial math is verified by an automated test suite covering:
- Remainder penny distribution
- Circular 2-way and 3-way mutual debt offsetting
- Partial settlement payments and balance reduction
- Overpayment credit reversal
- Late-joiner point-in-time obligation isolation
- Unified dashboard financial aggregation

To run checks:
```bash
# Type check & bundle verification
npm run build

# Code linting
npm run lint
```
You can also launch the in-app test runner via the **Security Audit** modal inside the UI.

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
