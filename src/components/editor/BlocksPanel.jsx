import { useMemo } from 'react'
import {
  DndContext, closestCenter, PointerSensor, KeyboardSensor,
  useSensor, useSensors,
} from '@dnd-kit/core'
import {
  SortableContext, verticalListSortingStrategy, useSortable,
  sortableKeyboardCoordinates,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

const TYPE_META = {
  paragraph: { icon: 'T', color: 'text-gray-600', bg: 'bg-gray-100', label: 'Text' },
  section:   { icon: 'H', color: 'text-purple-600', bg: 'bg-purple-100', label: 'Heading' },
  question:  { icon: 'Q', color: 'text-blue-600', bg: 'bg-blue-100', label: 'Question' },
  table:     { icon: '≡', color: 'text-green-600', bg: 'bg-green-100', label: 'Table' },
  image:     { icon: '⬜', color: 'text-orange-600', bg: 'bg-orange-100', label: 'Image' },
}

function nodePreview(node) {
  if (node.type === 'section') {
    return (node.heading || []).map(b => b.value ?? '').join(' ').trim() || 'Untitled Section'
  }
  if (node.type === 'paragraph') {
    const text = (node.content || []).filter(b => b.type === 'text').map(b => b.value ?? '').join(' ').trim()
    return text || '(empty paragraph)'
  }
  if (node.type === 'question') {
    const stem = (node.stem || []).filter(b => b.type === 'text').map(b => b.value ?? '').join(' ').trim()
    return `Q${node.number ?? ''}: ${stem || '(no stem)'}`
  }
  if (node.type === 'table') return `Table (${node.rows ?? 0}×${node.cols ?? 0})`
  if (node.type === 'image') return node.alt || 'Image'
  return node.type
}

function BlockItem({ node, isSelected, onSelect, onAction }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: node.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  }

  const meta = TYPE_META[node.type] || { icon: '•', color: 'text-gray-500', bg: 'bg-gray-100', label: node.type }
  const preview = nodePreview(node)
  const isSection = node.type === 'section'

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      onClick={() => onSelect(node.id)}
      className={`flex items-start gap-1.5 px-2 py-1.5 rounded border cursor-pointer transition-colors
        ${isSelected
          ? 'bg-blue-50 border-blue-400'
          : isSection
            ? 'bg-purple-50/40 border-purple-200 hover:bg-purple-50'
            : 'border-gray-200 hover:bg-gray-50'
        }`}
    >
      {/* Drag handle */}
      <button
        {...listeners}
        className="text-gray-300 hover:text-gray-500 text-[11px] mt-0.5 cursor-grab active:cursor-grabbing flex-shrink-0 leading-none"
        onClick={e => e.stopPropagation()}
        title="Drag to reorder"
      >
        ⠿
      </button>

      {/* Type badge */}
      <span className={`text-[11px] font-bold font-mono flex-shrink-0 mt-0.5 w-4 text-center ${meta.color}`}>
        {meta.icon}
      </span>

      {/* Preview */}
      <div className="flex-1 min-w-0">
        <div className={`text-[11px] truncate leading-snug ${isSection ? 'font-semibold text-gray-800' : 'text-gray-700'}`}>
          {preview}
        </div>
        <div className="text-[10px] text-gray-400 mt-0.5">{meta.label}</div>
      </div>

      {/* Action buttons — visible only when selected */}
      {isSelected && (
        <div className="flex gap-0.5 flex-shrink-0 ml-1" onClick={e => e.stopPropagation()}>
          {node.type === 'paragraph' && (
            <ActionBtn title="Convert to heading" onClick={() => onAction('to-heading', node.id)}>H</ActionBtn>
          )}
          {node.type === 'section' && (
            <ActionBtn title="Convert to paragraph" onClick={() => onAction('to-paragraph', node.id)}>T</ActionBtn>
          )}
          <ActionBtn danger title="Delete block" onClick={() => onAction('delete', node.id)}>✕</ActionBtn>
        </div>
      )}
    </div>
  )
}

function ActionBtn({ children, onClick, title, danger }) {
  return (
    <button
      title={title}
      onClick={onClick}
      className={`w-5 h-5 rounded text-[10px] font-bold flex items-center justify-center transition-colors
        ${danger
          ? 'text-red-400 hover:bg-red-100 hover:text-red-600'
          : 'text-gray-400 hover:bg-gray-200 hover:text-gray-700'
        }`}
    >
      {children}
    </button>
  )
}

export default function BlocksPanel({
  structuredContent,
  selectedNodeId,
  onNodeSelect,
  onReorder,
  onAction,
}) {
  const nodes = structuredContent?.nodes ?? []

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const typeCounts = useMemo(() => {
    const c = {}
    for (const n of nodes) c[n.type] = (c[n.type] || 0) + 1
    return c
  }, [nodes])

  function handleDragEnd(event) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIdx = nodes.findIndex(n => n.id === active.id)
    const newIdx = nodes.findIndex(n => n.id === over.id)
    if (oldIdx !== -1 && newIdx !== -1) onReorder(oldIdx, newIdx)
  }

  return (
    <div className="w-52 flex-shrink-0 flex flex-col border-l border-gray-200 bg-white overflow-hidden">
      {/* Header */}
      <div className="px-3 py-2.5 border-b border-gray-100 bg-gray-50 shrink-0">
        <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Structure</p>
        {nodes.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1.5">
            {Object.entries(typeCounts).map(([type, count]) => {
              const meta = TYPE_META[type] || { bg: 'bg-gray-100', color: 'text-gray-500' }
              return (
                <span key={type} className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${meta.bg} ${meta.color}`}>
                  {count} {type}
                </span>
              )
            })}
          </div>
        )}
      </div>

      {/* Block list */}
      <div className="flex-1 overflow-y-auto p-1.5">
        {!structuredContent ? (
          <p className="text-[11px] text-gray-400 text-center mt-6 px-3 leading-relaxed">
            Run OCR to see document structure
          </p>
        ) : nodes.length === 0 ? (
          <p className="text-[11px] text-gray-400 text-center mt-6">No blocks</p>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext items={nodes.map(n => n.id)} strategy={verticalListSortingStrategy}>
              <div className="space-y-0.5">
                {nodes.map(node => (
                  <BlockItem
                    key={node.id}
                    node={node}
                    isSelected={selectedNodeId === node.id}
                    onSelect={onNodeSelect}
                    onAction={onAction}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </div>
    </div>
  )
}
