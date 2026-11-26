import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createAiJobRunner, type AiJobApi, type AiJobPoll } from './ai-job-runner.js'

/** 실제로 기다리지 않고 가상 시계만 앞으로 돌리는 sleep */
function virtualClock() {
  let time = 0
  const waits: number[] = []
  return {
    now: () => time,
    sleep: async (ms: number) => {
      waits.push(ms)
      time += ms
    },
    waits
  }
}

function scriptedApi(script: (AiJobPoll<number> | Error)[]) {
  let starts = 0
  const api: AiJobApi<number> = {
    start: async () => {
      starts += 1
      return { jobId: 'job-1' }
    },
    poll: async () => {
      const next = script.shift() ?? { state: 'RUNNING' }
      if (next instanceof Error) throw next
      return next
    }
  }
  return { api, starts: () => starts }
}

test('완료될 때까지 간격을 늘려 가며 폴링한다', async () => {
  const clock = virtualClock()
  const { api } = scriptedApi([
    { state: 'RUNNING' },
    { state: 'RUNNING' },
    { state: 'RUNNING' },
    { state: 'DONE', result: 8 }
  ])
  const runner = createAiJobRunner(api, { ...clock, initialIntervalMs: 500, maxIntervalMs: 2_000 })

  assert.deepEqual(await runner.run('answer-1'), { kind: 'done', result: 8 })
  assert.deepEqual(clock.waits, [500, 1_000, 2_000, 2_000])
})

test('같은 답안을 연달아 요청해도 작업은 한 번만 시작한다', async () => {
  const { api, starts } = scriptedApi([{ state: 'DONE', result: 5 }])
  const runner = createAiJobRunner(api, { sleep: async () => {} })

  const [a, b] = await Promise.all([runner.run('answer-1'), runner.run('answer-1')])

  assert.equal(starts(), 1)
  assert.deepEqual(a, b)
  assert.equal(runner.isRunning('answer-1'), false)
})

test('대기 시간 상한을 넘으면 timeout으로 끝낸다', async () => {
  const clock = virtualClock()
  const { api } = scriptedApi([])
  const runner = createAiJobRunner(api, { ...clock, initialIntervalMs: 1_000, timeoutMs: 5_000 })

  assert.deepEqual(await runner.run('answer-1'), { kind: 'timeout' })
})

test('일시적인 폴링 오류는 넘기고, 연속으로 쌓이면 실패로 끝낸다', async () => {
  const sleep = async () => {}
  const recovered = scriptedApi([new Error('network'), new Error('network'), { state: 'DONE', result: 3 }])
  assert.deepEqual(await createAiJobRunner(recovered.api, { sleep }).run('a'), {
    kind: 'done',
    result: 3
  })

  const broken = scriptedApi([new Error('e1'), new Error('e2'), new Error('e3')])
  assert.deepEqual(await createAiJobRunner(broken.api, { sleep, maxPollErrors: 2 }).run('a'), {
    kind: 'failed',
    reason: 'e3'
  })
})

test('다른 답안으로 넘어가 취소하면 늦게 온 결과를 받지 않는다', async () => {
  let release!: () => void
  const gate = new Promise<void>((r) => (release = r))
  const { api } = scriptedApi([{ state: 'DONE', result: 9 }])
  const runner = createAiJobRunner(api, { sleep: () => gate })

  const controller = new AbortController()
  const pending = runner.run('answer-1', controller.signal)
  controller.abort()
  release()

  assert.deepEqual(await pending, { kind: 'aborted' })
})
