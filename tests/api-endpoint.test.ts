import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'
import {
  applyDiscoveredApiBaseUrl, effectiveApiBaseUrl, endpointWarning, getApiBaseUrlOverride,
  getDiscoveredApiBaseUrl, isUsingEndpointOverride, isValidEndpointUrl, setApiBaseUrlOverride,
} from '../src/services/api/endpoint.ts'

/** Node's experimental localStorage needs a file flag; tests use a Map shim. */
const stored = new Map<string, string>()
const shim = {
  getItem: (key: string) => stored.get(key) ?? null,
  setItem: (key: string, value: string) => { stored.set(key, value) },
  removeItem: (key: string) => { stored.delete(key) },
  clear: () => stored.clear(),
  key: (index: number) => [...stored.keys()][index] ?? null,
  get length() { return stored.size },
}
const savedLocation = Object.getOwnPropertyDescriptor(globalThis, 'location')
Object.defineProperty(globalThis, 'localStorage', { configurable: true, writable: true, value: shim })

afterEach(() => {
  stored.clear()
})

function withHttpsPageLocation(run: () => void) {
  Object.defineProperty(globalThis, 'location', { configurable: true, writable: true, value: { protocol: 'https:', hostname: 'example.github.io' } })
  try {
    run()
  } finally {
    if (savedLocation === undefined) delete (globalThis as Record<string, unknown>).location
    else Object.defineProperty(globalThis, 'location', savedLocation)
  }
}

test('without an override the build-time default endpoint is used', () => {
  setApiBaseUrlOverride(null)
  assert.equal(getApiBaseUrlOverride(), null)
  assert.equal(isUsingEndpointOverride(), false)
  assert.equal(effectiveApiBaseUrl(), 'http://127.0.0.1:8000')
})

test('a saved override becomes the effective endpoint and survives trailing slashes', () => {
  setApiBaseUrlOverride('https://earthtrend-api.example.com/')
  assert.equal(getApiBaseUrlOverride(), 'https://earthtrend-api.example.com')
  assert.equal(isUsingEndpointOverride(), true)
  assert.equal(effectiveApiBaseUrl(), 'https://earthtrend-api.example.com')
})

test('an empty or whitespace override falls back to the default instead of breaking requests', () => {
  setApiBaseUrlOverride('   ')
  assert.equal(getApiBaseUrlOverride(), null)
  assert.equal(effectiveApiBaseUrl(), 'http://127.0.0.1:8000')
})

test('clearing the override restores the build-time default', () => {
  setApiBaseUrlOverride('https://earthtrend-api.example.com')
  setApiBaseUrlOverride(null)
  assert.equal(isUsingEndpointOverride(), false)
  assert.equal(effectiveApiBaseUrl(), 'http://127.0.0.1:8000')
})

test('endpoint validation accepts absolute http(s) URLs only', () => {
  assert.equal(isValidEndpointUrl('https://api.example.com'), true)
  assert.equal(isValidEndpointUrl('http://localhost:8000'), true)
  assert.equal(isValidEndpointUrl('ftp://api.example.com'), false)
  assert.equal(isValidEndpointUrl('api.example.com'), false)
  assert.equal(isValidEndpointUrl(''), false)
  assert.equal(isValidEndpointUrl('not a url'), false)
})

test('plain-http remote endpoints are flagged as mixed content on secure pages', () => {
  withHttpsPageLocation(() => {
    assert.match(endpointWarning('http://api.example.com') ?? '', /mixed content/)
    assert.match(endpointWarning('http://127.0.0.1:8000') ?? '', /loopback|own machine|hosted service/)
    assert.match(endpointWarning('http://localhost:8000') ?? '', /loopback|own machine|hosted service/)
    // Even over https, a loopback endpoint only reaches the visitor's machine.
    assert.match(endpointWarning('https://localhost:8000') ?? '', /loopback|own machine|hosted service/)
    assert.equal(endpointWarning('https://api.example.com'), null)
    assert.match(endpointWarning('no-scheme') ?? '', /absolute http/)
  })
})

test('a discovered endpoint becomes effective without touching the manual override', () => {
  setApiBaseUrlOverride(null)
  applyDiscoveredApiBaseUrl(null)
  assert.equal(applyDiscoveredApiBaseUrl('https://tunnel-a.trycloudflare.com/'), true)
  assert.equal(getDiscoveredApiBaseUrl(), 'https://tunnel-a.trycloudflare.com')
  assert.equal(effectiveApiBaseUrl(), 'https://tunnel-a.trycloudflare.com')
})

test('a manual override wins over the discovered endpoint', () => {
  assert.equal(applyDiscoveredApiBaseUrl('https://tunnel-b.trycloudflare.com'), true)
  setApiBaseUrlOverride('https://manual.example.com')
  assert.equal(effectiveApiBaseUrl(), 'https://manual.example.com')
  setApiBaseUrlOverride(null)
  assert.equal(effectiveApiBaseUrl(), 'https://tunnel-b.trycloudflare.com')
})

test('invalid or unchanged discovered endpoints are rejected without side effects', () => {
  assert.equal(applyDiscoveredApiBaseUrl('not a url'), false)
  assert.equal(applyDiscoveredApiBaseUrl('   '), false)
  assert.equal(applyDiscoveredApiBaseUrl('https://tunnel-b.trycloudflare.com'), false)
  assert.equal(getDiscoveredApiBaseUrl(), 'https://tunnel-b.trycloudflare.com')
})

test('clearing the discovered endpoint restores the build default', () => {
  assert.equal(applyDiscoveredApiBaseUrl(null), true)
  assert.equal(getDiscoveredApiBaseUrl(), null)
  assert.equal(effectiveApiBaseUrl(), 'http://127.0.0.1:8000')
  assert.equal(applyDiscoveredApiBaseUrl(null), false)
})
