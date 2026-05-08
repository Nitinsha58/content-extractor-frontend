import { useState } from 'react'
import { Tag, Plus, X } from 'lucide-react'

const COLOR_OPTIONS = [
  { id: 'gray',   dot: 'bg-gray-400'   },
  { id: 'red',    dot: 'bg-red-400'    },
  { id: 'blue',   dot: 'bg-blue-400'   },
  { id: 'green',  dot: 'bg-green-400'  },
  { id: 'yellow', dot: 'bg-yellow-400' },
  { id: 'purple', dot: 'bg-purple-400' },
]

const DOT_COLORS = {
  gray:   'bg-gray-400',
  red:    'bg-red-400',
  blue:   'bg-blue-400',
  green:  'bg-green-400',
  yellow: 'bg-yellow-400',
  purple: 'bg-purple-400',
}

export default function TagList({ tags, selectedTagId, onSelect, onCreate, onDelete }) {
  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState('')
  const [color, setColor] = useState('gray')

  const handleCreate = async (e) => {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return
    await onCreate(trimmed, color)
    setName('')
    setColor('gray')
    setShowForm(false)
  }

  if (tags.length === 0 && !showForm) {
    return (
      <div>
        <div className="px-3 py-2 text-xs text-gray-600 flex items-center gap-2">
          <Tag size={13} />
          <span>No tags yet</span>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-gray-500 hover:text-gray-300 hover:bg-gray-800 rounded-lg transition-colors"
        >
          <Plus size={12} /> Add tag
        </button>
      </div>
    )
  }

  return (
    <div>
      <ul className="space-y-0.5 mb-1">
        {tags.map(tag => (
          <li key={tag.id}>
            <div
              onClick={() => onSelect(selectedTagId === tag.id ? null : tag.id)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg cursor-pointer group transition-colors text-xs ${
                selectedTagId === tag.id
                  ? 'bg-gray-700 text-gray-100'
                  : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'
              }`}
            >
              <span className={`w-2 h-2 rounded-full shrink-0 ${DOT_COLORS[tag.color] || 'bg-gray-400'}`} />
              <span className="flex-1 truncate">{tag.name}</span>
              {tag.doc_count > 0 && (
                <span className="text-gray-600 text-xs">{tag.doc_count}</span>
              )}
              <button
                onClick={e => { e.stopPropagation(); onDelete(tag.id) }}
                className="opacity-0 group-hover:opacity-100 text-gray-600 hover:text-red-400 transition"
              >
                <X size={11} />
              </button>
            </div>
          </li>
        ))}
      </ul>

      {showForm ? (
        <form onSubmit={handleCreate} className="px-2 py-2 space-y-1.5">
          <input
            autoFocus
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Tag name"
            className="w-full text-xs bg-gray-800 border border-gray-700 rounded-md px-2 py-1 text-gray-200
                       placeholder-gray-600 focus:outline-none focus:border-blue-500"
          />
          <div className="flex items-center gap-1.5">
            {COLOR_OPTIONS.map(c => (
              <button
                key={c.id}
                type="button"
                onClick={() => setColor(c.id)}
                className={`w-4 h-4 rounded-full ${c.dot} transition-transform ${color === c.id ? 'scale-125 ring-1 ring-white/40' : 'opacity-60'}`}
              />
            ))}
          </div>
          <div className="flex gap-1.5">
            <button
              type="submit"
              className="flex-1 text-xs bg-blue-600 hover:bg-blue-500 text-white rounded-md py-1 transition-colors"
            >
              Create
            </button>
            <button
              type="button"
              onClick={() => { setShowForm(false); setName(''); setColor('gray') }}
              className="flex-1 text-xs bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-md py-1 transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <button
          onClick={() => setShowForm(true)}
          className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-gray-600 hover:text-gray-300 hover:bg-gray-800 rounded-lg transition-colors"
        >
          <Plus size={12} /> Add tag
        </button>
      )}
    </div>
  )
}
