import { useRef, useEffect, useState } from 'react'
import {
  MousePointer2, Type, Heading2, Sigma, Table2, Image,
  ChevronLeft, ChevronRight,
  Clock, LayoutTemplate, CheckCircle2, AlertTriangle,
  Trash2, PlusSquare,
} from 'lucide-react'

const TOOLS = [
  { id: 'select',  label: 'Select',  Icon: MousePointer2, color: 'text-gray-700',  bg: 'bg-gray-100',  shortcut: 'Esc'  },
  { id: 'text',    label: 'Text',    Icon: Type,          color: 'text-green-600', bg: 'bg-green-50',  shortcut: '1/T'  },
  { id: 'title',   label: 'Title',   Icon: Heading2,      color: 'text-purple-600',bg: 'bg-purple-50', shortcut: '2/H'  },
  { id: 'formula', label: 'Formula', Icon: Sigma,         color: 'text-amber-600', bg: 'bg-amber-50',  shortcut: '3/F'  },
  { id: 'table',   label: 'Table',   Icon: Table2,        color: 'text-blue-600',  bg: 'bg-blue-50',   shortcut: '4/B'  },
  { id: 'figure',  label: 'Figure',  Icon: Image,         color: 'text-red-600',   bg: 'bg-red-50',    shortcut: '5/G'  },
]

const LABEL_TO_TOOL = {
  plain_text: 'text',
  title: 'title',
  isolate_formula: 'formula',
  table: 'table',
  figure: 'figure',
}

function PageStatusIcon({ status }) {
  if (status === 'detecting') {
    return (
      <span
        className="inline-block w-3 h-3 border-2 border-blue-400 border-t-transparent rounded-full animate-spin"
        title="Detecting layout…"
      />
    )
  }
  if (status === 'queued')           return <Clock          size={12} className="text-gray-400"  title="Queued" />
  if (status === 'layout-detected')  return <LayoutTemplate size={12} className="text-blue-500"  title="Layout detected" />
  if (status === 'ocr-complete')     return <CheckCircle2   size={12} className="text-green-500" title="OCR complete" />
  if (status === 'error')            return <AlertTriangle  size={12} className="text-amber-500" title="Error" />
  return null
}

