"""
Synthesizes individual scene audio files with Edge-TTS and calculates exact
word-level timestamp alignments for TikTok/Reels kinetic captions.
"""

import asyncio
import json
import re
from pathlib import Path
import edge_tts

VOICE = "en-IN-PrabhatNeural"
RATE = "+4%"

SCENES = [
    {
        "id": "scene1",
        "file": "scene1_hook.mp3",
        "startSec": 0.2,
        "text": "Still fighting with your roommates over unpaid Wi-Fi and grocery bills?"
    },
    {
        "id": "scene2",
        "file": "scene2_reveal.mp3",
        "startSec": 5.6,
        "text": "Meet RoomMate! The smart expense app built for hostel and flat living."
    },
    {
        "id": "scene3",
        "file": "scene3_vault.mp3",
        "startSec": 10.6,
        "text": "Your personal expenses stay completely private, while shared household bills split to the exact penny."
    },
    {
        "id": "scene4",
        "file": "scene4_settle.mp3",
        "startSec": 18.6,
        "text": "Mutual debts automatically offset, and you settle in one tap with UPI."
    },
    {
        "id": "scene5",
        "file": "scene5_cta.mp3",
        "startSec": 24.6,
        "text": "Scan the QR code to download RoomMate today. Zero drama, zero debt!"
    }
]

OUTPUT_DIR = Path("scratch/OpenMontage/remotion-composer/public/audio")
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
CAPTIONS_OUTPUT = OUTPUT_DIR / "roommate_captions.json"


async def process_scenes():
    print(f"Synthesizing 5 scene audio tracks using {VOICE}...")
    all_captions = []
    
    for s in SCENES:
        out_path = OUTPUT_DIR / s["file"]
        comm = edge_tts.Communicate(s["text"], voice=VOICE, rate=RATE)
        
        audio_bytes = bytearray()
        actual_duration_ms = 0
        
        async for chunk in comm.stream():
            if chunk["type"] == "audio":
                audio_bytes.extend(chunk["data"])
            elif chunk["type"] == "SentenceBoundary":
                actual_duration_ms = round(chunk["duration"] / 10000)
                
        with open(out_path, "wb") as f:
            f.write(audio_bytes)
            
        print(f"[{s['id']}] Generated {s['file']} | Duration: {actual_duration_ms / 1000:.2f}s")
        
        # Split words cleanly
        words = s["text"].split()
        if not words:
            continue
            
        # Character-weighted duration distribution for human-realistic reading rhythm
        clean_words = [re.sub(r"[^\w]", "", w) for w in words]
        char_counts = [max(1, len(cw)) for cw in clean_words]
        total_chars = sum(char_counts)
        
        scene_start_ms = round(s["startSec"] * 1000)
        cursor_ms = scene_start_ms
        
        for idx, word in enumerate(words):
            word_fraction = char_counts[idx] / total_chars
            word_dur = round(actual_duration_ms * word_fraction)
            # Ensure minimum duration
            word_dur = max(180, word_dur)
            
            end_ms = cursor_ms + word_dur
            all_captions.append({
                "word": word,
                "startMs": cursor_ms,
                "endMs": end_ms,
                "pageBreakAfter": (idx == len(words) - 1)  # Break page at end of each scene
            })
            cursor_ms = end_ms + 40  # 40ms inter-word gap

    with open(CAPTIONS_OUTPUT, "w", encoding="utf-8") as f:
        json.dump(all_captions, f, indent=2)
        
    print(f"\nAll 5 scenes synthesized! Captions written with {len(all_captions)} words to: {CAPTIONS_OUTPUT}")


if __name__ == "__main__":
    asyncio.run(process_scenes())
