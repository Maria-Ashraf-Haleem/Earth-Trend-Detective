import { effectiveApiBaseUrl } from './endpoint.ts'

export interface ApiErrorShape { message: string; code: string; status: number; request_id?: string | null }
export interface RequestOptions extends RequestInit { timeoutMs?: number; responseType?: 'json' | 'blob' }
export class ApiError extends Error {
  readonly code: string
  readonly status: number
  readonly requestId: string | null
  readonly request_id: string | null
  constructor(shape: ApiErrorShape) {
    super(shape.message)
    this.name = 'ApiError'
    this.code = shape.code
    this.status = shape.status
    this.requestId = shape.request_id ?? null
    this.request_id = this.requestId
  }
}

/** Accept the documented origin base; tolerate a pasted /api/v1 suffix once. */
export function buildApiUrl(baseUrl: string, path: string): string {
  const base = baseUrl.trim().replace(/\/+$/, '')
  const route = path.startsWith('/') ? path : `/${path}`
  return `${base.endsWith('/api/v1') && route.startsWith('/api/v1/') ? base.slice(0, -7) : base}${route}`
}
const statusMessages: Record<number, string> = {
  404: 'The requested data or selection could not be found.',
  409: 'This selection is unavailable or conflicts with the published data.',
  422: 'Check the requested dates, indicator and filters.',
  501: 'This feature is not implemented by the environmental data service.',
  503: 'The environmental data service is temporarily unavailable.',
}

/** Connection failures say what is actually wrong for the current deployment. */
function connectionMessage(baseUrl: string): string {
  const reachableLocally = typeof location !== 'undefined'
    && ['localhost', '127.0.0.1'].includes(location.hostname)
  if (reachableLocally) {
    return 'Could not reach the environmental data service. Start the FastAPI backend on the configured endpoint.'
  }
  if (/^https?:\/\/(localhost|127\.0\.0\.1)/i.test(baseUrl)) {
    return 'This deployment points at a local address no visitor can reach. Set a hosted https:// API endpoint in Settings → Data service endpoint.'
  }
  return `Could not reach the environmental data service at ${baseUrl}. Verify the endpoint is hosted and online, or change it in Settings → Data service endpoint.`
}

/**
 * Base URL may be a fixed string (tests, single-tenant builds) or a resolver
 * evaluated per request so a Settings-page override takes effect immediately.
 */
type BaseUrlSource = string | (() => string)

export function createApiClient(baseUrl: BaseUrlSource, fetcher: typeof fetch = fetch) {
  const resolveBase = (): string => (typeof baseUrl === 'function' ? baseUrl() : baseUrl)
  return async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const { timeoutMs = 60_000, responseType = 'json', signal, ...init } = options
    const controller = new AbortController()
    let timedOut = false
    const abort = () => controller.abort(signal?.reason)
    if (signal?.aborted) abort()
    else signal?.addEventListener('abort', abort, { once: true })
    const timeout = setTimeout(() => { timedOut = true; controller.abort() }, timeoutMs)
    const base = resolveBase()
    try {
      const headers = new Headers(init.headers)
      headers.set('Accept', 'application/json')
      if (init.body != null && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
      const response = await fetcher(buildApiUrl(base, path), { ...init, headers, signal: controller.signal })
      if (!response.ok) {
        let body: unknown = null
        try { body = await response.json() }
        catch (error) { if (controller.signal.aborted) throw error }
        const error = body && typeof body === 'object' ? body as Record<string, unknown> : {}
        throw new ApiError({
          status: response.status,
          code: typeof error.code === 'string' ? error.code : 'http_error',
          message: typeof error.message === 'string' ? error.message : statusMessages[response.status] ?? `Request failed (${response.status}).`,
          request_id: typeof error.request_id === 'string' ? error.request_id : response.headers.get('X-Request-ID'),
        })
      }
      if (responseType === 'blob') return await response.blob() as T
      try { return await response.json() as T }
      catch (error) {
        if (controller.signal.aborted) throw error
        throw new ApiError({ status: response.status, code: 'invalid_response', message: 'The data service returned an unreadable response.' })
      }
    } catch (error) {
      if (error instanceof ApiError) throw error
      if (signal?.aborted) throw new DOMException('Request cancelled.', 'AbortError')
      if (timedOut) throw new ApiError({ code: 'timeout', status: 0, message: 'This query took too long. Try a shorter date range or a single cell.' })
      if (error instanceof DOMException && error.name === 'AbortError') throw error
      throw new ApiError({ message: connectionMessage(base), code: 'network', status: 0 })
    } finally {
      clearTimeout(timeout)
      signal?.removeEventListener('abort', abort)
    }
  }
}
/** Every request resolves the live endpoint, so Settings overrides apply instantly. */
export const request = createApiClient(effectiveApiBaseUrl)
export function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'The requested data could not be loaded.'
}
