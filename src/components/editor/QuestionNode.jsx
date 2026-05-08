import ParagraphNode from './ParagraphNode'

export default function QuestionNode({ node, onChange, onSelect, isHighlighted }) {
  const handleStemChange = (updated) => {
    onChange({ ...node, stem: updated.content })
  }

  const handleOptionChange = (optIdx, updated) => {
    const options = node.options.map((o, i) => i === optIdx ? { ...o, content: updated.content } : o)
    onChange({ ...node, options })
  }

  return (
    <div
      className={`my-3 rounded px-2 py-1 cursor-pointer ${
        isHighlighted ? 'ring-2 ring-yellow-400 bg-yellow-50' : 'hover:bg-gray-50'
      }`}
      onClick={onSelect}
    >
      {/* Question stem */}
      <div className="flex gap-2 items-start">
        <span className="font-semibold text-gray-700 shrink-0 mt-0.5">
          {node.number != null ? `Q${node.number}.` : 'Q.'}
        </span>
        <ParagraphNode
          node={{ ...node, content: node.stem || [] }}
          onChange={handleStemChange}
          onSelect={() => {}}
          isHighlighted={false}
        />
      </div>

      {/* Options */}
      {(node.options || []).length > 0 && (
        <div className="mt-2 ml-6 space-y-1">
          {node.options.map((opt, i) => (
            <div key={i} className="flex gap-2 items-start">
              <span className="font-medium text-gray-600 shrink-0 w-6">{opt.label}.</span>
              <ParagraphNode
                node={{ ...node, content: opt.content || [] }}
                onChange={(updated) => handleOptionChange(i, updated)}
                onSelect={() => {}}
                isHighlighted={false}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
