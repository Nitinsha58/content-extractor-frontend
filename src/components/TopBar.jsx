export default function TopBar({
  filename,
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
}) {
  const isLoading = pdfLoadProgress && !pdfLoadProgress.allReady
  const loadPct = isLoading && pdfLoadProgress.total > 0
    ? Math.round((pdfLoadProgress.loaded / pdfLoadProgress.total) * 100)
    : 0

  return (
    <div className="relative flex flex-col bg-gray-900 border-b border-gray-700">
      <div className="flex items-center gap-3 px-4 py-2 text-white text-sm">
        {onNavigateToDashboard && (
          <button
            onClick={onNavigateToDashboard}
            className="px-3 py-1 bg-gray-700 rounded hover:bg-gray-600 shrink-0"
          >
            ← Dashboard
          </button>
        )}
        <label className="px-3 py-1 bg-blue-600 rounded cursor-pointer hover:bg-blue-700 font-medium shrink-0">
          📂 Open File
          <input type="file" accept=".pdf,.jpg,.jpeg,.png,.tiff,.tif,.bmp,.webp" className="hidden" onChange={onFileChange} />
        </label>

        {/* Filename + loading/detection status */}
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-gray-400 truncate max-w-48">
            {filename || 'No file'}
          </span>
          {isLoading ? (
            <span className="text-blue-400 text-xs shrink-0 flex items-center gap-1">
              <span className="inline-block w-3 h-3 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
              {pdfLoadProgress.loaded}/{pdfLoadProgress.total} pages
            </span>
          ) : detectingCount > 0 ? (
            <span className="text-blue-400 text-xs shrink-0 flex items-center gap-1">
              <span className="inline-block w-2.5 h-2.5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
              Detecting {detectingCount}…
            </span>
          ) : (
            totalPages > 0 && (
              <span className="text-gray-500 text-xs shrink-0">
                {pagesDone}/{totalPages} done
              </span>
            )
          )}
        </div>

        <div className="w-px h-6 bg-gray-700 shrink-0" />

        <button
          onClick={onRecognize}
          disabled={!filename || isProcessing || isLoading}
          className="px-4 py-1 bg-green-600 rounded font-medium hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
        >
          🔍 Detect Layout
        </button>

        <button
          onClick={onRerunOcr}
          disabled={!filename || isProcessing}
          className="px-3 py-1 bg-gray-700 rounded hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
        >
          ↺ Run OCR
        </button>

        {selectedBlockCount > 0 && (
          <button
            onClick={onRunOcrSelected}
            disabled={isProcessing}
            className="px-3 py-1 bg-amber-600 rounded hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
          >
            ↺ OCR Selected ({selectedBlockCount})
          </button>
        )}

        <div className="w-px h-6 bg-gray-700 shrink-0" />

        <button
          onClick={onUndo}
          disabled={!canUndo || isProcessing}
          className="px-3 py-1 bg-gray-700 rounded hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
        >
          ↶ Undo
        </button>

        <button
          onClick={onRedo}
          disabled={!canRedo || isProcessing}
          className="px-3 py-1 bg-gray-700 rounded hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
        >
          ↷ Redo
        </button>

        <div className="w-px h-6 bg-gray-700 shrink-0" />

        <div className="flex rounded overflow-hidden border border-gray-600 shrink-0">
          {['original', 'overlay', 'split'].map((mode) => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              className={`px-3 py-1 text-xs font-medium transition-colors ${
                viewMode === mode ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              {mode === 'original' ? '📄' : mode === 'overlay' ? '🎯' : '↔️'} {mode}
            </button>
          ))}
        </div>

        <div className="ml-auto flex gap-2 shrink-0">
          <button
            onClick={() => onExport?.('html')}
            disabled={!onExport || currentPageStatus !== 'ocr-complete' || isProcessing}
            className="px-3 py-1 bg-purple-600 rounded text-xs hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            HTML
          </button>
          <button
            onClick={() => onExport?.('markdown')}
            disabled={!onExport || currentPageStatus !== 'ocr-complete' || isProcessing}
            className="px-3 py-1 bg-purple-600 rounded text-xs hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            MD
          </button>
          <button
            onClick={() => onExport?.('docx')}
            disabled={!onExport || currentPageStatus !== 'ocr-complete' || isProcessing}
            className="px-3 py-1 bg-purple-600 rounded text-xs hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            DOCX
          </button>
        </div>
      </div>

      {/* Progress bar — visible only while pages are loading */}
      {isLoading && (
        <div className="h-0.5 bg-gray-700">
          <div
            className="h-full bg-blue-500 transition-all duration-300"
            style={{ width: `${loadPct}%` }}
          />
        </div>
      )}
    </div>
  )
}
