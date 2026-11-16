// Follows the live service origin across quick-tunnel restarts.
//
// The supervisor commits the current tunnel URL to the repository's `api-url`
// branch whenever it changes. Deployed sites check their endpoint every 30
// seconds; only when it stops answering do they read the published file and
// switch, so visitors reconnect within a poll cycle instead of waiting for a
// Pages rebuild. The file is served by jsDelivr: raw.githubusercontent.com
// strips query strings from its CDN cache key and served hour-old content
// here, while jsDelivr honours the cache-busting timestamp. The loop only
// runs on the deployed GitHub Pages origin; development and Node tests keep
// their own endpoints. A manual override (Settings) always wins.

import {
  applyDiscoveredApiBaseUrl, effectiveApiBaseUrl, getDiscoveredApiBaseUrl,
  isUsingEndpointOverride,
} from './endpoint.ts'

const POLL_INTERVAL_MS = 30_000

/** jsDelivr mirror of the api-url branch; the timestamp busts its CDN cache. */
const ENDPOINT_FILE_URL =
  'https://cdn.jsdelivr.net/gh/Mohammed-Emad2004/Earth-Trend-Detective@api-url/api-url.json'

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

/** Cheap readiness check against the endpoint in use right now. */
async function apiHealthy(): Promise<boolean> {
  try {
    const response = await fetch(`${effectiveApiBaseUrl()}/api/v1/health/readiness`, {
      headers: { Accept: 'application/json' },
    })
    if (!response.ok) return false
    const payload = (await response.json()) as { status?: unknown }
    return payload.status === 'ready'
  } catch {
    return false
  }
}

/** Fetch the published endpoint; null when the file is missing or unusable. */
async function pollOnce(): Promise<string | null> {
  try {
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
    // A healthy endpoint has nothing to catch up on: tunnel restarts always
    // change the origin, so only a failing endpoint can benefit from the file.
    if (await apiHealthy()) return
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
