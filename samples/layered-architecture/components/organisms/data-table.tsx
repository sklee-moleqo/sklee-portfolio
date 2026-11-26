import type { ReactNode } from 'react'

export interface Column<Row> {
  key: string
  header: string
  render: (row: Row) => ReactNode
}

/**
 * organism: 목록 화면 어디서나 쓰는 표. 행 타입은 제네릭으로 받아 도메인을 모른다.
 * 로딩·빈 결과·오류 상태를 표 안에서 일관되게 보여줘 화면마다 따로 만들지 않는다.
 */
export function DataTable<Row>({
  caption,
  columns,
  rows,
  getRowKey,
  isLoading,
  errorMessage,
  emptyMessage = '조회된 항목이 없습니다.'
}: {
  caption: string
  columns: Column<Row>[]
  rows: Row[]
  getRowKey: (row: Row) => string
  isLoading?: boolean
  errorMessage?: string | null
  emptyMessage?: string
}) {
  const status = isLoading ? '불러오는 중…' : errorMessage ? errorMessage : rows.length === 0 ? emptyMessage : null

  return (
    <table aria-busy={isLoading}>
      <caption>{caption}</caption>
      <thead>
        <tr>
          {columns.map((column) => (
            <th key={column.key} scope='col'>
              {column.header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {status ? (
          <tr>
            <td colSpan={columns.length} role={errorMessage ? 'alert' : undefined}>
              {status}
            </td>
          </tr>
        ) : (
          rows.map((row) => (
            <tr key={getRowKey(row)}>
              {columns.map((column) => (
                <td key={column.key}>{column.render(row)}</td>
              ))}
            </tr>
          ))
        )}
      </tbody>
    </table>
  )
}
