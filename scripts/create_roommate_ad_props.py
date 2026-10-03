"""
Assembles the complete Remotion props JSON for RoomMate 30s Vertical Video Ad
using REAL app screenshots and the OFFICIAL RoomMate logo.
"""

import json
from pathlib import Path

COMPOSER_DIR = Path("scratch/OpenMontage/remotion-composer")
CAPTIONS_FILE = COMPOSER_DIR / "public" / "audio" / "roommate_captions.json"
PROPS_OUTPUT = COMPOSER_DIR / "public" / "demo-props" / "roommate-ad-props.json"

with open(CAPTIONS_FILE, "r", encoding="utf-8") as f:
    captions = json.load(f)

# Natural resolution of the captured mobile screenshots (iPhone 16 Pro density: 430x932 @ 2.5x)
SCREEN_SIZE = {"width": 1075, "height": 2330}

props = {
    "theme": "roommate-emerald",
    "cuts": [
        # Scene 1: The Hook (Unsettled Flat Debts & Messy Finances)
        {
            "id": "scene-1-hook",
            "source": "",
            "type": "screenshot_scene",
            "backgroundImage": "assets/roommate/real_screen_dashboard.png",
            "screenshotSize": SCREEN_SIZE,
            "in_seconds": 0.0,
            "out_seconds": 5.5,
            "cursorStartAt": [0.5, 0.2],
            "screenshotSteps": [
                {"kind": "cursor_move", "to": [0.5, 0.17], "durationSeconds": 0.8},
                {"kind": "click_pulse", "at": [0.5, 0.17], "color": "#F43F5E"},
                {
                    "kind": "highlight_box",
                    "region": {"x": 0.04, "y": 0.12, "w": 0.92, "h": 0.12},
                    "durationSeconds": 2.0,
                    "color": "#F43F5E",
                    "pulses": 2
                },
                {
                    "kind": "callout_balloon",
                    "anchor": [0.5, 0.24],
                    "text": "Unsettled debts & messy roommate bills!",
                    "position": "bottom",
                    "durationSeconds": 2.0,
                    "color": "#F43F5E"
                },
                {"kind": "cursor_move", "to": [0.5, 0.44], "durationSeconds": 0.8},
                {
                    "kind": "highlight_box",
                    "region": {"x": 0.04, "y": 0.40, "w": 0.92, "h": 0.09},
                    "durationSeconds": 1.4,
                    "color": "#F59E0B"
                }
            ]
        },
        # Scene 2: Product Reveal - Official Logo + Tagline
        {
            "id": "scene-2-reveal",
            "source": "",
            "type": "hero_title",
            "in_seconds": 5.5,
            "out_seconds": 10.5,
            "text": "Meet RoomMate",
            "subtitle": "Live Together. Spend Smarter.",
            "logoSrc": "assets/roommate/logo.png",
            "backgroundImage": "assets/roommate/real_screen_login.png",
            "backgroundOverlay": 0.82,
            "accentColor": "#10B981",
            "textColor": "#F8FAFC",
            "backgroundColor": "#0B0F19"
        },
        # Scene 3: Feature 1 - Personal Vault (100% Private & Burn Rate)
        {
            "id": "scene-3-vault",
            "source": "",
            "type": "screenshot_scene",
            "backgroundImage": "assets/roommate/real_screen_vault.png",
            "screenshotSize": SCREEN_SIZE,
            "in_seconds": 10.5,
            "out_seconds": 18.5,
            "cursorStartAt": [0.5, 0.15],
            "screenshotSteps": [
                {"kind": "cursor_move", "to": [0.5, 0.09], "durationSeconds": 0.8},
                {"kind": "click_pulse", "at": [0.5, 0.09], "color": "#10B981"},
                {
                    "kind": "highlight_box",
                    "region": {"x": 0.04, "y": 0.06, "w": 0.92, "h": 0.08},
                    "durationSeconds": 2.2,
                    "color": "#10B981",
                    "pulses": 2
                },
                {
                    "kind": "callout_balloon",
                    "anchor": [0.5, 0.15],
                    "text": "100% Private Vault • Zero Room Visibility!",
                    "position": "bottom",
                    "durationSeconds": 2.2,
                    "color": "#10B981"
                },
                {"kind": "cursor_move", "to": [0.5, 0.38], "durationSeconds": 0.8},
                {"kind": "click_pulse", "at": [0.5, 0.38], "color": "#10B981"},
                {
                    "kind": "highlight_box",
                    "region": {"x": 0.04, "y": 0.36, "w": 0.92, "h": 0.07},
                    "durationSeconds": 2.0,
                    "color": "#10B981"
                },
                {
                    "kind": "callout_balloon",
                    "anchor": [0.5, 0.44],
                    "text": "Healthy Burn Rate • Safe ₹214/Day Limit",
                    "position": "bottom",
                    "durationSeconds": 2.0,
                    "color": "#10B981"
                },
                {"kind": "cursor_move", "to": [0.5, 0.53], "durationSeconds": 0.8},
                {
                    "kind": "highlight_box",
                    "region": {"x": 0.04, "y": 0.49, "w": 0.92, "h": 0.28},
                    "durationSeconds": 1.6,
                    "color": "#6366F1"
                }
            ]
        },
        # Scene 4: Feature 2 - 1-Tap UPI Settlement & Real Payment Chooser
        {
            "id": "scene-4-upi-settle",
            "source": "",
            "type": "screenshot_scene",
            "backgroundImage": "assets/roommate/real_screen_upi.png",
            "screenshotSize": SCREEN_SIZE,
            "in_seconds": 18.5,
            "out_seconds": 24.5,
            "cursorStartAt": [0.5, 0.3],
            "screenshotSteps": [
                {
                    "kind": "highlight_box",
                    "region": {"x": 0.04, "y": 0.19, "w": 0.92, "h": 0.09},
                    "durationSeconds": 1.8,
                    "color": "#10B981",
                    "pulses": 2
                },
                {
                    "kind": "callout_balloon",
                    "anchor": [0.5, 0.29],
                    "text": "Penny-Exact Splits • No Awkward Reminders!",
                    "position": "bottom",
                    "durationSeconds": 1.8,
                    "color": "#10B981"
                },
                {"kind": "cursor_move", "to": [0.28, 0.43], "durationSeconds": 0.8},
                {"kind": "click_pulse", "at": [0.28, 0.43], "color": "#3B82F6"},
                {"kind": "cursor_move", "to": [0.72, 0.43], "durationSeconds": 0.8},
                {"kind": "click_pulse", "at": [0.72, 0.43], "color": "#A855F7"},
                {
                    "kind": "callout_balloon",
                    "anchor": [0.5, 0.44],
                    "text": "1-Tap Settle via Google Pay & PhonePe",
                    "position": "top",
                    "durationSeconds": 2.0,
                    "color": "#10B981"
                }
            ]
        },
        # Scene 5: Outro & Download CTA - Official Logo + App End Card
        {
            "id": "scene-5-cta",
            "source": "",
            "type": "app_end_card",
            "in_seconds": 24.5,
            "out_seconds": 30.0,
            "appName": "RoomMate",
            "tagline": "Live Together. Spend Smarter.",
            "subTagline": "Student-First Expense & Shared Room Ledger",
            "logoSrc": "assets/roommate/logo.png",
            "qrSrc": "assets/roommate/qr_code.png",
            "primaryColor": "#10B981",
            "accentColor": "#F59E0B",
            "backgroundColor": "#0B0F19"
        }
    ],
    "overlays": [],
    "captions": captions,
    "audio": {
        "music": {
            "src": "audio/roommate_bgm.wav",
            "volume": 0.16,
            "fadeInSeconds": 1.2,
            "fadeOutSeconds": 2.0,
            "loop": True
        },
        "tracks": [
            {"src": "audio/scene1_hook.mp3", "startSeconds": 0.2, "volume": 1.0},
            {"src": "audio/scene2_reveal.mp3", "startSeconds": 5.6, "volume": 1.0},
            {"src": "audio/scene3_vault.mp3", "startSeconds": 10.6, "volume": 1.0},
            {"src": "audio/scene4_settle.mp3", "startSeconds": 18.6, "volume": 1.0},
            {"src": "audio/scene5_cta.mp3", "startSeconds": 24.6, "volume": 1.0}
        ]
    }
}

with open(PROPS_OUTPUT, "w", encoding="utf-8") as f:
    json.dump(props, f, indent=2)

print(f"RoomMate ad props successfully created at: {PROPS_OUTPUT}")
print(f"Total Cuts: {len(props['cuts'])} | Overlays: {len(props['overlays'])} | Captions: {len(props['captions'])}")
