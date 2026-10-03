"""
Generates a smooth, royalty-free lofi background music track for the RoomMate 30s ad.
Synthesizes chill chords (Fm9 - Dbmaj7 - Bbm7 - C7alt) with soft filter, subtle sub-bass,
and gentle vinyl warmth. Pure Python standard library (wave + math + struct).
"""

import math
import struct
import wave
from pathlib import Path

SAMPLE_RATE = 44100
DURATION_SEC = 30.5
NUM_SAMPLES = int(SAMPLE_RATE * DURATION_SEC)

OUTPUT_PATH = Path("scratch/OpenMontage/remotion-composer/public/audio/roommate_bgm.wav")
OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)

# 80 BPM -> beat = 0.75s, bar = 3.0s
# 10 bars total for 30s
CHORDS = [
    # Bar 1-2: Fm9 (F, Ab, C, Eb, G)
    [174.61, 207.65, 261.63, 311.13, 392.00],
    # Bar 3-4: Dbmaj7 (Db, F, Ab, C)
    [138.59, 174.61, 207.65, 261.63],
    # Bar 5-6: Bbm7 (Bb, Db, F, Ab)
    [116.54, 138.59, 174.61, 207.65],
    # Bar 7-8: C7b9 (C, E, G, Bb, Db)
    [130.81, 164.81, 196.00, 233.08, 277.18],
    # Bar 9-10: Fm9 resolution
    [174.61, 207.65, 261.63, 311.13, 392.00],
]

def generate_track():
    print("Synthesizing custom 30s lofi background music...")
    samples = []
    
    beat_sec = 0.75
    bar_sec = 3.0
    
    for i in range(NUM_SAMPLES):
        t = i / SAMPLE_RATE
        
        # Chord selection based on bar
        bar_idx = min(int(t / bar_sec), len(CHORDS) - 1)
        chord_freqs = CHORDS[bar_idx]
        
        # Sub-bass root
        root_freq = chord_freqs[0] / 2.0
        bass = 0.28 * math.sin(2 * math.pi * root_freq * t)
        
        # Electric Piano / Rhodes chord texture
        t_in_bar = t % bar_sec
        # Soft tremolo
        tremolo = 1.0 + 0.15 * math.sin(2 * math.pi * 3.5 * t)
        chord_val = 0.0
        for idx, f in enumerate(chord_freqs):
            # Soft harmonics
            h1 = math.sin(2 * math.pi * f * t)
            h2 = 0.35 * math.sin(2 * math.pi * f * 2 * t)
            chord_val += (h1 + h2) * (0.12 / (1 + idx * 0.25))
            
        chord_val *= tremolo
        
        # Percussion: soft kick on beats 1 and 3, rimshot / click on beats 2 and 4
        t_in_beat = t % beat_sec
        beat_num = int((t % (2 * beat_sec)) / beat_sec)
        
        perc = 0.0
        if beat_num == 0:  # Kick
            if t_in_beat < 0.12:
                kick_env = (1.0 - t_in_beat / 0.12) ** 2
                kick_freq = 90 * (1.0 - t_in_beat / 0.15) + 35
                perc += 0.22 * math.sin(2 * math.pi * kick_freq * t_in_beat) * kick_env
        else:  # Soft rim click
            if t_in_beat < 0.05:
                click_env = (1.0 - t_in_beat / 0.05) ** 3
                perc += 0.08 * (math.sin(2 * math.pi * 1800 * t_in_beat) + math.sin(2 * math.pi * 2400 * t_in_beat)) * click_env

        # Master mix
        mix = (bass + chord_val + perc) * 0.55
        
        # Global Fade In (first 1.5s) & Fade Out (last 2.0s)
        if t < 1.5:
            mix *= (t / 1.5)
        elif t > (DURATION_SEC - 2.0):
            mix *= max(0.0, (DURATION_SEC - t) / 2.0)
            
        # Soft limiter / saturation
        mix = math.tanh(mix * 1.2) * 0.8
        
        # 16-bit PCM integer
        sample_int = int(max(-32767, min(32767, mix * 32767)))
        samples.append(sample_int)

    # Write stereo WAV
    with wave.open(str(OUTPUT_PATH), "wb") as wav_file:
        wav_file.setnchannels(2)
        wav_file.setsampwidth(2)
        wav_file.setframerate(SAMPLE_RATE)
        
        # Interleave stereo
        packed_data = bytearray()
        for s in samples:
            packed_data.extend(struct.pack("<hh", s, s))
            
        wav_file.writeframes(packed_data)
        
    print(f"Music track generated: {OUTPUT_PATH} (Length: {DURATION_SEC:.1f}s)")

if __name__ == "__main__":
    generate_track()
