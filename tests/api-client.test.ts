import assert from 'node:assert/strict'
import test from 'node:test'
import { ApiError, buildApiUrl, createApiClient } from '../src/services/api/client.ts'

function json(body: unknown, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } })
}

test('API origin and version suffix never duplicate the documented prefix', () => {
  assert.equal(buildApiUrl('http://127.0.0.1:8000/', '/api/v1/regions'), 'http://127.0.0.1:8000/api/v1/regions')
  assert.equal(buildApiUrl('http://127.0.0.1:8000/api/v1/', '/api/v1/observations?page_size=2'), 'http://127.0.0.1:8000/api/v1/observations?page_size=2')
})

test('JSON reads preserve null and zero and do not send operator credentials', async () => {
  const client = createApiClient('http://localhost:8000', async (url, init) => {
    assert.equal(String(url), 'http://localhost:8000/api/v1/observations')
    const headers = new Headers(init?.headers)
    assert.equal(headers.get('Accept'), 'application/json')
    assert.equal(headers.has('Content-Type'), false)
    assert.equal(headers.has('X-Import-Key'), false)
    assert.equal(init?.credentials, undefined)
    return json({ values: { missing: null, measured: 0 } })
  })
  assert.deepEqual(await client('/api/v1/observations'), { values: { missing: null, measured: 0 } })
})

for (const status of [404, 409, 422, 501, 503]) {
  test(`HTTP ${status} preserves structured service messages and request identity`, async () => {
    const client = createApiClient('http://localhost:8000', async () => json({
      code: 'verified_backend_code', message: 'The selected historical interval is unavailable.', status, request_id: 'request-test-123',
    }, status))
    await assert.rejects(client('/api/v1/analysis/trends'), (error: unknown) => {
      assert.ok(error instanceof ApiError)
      assert.equal(error.status, status)
      assert.equal(error.code, 'verified_backend_code')
      assert.equal(error.message, 'The selected historical interval is unavailable.')
      assert.equal(error.requestId, 'request-test-123')
      return true
    })
  })
}

test('non-JSON error bodies use a friendly status message and safe request header', async () => {
  const client = createApiClient('http://localhost:8000', async () => new Response('<html>service unavailable</html>', {
    status: 503, headers: { 'X-Request-ID': 'header-request-1' },
  }))
  await assert.rejects(client('/api/v1/regions'), (error: unknown) => {
    assert.ok(error instanceof ApiError)
    assert.equal(error.status, 503)
    assert.equal(error.requestId, 'header-request-1')
    assert.match(error.message, /temporarily unavailable/)
    assert.doesNotMatch(error.message, /html/)
    return true
  })
})

test('explicit cancellation remains an AbortError instead of a network/demo fallback', async () => {
  const controller = new AbortController()
  const client = createApiClient('http://localhost:8000', async (_url, init) => new Promise<Response>((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true })
  }))
  const pending = client('/api/v1/analysis/trends', { signal: controller.signal })
  controller.abort()
  await assert.rejects(pending, { name: 'AbortError' })
})

test('a query deadline aborts the HTTP request and returns an actionable timeout', async () => {
  let aborted = false
  const client = createApiClient('http://localhost:8000', async (_url, init) => new Promise<Response>((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () => { aborted = true; reject(new DOMException('aborted', 'AbortError')) }, { once: true })
  }))
  await assert.rejects(client('/api/v1/analysis/trends', { timeoutMs: 5 }), (error: unknown) => {
    assert.ok(error instanceof ApiError)
    assert.equal(error.code, 'timeout')
    assert.equal(error.status, 0)
    return true
  })
  assert.equal(aborted, true)
})

test('unreadable success JSON is a response error and never manufactured data', async () => {
  const client = createApiClient('http://localhost:8000', async () => new Response('not-json', { status: 200 }))
  await assert.rejects(client('/api/v1/observations'), (error: unknown) => error instanceof ApiError && error.code === 'invalid_response')
})

test('network failure surfaces a connection error without fallback', async () => {
  const client = createApiClient('http://localhost:8000', async () => { throw new TypeError('fetch failed') })
  await assert.rejects(client('/api/v1/observations'), (error: unknown) => error instanceof ApiError && error.code === 'network')
})

test('explicit file response mode preserves text instead of JSON parsing', async () => {
  const client = createApiClient('http://localhost:8000', async () => new Response('date,value\n2022-01-01,0\n'))
  const blob = await client<Blob>('/api/v1/example', { responseType: 'blob' })
  assert.equal(await blob.text(), 'date,value\n2022-01-01,0\n')
})
