import { fileURLToPath, URL } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { cpSync, existsSync, mkdirSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { defineConfig } from 'vite'

export default defineConfig(({ mode }) => {
  const deployment = mode === 'deployment'
  return {
    resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
    plugins: [
      react(),
      tailwindcss(),
      ...(deployment
        ? [
            {
              name: 'public-deployment-assets',
              closeBundle() {
                const source = fileURLToPath(new URL('./public', import.meta.url))
                const output = fileURLToPath(new URL('./dist-production', import.meta.url))
                mkdirSync(output, { recursive: true })
                // An explicit allowlist keeps ignored samples and future private files out.
                for (const name of ['tmdb-logo.svg']) {
                  if (existsSync(join(source, name))) cpSync(join(source, name), join(output, name))
                }
                if (readdirSync(output).some((name) => name.startsWith('__')))
                  throw new Error('Private files appeared in the deployment assets')
              },
            },
          ]
        : []),
    ],
    ...(deployment ? { publicDir: false } : {}),
    build: {
      outDir: deployment ? 'dist-production' : 'dist',
      rollupOptions: {
        input: deployment
          ? { app: 'index.html' }
          : {
              app: 'index.html',
              design: 'design.html',
              libraryReview: 'library-review.html',
              specimen: 'specimen.html',
            },
      },
    },
    server: {
      port: 5173,
      strictPort: true,
      proxy: {
        '/api': {
          target: 'http://127.0.0.1:8787',
          changeOrigin: true,
        },
      },
    },
  }
})
