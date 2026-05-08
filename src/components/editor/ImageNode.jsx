import { useRef, useState } from 'react'

export default function ImageNode({ node, onChange, onSelect, isHighlighted }) {
  const [editingAlt, setEditingAlt] = useState(false)
  const altRef = useRef(null)

  const handleAltBlur = () => {
    setEditingAlt(false)
    const newAlt = altRef.current?.innerText ?? node.alt
    if (newAlt !== node.alt) onChange({ ...node, alt: newAlt })
  }

  return (
    <div
      className={`my-3 cursor-pointer rounded ${isHighlighted ? 'ring-2 ring-yellow-400' : 'hover:bg-gray-50'}`}
      onClick={onSelect}
    >
      {node.url ? (
        <img
          src={node.url}
          alt={node.alt}
          style={{ maxWidth: '100%', height: 'auto', display: 'block', margin: '0 auto' }}
          className="rounded"
        />
      ) : (
        <div className="border-2 border-dashed border-gray-300 rounded p-6 text-center text-sm text-gray-400">
          Figure (image unavailable)
        </div>
      )}
      <div className="text-center mt-1 text-xs text-gray-500">
        {editingAlt ? (
          <span
            ref={altRef}
            contentEditable
            suppressContentEditableWarning
            onBlur={handleAltBlur}
            className="outline-none border-b border-blue-400 px-1"
          >
            {node.alt}
          </span>
        ) : (
          <span
            className="italic hover:text-gray-700 cursor-text"
            onDoubleClick={(e) => { e.stopPropagation(); setEditingAlt(true) }}
          >
            {node.alt || 'Figure'}
          </span>
        )}
      </div>
    </div>
  )
}
