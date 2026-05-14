import { ArrowUpDown, FolderOpen } from 'lucide-react'
import FilesGrid from './FilesGrid'
import FilesTable from './FilesTable'
import FoldersGrid from './FoldersGrid'

const VIEW_TITLES = {
  all:     'All Files',
  recent:  'Recent',
  starred: 'Starred',
  trash:   'Trash',
}

function Breadcrumb({ folders, currentFolderId, onNavigate }) {
  if (!currentFolderId) return null

  const path = []
  let id = currentFolderId
  while (id) {
    const f = folders.find(x => x.id === id)
    if (!f) break
    path.unshift(f)
    id = f.parent_id
  }

  return (
    <div className="flex items-center gap-1 text-xs text-gray-500 mb-1">
      <button onClick={() => onNavigate(null)} className="hover:text-gray-300 transition-colors">
        All Files
      </button>
      {path.map(f => (
        <span key={f.id} className="flex items-center gap-1">
          <span>/</span>
          <button
            onClick={() => onNavigate(f.id)}
            className={`hover:text-gray-300 transition-colors ${f.id === currentFolderId ? 'text-gray-300 font-medium' : ''}`}
          >
            {f.name}
          </button>
        </span>
      ))}
    </div>
  )
}

export default function MainWorkspace({
  view,
  viewMode,
  documents,
  folders,
  searchQuery,
  sortBy,
  onSortChange,
  currentFolderId,
  onFolderNavigate,
  onFolderRename,
  onFolderDelete,
  onDelete,
  onStar,
  onMove,
  onRestore,
  selectedIds,
  onToggleSelect,
}) {
  const title = VIEW_TITLES[view] || 'All Files'

  const filtered = searchQuery
    ? documents.filter(d => d.filename?.toLowerCase().includes(searchQuery.toLowerCase()))
    : documents

  const sorted = [...filtered].sort((a, b) => {
    if (sortBy === 'name') return a.filename.localeCompare(b.filename)
    if (sortBy === 'status') return a.status.localeCompare(b.status)
    return new Date(b.updated_at) - new Date(a.updated_at)
  })

  return (
    <div className="flex-1 min-w-0 flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="px-5 py-3 border-b border-gray-800 shrink-0">
        <Breadcrumb folders={folders} currentFolderId={currentFolderId} onNavigate={onFolderNavigate} />
        <div className="flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <h2 className="text-sm font-semibold text-gray-200 flex items-center gap-2">
              {currentFolderId && <FolderOpen size={14} className="text-yellow-400" />}
              {currentFolderId
                ? folders.find(f => f.id === currentFolderId)?.name ?? title
                : title}
            </h2>
            {searchQuery && (
              <p className="text-xs text-gray-500 mt-0.5">
                {sorted.length} result{sorted.length !== 1 ? 's' : ''} for "{searchQuery}"
              </p>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <div className="flex items-center gap-1.5 text-xs text-gray-500">
              <ArrowUpDown size={12} />
            </div>
            <select
              value={sortBy}
              onChange={e => onSortChange(e.target.value)}
              className="text-xs bg-gray-800 border border-gray-700 text-gray-300 rounded-md px-2 py-1 focus:outline-none focus:border-blue-500"
            >
              <option value="date">Date modified</option>
              <option value="name">Name</option>
              <option value="status">Status</option>
            </select>
          </div>

          {filtered.length > 0 && (
            <span className="text-xs text-gray-600 shrink-0">
              {filtered.length} file{filtered.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-5 py-4">
        {/* Folders grid — only in 'all' view, not when searching */}
        {view === 'all' && !searchQuery && (
          <FoldersGrid
            folders={folders}
            currentFolderId={currentFolderId}
            onFolderClick={onFolderNavigate}
            onRename={onFolderRename}
            onDelete={onFolderDelete}
          />
        )}

        {viewMode === 'grid' ? (
          <FilesGrid documents={sorted} view={view} onDelete={onDelete} onStar={onStar} onRestore={onRestore} />
        ) : (
          <FilesTable
            documents={sorted}
            folders={folders}
            view={view}
            onDelete={onDelete}
            onStar={onStar}
            onMove={onMove}
            onRestore={onRestore}
            selectedIds={selectedIds}
            onToggleSelect={onToggleSelect}
          />
        )}
      </div>
    </div>
  )
}
