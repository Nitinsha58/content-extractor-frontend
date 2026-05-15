import { useState } from 'react'
import { Fragment } from '@tiptap/pm/model'

export function moveBlock(editor, getPos, direction) {
  const pos = getPos?.()
  if (pos == null || !editor) return
  const { doc } = editor.state

  if (direction === 'up') {
    const $pos = doc.resolve(pos)
    const prev = $pos.nodeBefore
    if (!prev) return
    const cur = doc.nodeAt(pos)
    if (!cur) return
    editor.chain().command(({ tr }) => {
      tr.replaceWith(pos - prev.nodeSize, pos + cur.nodeSize, Fragment.from([cur, prev]))
      return true
    }).run()
  } else {
    const cur = doc.nodeAt(pos)
    if (!cur) return
    const nextPos = pos + cur.nodeSize
    const next = doc.nodeAt(nextPos)
    if (!next) return
    editor.chain().command(({ tr }) => {
      tr.replaceWith(pos, nextPos + next.nodeSize, Fragment.from([next, cur]))
      return true
    }).run()
  }
}

export default function BlockMenu({ editor, getPos, onDelete, convertLabel, onConvert, onCopy }) {
  const stop = (e) => { e.preventDefault(); e.stopPropagation() }

  return (
    <div
      contentEditable={false}
      className="absolute right-0 bottom-full -mb-px flex items-center gap-0.5 bg-white border border-gray-200 rounded-md shadow-sm px-1 py-0.5 z-20 select-none"
      onMouseDown={stop}
    >
      <Btn onClick={() => moveBlock(editor, getPos, 'up')} title="Move up">↑</Btn>
      <Btn onClick={() => moveBlock(editor, getPos, 'down')} title="Move down">↓</Btn>
      {onCopy && (
        <>
          <Sep />
          <CopyBtn onCopy={onCopy} />
        </>
      )}
      {convertLabel && (
        <>
          <Sep />
          <Btn onClick={onConvert} title={`Convert to ${convertLabel}`}>{convertLabel}</Btn>
        </>
      )}
      <Sep />
      <Btn onClick={onDelete} title="Delete" danger>✕</Btn>
    </div>
  )
}

function Btn({ onClick, title, danger, children }) {
  return (
    <button
      className={`px-1.5 py-0.5 rounded text-xs font-medium leading-none transition-colors ${
        danger ? 'text-red-400 hover:bg-red-50' : 'text-gray-400 hover:bg-gray-100'
      }`}
      title={title}
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); onClick?.() }}
    >
      {children}
    </button>
  )
}

function CopyBtn({ onCopy }) {
  const [copied, setCopied] = useState(false)
  const handleCopy = () => {
    onCopy()
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }
  return (
    <button
      className="px-1.5 py-0.5 rounded text-xs font-medium leading-none transition-colors text-gray-400 hover:bg-gray-100"
      title="Copy block text"
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleCopy() }}
    >
      {copied ? '✓' : '⎘'}
    </button>
  )
}

function Sep() {
  return <div className="w-px h-3 bg-gray-200 mx-0.5 shrink-0" />
}
