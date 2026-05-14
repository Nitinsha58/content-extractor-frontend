import { useCallback, useEffect, useState } from 'react'

export function useEditableNode({ currentValue, inputRef, onCommit, alwaysCommit = false }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(currentValue)

  useEffect(() => {
    setDraft(currentValue)
  }, [currentValue])

  useEffect(() => {
    if (editing && inputRef?.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [editing])

  const commit = useCallback(() => {
    setEditing(false)
    const trimmed = draft.trim()
    if (alwaysCommit || (trimmed && trimmed !== currentValue)) {
      try { onCommit(trimmed) } catch { /* editor destroyed during navigation */ }
    } else {
      setDraft(currentValue)
    }
  }, [draft, currentValue, onCommit, alwaysCommit])

  const cancel = useCallback(() => {
    setEditing(false)
    setDraft(currentValue)
  }, [currentValue])

  return { editing, setEditing, draft, setDraft, commit, cancel }
}
