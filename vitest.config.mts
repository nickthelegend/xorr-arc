import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Solidity vendor fixtures use Hardhat/Mocha and belong to the contracts suite.
export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: {
    setupFiles: ['./test/setup.ts'],
    include: ['src/**/*.test.ts', 'server/src/**/*.test.ts'],
    maxWorkers: 2,
  },
});
