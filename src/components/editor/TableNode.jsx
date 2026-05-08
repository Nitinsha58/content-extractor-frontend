import { useRef, useState } from 'react'
import InlineContent from './InlineContent'

export default function TableNode({ node, onChange, onSelect, isHighlighted }) {
  const [editing, setEditing] = useState(null) // { row, col }
  const cellRef = useRef(null)
  const cells = node.cells || []

  const getCellText = (r, c) => {
    const cell = cells[r]?.[c] ?? []
    return cell.map(b => b.value ?? '').join('')
  }

  const handleBlur = (r, c) => {
    setEditing(null)
    const el = cellRef.current
    if (!el) return
    const newText = el.innerText
    const oldText = getCellText(r, c)
    if (newText === oldText) return
    const newCells = cells.map((row, ri) =>
      row.map((cell, ci) =>
        ri === r && ci === c ? [{ type: 'text', value: newText }] : cell
      )
    )
    onChange({ ...node, cells: newCells })
  }

  const handleKeyDown = (e, r, c) => {
    if (e.key === 'Tab') {
      e.preventDefault()
      const nextC = c + 1 < node.cols ? c + 1 : 0
      const nextR = nextC === 0 ? r + 1 : r
      if (nextR < node.rows) setEditing({ row: nextR, col: nextC })
      else setEditing(null)
    }
    if (e.key === 'Escape') setEditing(null)
  }

  return (
    <div
      className={`my-3 overflow-x-auto cursor-pointer rounded ${isHighlighted ? 'ring-2 ring-yellow-400' : ''}`}
      onClick={onSelect}
    >
      <table className="border-collapse text-sm w-full">
        <tbody>
          {cells.map((row, r) => (
            <tr key={r}>
              {row.map((cell, c) => {
                const isEditing = editing?.row === r && editing?.col === c
                return (
                  <td
                    key={c}
                    className={`border border-gray-300 px-3 py-1.5 ${
                      r === 0 ? 'bg-gray-100 font-semibold' : ''
                    } ${isEditing ? 'bg-blue-50' : 'hover:bg-gray-50'}`}
                    onDoubleClick={(e) => { e.stopPropagation(); setEditing({ row: r, col: c }) }}
                  >
                    {isEditing ? (
                      <span
                        ref={cellRef}
                        contentEditable
                        suppressContentEditableWarning
                        onBlur={() => handleBlur(r, c)}
                        onKeyDown={(e) => handleKeyDown(e, r, c)}
                        className="outline-none"
                      >
                        {getCellText(r, c)}
                      </span>
                    ) : (
                      <InlineContent content={cell} />
                    )}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
