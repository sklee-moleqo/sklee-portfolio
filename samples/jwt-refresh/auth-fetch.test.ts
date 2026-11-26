import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createAuthFetch, type SessionEndReason } from './auth-fetch.js'

const json = (status: number, body: unknown = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  })

/** 'valid' 토큰만 통과시키는 가짜 서버 */
function fakeServer(validToken = 'valid') {
  const calls: { url: string; auth: string | null }[] = []
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    const auth = new Headers(init?.headers).get('Authorization')
    calls.push({ url, auth })
    return auth === `Bearer ${validToken}` ? json(200, { ok: true }) : json(401)
  }) as typeof fetch
  return { calls, fetchImpl }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((r) => (resolve = r))
  return { promise, resolve }
}

test('동시에 401이 나도 재발급은 한 번만 하고 모든 요청을 재시도한다', async () => {
  const server = fakeServer()
  let refreshCount = 0
  const authFetch = createAuthFetch({
    getAccessToken: () => 'expired',
    refresh: async () => {
      refreshCount += 1
      return 'valid'
    },
    onSessionEnd: () => assert.fail('세션이 끝나면 안 된다'),
    fetchImpl: server.fetchImpl
  })

  const results = await Promise.all(['/a', '/b', '/c'].map((url) => authFetch(url)))

  assert.equal(refreshCount, 1)
  assert.deepEqual(
    results.map((r) => r.status),
    [200, 200, 200]
  )
})

test('재발급에 실패하면 세션 종료를 한 번만 알린다', async () => {
  const server = fakeServer()
  const reasons: SessionEndReason[] = []
  const authFetch = createAuthFetch({
    getAccessToken: () => 'expired',
    refresh: async () => null,
    onSessionEnd: (reason) => reasons.push(reason),
    fetchImpl: server.fetchImpl
  })

  await Promise.all([authFetch('/a'), authFetch('/b')])

  assert.deepEqual(reasons, ['refresh-failed'])
})

test('서버가 세션 종료를 확정하면 재발급하지 않는다', async () => {
  let refreshCount = 0
  const reasons: SessionEndReason[] = []
  const authFetch = createAuthFetch({
    getAccessToken: () => 'expired',
    refresh: async () => {
      refreshCount += 1
      return 'valid'
    },
    onSessionEnd: (reason) => reasons.push(reason),
    sessionEndCodes: ['SESSION_EXPIRED'],
    fetchImpl: (async () => json(401, { code: 'SESSION_EXPIRED' })) as typeof fetch
  })

  const response = await authFetch('/a')

  assert.equal(refreshCount, 0)
  assert.deepEqual(reasons, ['session-expired'])
  // 호출부가 원래 응답 본문을 그대로 읽을 수 있어야 한다
  assert.deepEqual(await response.json(), { code: 'SESSION_EXPIRED' })
})

test('새 토큰으로도 401이면 한 번만 재시도하고 멈춘다', async () => {
  const server = fakeServer('never-valid')
  let refreshCount = 0
  const authFetch = createAuthFetch({
    getAccessToken: () => 'expired',
    refresh: async () => {
      refreshCount += 1
      return 'valid'
    },
    onSessionEnd: () => {},
    fetchImpl: server.fetchImpl
  })

  const response = await authFetch('/a')

  assert.equal(response.status, 401)
  assert.equal(refreshCount, 1)
  assert.equal(server.calls.length, 2)
})

test('로그인·재발급 API의 401은 재발급 대상이 아니다', async () => {
  const server = fakeServer()
  let refreshCount = 0
  const authFetch = createAuthFetch({
    getAccessToken: () => 'expired',
    refresh: async () => {
      refreshCount += 1
      return 'valid'
    },
    onSessionEnd: () => {},
    isPublicUrl: (url) => url.startsWith('/auth/login'),
    fetchImpl: server.fetchImpl
  })

  await authFetch('/auth/login')
  await authFetch('/auth/refresh')

  assert.equal(refreshCount, 0)
  // 공개 API에는 남아 있던 토큰을 싣지 않는다
  assert.equal(server.calls[0]?.auth, null)
})

test('재발급 도중 새로 로그인하면 늦게 도착한 토큰을 쓰지 않는다', async () => {
  const server = fakeServer()
  const pending = deferred<string | null>()
  const authFetch = createAuthFetch({
    getAccessToken: () => 'expired',
    refresh: () => pending.promise,
    onSessionEnd: () => {},
    fetchImpl: server.fetchImpl
  })

  const request = authFetch('/a')
  await new Promise((r) => setImmediate(r))

  authFetch.startSession() // 다른 탭에서 다시 로그인한 상황
  pending.resolve('valid')

  const response = await request
  assert.equal(response.status, 401)
  assert.equal(
    server.calls.filter((c) => c.auth === 'Bearer valid').length,
    0,
    '이전 세션의 재발급 토큰으로 재시도하면 안 된다'
  )
})
