import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { loadEnv } from 'vite'

// VS Code sets ELECTRON_RUN_AS_NODE=1 which makes Electron skip browser init
delete process.env.ELECTRON_RUN_AS_NODE

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  return {
    main: {
      plugins: [
        externalizeDepsPlugin({
          exclude: ['@electron-toolkit/utils', 'dotenv']
        })
      ],
      define: {
        'process.env.SUPPORT_EMAIL': JSON.stringify(
          env.SUPPORT_EMAIL || process.env.SUPPORT_EMAIL || 'support@healthos.dev'
        ),
        'process.env.GOOGLE_OAUTH_CLIENT_ID': JSON.stringify(
          env.GOOGLE_OAUTH_CLIENT_ID || process.env.GOOGLE_OAUTH_CLIENT_ID || ''
        ),
        'process.env.GOOGLE_OAUTH_CLIENT_SECRET': JSON.stringify(
          env.GOOGLE_OAUTH_CLIENT_SECRET || process.env.GOOGLE_OAUTH_CLIENT_SECRET || ''
        ),
        'process.env.GOOGLE_OAUTH_REDIRECT_URI': JSON.stringify(
          env.GOOGLE_OAUTH_REDIRECT_URI || process.env.GOOGLE_OAUTH_REDIRECT_URI || ''
        )
      }
    },
    preload: {
      plugins: [externalizeDepsPlugin()]
    },
    renderer: {
      resolve: {
        alias: {
          '@': resolve('src/renderer/src')
        }
      },
      plugins: [react()],
      build: {
        rollupOptions: {
          input: {
            index: resolve('src/renderer/index.html'),
            prompt: resolve('src/renderer/prompt.html'),
            widget: resolve('src/renderer/widget.html')
          }
        }
      }
    }
  }
})
