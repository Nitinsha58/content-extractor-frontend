import { Files, Clock, Star, Trash2, ChevronRight, HardDrive, Tag as TagIcon } from 'lucide-react'
import FolderTree from './FolderTree'
import TagList from './TagList'

const NAV_ITEMS = [
  { id: 'all',     label: 'All Files', icon: Files },
  { id: 'recent',  label: 'Recent',    icon: Clock },
  { id: 'starred', label: 'Starred',   icon: Star },
  { id: 'trash',   label: 'Trash',     icon: Trash2 },
]

export default function Sidebar({
  view,
  onViewChange,
  docCounts = {},
  folders,
  tags,
  selectedFolderId,
  selectedTagId,
  onFolderSelect,
  onTagSelect,
  onNewFolder,
  onRenameFolder,
  onDeleteFolder,
  onCreateTag,
  onDeleteTag,
  storage,
}) {
  const usedBytes = storage?.used_bytes ?? 0
  const limitBytes = storage?.limit_bytes ?? (100 * 1024 * 1024 * 1024)
  const usedPct = limitBytes > 0 ? Math.round((usedBytes / limitBytes) * 100) : 0
  const usedGB = (usedBytes / (1024 ** 3)).toFixed(2)
  const limitGB = (limitBytes / (1024 ** 3)).toFixed(0)

  return (
    <aside className="w-52 shrink-0 bg-gray-900 border-r border-gray-800 flex flex-col h-full overflow-hidden">
      <nav className="flex-1 overflow-y-auto px-2 pt-3 pb-2">
        {/* Main nav */}
        <ul className="space-y-0.5 mb-4">
          {NAV_ITEMS.map(({ id, label, icon: Icon }) => (
            <li key={id}>
              <button
                onClick={() => { onViewChange(id); onFolderSelect(null); onTagSelect(null) }}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${
                  view === id && !selectedFolderId && !selectedTagId
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-400 hover:text-gray-100 hover:bg-gray-800'
                }`}
              >
                <Icon size={15} className="shrink-0" />
                <span className="truncate">{label}</span>
                {docCounts[id] != null && (
                  <span className={`ml-auto text-xs rounded-full px-1.5 py-0.5 ${
                    view === id && !selectedFolderId ? 'bg-blue-500 text-white' : 'bg-gray-700 text-gray-400'
                  }`}>
                    {docCounts[id]}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>

        {/* Folders section */}
        <div className="mb-4">
          <div className="flex items-center justify-between px-3 mb-1.5">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Folders</span>
            <button
              onClick={() => onNewFolder(selectedFolderId)}
              className="text-gray-500 hover:text-gray-300 transition-colors p-0.5 rounded"
              title="New folder"
            >
              <ChevronRight size={13} />
            </button>
          </div>
          <FolderTree
            folders={folders}
            selectedId={selectedFolderId}
            onSelect={id => { onFolderSelect(id); onViewChange('all') }}
            onCreate={onNewFolder}
            onRename={onRenameFolder}
            onDelete={onDeleteFolder}
          />
        </div>

        {/* Tags section */}
        <div>
          <div className="flex items-center justify-between px-3 mb-1.5">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Tags</span>
          </div>
          <TagList
            tags={tags}
            selectedTagId={selectedTagId}
            onSelect={id => { onTagSelect(id); onViewChange('all') }}
            onCreate={onCreateTag}
            onDelete={onDeleteTag}
          />
        </div>
      </nav>

      {/* Storage indicator */}
      <div className="border-t border-gray-800 px-3 py-3">
        <div className="flex items-center gap-2 mb-1.5">
          <HardDrive size={13} className="text-gray-500" />
          <span className="text-xs text-gray-500 font-medium">Storage</span>
        </div>
        <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden mb-1">
          <div
            className="h-full bg-blue-500 rounded-full transition-all"
            style={{ width: `${Math.max(usedPct, usedBytes > 0 ? 2 : 0)}%` }}
          />
        </div>
        <p className="text-xs text-gray-600">{usedGB} GB of {limitGB} GB used</p>
      </div>
    </aside>
  )
}
