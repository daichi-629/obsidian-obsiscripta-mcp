import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
  define: {
    __BRIDGE_VERSION__: JSON.stringify('test'),
  },
});
