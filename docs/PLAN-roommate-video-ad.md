# Implementation Plan: 30-Second RoomMate App Video Ad (OpenMontage + Remotion)

Comprehensive phase-by-phase blueprint for generating a high-converting, 30-second 9:16 vertical video ad for **RoomMate** (Student-First Expense & Shared Ledger App) using the newly pulled **OpenMontage** engine, Edge-TTS audio narration, and Remotion motion graphics.

---

## 1. Deep Discovery & Repository Analysis

### OpenMontage Core Architecture (`scratch/OpenMontage`)
OpenMontage is an AI-orchestrated video production framework with two primary execution layers:
1. **Remotion Composition Engine (`remotion-composer/`)**:
   - React-based deterministic video rendering engine with sub-pixel typography and spring physics.
   - Scene components ready out-of-the-box:
     - `ScreenshotScene`: Animates app screenshots inside phone containers with animated cursors, click pulses, typing, and highlight focus balloons.
     - `HeroTitle`: Clean typographic hooks with dynamic mesh gradients.
     - `StatCard` & `StatReveal`: Highlighting key statistics (e.g., *₹0 Lost Paise*, *100% Private Vault*).
     - `ComparisonCard`: Before vs After product comparisons.
     - `CaptionOverlay`: Word-level kinetic pop subtitles synced with voiceover timestamps.
     - `EndTag`: App logo, download call-to-action, and QR code integration.
2. **Audio & Narration Pipeline (`tools/audio/`)**:
   - Zero-cost, high-fidelity neural speech synthesis via local/edge models (`edge-tts` / `piper_tts`).
   - Word-level timestamp alignment generating structured JSON for Remotion's `CaptionOverlay`.
3. **Pipeline Manifests**:
   - `screen-demo.yaml` and `animated-explainer.yaml` provide the pipeline state machine:
     `brief → script → scene_plan → asset_manifest → edit_decisions → compose → publish`.

---

## 2. Creative & Narrative Strategy: "Roommate Debt Drama"

- **Duration**: Exactly 30.0 seconds (900 frames @ 30 FPS).
- **Format**: 9:16 Vertical (1080 × 1920) optimized for Instagram Reels, YouTube Shorts, and TikTok Ads.
- **Color Palette & Brand Identity**:
  - Primary Brand: Emerald Green (`#10B981`)
  - Accent / Urgency: Rose / Amber (`#F43F5E` / `#F59E0B`)
  - Background: Deep Navy Dark Mode (`#0B0F19` / `#0F172A`)
  - Text & Accents: Crisp White (`#F8FAFC`) and Slate Muted (`#94A3B8`)
  - Font: Space Grotesk / Inter
- **Audio & Voiceover**:
  - Voice: Free Indian English / Natural Neutral Neural Voice (`en-IN-PrabhatNeural` or `en-IN-NeerjaNeural` via Edge-TTS).
  - Background Music: Lo-fi upbeat student beat (ducked under narration).
  - Subtitles: High-contrast kinetic pop captioning with word-by-word Emerald highlights.

---

## 3. Shot-by-Shot Timeline & Storyboard (30 Seconds)

```
0.0s ────── 4.5s ────── 10.0s ────── 17.0s ────── 24.0s ────── 30.0s
[Act 1: The Hook] [Act 2: The Hero] [Act 3: Personal [Act 4: 1-Tap [Act 5: CTA
 "Who owes who for  "Meet RoomMate:   vs Shared]       UPI Settle]    & Download QR]
  Wi-Fi & Mess?"    Zero awkwardness" (App Mockup)    (Zero Debt)   (RoomMate-Scan-QR)
```

### Scene 1: The Frustration Hook (0.0s – 4.5s | Frames 0 – 135)
- **Visual**: Dark high-contrast `TextCard` with floating notification bubbles simulating chaotic WhatsApp chats: *"Who paid Wi-Fi?"*, *"Bro, you owe ₹340 for dinner"*, *"Where's the electricity bill?"*.
- **Voiceover**: *"Still arguing in the flat group chat over who owes what for groceries and Wi-Fi?"*
- **On-Screen Text**: "The Roommate Money Drama Stops Here." (Amber warning badge).

### Scene 2: Product Reveal (4.5s – 10.0s | Frames 135 – 300)
- **Visual**: `HeroTitle` + `ProductReveal` transition. The 3D RoomMate mobile phone frame slides into view with a glowing Emerald halo.
- **Voiceover**: *"Meet RoomMate. The smart expense app built specifically for students and flatmates."*
- **On-Screen Text**: "RoomMate 🏠💳 — Smart Student Ledger"

### Scene 3: Feature Deep-Dive — Private Vault vs Shared Ledger (10.0s – 17.0s | Frames 300 – 510)
- **Visual**: `ScreenshotScene` animating the RoomMate dashboard UI:
  - Cursor clicks toggle between **Personal Vault** (private food, shopping, tuition) and **Shared Room Ledger** (rent, LPG, Wi-Fi).
  - Animated highlight box zooms into the penny-exact split: `₹1,337.00 exact share`.
