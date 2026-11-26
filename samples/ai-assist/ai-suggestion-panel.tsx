import type { AiSuggestionState } from './use-ai-suggestion.js'

/**
 * 채점 화면 옆에 붙는 AI 추천 패널.
 * 로딩은 패널 안 버튼 영역에만 표시해 채점자가 기다리는 동안에도 답안을 읽고 점수를 입력할 수 있다.
 * AI 결과는 "추천"일 뿐이라 자동 저장하지 않고, 채점자가 반영 버튼을 눌러야 입력란에 들어간다.
 */
export function AiSuggestionPanel({
  state,
  onRequest,
  onApply
}: {
  state: AiSuggestionState
  onRequest: () => void
  onApply: (score: number, comment: string) => void
}) {
  return (
    <section aria-labelledby='ai-suggestion-title' aria-busy={state.status === 'running'}>
      <h3 id='ai-suggestion-title'>AI 채점 추천</h3>

      {state.status === 'ready' && (
        <dl>
          <dt>추천 점수</dt>
          <dd>{state.suggestion.score}점</dd>
          <dt>채점 의견</dt>
          <dd>{state.suggestion.comment}</dd>
        </dl>
      )}

      {state.status === 'error' && <p role='alert'>{state.message}</p>}

      <div>
        <button type='button' onClick={onRequest} disabled={state.status === 'running'}>
          {state.status === 'running' ? 'AI 분석 중…' : state.status === 'idle' ? 'AI 추천 받기' : '다시 분석'}
        </button>
        {state.status === 'ready' && (
          <button
            type='button'
            onClick={() => onApply(state.suggestion.score, state.suggestion.comment)}
          >
            점수·의견 반영
          </button>
        )}
      </div>
    </section>
  )
}
