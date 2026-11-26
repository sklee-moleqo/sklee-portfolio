import assert from 'node:assert/strict'
import { test } from 'node:test'

import { classifyTenantResponse, createTenantResolver } from './tenant-resolver.js'

const active = (tenantId: string) => ({
  status: 200,
  body: { success: true, data: { tenantId, status: 'ACTIVE', locale: 'ko-KR' } }
})

test('서버 장애는 없는 테넌트가 아니라 UNAVAILABLE로 판정한다', () => {
  assert.equal(classifyTenantResponse(503, null).status, 'UNAVAILABLE')
  assert.equal(classifyTenantResponse(429, {}).status, 'UNAVAILABLE')
  assert.equal(classifyTenantResponse(200, null).status, 'UNAVAILABLE')
  assert.equal(
    classifyTenantResponse(200, { success: false, data: { status: 'STOPPED' } }).status,
    'NOT_FOUND'
  )
  assert.deepEqual(classifyTenantResponse(200, active('t-1').body), {
    status: 'ACTIVE',
    tenant: { tenantId: 't-1', locale: 'ko-KR' }
  })
})

test('ACTIVE는 TTL 동안 캐시하고 Host는 대소문자·포트를 무시한다', async () => {
  let clock = 0
  let calls = 0
  const resolver = createTenantResolver({
    fetchTenantInfo: async () => {
      calls += 1
      return active('t-1')
    },
    ttlMs: { ACTIVE: 1_000 },
    now: () => clock
  })

  await resolver.resolve('a.example.com')
  await resolver.resolve('A.Example.com:3000')
  assert.equal(calls, 1)

  clock = 1_001
  await resolver.resolve('a.example.com')
  assert.equal(calls, 2)
})

test('장애 결과는 캐시하지 않아 복구 즉시 정상으로 돌아온다', async () => {
  let down = true
  let calls = 0
  const resolver = createTenantResolver({
    fetchTenantInfo: async () => {
      calls += 1
      if (down) throw new Error('timeout')
      return active('t-1')
    }
  })

  assert.equal((await resolver.resolve('a.example.com')).status, 'UNAVAILABLE')
  down = false
  assert.equal((await resolver.resolve('a.example.com')).status, 'ACTIVE')
  assert.equal(calls, 2)
})

test('동시에 들어온 요청은 조회 한 건을 공유한다', async () => {
  let calls = 0
  const resolver = createTenantResolver({
    fetchTenantInfo: async () => {
      calls += 1
      await new Promise((r) => setTimeout(r, 5))
      return active('t-1')
    }
  })

  await Promise.all([1, 2, 3, 4].map(() => resolver.resolve('a.example.com')))
  assert.equal(calls, 1)
})

test('임의 Host가 쏟아져도 캐시는 상한을 넘지 않는다', async () => {
  let calls = 0
  const resolver = createTenantResolver({
    fetchTenantInfo: async () => {
      calls += 1
      return { status: 200, body: { success: false } }
    },
    maxEntries: 3
  })

  for (let i = 0; i < 10; i += 1) await resolver.resolve(`h${i}.example.com`)
  // 상한을 넘으면 캐시를 비우므로 처음 Host는 다시 조회된다
  await resolver.resolve('h0.example.com')
  assert.equal(calls, 11)
})
