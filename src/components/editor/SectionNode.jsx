import { useRef, useState } from 'react'
import InlineContent from './InlineContent'

export default function SectionNode({ node, onChange, onSelect, isHighlighted }) {
  const [editing, setEditing] = useState(false)
  const headingRef = useRef(null)

  const headingText = (node.heading || []).map(b => b.value ?? '').join(' ').trim()

  const handleBlur = () => {
    setEditing(false)
    const newText = headingRef.current?.innerText ?? headingText
    if (newText !== headingText) {
      onChange({ ...node, heading: [{ type: 'text', value: newText }] })
    }
  }

  return (
    <div
      className={`mt-6 mb-2 cursor-pointer rounded px-1 ${isHighlighted ? 'ring-2 ring-yellow-400 bg-yellow-50' : ''}`}
      onClick={onSelect}
    >
      {editing ? (
        <h2
          ref={headingRef}
          contentEditable
          suppressContentEditableWarning
          onBlur={handleBlur}
          className="text-xl font-bold text-gray-900 outline-none border-b-2 border-blue-400"
        >
          {headingText}
        </h2>
      ) : (
        <h2
          className="text-xl font-bold text-gray-900 border-b border-gray-200 pb-1 hover:border-blue-300 transition-colors"
          onDoubleClick={() => setEditing(true)}
        >
          <InlineContent content={node.heading || []} />
        </h2>
      )}
    </div>
  )
}
