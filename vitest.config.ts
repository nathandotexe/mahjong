import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tests/unit/**/*.spec.ts'],
    environment: 'node',
    env: { NODE_ENV: 'test', MONGODB_URI: 'memory' }
  }
})
