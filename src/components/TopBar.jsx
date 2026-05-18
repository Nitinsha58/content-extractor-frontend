import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, FolderOpen, Scan, RotateCcw, Undo2, Redo2, ChevronDown, Layers, Columns2, FileText, Pencil } from 'lucide-react'

function Dropdown({ open, onClose, children, align = 'left' }) {
  const ref = useRef(null)
  useEffect(() => {
    if (!open) return
    const handler = (e) => { if (!ref.current?.contains(e.target)) onClose() }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open, onClose])

  if (!open) return null
  return (
    <div
      ref={ref}
      className={`absolute top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50 py-1 min-w-44 ${align === 'right' ? 'right-0' : 'left-0'}`}
    >
      {children}
    </div>
  )
}

function DropdownItem({ onClick, disabled, icon: Icon, children }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed text-left"
    >
      {Icon && <Icon size={14} className="shrink-0 text-gray-400" />}
      {children}
    </button>
  )
}

const VIEW_MODES = [
  { id: 'overlay',  label: 'Overlay',    Icon: Layers   },
  { id: 'split',    label: 'Split View', Icon: Columns2 },
  { id: 'original', label: 'Original',   Icon: FileText  },
]

export default function TopBar({
  filename,
  fileType,
  pagesDone,
  totalPages,
  onFileChange,
  onRecognize,
  onRerunOcr,
  selectedBlockCount = 0,
  onRunOcrSelected,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  viewMode,
  setViewMode,
  isProcessing,
  onExport,
  currentPageStatus,
  pdfLoadProgress,
  detectingCount = 0,
  onNavigateToDashboard,
  onRenameFile,
}) {
  const [layoutOpen, setLayoutOpen]   = useState(false)
  const [ocrOpen,    setOcrOpen]      = useState(false)
  const [exportOpen, setExportOpen]   = useState(false)
  const [editingName, setEditingName] = useState(false)
  const [nameInput,   setNameInput]   = useState('')
  const nameInputRef = useRef(null)

  const layoutRef = useRef(null)
  const ocrRef    = useRef(null)
  const exportRef = useRef(null)

  const startEditName = () => {
    if (!onRenameFile) return
    setNameInput(filename || '')
    setEditingName(true)
    setTimeout(() => { nameInputRef.current?.select() }, 0)
  }

  const commitEditName = () => {
    const trimmed = nameInput.trim()
    if (trimmed && trimmed !== filename) onRenameFile(trimmed)
    setEditingName(false)
  }

  const cancelEditName = () => setEditingName(false)

  const close = (setter) => () => setter(false)
  const toggle = (setter, others) => () => {
    others.forEach(s => s(false))
    setter(v => !v)
  }

  const isLoading = pdfLoadProgress && !pdfLoadProgress.allReady
  const loadPct   = isLoading && pdfLoadProgress.total > 0
    ? Math.round((pdfLoadProgress.loaded / pdfLoadProgress.total) * 100)
    : 0
  const canExport = onExport && currentPageStatus === 'ocr-complete' && !isProcessing

  return (
    <div className="relative flex flex-col bg-white border-b border-gray-200">
      <div className="flex items-center h-12 px-3 gap-2">

        {/* ── Left: Dashboard + Open File ─────────────────────────────── */}
        <div className="flex items-center gap-1 shrink-0">
          {onNavigateToDashboard && (
            <button
              onClick={onNavigateToDashboard}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-sm text-gray-600 rounded-md hover:bg-gray-100 font-medium"
            >
              <ArrowLeft size={15} />
              Dashboard
            </button>
          )}

          <label className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-sm rounded-md cursor-pointer hover:bg-blue-700 font-medium select-none">
            <FolderOpen size={15} />
            Open File
            <ChevronDown size={12} className="opacity-70 -ml-0.5" />
            <input
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,.tiff,.tif,.bmp,.webp"
              className="hidden"
              onChange={onFileChange}
            />
          </label>
        </div>

        {/* ── Center: actions (auto-centred with mx-auto on both spacers) ── */}
        <div className="flex-1" />
        <div className="flex items-center gap-1">

          {/* Layout ▼ */}
          <div className="relative" ref={layoutRef}>
            <button
              onClick={toggle(setLayoutOpen, [setOcrOpen, setExportOpen])}
              disabled={!filename || isProcessing || isLoading}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-700 rounded-md hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Scan size={15} className="text-gray-500" />
              Layout
              <ChevronDown size={12} className="text-gray-400" />
            </button>
            <Dropdown open={layoutOpen} onClose={close(setLayoutOpen)}>
              <DropdownItem
                icon={Scan}
                onClick={() => { onRecognize(); setLayoutOpen(false) }}
                disabled={isProcessing || isLoading}
              >
                Detect Layout
              </DropdownItem>
            </Dropdown>
          </div>

          {/* OCR ▼ */}
          <div className="relative" ref={ocrRef}>
            <button
              onClick={toggle(setOcrOpen, [setLayoutOpen, setExportOpen])}
              disabled={!filename || isProcessing}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-700 rounded-md hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <RotateCcw size={15} className="text-gray-500" />
              OCR
              <ChevronDown size={12} className="text-gray-400" />
            </button>
            <Dropdown open={ocrOpen} onClose={close(setOcrOpen)}>
              <DropdownItem
                icon={RotateCcw}
                onClick={() => { onRerunOcr(); setOcrOpen(false) }}
                disabled={isProcessing}
              >
                Run All OCR
              </DropdownItem>
              {selectedBlockCount > 0 && (
                <DropdownItem
                  icon={RotateCcw}
                  onClick={() => { onRunOcrSelected(); setOcrOpen(false) }}
                  disabled={isProcessing}
                >
                  OCR Selected ({selectedBlockCount})
                </DropdownItem>
              )}
            </Dropdown>
          </div>

          {/* Run OCR — primary action */}
          <button
            onClick={onRerunOcr}
            disabled={!filename || isProcessing}
            className="flex items-center gap-1.5 px-4 py-1.5 bg-blue-600 text-white text-sm rounded-md font-medium hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <RotateCcw size={14} />
            Run OCR
          </button>

          <div className="w-px h-5 bg-gray-200 mx-0.5" />

          {/* Undo */}
          <button
            onClick={onUndo}
            disabled={!canUndo || isProcessing}
            title="Undo"
            className="flex items-center gap-1 px-2.5 py-1.5 text-sm text-gray-600 rounded-md hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Undo2 size={15} />
            <span className="text-xs">Undo</span>
          </button>

          {/* Redo */}
          <button
            onClick={onRedo}
            disabled={!canRedo || isProcessing}
            title="Redo"
            className="flex items-center gap-1 px-2.5 py-1.5 text-sm text-gray-600 rounded-md hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Redo2 size={15} />
            <span className="text-xs">Redo</span>
          </button>
        </div>
        <div className="flex-1" />

        {/* ── Right: status + view tabs + export ──────────────────────── */}
        <div className="flex items-center gap-3 shrink-0">

          {/* Status */}
          <div className="flex items-center gap-1.5 text-xs">
            {filename && (
              editingName ? (
                <input
                  ref={nameInputRef}
                  value={nameInput}
                  onChange={e => setNameInput(e.target.value)}
                  onBlur={commitEditName}
                  onKeyDown={e => {
                    if (e.key === 'Enter') { e.preventDefault(); commitEditName() }
                    if (e.key === 'Escape') { e.preventDefault(); cancelEditName() }
                  }}
                  className="text-xs text-gray-700 bg-white border border-blue-400 rounded px-1.5 py-0.5 outline-none max-w-48"
                  style={{ minWidth: 60 }}
                />
              ) : (
                <span
                  className={`text-gray-500 truncate max-w-40 ${onRenameFile ? 'cursor-pointer hover:text-gray-800' : ''}`}
                  title={onRenameFile ? `${filename} — click to rename` : filename}
                  onClick={onRenameFile ? startEditName : undefined}
                >
                  {filename}
                </span>
              )
            )}
            {filename && onRenameFile && !editingName && (
              <button
                onClick={startEditName}
                className="text-gray-300 hover:text-gray-500 transition-colors shrink-0"
                title="Rename"
              >
                <Pencil size={11} />
              </button>
            )}
            {isLoading ? (
              <span className="text-blue-500 flex items-center gap-1 shrink-0">
                <span className="inline-block w-2.5 h-2.5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                {pdfLoadProgress.loaded}/{pdfLoadProgress.total} pages
              </span>
            ) : detectingCount > 0 ? (
              <span className="text-blue-500 flex items-center gap-1 shrink-0">
                <span className="inline-block w-2.5 h-2.5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                Detecting {detectingCount}…
              </span>
            ) : totalPages > 0 ? (
              <span className="text-gray-400 shrink-0">{pagesDone}/{totalPages} done</span>
            ) : null}
          </div>

          {/* View mode tabs */}
          <div className="flex items-stretch h-12">
            {VIEW_MODES.map(({ id, label, Icon }) => (
              <button
                key={id}
                onClick={() => setViewMode(id)}
                className={`flex items-center gap-1.5 px-3 text-sm font-medium border-b-2 transition-colors ${
                  viewMode === id
                    ? 'text-blue-600 border-blue-600'
                    : 'text-gray-500 border-transparent hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <Icon size={14} />
                {label}
              </button>
            ))}
          </div>

          {/* Export ▼ */}
          <div className="relative" ref={exportRef}>
            <button
              onClick={toggle(setExportOpen, [setLayoutOpen, setOcrOpen])}
              disabled={!canExport}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-700 rounded-md border border-gray-200 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed font-medium"
            >
              Export
              <ChevronDown size={12} className="text-gray-400" />
            </button>
            <Dropdown open={exportOpen} onClose={close(setExportOpen)} align="right">
              <DropdownItem onClick={() => { onExport?.('html');     setExportOpen(false) }}>HTML</DropdownItem>
              <DropdownItem onClick={() => { onExport?.('markdown'); setExportOpen(false) }}>Markdown</DropdownItem>
              <DropdownItem onClick={() => { onExport?.('docx');     setExportOpen(false) }}>Word (.docx)</DropdownItem>
            </Dropdown>
          </div>
        </div>

      </div>

      {/* PDF load progress bar */}
      {isLoading && (
        <div className="h-0.5 bg-gray-100">
          <div className="h-full bg-blue-500 transition-all duration-300" style={{ width: `${loadPct}%` }} />
        </div>
      )}

    </div>
  )
}
