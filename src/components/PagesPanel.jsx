import { useRef, useEffect } from 'react'

const STATUS_ICON = {
  idle: null,
  queued: '⏳',
  detecting: null,
  'layout-detected': '📐',
  'ocr-complete': '✅',
  error: '⚠️',
}

const TOOLS = [
  { id: 'select', label: 'Select', icon: '➡️', color: 'text-gray-700', bg: 'bg-gray-100' },
  { id: 'text', label: 'Text', icon: 'T', color: 'text-green-600', bg: 'bg-green-50' },
  { id: 'title', label: 'Title', icon: 'H', color: 'text-purple-600', bg: 'bg-purple-50' },
  { id: 'formula', label: 'Formula', icon: 'fx', color: 'text-amber-600', bg: 'bg-amber-50' },
  { id: 'table', label: 'Table', icon: '≡', color: 'text-blue-600', bg: 'bg-blue-50' },
  { id: 'figure', label: 'Figure', icon: '🖼', color: 'text-red-600', bg: 'bg-red-50' },
]

const LABEL_TO_TOOL = {
  plain_text: 'text',
  title: 'title',
  isolate_formula: 'formula',
  table: 'table',
  figure: 'figure',
}

export default function PagesPanel({
  pages,
  activePage,
  onSelectPage,
  activeTool,
  setActiveTool,
  selectedBlockLabel,
  onPreloadPages,
}) {
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

  return (
    <div className="w-48 bg-white border-r border-gray-200 flex flex-col">
      {/* Pages list — acts as the mini-map */}
      <div
        ref={scrollContainerRef}
        onScroll={handlePanelScroll}
        className="flex-1 overflow-y-auto border-b border-gray-200"
      >
        <div className="text-xs font-semibold text-gray-600 px-2 py-2 bg-gray-50">Pages</div>
        {pages.map((p, i) => (
          <div
            key={i}
            ref={i === activePage ? activeItemRef : null}
            onClick={() => onSelectPage(i)}
            className={`flex items-center gap-2 p-2 cursor-pointer border-b transition-colors ${
              activePage === i
                ? 'bg-blue-50 border-l-4 border-l-blue-500'
                : 'hover:bg-gray-50'
            }`}
          >
            <span className="text-xs text-gray-500 w-4 shrink-0">{p.pageNo}</span>

            {/* Thumbnail or skeleton */}
            {p.thumbnail ? (
              <img
                src={p.thumbnail}
                alt={`Page ${p.pageNo}`}
                className="w-12 h-16 object-contain border border-gray-200 shrink-0"
              />
            ) : (
              <div className="w-12 h-16 bg-gray-100 border border-gray-200 shrink-0" />
            )}

            {/* Status indicator */}
            <span className="shrink-0">
              {p.status === 'detecting' ? (
                <span
                  className="inline-block w-3 h-3 border-2 border-blue-400 border-t-transparent rounded-full animate-spin"
                  title="Detecting layout…"
                />
              ) : (
                <span className="text-sm" title={p.status}>
                  {STATUS_ICON[p.status] ?? ''}
                </span>
              )}
            </span>
          </div>
        ))}
      </div>

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
                title={tool.label}
              >
                <span className="text-base">{tool.icon}</span>
                <span className="text-xs">{tool.label}</span>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
