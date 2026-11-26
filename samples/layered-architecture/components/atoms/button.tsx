import type { ButtonHTMLAttributes } from 'react'

type Variant = 'primary' | 'secondary' | 'danger'

/** atom: 더 쪼갤 수 없는 단위. 도메인 지식이 없고 디자인 토큰(variant)만 안다 */
export function Button({
  variant = 'primary',
  type = 'button',
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return <button type={type} className={['btn', `btn-${variant}`, className].filter(Boolean).join(' ')} {...props} />
}
