export const WAVEFORM_BARS = 46;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function scaleByteToHeight(value: number, minHeight: number, maxHeight: number) {
  const safeValue = clamp(value, 0, 255);
  return Math.round(minHeight + (safeValue / 255) * (maxHeight - minHeight));
}

export function mapFrequencyToBars(
  freq: Uint8Array,
  barCount = WAVEFORM_BARS,
  minHeight = 6,
  maxHeight = 60,
): number[] {
  if (barCount <= 0) {
    return [];
  }

  if (freq.length === 0) {
    return Array.from({ length: barCount }, () => minHeight);
  }

  if (freq.length < barCount) {
    return Array.from({ length: barCount }, (_, index) => {
      const sourceIndex = Math.min(index, freq.length - 1);
      return scaleByteToHeight(freq[sourceIndex], minHeight, maxHeight);
    });
  }

  return Array.from({ length: barCount }, (_, index) => {
    const start = Math.floor((index * freq.length) / barCount);
    const end = Math.max(start + 1, Math.floor(((index + 1) * freq.length) / barCount));
    let total = 0;

    for (let sourceIndex = start; sourceIndex < end; sourceIndex += 1) {
      total += freq[sourceIndex];
    }

    return scaleByteToHeight(total / (end - start), minHeight, maxHeight);
  });
}

function hashSeed(seed: string) {
  let hash = 2166136261;

  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function nextRandom(state: number) {
  let value = state + 0x6d2b79f5;
  value = Math.imul(value ^ (value >>> 15), value | 1);
  value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
  return {
    state: value >>> 0,
    random: ((value ^ (value >>> 14)) >>> 0) / 4294967296,
  };
}

export function deriveAmbientWaveform(
  seed: string,
  barCount = WAVEFORM_BARS,
  minHeight = 10,
  maxHeight = 62,
): number[] {
  if (barCount <= 0) {
    return [];
  }

  const span = maxHeight - minHeight;
  let state = hashSeed(seed);
  const phase = (state % 6283) / 1000;
  const secondaryPhase = ((state >>> 8) % 6283) / 1000;

  return Array.from({ length: barCount }, (_, index) => {
    const progress = barCount === 1 ? 0 : index / (barCount - 1);
    const primary = Math.sin(progress * Math.PI * 2.25 + phase) * 0.28;
    const secondary = Math.sin(progress * Math.PI * 6.5 + secondaryPhase) * 0.14;
    const randomResult = nextRandom(state + index * 1013);
    state = randomResult.state;
    const texture = (randomResult.random - 0.5) * 0.16;
    const taper = Math.sin(progress * Math.PI) * 0.12;
    const normalized = clamp(0.5 + primary + secondary + texture + taper, 0, 1);

    return Math.round(minHeight + normalized * span);
  });
}

export function pushSample(history: number[], sample: number, capacity: number): number[] {
  if (capacity <= 0) {
    return [];
  }

  return [...history, sample].slice(-capacity);
}
