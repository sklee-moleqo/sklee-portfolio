import { useState } from 'react'

import { StatusBadge, type BadgeTone } from '../../components/atoms/status-badge.js'
import { SearchField } from '../../components/molecules/search-field.js'
import { DataTable, type Column } from '../../components/organisms/data-table.js'
import { useExamList, type Exam, type ExamStatus } from '../../hooks/api/use-exam-list.js'

// ----------------------------------------------------------------------
// Domain UI Layer: 화면 조립과 사용자 상호작용.
// 상태(검색어·페이지)와 이벤트는 여기서 다루지만 HTTP는 직접 부르지 않는다.
// 도메인 지식(시험 상태를 어떤 색·문구로 보여줄지)은 이 층에만 있다.
// ----------------------------------------------------------------------

const STATUS_BADGE: Record<ExamStatus, { tone: BadgeTone; label: string }> = {
  READY: { tone: 'neutral', label: '대기' },
  OPEN: { tone: 'success', label: '진행 중' },
  CLOSED: { tone: 'warning', label: '종료' }
}

const columns: Column<Exam>[] = [
  { key: 'title', header: '시험명', render: (exam) => exam.title },
  {
    key: 'status',
    header: '상태',
    render: (exam) => <StatusBadge {...STATUS_BADGE[exam.status]} />
  },
  {
    key: 'startsAt',
    header: '시작 일시',
    render: (exam) => exam.startsAt.toLocaleString('ko-KR')
  }
]

export function ExamListView() {
  const [params, setParams] = useState({ keyword: '', page: 1 })
  const { data, isLoading, error } = useExamList(params)

  return (
    <>
      <SearchField label='시험명 검색' onSearch={(keyword) => setParams({ keyword, page: 1 })} />
      <DataTable
        caption={`시험 목록 (총 ${data?.total ?? 0}건)`}
        columns={columns}
        rows={data?.exams ?? []}
        getRowKey={(exam) => exam.id}
        isLoading={isLoading}
        errorMessage={error ? '목록을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.' : null}
      />
    </>
  )
}
