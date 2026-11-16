// Runtime data-service endpoint resolution.
//
// The build-time default comes from VITE_API_BASE_URL. On static deployments
// (GitHub Pages) that value must point at a hosted FastAPI service; if the
// deployment ships a local fallback address, no visitor can reach a backend.
// This module lets any deployed site be pointed at a live service from the
// Settings page — without a rebuild — and keeps tests working in plain Node
// (no `@/` alias imports, guarded localStorage access).

import { config } from '../../config.ts'

const STORAGE_KEY = `${config.persistenceKey}.api-base-url`
const CHANGE_EVENT = 'earthtrend:api-base-url-changed'

function safeStorage(): Storage | null {
  try {
    if (typeof localStorage === 'undefined') return null
    return localStorage
  } catch {
    return null
  }
}

function storageGet(storage: Storage, key: string): string | null {
  try {
    return storage.getItem(key)
  } catch {
    return null
  }
}

function storageSet(storage: Storage, key: string, value: string): boolean {
  try {
    storage.setItem(key, value)
    return true
  } catch {
    return false
  }
}

function storageRemove(storage: Storage, key: string): void {
  try {
    storage.removeItem(key)
  } catch {
    // Unavailable storage is treated as "no override", which is the safe default.
  }
}

/** Normalized stored override, or null when the build-time default is in effect. */
export function getApiBaseUrlOverride(): string | null {
  const storage = safeStorage()
  if (!storage) return null
  const raw = storageGet(storage, STORAGE_KEY)
  if (raw == null) return null
  const normalized = raw.trim().replace(/\/+$/, '')
  return normalized.length > 0 ? normalized : null
}

/**
 * Runtime-discovered endpoint: the live supervisor republishes the current
 * service origin to the repository's `api-url` branch, so a deployed site can
 * follow a relocated service within seconds — without a rebuild. A manual
 * override (Settings) takes precedence over the discovery layer.
 */
let discoveredEndpoint: string | null = null

/** Normalized discovered endpoint, or null while only the build default applies. */
export function getDiscoveredApiBaseUrl(): string | null {
  return discoveredEndpoint
}

/** Validate and adopt a discovered endpoint; null clears it. Reports whether the effective endpoint changed. */
export function applyDiscoveredApiBaseUrl(value: string | null): boolean {
  if (value == null) {
    if (discoveredEndpoint == null) return false
    discoveredEndpoint = null
    notifyEndpointChanged()
    return true
  }
  const trimmed = value.trim().replace(/\/+$/, '')
  if (trimmed.length === 0 || !isValidEndpointUrl(trimmed)) return false
  if (trimmed === discoveredEndpoint) return false
  discoveredEndpoint = trimmed
  notifyEndpointChanged()
  return true
}

/** Resolve the endpoint actually used for every request right now. */
export function effectiveApiBaseUrl(): string {
  return getApiBaseUrlOverride() ?? getDiscoveredApiBaseUrl() ?? config.apiBaseUrl
}

/** Persist (or clear with null) a runtime endpoint override and notify listeners. */
export function setApiBaseUrlOverride(value: string | null): void {
  const storage = safeStorage()
  if (!storage) return
  if (value == null) {
    storageRemove(storage, STORAGE_KEY)
  } else {
    const stored = value.trim().replace(/\/+$/, '')
    // Only report success when the storage write actually landed; in-memory
    // fallbacks would otherwise present an override that vanishes on reload.
    if (!storageSet(storage, STORAGE_KEY, stored)) return
  }
  notifyEndpointChanged()
}

export function isUsingEndpointOverride(): boolean {
  return getApiBaseUrlOverride() != null
}

/** Basic URL sanity for the Settings input: absolute http(s) origin required. */
export function isValidEndpointUrl(value: string): boolean {
  try {
    const url = new URL(value.trim())
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

/**
 * Deployment-relevant warning for a candidate endpoint. GitHub Pages serves the
 * app over HTTPS, so a plain-http remote address would be blocked as mixed
 * content, and a loopback address can only ever reach the visitor's own machine.
 */
export function endpointWarning(value: string): string | null {
  const trimmed = value.trim()
  if (!isValidEndpointUrl(trimmed)) return 'Enter an absolute http(s) endpoint, e.g. https://earthtrend-api.example.com'
  if (typeof location !== 'undefined' && location.protocol === 'https:') {
    let parsed: URL
    try { parsed = new URL(trimmed) } catch { return null }
    const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname)
    if (parsed.protocol === 'http:' && !loopback) {
      return 'HTTPS pages cannot call a plain-http remote endpoint (mixed content). Use an https:// service URL.'
    }
    if (loopback) {
      return 'A loopback address only reaches the visitor’s own machine, not a hosted service. Point this at the deployed API.'
    }
  }
  return null
}

export function onEndpointChange(listener: () => void): () => void {
  if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') return () => {}
  window.addEventListener(CHANGE_EVENT, listener)
  return () => window.removeEventListener(CHANGE_EVENT, listener)
}

function notifyEndpointChanged(): void {
  if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') return
  try {
    window.dispatchEvent(new Event(CHANGE_EVENT))
  } catch {
    // Event constructor unavailable in very old environments; ignore.
  }
}