- **Voiceover**: *"Keep personal shopping 100% private in your personal vault, while shared expenses are split with penny-exact math."*
- **On-Screen Text**: "Private Vault 🔒 • Shared Ledger 👥"

### Scene 4: Instant Resolution — 1-Tap UPI Settlement (17.0s – 24.0s | Frames 510 – 720)
- **Visual**: `ComparisonCard` / `ScreenshotScene` showing mutual debt simplification:
  - Person A owes B, B owes C → collapsed into a single direct payment.
  - 1-tap GPay / PhonePe deep-link intent trigger popup.
- **Voiceover**: *"No awkward reminders. Circular debts automatically offset, and you settle in one tap with UPI."*
- **On-Screen Stat**: "₹0 Lost Paise • 1-Tap GPay / PhonePe"

### Scene 5: Outro & Download Call To Action (24.0s – 30.0s | Frames 720 – 900)
- **Visual**: `EndTag` composition featuring the official logo, download badges, and the verified QR code asset (`RoomMate-Scan-To-Download-QR.png`).
- **Voiceover**: *"Scan to download RoomMate today. Zero drama. Zero debt."*
- **On-Screen CTA**: "Scan to Download • Android APK Live Now"

---

## 4. Phase-by-Phase Technical Implementation Plan

### Phase 1: Environment & Remotion Setup for 9:16 Vertical
1. **Vertical Composition Registration**:
   - In `scratch/OpenMontage/remotion-composer/src/Root.tsx`, register a dedicated 9:16 composition:
     - `id: "RoomMateAdVertical"`
     - `width: 1080, height: 1920, fps: 30, durationInFrames: 900`
   - Implement vertical responsive styling for `ScreenshotScene.tsx` and `HeroTitle.tsx` to ensure phone mockups and typography scale crisply for mobile displays.
2. **Asset Directory Preparation**:
   - Link or copy RoomMate branding assets into `remotion-composer/public/assets/roommate/`:
     - App Icon / Logo
     - `RoomMate-Scan-To-Download-QR.png` (from workspace root)
     - High-resolution UI captures of RoomMate dashboard, personal vault, and UPI settlement modal.

### Phase 2: Narration & Subtitle Generation (Edge-TTS)
1. **Narration Scripting**:
   - Compose the precise 30-second timing script (approx. 65 words total to maintain clear, unhurried cadence).
2. **Audio Synthesis Script (`scripts/generate_ad_audio.py`)**:
   - Utilize Python `edge-tts` to synthesize the voiceover track (`roommate_ad_vo.mp3`).
   - Extract exact word-level timing boundaries (`roommate_ad_words.json`).
3. **Caption Alignment**:
   - Convert word timestamps into Remotion `CaptionOverlay` format with Emerald active-word highlights.

### Phase 3: Remotion Props Manifest & Scene Composition
1. **Create `roommate-ad-props.json`**:
   - Define all 5 cuts (`hero_title`, `screenshot_scene`, `comparison`, `stat_card`, `end_tag`).
   - Define overlays (progress bar, floating pills, section titles).
   - Wire the background music loop and synchronized voiceover.
2. **Local Preview & Validation**:
   - Test rendering individual frames using Remotion preview (`npx remotion preview` or `npx remotion still`).

### Phase 4: Production Rendering & Quality Control
1. **Full Video Render**:
   - Execute production render via Remotion CLI:
     ```bash
     npx remotion render src/index.tsx RoomMateAdVertical output/roommate-ad-30s.mp4 --props public/demo-props/roommate-ad-props.json --codec h264 --audio-codec aac
     ```
2. **Quality Verification**:
   - Verify video playback (30.0s duration, 1080x1920 resolution, 30fps).
   - Verify audio mixing (voice clarity over background music, no clipping).
   - Verify subtitle synchronization with spoken words.
   - Verify QR code legibility on mobile screens.

---

## 5. Verification & Acceptance Checklist

| Stage | Criteria | Target |
|-------|----------|--------|
| **Aspect Ratio** | 9:16 Vertical (1080 × 1920) | Verified |
| **Duration** | 30.0 seconds (900 frames @ 30fps) | Verified |
| **Audio** | Natural neural TTS voiceover with word-level subtitles | Zero external API costs |
| **Branding** | Emerald Green (`#10B981`), Dark Navy, Space Grotesk | Matches RoomMate design system |
| **Content Accuracy** | Personal Vault, Shared Ledger, Penny Splits, 1-Tap UPI | Accurate to RoomMate SaaS |
| **CTA** | Scannable `RoomMate-Scan-To-Download-QR.png` end card | Scans on Android & iOS |
| **Deliverable** | MP4 render in `artifacts/roommate-ad-30s.mp4` | Ready for distribution |

---

## 6. Execution Command
To begin execution of this plan, run:
```bash
/create
```
