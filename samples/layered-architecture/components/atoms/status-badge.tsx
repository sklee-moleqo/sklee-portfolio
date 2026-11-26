export type BadgeTone = 'neutral' | 'success' | 'warning'

/** atom: 상태를 색으로만 구분하지 않도록 글자를 항상 함께 보여준다 (접근성) */
export function StatusBadge({ tone, label }: { tone: BadgeTone; label: string }) {
  return <span className={`badge badge-${tone}`}>{label}</span>
}
