import { defineConfig } from 'vite'

// GitHub Pages project site: https://<user>.github.io/<repo>/
const base =
  process.env.CI && process.env.GITHUB_REPOSITORY
    ? `/${process.env.GITHUB_REPOSITORY.split('/')[1]}/`
    : './'

export default defineConfig({
  base,
})
