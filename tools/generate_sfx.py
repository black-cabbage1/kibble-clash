"""Generate the original, dependency-light Kibble Clash SFX set."""
from __future__ import annotations

import math
import wave
from pathlib import Path

import numpy as np
import soundfile as sf

RATE = 44_100
ROOT = Path(__file__).resolve().parents[1] / "assets" / "audio" / "sfx" / "wav"
OGG_ROOT = ROOT.parent / "ogg"
RNG = np.random.default_rng(20260812)


def env(length: int, attack: float = .01, release: float = .12) -> np.ndarray:
    a = min(length, int(attack * RATE)); r = min(length - a, int(release * RATE))
    out = np.ones(length)
    if a: out[:a] = np.linspace(0, 1, a)
    if r: out[-r:] = np.linspace(1, 0, r) ** 1.7
    return out


def tone(duration: float, frequency: float, volume: float = 1, wave_type: str = "sine", decay: float = .15, start: float = 0) -> np.ndarray:
    n = int(duration * RATE); t = np.arange(n) / RATE
    phase = 2 * np.pi * frequency * t
    if wave_type == "triangle": signal = 2 / np.pi * np.arcsin(np.sin(phase))
    elif wave_type == "square": signal = np.tanh(2.2 * np.sin(phase))
    else: signal = np.sin(phase)
    signal *= np.exp(-t / max(decay, .001)) * env(n, .004, min(.08, duration / 2)) * volume
    return np.pad(signal, (int(start * RATE), 0))


def sweep(duration: float, start_hz: float, end_hz: float, volume: float, decay: float) -> np.ndarray:
    n = int(duration * RATE); t = np.arange(n) / RATE
    freq = start_hz * (end_hz / start_hz) ** (t / duration)
    phase = 2 * np.pi * np.cumsum(freq) / RATE
    return np.sin(phase) * np.exp(-t / decay) * env(n, .003, min(.1, duration / 2)) * volume


def noise_hit(duration: float, volume: float, cutoff: int = 9, decay: float = .08) -> np.ndarray:
    n = int(duration * RATE); raw = RNG.normal(0, 1, n)
    kernel = np.ones(cutoff) / cutoff
    filtered = np.convolve(raw, kernel, mode="same")
    t = np.arange(n) / RATE
    return filtered * np.exp(-t / decay) * env(n, .001, min(.06, duration / 2)) * volume


def mix(*signals: np.ndarray, peak_db: float = -4.5) -> np.ndarray:
    length = max(map(len, signals)); output = np.zeros(length)
    for signal in signals: output[:len(signal)] += signal
    peak = np.max(np.abs(output)) or 1
    return output / peak * (10 ** (peak_db / 20))


def melody(notes: list[tuple[float, float, float]], duration: float, volume: float = .7) -> np.ndarray:
    parts = [warm_note(length, hz, volume, start) for start, hz, length in notes]
    result = mix(*parts, peak_db=-7)
    return np.pad(result, (0, max(0, int(duration * RATE) - len(result))))[:int(duration * RATE)]


def warm_note(duration: float, frequency: float, volume: float = 1, start: float = 0) -> np.ndarray:
    """Rounded toy-marimba note with a soft fundamental and muted overtones."""
    base = tone(duration, frequency, volume, "sine", duration * .65)
    second = tone(duration, frequency * 2, volume * .12, "sine", duration * .22)
    body = mix(base, second, peak_db=-8)
    body *= env(len(body), .018, min(.14, duration * .45))
    return np.pad(body, (int(start * RATE), 0))


