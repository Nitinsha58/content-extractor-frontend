import { Folder, MoreHorizontal, Pencil, Trash2 } from 'lucide-react'
import { useState, useRef } from 'react'
import PortalMenu from './PortalMenu'

function FolderCardMenu({ folder, onRename, onDelete }) {
  const [open, setOpen] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [val, setVal] = useState(folder.name)
  const triggerRef = useRef(null)

  const submit = (e) => {
    e?.preventDefault()
    const name = val.trim()
    if (name && name !== folder.name) onRename(folder.id, name)
    setRenaming(false)
  }

  if (renaming) {
    return (
      <form onSubmit={submit} onClick={e => e.stopPropagation()} className="px-2 py-1.5">
        <input
          autoFocus
          value={val}
          onChange={e => setVal(e.target.value)}
          onBlur={submit}
          onKeyDown={e => e.key === 'Escape' && setRenaming(false)}
          className="w-full text-xs bg-gray-700 border border-blue-500 rounded px-1.5 py-1 focus:outline-none text-white"
        />
      </form>
    )
  }

  return (
    <div onClick={e => e.stopPropagation()}>
      <button
        ref={triggerRef}
        onClick={() => setOpen(v => !v)}
        className="p-1 rounded text-gray-500 hover:text-gray-300 hover:bg-gray-700/50 opacity-0 group-hover:opacity-100 transition"
      >
        <MoreHorizontal size={13} />
      </button>

      <PortalMenu
        triggerRef={triggerRef}
        open={open}
        onClose={() => setOpen(false)}
        width={140}
        estimatedH={80}
      >
        <button
          onClick={() => { setOpen(false); setVal(folder.name); setRenaming(true) }}
          className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-gray-300 hover:bg-gray-700"
        >
          <Pencil size={11} /> Rename
        </button>
        <button
          onClick={() => { setOpen(false); onDelete(folder.id) }}
          className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-red-400 hover:bg-gray-700"
        >
          <Trash2 size={11} /> Delete
        </button>
      </PortalMenu>
    </div>
  )
}

export default function FoldersGrid({ folders, currentFolderId, onFolderClick, onRename, onDelete }) {
  const children = currentFolderId
    ? folders.filter(f => f.parent_id === currentFolderId)
    : folders.filter(f => !f.parent_id)

  if (children.length === 0) return null

  return (
    <div className="mb-4">
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">Folders</p>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
        {children.map(folder => (
          <div
            key={folder.id}
            onClick={() => onFolderClick(folder.id)}
            className="group flex items-center gap-2.5 bg-gray-800/80 border border-gray-700/60
                       hover:border-blue-500/50 rounded-xl px-3 py-2.5 cursor-pointer transition-all
                       hover:shadow-md hover:shadow-blue-900/10"
          >
            <Folder size={16} className="text-yellow-400 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-gray-200 truncate">{folder.name}</p>
              <p className="text-xs text-gray-600">{folder.doc_count ?? 0} file{folder.doc_count !== 1 ? 's' : ''}</p>
            </div>
            <FolderCardMenu folder={folder} onRename={onRename} onDelete={onDelete} />
          </div>
        ))}
      </div>
    </div>
  )
}
