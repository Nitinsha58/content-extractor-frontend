import { useRef, useState } from 'react'
import { Search, LayoutGrid, List, Upload, Plus, ScanText, FolderPlus, FileUp, DatabaseZap, FilePlus } from 'lucide-react'

const ACCEPTED_TYPES = '.pdf,.jpg,.jpeg,.png,.tiff,.tif,.bmp,.webp'

export default function DashboardTopBar({
  searchQuery,
  onSearchChange,
  viewMode,
  onViewModeChange,
  onUpload,
  onNewFolder,
  onNewBlank,
  uploading,
  onExportTrainingData,
  annotatedPageCount = 0,
  exportingTrainingData = false,
}) {
  const uploadRef = useRef(null)
  const newFileRef = useRef(null)
  const [showNewMenu, setShowNewMenu] = useState(false)

  const handleFiles = (e) => {
    const files = Array.from(e.target.files || [])
    e.target.value = ''
    if (files.length > 0) {
      setShowNewMenu(false)
      onUpload(files)
    }
  }

  return (
    <header className="h-14 bg-gray-900 border-b border-gray-800 px-4 flex items-center gap-3 shrink-0 z-10">
      {/* Logo */}
      <div className="flex items-center gap-2 mr-2 shrink-0">
        <div className="w-7 h-7 bg-blue-600 rounded-lg flex items-center justify-center">
          <ScanText size={15} className="text-white" />
        </div>
        <span className="font-semibold text-sm text-gray-100 hidden sm:block">Content Extractor</span>
      </div>

      {/* Search */}
      <div className="flex-1 max-w-xl relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
        <input
          type="text"
          placeholder="Search documents…"
          value={searchQuery}
          onChange={e => onSearchChange(e.target.value)}
          className="w-full bg-gray-800 border border-gray-700 rounded-lg pl-8 pr-3 py-1.5 text-sm
                     text-gray-200 placeholder-gray-500 focus:outline-none focus:border-blue-500
                     focus:ring-1 focus:ring-blue-500/30 transition-colors"
        />
      </div>

      <div className="flex items-center gap-2 ml-auto shrink-0">
        {/* View mode toggle */}
        <div className="flex items-center bg-gray-800 border border-gray-700 rounded-lg p-0.5">
          <button
            onClick={() => onViewModeChange('grid')}
            className={`p-1.5 rounded-md transition-colors ${
              viewMode === 'grid' ? 'bg-gray-700 text-white' : 'text-gray-500 hover:text-gray-300'
            }`}
            title="Grid view"
          >
            <LayoutGrid size={14} />
          </button>
          <button
            onClick={() => onViewModeChange('table')}
            className={`p-1.5 rounded-md transition-colors ${
              viewMode === 'table' ? 'bg-gray-700 text-white' : 'text-gray-500 hover:text-gray-300'
            }`}
            title="Table view"
          >
            <List size={14} />
          </button>
        </div>

        {/* Export training data button */}
        {annotatedPageCount > 0 && (
          <button
            onClick={onExportTrainingData}
            disabled={exportingTrainingData}
            title={`Export ${annotatedPageCount} annotated page${annotatedPageCount !== 1 ? 's' : ''} as YOLO training data`}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border ${
              exportingTrainingData
                ? 'bg-gray-800 border-gray-700 text-gray-500 cursor-not-allowed'
                : 'bg-gray-800 border-gray-700 text-purple-400 hover:bg-gray-700 hover:text-purple-300'
            }`}
          >
            <DatabaseZap size={13} />
            <span className="hidden sm:block">{exportingTrainingData ? 'Exporting…' : 'Export Training Data'}</span>
            <span className="ml-1 text-xs bg-purple-900/50 text-purple-300 px-1.5 py-0.5 rounded-full">{annotatedPageCount}</span>
          </button>
        )}

        {/* Upload button — quick file picker */}
        <label className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium cursor-pointer transition-colors border ${
          uploading
            ? 'bg-gray-800 border-gray-700 text-gray-500 cursor-not-allowed'
            : 'bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-700 hover:text-white'
        }`}>
          <Upload size={13} />
          <span className="hidden sm:block">{uploading ? 'Uploading…' : 'Upload'}</span>
          <input
            ref={uploadRef}
            type="file"
            accept={ACCEPTED_TYPES}
            multiple
            className="hidden"
            onChange={handleFiles}
            disabled={uploading}
          />
        </label>

        {/* New button — dropdown with New Folder + Upload File */}
        <div className="relative">
          <button
            onClick={() => setShowNewMenu(v => !v)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              uploading ? 'bg-blue-400 cursor-not-allowed text-white' : 'bg-blue-600 hover:bg-blue-500 text-white'
            }`}
            disabled={uploading}
          >
            <Plus size={13} />
            <span>New</span>
          </button>

          {showNewMenu && (
            <>
              <div className="fixed inset-0 z-20" onClick={() => setShowNewMenu(false)} />
              <div className="absolute right-0 top-9 z-30 bg-gray-800 border border-gray-700 rounded-xl shadow-xl py-1.5 w-44">
                <button
                  onClick={() => { setShowNewMenu(false); onNewFolder() }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-gray-200 hover:bg-gray-700 transition-colors"
                >
                  <FolderPlus size={14} className="text-yellow-400" />
                  New Folder
                </button>
                <button
                  onClick={() => { setShowNewMenu(false); onNewBlank?.() }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-gray-200 hover:bg-gray-700 transition-colors"
                >
                  <FilePlus size={14} className="text-green-400" />
                  New Blank
                </button>
                <label className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-gray-200 hover:bg-gray-700 transition-colors cursor-pointer">
                  <FileUp size={14} className="text-blue-400" />
                  Upload File
                  <input
                    ref={newFileRef}
                    type="file"
                    accept={ACCEPTED_TYPES}
                    multiple
                    className="hidden"
                    onChange={handleFiles}
                    disabled={uploading}
                  />
                </label>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  )
}
