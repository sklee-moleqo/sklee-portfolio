import { keepPreviousData, useQuery } from '@tanstack/react-query'

// ----------------------------------------------------------------------
// Data Layer: HTTP와 서버 상태를 다루는 유일한 곳.
// 화면(sections)은 이 훅만 부르고 엔드포인트·응답 형태·캐시 키를 모른다.
// 서버 응답을 화면용 모델로 바꾸는 것도 여기서 끝낸다.
// ----------------------------------------------------------------------

export type ExamStatus = 'READY' | 'OPEN' | 'CLOSED'

export interface Exam {
  id: string
  title: string
  status: ExamStatus
  startsAt: Date
}

export interface ExamListParams {
  keyword: string
  page: number
}

/** 서버 응답 (화면에 노출하지 않는다) */
interface ExamListResponse {
  items: { examId: string; examName: string; statusCode: ExamStatus; startAt: string }[]
  totalCount: number
}

export const examKeys = {
  all: ['exams'] as const,
  list: (params: ExamListParams) => [...examKeys.all, 'list', params] as const
}

async function fetchExamList(params: ExamListParams, signal: AbortSignal) {
  const query = new URLSearchParams({ keyword: params.keyword, page: String(params.page) })
  const response = await fetch(`/api/exams?${query}`, { signal })
  if (!response.ok) throw new Error(`시험 목록 조회 실패 (${response.status})`)
  return (await response.json()) as ExamListResponse
}

export function useExamList(params: ExamListParams) {
  return useQuery({
    queryKey: examKeys.list(params),
    queryFn: ({ signal }) => fetchExamList(params, signal),
    // 페이지를 넘길 때 표가 비었다 채워지며 깜빡이지 않게 이전 결과를 유지한다
    placeholderData: keepPreviousData,
    select: (data) => ({
      total: data.totalCount,
      exams: data.items.map(
        (item): Exam => ({
          id: item.examId,
          title: item.examName,
          status: item.statusCode,
          startsAt: new Date(item.startAt)
        })
      )
    })
  })
}
