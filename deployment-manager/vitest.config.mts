import { defineConfig } from 'vitest/config';
import path from 'path';

// Minimal config: this repo has no prior test setup. Matches tsconfig's `~/*` -> `./src/*`
// path alias so tests can import the same modules the app does. Node environment only -
// these are pure-logic/unit tests, no DOM rendering.
export default defineConfig({
  resolve: {
    alias: {
      '~': path.resolve(import.meta.dirname, './src'),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
