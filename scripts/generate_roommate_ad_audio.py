"""
Audio & Caption Generator for RoomMate 30s Video Ad using Edge-TTS
Generates high-fidelity neural voiceover with exact word-level timestamp alignment.
"""

import asyncio
import json
import os
from pathlib import Path
import edge_tts

VOICE = "en-IN-PrabhatNeural"  # Professional, friendly Indian English neural voice
RATE = "+4%"  # Slightly energetic ad pace
PITCH = "+0Hz"

SCRIPT_SEGMENTS = [
    {
        "scene": "hook",
        "start_target_sec": 0.5,
        "text": "Still fighting with your roommates over unpaid Wi-Fi and grocery bills?"
    },
    {
        "scene": "reveal",
        "start_target_sec": 5.2,
        "text": "Meet RoomMate! The smart expense app built for hostel and flat living."
    },
    {
        "scene": "vault_vs_ledger",
        "start_target_sec": 11.0,
        "text": "Your personal expenses stay completely private, while shared household bills split to the exact penny."
    },
    {
        "scene": "upi_settle",
        "start_target_sec": 18.2,
        "text": "Mutual debts automatically offset, and you settle in one tap with UPI."
    },
    {
        "scene": "cta",
        "start_target_sec": 24.5,
        "text": "Scan the QR code to download RoomMate today. Zero drama, zero debt!"
    }
]

OUTPUT_DIR = Path("scratch/OpenMontage/remotion-composer/public/audio")
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

AUDIO_OUTPUT = OUTPUT_DIR / "roommate_vo.mp3"
CAPTIONS_OUTPUT = OUTPUT_DIR / "roommate_captions.json"


async def generate_audio_and_captions():
    print(f"Generating voiceover using {VOICE}...")
    
    # We will synthesize each segment with precise timing offsets
    all_words = []
    
    # Combined script with natural spacing for a seamless single audio track
    full_text = " ".join([seg["text"] for seg in SCRIPT_SEGMENTS])
    
    communicate = edge_tts.Communicate(full_text, voice=VOICE, rate=RATE, pitch=PITCH)
    
    submaker = edge_tts.SubMaker()
    
    with open(AUDIO_OUTPUT, "wb") as f:
        async for chunk in communicate.stream():
            if chunk["type"] == "audio":
                f.write(chunk["data"])
            elif chunk["type"] == "WordBoundary":
                submaker.feed(chunk)
                # WordBoundary format: offset in 100ns units (ticks), duration in ticks, text
                start_ms = round(chunk["offset"] / 10000)
                duration_ms = round(chunk["duration"] / 10000)
                end_ms = start_ms + duration_ms
                word_text = chunk["text"]
                all_words.append({
                    "word": word_text,
                    "startMs": start_ms,
                    "endMs": end_ms
                })

    print(f"Synthesized audio written to: {AUDIO_OUTPUT}")
    print(f"Total words captured with timing: {len(all_words)}")
    
    # Adjust last word timing for clean caption page breaks
    with open(CAPTIONS_OUTPUT, "w", encoding="utf-8") as f:
        json.dump(all_words, f, indent=2)
        
    print(f"Captions JSON written to: {CAPTIONS_OUTPUT}")
    
    # Output quick timing stats
    if all_words:
        first_ms = all_words[0]["startMs"]
        last_ms = all_words[-1]["endMs"]
        print(f"Audio start: {first_ms / 1000:.2f}s | Audio end: {last_ms / 1000:.2f}s | Total span: {(last_ms - first_ms) / 1000:.2f}s")


if __name__ == "__main__":
    asyncio.run(generate_audio_and_captions())
