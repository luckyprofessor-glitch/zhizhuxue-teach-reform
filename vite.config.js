/* global process */
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const repoName = 'zhizhuxue-teach-reform'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: process.env.GITHUB_PAGES === 'true' ? `/${repoName}/` : '/',
})
