import { useCallback, useEffect, useRef, useState } from 'react'

import type { AiJobOutcome, createAiJobRunner } from './ai-job-runner.js'

export interface AiSuggestion {
  score: number
  comment: string
}

export type AiSuggestionState =
  | { status: 'idle' }
  | { status: 'running' }
  | { status: 'ready'; suggestion: AiSuggestion }
  | { status: 'error'; message: string }

type Runner = ReturnType<typeof createAiJobRunner<AiSuggestion>>

/**
 * 답안 하나에 대한 AI 추천 상태를 관리한다.
 * - 답안이 바뀌면 이전 작업을 취소해 늦게 온 결과가 새 답안 화면을 덮지 않게 한다.
 * - 채점자가 점수를 반영해도 추천 결과는 지우지 않는다(비교해 보며 수정할 수 있게).
 */
export function useAiSuggestion(runner: Runner, answerId: string) {
  const [state, setState] = useState<AiSuggestionState>({ status: 'idle' })
  const controllerRef = useRef<AbortController | null>(null)

  useEffect(() => {
    setState({ status: 'idle' })
    return () => controllerRef.current?.abort()
  }, [answerId])

  const request = useCallback(async () => {
    controllerRef.current?.abort()
    const controller = new AbortController()
    controllerRef.current = controller

    setState({ status: 'running' })
    const outcome = await runner.run(answerId, controller.signal)
    if (outcome.kind !== 'aborted') setState(toState(outcome))
  }, [runner, answerId])

  return { state, request }
}

function toState(outcome: Exclude<AiJobOutcome<AiSuggestion>, { kind: 'aborted' }>): AiSuggestionState {
  switch (outcome.kind) {
    case 'done':
      return { status: 'ready', suggestion: outcome.result }
    case 'timeout':
      return { status: 'error', message: 'AI 응답이 지연되고 있습니다. 다시 시도해 주세요.' }
    case 'failed':
      return { status: 'error', message: 'AI 채점에 실패했습니다. 직접 채점하거나 다시 시도해 주세요.' }
  }
}