def puppy_bark(start: float = 0, pitch: float = 1.0, volume: float = 1.0, soft: bool = False) -> np.ndarray:
    """Short synthetic puppy yip: voiced pitch drop plus two warm formants."""
    duration = .20 if not soft else .34
    n = int(duration * RATE); t = np.arange(n) / RATE
    f0_start, f0_end = (330 * pitch, 205 * pitch) if not soft else (280 * pitch, 190 * pitch)
    f0 = f0_start * (f0_end / f0_start) ** (t / duration)
    phase = 2 * np.pi * np.cumsum(f0) / RATE
    voiced = np.sin(phase) + .28 * np.sin(2 * phase) + .09 * np.sin(3 * phase)
    mouth = np.sin(2 * np.pi * 720 * pitch * t + .5 * np.sin(phase)) * .18
    breath = np.convolve(RNG.normal(0, 1, n), np.ones(28) / 28, mode="same") * .12
    shape = env(n, .018 if soft else .008, .2 if soft else .1) * np.exp(-t / (.24 if soft else .11))
    signal = (voiced + mouth + breath) * shape * volume
    return np.pad(signal, (int(start * RATE), 0))


def write(name: str, signal: np.ndarray) -> None:
    ROOT.mkdir(parents=True, exist_ok=True)
    pcm = np.clip(signal, -1, 1)
    with wave.open(str(ROOT / f"{name}.wav"), "wb") as target:
        target.setnchannels(1); target.setsampwidth(2); target.setframerate(RATE)
        target.writeframes((pcm * 32767).astype("<i2").tobytes())
    OGG_ROOT.mkdir(parents=True, exist_ok=True)
    sf.write(OGG_ROOT / f"{name}.ogg", pcm, RATE, format="OGG", subtype="VORBIS")


def main() -> None:
    # Paw-pad boop: round, low and free of sharp transients.
    write("ui-click", mix(sweep(.14, 310, 205, .48, .075), tone(.14, 118, .24, "sine", .07), peak_db=-11))
    # Kibble pieces rattling in a plastic bowl: dense at first, then slowing down.
    roll = []
    for index, at in enumerate([.00, .055, .105, .16, .225, .30, .39, .50, .63]):
        pitch = [720, 610, 790][index % 3]
        tick = mix(sweep(.075, pitch, pitch * .55, .34, .026), noise_hit(.055, .07, 35, .018), peak_db=-14)
        roll.append(np.pad(tick, (int(at * RATE), 0)))
    write("dice-roll", mix(*roll, tone(.72, 155, .06, "sine", .5), peak_db=-9))
    # Hollow but friendly plastic bowl 'tong'.
    write("dice-land", mix(sweep(.32, 420, 175, .48, .095), tone(.38, 188, .42, "sine", .17), tone(.28, 376, .12, "sine", .09), peak_db=-8))
    # Nose pressing a soft game button: 'boop'.
    write("select-dice", mix(sweep(.17, 540, 285, .48, .065), tone(.2, 190, .24, "sine", .1), peak_db=-9.5))
    # A small handful of kibble falling into the bowl: 'to-do-dok'.
    placement = []
    for index, at in enumerate([0, .065, .125, .18]):
        tok = mix(sweep(.12, 470 + index * 35, 215, .34, .04), tone(.13, 145, .13, "sine", .055), peak_db=-14)
        placement.append(np.pad(tok, (int(at * RATE), 0)))
    write("place-dice", mix(*placement, peak_db=-9))
    write("score-gain", mix(puppy_bark(0, 1.08, .75), warm_note(.34, 523.25, .28, .11), peak_db=-7.5))
    # Friendly cartoon bonk rather than a metallic crash.
    write("kibble-clash", mix(sweep(.35, 175, 78, .46, .15), puppy_bark(.12, .88, .52), noise_hit(.25, .07, 60, .1), peak_db=-8.5))
    write("round-complete", mix(puppy_bark(0, 1.0, .62), puppy_bark(.27, 1.12, .68), warm_note(.52, 523.25, .22, .43), peak_db=-7.5))
    victory = melody([(0, 329.63, .24), (.25, 392.00, .25), (.52, 523.25, .5)], 1.25, .34)
    write("victory", mix(victory, puppy_bark(.02, .96, .52), puppy_bark(.31, 1.08, .58), puppy_bark(.62, 1.2, .64), peak_db=-7))
    # Small, soft whine-like yip without a prolonged sad cue.
    write("defeat", mix(puppy_bark(0, .82, .34, soft=True), sweep(.82, 245, 165, .22, .62), warm_note(.62, 196, .15, .24), peak_db=-9))


if __name__ == "__main__":
    main()
