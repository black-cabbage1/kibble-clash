export type SoundEffectName =
  | 'ui-click'
  | 'dice-roll'
  | 'dice-land'
  | 'select-dice'
  | 'place-dice'
  | 'score-gain'
  | 'kibble-clash'
  | 'round-complete'
  | 'victory'
  | 'defeat';

export const SOUND_ENABLED_STORAGE_KEY = 'kibble-clash:sound-enabled';

const SOUND_URLS: Record<SoundEffectName, URL> = {
  'ui-click': new URL('../../../audio/sfx/ogg/ui-click.ogg', import.meta.url),
  'dice-roll': new URL('../../../audio/sfx/ogg/dice-roll.ogg', import.meta.url),
  'dice-land': new URL('../../../audio/sfx/ogg/dice-land.ogg', import.meta.url),
  'select-dice': new URL('../../../audio/sfx/ogg/select-dice.ogg', import.meta.url),
  'place-dice': new URL('../../../audio/sfx/ogg/place-dice.ogg', import.meta.url),
  'score-gain': new URL('../../../audio/sfx/ogg/score-gain.ogg', import.meta.url),
  'kibble-clash': new URL('../../../audio/sfx/ogg/kibble-clash.ogg', import.meta.url),
  'round-complete': new URL('../../../audio/sfx/ogg/round-complete.ogg', import.meta.url),
  'victory': new URL('../../../audio/sfx/ogg/victory.ogg', import.meta.url),
  'defeat': new URL('../../../audio/sfx/ogg/defeat.ogg', import.meta.url),
};

const activeSounds = new Set<HTMLAudioElement>();
const scheduledSounds = new Set<number>();

function loadSoundEnabled(): boolean {
  try {
    return globalThis.localStorage?.getItem(SOUND_ENABLED_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

let soundEnabled = loadSoundEnabled();

export function isSoundEnabled(): boolean {
  return soundEnabled;
}

export function stopAllSounds(): void {
  scheduledSounds.forEach((timer) => globalThis.clearTimeout(timer));
  scheduledSounds.clear();
  activeSounds.forEach((audio) => {
    audio.pause();
    try {
      audio.currentTime = 0;
    } catch {
      // Some WebViews reject seeking before media metadata is ready.
    }
  });
  activeSounds.clear();
}

export function setSoundEnabled(enabled: boolean): void {
  soundEnabled = enabled;
  try {
    globalThis.localStorage?.setItem(SOUND_ENABLED_STORAGE_KEY, String(enabled));
  } catch {
    // Storage can be unavailable in private or restricted WebViews.
  }
  if (!enabled) stopAllSounds();
}

export function playSound(name: SoundEffectName): void {
  if (!soundEnabled || typeof Audio === 'undefined') return;
  try {
    const audio = new Audio(SOUND_URLS[name].href);
    const cleanup = (): void => {
      activeSounds.delete(audio);
    };
    audio.preload = 'auto';
    audio.addEventListener('ended', cleanup, { once: true });
    audio.addEventListener('error', cleanup, { once: true });
    activeSounds.add(audio);
    void audio.play().catch(cleanup);
  } catch {
    // Sound must never interrupt game flow.
  }
}

export function scheduleSound(name: SoundEffectName, delayMs: number): void {
  if (!soundEnabled) return;
  const timer = globalThis.setTimeout(() => {
    scheduledSounds.delete(timer);
    playSound(name);
  }, delayMs);
  scheduledSounds.add(timer);
}