export default function PagesPanel({
  pages,
  activePage,
  onSelectPage,
  activeTool,
  setActiveTool,
  selectedBlockLabel,
  onPreloadPages,
  isBlankDoc = false,
  onDeletePage,
  onAddPage,
}) {
  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem('pages-panel-collapsed') === 'true'
  )
  const toggleCollapsed = (next) => {
    setCollapsed(next)
    localStorage.setItem('pages-panel-collapsed', String(next))
  }
  const effectiveActiveTool = selectedBlockLabel ? LABEL_TO_TOOL[selectedBlockLabel] : activeTool

  const scrollContainerRef = useRef(null)
  const activeItemRef = useRef(null)
  const scrollTimerRef = useRef(null)

  // Auto-scroll to keep the active thumbnail visible when activePage changes.
  useEffect(() => {
    activeItemRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [activePage])

  // Cleanup debounce timer on unmount.
  useEffect(() => () => clearTimeout(scrollTimerRef.current), [])

  // When the user scrolls the thumbnail panel, pre-load the pages visible there.
  const handlePanelScroll = () => {
    clearTimeout(scrollTimerRef.current)
    scrollTimerRef.current = setTimeout(() => {
      const el = scrollContainerRef.current
      if (!el || !onPreloadPages || pages.length === 0) return
      const itemH = el.scrollHeight / pages.length
      const firstVisible = Math.floor(el.scrollTop / itemH)
      const lastVisible  = Math.ceil((el.scrollTop + el.clientHeight) / itemH)
      onPreloadPages(firstVisible - 2, lastVisible + 2)
    }, 150)
  }

  if (collapsed) {
    return (
      <div className="w-10 bg-white border-r border-gray-200 flex flex-col items-center py-2 gap-2 shrink-0">
        <button
          onClick={() => toggleCollapsed(false)}
          title="Expand sidebar"
          className="w-7 h-7 flex items-center justify-center rounded hover:bg-gray-100 text-gray-500"
        >
          <ChevronRight size={16} />
        </button>
        <div className="w-6 h-px bg-gray-200" />
        {isBlankDoc && onAddPage && (
          <button
            onClick={onAddPage}
            title="Add Page"
            className="w-7 h-7 flex items-center justify-center rounded hover:bg-green-100 text-green-600"
          >
            <PlusSquare size={16} />
          </button>
        )}
        {/* Tool icons — compact */}
        {TOOLS.map((tool) => {
          const isActive = effectiveActiveTool === tool.id
          return (
            <button
              key={tool.id}
              onClick={() => setActiveTool(tool.id)}
              title={`${tool.label} (${tool.shortcut})`}
              className={`w-7 h-7 flex items-center justify-center rounded transition-colors ${
                isActive ? `${tool.color} ${tool.bg}` : 'text-gray-500 hover:bg-gray-100'
              }`}
            >
              <tool.Icon size={16} />
            </button>
          )
        })}
      </div>
    )
  }

  return (
    <div className="w-48 bg-white border-r border-gray-200 flex flex-col shrink-0">
      {/* Header with collapse button */}
      <div className="flex items-center justify-between px-2 py-2 bg-gray-50 border-b border-gray-200">
        <span className="text-xs font-semibold text-gray-600">Pages</span>
        <button
          onClick={() => toggleCollapsed(true)}
          title="Collapse sidebar"
          className="w-5 h-5 flex items-center justify-center rounded hover:bg-gray-200 text-gray-500"
        >
          <ChevronLeft size={16} />
        </button>
      </div>

      {/* Pages list */}
      <div
        ref={scrollContainerRef}
        onScroll={handlePanelScroll}
        className="flex-1 overflow-y-auto border-b border-gray-200"
      >
        {pages.map((p, i) => (
          <div
            key={i}
            ref={i === activePage ? activeItemRef : null}
            onClick={() => onSelectPage(i)}
            className={`group flex items-center gap-2 p-2 cursor-pointer border-b transition-colors ${
              activePage === i
                ? 'bg-blue-50 border-l-4 border-l-blue-500'
                : 'hover:bg-gray-50'
            }`}
          >
            <span className="text-xs text-gray-500 w-4 shrink-0">{p.pageNo}</span>

            {p.thumbnail ? (
              <img
                src={p.thumbnail}
                alt={`Page ${p.pageNo}`}
                className="w-12 h-16 object-contain border border-gray-200 shrink-0"
              />
            ) : (
              <div className="w-12 h-16 bg-gray-100 border border-gray-200 shrink-0 flex items-center justify-center">
                {isBlankDoc && <span className="text-xs text-gray-300">A4</span>}
              </div>
            )}

            <div className="flex flex-col items-center gap-1 ml-auto shrink-0">
              <span className="flex items-center">
                <PageStatusIcon status={p.status} />
              </span>
              {isBlankDoc && pages.length > 1 && (
                <button
                  onClick={(e) => { e.stopPropagation(); onDeletePage?.(i) }}
                  title="Delete page"
                  className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-red-100 text-gray-300 hover:text-red-500"
                >
                  <Trash2 size={11} />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Add Page — blank docs only */}
      {isBlankDoc && onAddPage && (
        <div className="px-2 py-1.5 border-b border-gray-200">
          <button
            onClick={onAddPage}
            className="w-full flex items-center justify-center gap-1.5 px-2 py-1.5 text-xs font-medium text-green-700 bg-green-50 rounded-md hover:bg-green-100 transition-colors"
          >
            <PlusSquare size={12} />
            Add Page
          </button>
        </div>
      )}

      {/* Tools */}
      <div className="border-t border-gray-200 p-2">
        <div className="text-xs font-semibold text-gray-600 mb-2">Tools</div>
        <div className="space-y-1">
          {TOOLS.map((tool) => {
            const isActive = effectiveActiveTool === tool.id
            const isBothActive =
              activeTool === tool.id &&
              selectedBlockLabel &&
              LABEL_TO_TOOL[selectedBlockLabel] === tool.id

            return (
              <button
                key={tool.id}
                onClick={() => setActiveTool(tool.id)}
                className={`w-full flex items-center gap-2 px-3 py-2 rounded text-sm font-medium transition-colors ${
                  isBothActive
                    ? `${tool.color} ${tool.bg} border-2 border-current`
                    : isActive
                    ? `${tool.color} ${tool.bg}`
                    : 'text-gray-600 bg-white border border-gray-200 hover:bg-gray-50'
                }`}
                title={`${tool.label} (${tool.shortcut})`}
              >
                <tool.Icon size={16} />
                <span className="text-xs flex-1">{tool.label}</span>
                <span className="text-xs opacity-40 font-mono">{tool.shortcut}</span>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
