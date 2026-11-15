/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_DEMO_MODE: string
  readonly VITE_API_BASE_URL: string
  readonly VITE_GITHUB_PAGES: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
