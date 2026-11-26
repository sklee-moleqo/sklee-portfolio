// ----------------------------------------------------------------------
// AI 채점 추천 실행기 (시작 → 상태 폴링 → 결과)
//
// AI 채점은 수 초~수십 초 걸리는 비동기 작업이다. 화면은 "실행 요청"을 보내고 작업 ID로
// 상태를 폴링해 결과를 받는다. 실무에서 겪은 문제와 이 모듈의 대응은 다음과 같다.
//
// - 버튼을 연타하거나 같은 답안을 다시 열면 같은 작업이 중복 요청된다
//   → 같은 key로 진행 중인 작업이 있으면 새로 시작하지 않고 그 결과를 함께 기다린다.
// - 응답이 늦어지면 로딩이 끝나지 않는다
//   → 전체 대기 시간에 상한을 두고, 넘으면 'timeout'으로 끝내 화면이 복구 버튼을 보여준다.
// - 폴링 간격이 고정이면 서버 부하가 커진다
//   → 간격을 점점 늘린다(지수 백오프, 상한 있음).
// - 다른 답안으로 넘어가면 앞 작업의 결과가 늦게 도착해 화면을 덮는다
//   → AbortSignal로 취소하고, 취소된 작업은 결과를 돌려주지 않는다.
// - 폴링 한 번이 네트워크 오류로 실패해도 작업 자체는 살아 있다
//   → 일시 오류는 몇 번까지 넘기고 계속 폴링한다.
// ----------------------------------------------------------------------

export type AiJobPoll<R> =
  | { state: 'RUNNING' }
  | { state: 'DONE'; result: R }
  | { state: 'FAILED'; reason: string }

export interface AiJobApi<R> {
  start: (key: string) => Promise<{ jobId: string }>
  poll: (jobId: string) => Promise<AiJobPoll<R>>
}

export type AiJobOutcome<R> =
  | { kind: 'done'; result: R }
  | { kind: 'failed'; reason: string }
  | { kind: 'timeout' }
  | { kind: 'aborted' }

export interface AiJobRunnerOptions {
  initialIntervalMs?: number
  maxIntervalMs?: number
  timeoutMs?: number
  /** 연속으로 몇 번까지 폴링 오류를 넘길지 */
  maxPollErrors?: number
  /** 테스트에서 시간을 제어한다 */
  sleep?: (ms: number) => Promise<void>
  now?: () => number
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

export function createAiJobRunner<R>(api: AiJobApi<R>, options: AiJobRunnerOptions = {}) {
  const {
    initialIntervalMs = 1_000,
    maxIntervalMs = 8_000,
    timeoutMs = 60_000,
    maxPollErrors = 3,
    sleep = defaultSleep,
    now = Date.now
  } = options

  const inFlight = new Map<string, Promise<AiJobOutcome<R>>>()

  const execute = async (key: string): Promise<AiJobOutcome<R>> => {
    const startedAt = now()
    let jobId: string
    try {
      ;({ jobId } = await api.start(key))
    } catch (error) {
      return { kind: 'failed', reason: errorMessage(error) }
    }

    let interval = initialIntervalMs
    let pollErrors = 0
    for (;;) {
      if (now() - startedAt >= timeoutMs) return { kind: 'timeout' }
      await sleep(interval)
      interval = Math.min(interval * 2, maxIntervalMs)

      let poll: AiJobPoll<R>
      try {
        poll = await api.poll(jobId)
        pollErrors = 0
      } catch (error) {
        pollErrors += 1
        if (pollErrors > maxPollErrors) return { kind: 'failed', reason: errorMessage(error) }
        continue
      }

      if (poll.state === 'DONE') return { kind: 'done', result: poll.result }
      if (poll.state === 'FAILED') return { kind: 'failed', reason: poll.reason }
    }
  }

  return {
    /**
     * key(예: 답안 ID)로 AI 추천을 받는다. 같은 key가 진행 중이면 그 작업에 합류한다.
     * signal이 취소되면 이 호출부만 'aborted'를 받고, 작업 자체는 다른 대기자를 위해 계속된다.
     */
    run(key: string, signal?: AbortSignal): Promise<AiJobOutcome<R>> {
      if (signal?.aborted) return Promise.resolve({ kind: 'aborted' })

      let job = inFlight.get(key)
      if (!job) {
        job = execute(key).finally(() => inFlight.delete(key))
        inFlight.set(key, job)
      }
      if (!signal) return job

      return new Promise((resolve) => {
        const onAbort = () => resolve({ kind: 'aborted' })
        signal.addEventListener('abort', onAbort, { once: true })
        job.then((outcome) => {
          signal.removeEventListener('abort', onAbort)
          resolve(outcome)
        })
      })
    },
    isRunning: (key: string) => inFlight.has(key)
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
