// Follows the live service origin across quick-tunnel restarts.
//
// The supervisor republishes the current tunnel URL to the repository's
// `api-url` branch whenever it changes. Deployed sites poll that small JSON
// file and switch within one poll cycle, so visitors reconnect in seconds
// instead of waiting for a Pages rebuild. The loop only runs on the deployed
// GitHub Pages origin; development and Node tests keep their own endpoints.
// A manual override (Settings) always wins over the published endpoint.

import {
  applyDiscoveredApiBaseUrl, effectiveApiBaseUrl, getDiscoveredApiBaseUrl,
  isUsingEndpointOverride,
} from './endpoint.ts'

const POLL_INTERVAL_MS = 30_000

/** Raw file the supervisor commits to the `api-url` branch; no site build there. */
const ENDPOINT_FILE_URL =
  'https://raw.githubusercontent.com/Mohammed-Emad2004/Earth-Trend-Detective/api-url/api-url.json'

interface RecoveryClient {
  invalidateQueries(options: { queryKey: readonly unknown[] }): unknown
  removeQueries(options: { queryKey: readonly unknown[] }): void
}

function deployedOrigin(): boolean {
  try {
    return typeof location !== 'undefined' && typeof fetch === 'function'
      && location.protocol === 'https:' && location.hostname.endsWith('.github.io')
  } catch {
    return false
  }
}

/** Fetch the published endpoint; null when the file is missing or unusable. */
async function pollOnce(): Promise<string | null> {
  try {
    // The timestamp busts the CDN cache so a fresh publish is served at once.
    const response = await fetch(`${ENDPOINT_FILE_URL}?t=${Date.now()}`, {
      headers: { Accept: 'application/json' },
    })
    if (!response.ok) return null
    const payload = (await response.json()) as { api_base_url?: unknown }
    if (typeof payload.api_base_url !== 'string') return null
    const candidate = payload.api_base_url.trim().replace(/\/+$/, '')
    return candidate.startsWith('https://') ? candidate : null
  } catch {
    return null
  }
}

/**
 * Start following the published endpoint and refetch the workspace whenever it
 * changes. Returns a stop function; a no-op when the page is not the deployed
 * site or a manual override is already in charge.
 */
export function startEndpointRecovery(client: RecoveryClient): () => void {
  if (!deployedOrigin() || isUsingEndpointOverride()) return () => {}
  const tick = async () => {
    if (isUsingEndpointOverride()) {
      stop()
      return
    }
    const candidate = await pollOnce()
    if (!candidate || candidate === effectiveApiBaseUrl()) return
    if (applyDiscoveredApiBaseUrl(candidate)) {
      // Catalog and analysis data is keyed to the previous service; refetch.
      void client.invalidateQueries({ queryKey: ['environment'] })
      client.removeQueries({ queryKey: ['environment', 'readiness'] })
    }
  }
  const timer = setInterval(() => { void tick() }, POLL_INTERVAL_MS)
  const stop = () => clearInterval(timer)
  void tick()
  return stop
}

/** Exposed for tests and diagnostics: the currently adopted published endpoint. */
export function discoveredEndpointUrl(): string | null {
  return getDiscoveredApiBaseUrl()
}
