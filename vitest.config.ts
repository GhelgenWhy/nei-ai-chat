import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    alias: {
      obsidian: resolve(__dirname, 'tests/__mocks__/obsidian.ts'),
    },
  },
});
