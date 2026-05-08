import { Node, mergeAttributes } from '@tiptap/core'
import { NodeViewWrapper } from '@tiptap/react'
import { guardedNodeView } from './utils'
import { useState } from 'react'
import katex from 'katex'
import BlockMenu from '../BlockMenu'

function renderInline(blocks = []) {
  return blocks.map((b, i) => {
    if (b.type === 'latex') {
      let html
      try { html = katex.renderToString(b.value, { displayMode: !!b.display, throwOnError: false }) }
      catch { html = `<code>$${b.value}$</code>` }
      return b.display
        ? <div key={i} className="text-center my-1" dangerouslySetInnerHTML={{ __html: html }} />
        : <span key={i} dangerouslySetInnerHTML={{ __html: html }} />
    }
    return <span key={i}>{b.value ?? ''}</span>
  })
}

function QuestionBlockView({ node, updateAttributes, selected, editor, getPos, deleteNode }) {
  const [editingStem, setEditingStem] = useState(false)
  const [stemDraft, setStemDraft] = useState('')
  const [hovered, setHovered] = useState(false)

  const number = node.attrs.number
  let stem = []
  let options = []
  try { stem = JSON.parse(node.attrs.stem || '[]') } catch { stem = [] }
  try { options = JSON.parse(node.attrs.options || '[]') } catch { options = [] }

  const stemText = stem.map(b => b.type === 'latex' ? (b.display ? `$$${b.value}$$` : `$${b.value}$`) : (b.value ?? '')).join('')

  const commitStem = () => {
    setEditingStem(false)
    const newBlocks = parseInlineText(stemDraft)
    try { updateAttributes({ stem: JSON.stringify(newBlocks) }) } catch { /* editor destroyed during navigation */ }
  }

  return (
    <NodeViewWrapper>
      <div
        className="relative"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        <div
          className={`my-4 rounded-lg border px-4 py-3 ${
            selected ? 'border-blue-300 bg-blue-50/30' : 'border-gray-200 bg-gray-50/50'
          }`}
        >
          <div className="flex gap-2 items-start">
            <span className="font-semibold text-gray-700 shrink-0 text-sm mt-0.5">
              {number != null ? `Q${number}.` : 'Q.'}
            </span>
            {editingStem ? (
              <textarea
                autoFocus
                defaultValue={stemText}
                onChange={(e) => setStemDraft(e.target.value)}
                onBlur={commitStem}
                onKeyDown={(e) => { if (e.key === 'Escape') setEditingStem(false); e.stopPropagation() }}
                rows={2}
                className="flex-1 text-sm border border-blue-300 rounded px-2 py-1 outline-none resize-none bg-white font-mono"
                spellCheck={false}
              />
            ) : (
              <p
                className="flex-1 text-sm text-gray-800 leading-relaxed cursor-text"
                onDoubleClick={() => { setStemDraft(stemText); setEditingStem(true) }}
              >
                {renderInline(stem)}
              </p>
            )}
          </div>

          {options.length > 0 && (
            <div className="mt-2 ml-6 space-y-1">
              {options.map((opt, i) => (
                <div key={i} className="flex gap-2 items-start text-sm">
                  <span className="font-medium text-gray-600 shrink-0 w-5">{opt.label}.</span>
                  <span className="text-gray-700">{renderInline(opt.content || [])}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        {hovered && !editingStem && (
          <BlockMenu
            editor={editor}
            getPos={getPos}
            onDelete={() => deleteNode()}
          />
        )}
      </div>
    </NodeViewWrapper>
  )
}

function parseInlineText(text) {
  if (!text.trim()) return [{ type: 'text', value: '' }]
  const parts = []
  const re = /(\$\$[\s\S]+?\$\$|\$[^$\n]+?\$)/g
  let lastIndex = 0
  let match
  while ((match = re.exec(text)) !== null) {
    const before = text.slice(lastIndex, match.index)
    if (before) parts.push({ type: 'text', value: before })
    const raw = match[1]
    const display = raw.startsWith('$$')
    const value = display ? raw.slice(2, -2).trim() : raw.slice(1, -1).trim()
    if (value) parts.push({ type: 'latex', value, display })
    lastIndex = re.lastIndex
  }
  const after = text.slice(lastIndex)
  if (after) parts.push({ type: 'text', value: after })
  return parts.length ? parts : [{ type: 'text', value: text }]
}

const QuestionBlock = Node.create({
  name: 'questionBlock',
  group: 'block',
  atom: true,

  addAttributes() {
    return {
      nodeId: { default: null },
      sourceBlockIds: { default: '' },
      nodeType: { default: 'question', renderHTML: () => ({}) },
      number: { default: null },
      stem: { default: '[]' },
      options: { default: '[]' },
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-question-block]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes({ 'data-question-block': '' }, HTMLAttributes)]
  },

  addNodeView() {
    return guardedNodeView(QuestionBlockView)
  },
})

export default QuestionBlock
