import { useId, useState, type FormEvent } from 'react'

import { Button } from '../atoms/button.js'

/** molecule: atom 몇 개를 묶어 하나의 동작(검색)을 만든다. 무엇을 검색하는지는 모른다 */
export function SearchField({
  label,
  defaultValue = '',
  onSearch
}: {
  label: string
  defaultValue?: string
  onSearch: (keyword: string) => void
}) {
  const id = useId()
  const [value, setValue] = useState(defaultValue)

  const submit = (event: FormEvent) => {
    event.preventDefault()
    onSearch(value.trim())
  }

  return (
    <form role='search' onSubmit={submit}>
      <label htmlFor={id}>{label}</label>
      <input id={id} value={value} onChange={(e) => setValue(e.target.value)} />
      <Button type='submit'>검색</Button>
    </form>
  )
}
