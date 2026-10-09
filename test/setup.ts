import { vi } from 'vitest';

// Unit tests cover layout math, rather than loading native React Native modules.
vi.mock('react-native', () => ({
  Dimensions: { get: () => ({ width: 402, height: 874 }) },
  PixelRatio: { roundToNearestPixel: (value: number) => value },
}));
