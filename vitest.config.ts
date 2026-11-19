import { defineConfig } from 'vitest/config'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  test: {
    globals: true,
    testTimeout: 15000,
    hookTimeout: 15000,
    server: {
      deps: {
        inline: ['electron']
      }
    },
    projects: [
      {
        test: {
          name: 'renderer',
          include: ['src/renderer/**/*.{test,spec}.{ts,tsx}'],
          environment: 'happy-dom'
        }
      },
      {
        test: {
          name: 'node',
          include: ['src/{main,shared,__tests__}/**/*.{test,spec}.{ts,tsx}'],
          environment: 'node'
        }
      }
    ]
  },
  resolve: {
    alias: {
      electron: path.resolve(__dirname, 'src/__mocks__/electron.ts'),
      '@': path.resolve(__dirname, 'src/renderer/src')
    }
  },
  ssr: {
    noExternal: ['electron']
  }
})
