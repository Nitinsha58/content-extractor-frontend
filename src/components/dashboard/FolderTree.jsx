import { useState, useRef } from 'react'
import { Folder, FolderOpen, ChevronRight, ChevronDown, MoreHorizontal, Plus, Pencil, Trash2 } from 'lucide-react'
import PortalMenu from './PortalMenu'

function FolderNode({
  folder,
  allFolders,
  depth,
  selectedId,
  expanded,
  onToggle,
  onSelect,
  onRename,
  onDelete,
  onCreate,
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [renameVal, setRenameVal] = useState(folder.name)
  const triggerRef = useRef(null)

  const children = allFolders.filter(f => f.parent_id === folder.id)
  const isExpanded = expanded.has(folder.id)
  const isSelected = selectedId === folder.id

  const handleRenameSubmit = (e) => {
    e.preventDefault()
    const name = renameVal.trim()
    if (name && name !== folder.name) onRename(folder.id, name)
    setRenaming(false)
  }

  return (
    <li>
      <div
        className={`flex items-center gap-1 px-2 py-1.5 rounded-lg cursor-pointer group transition-colors ${
          isSelected ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-gray-100 hover:bg-gray-800'
        }`}
        style={{ paddingLeft: `${8 + depth * 12}px` }}
      >
        {/* Expand toggle */}
        <button
          onClick={e => { e.stopPropagation(); if (children.length > 0) onToggle(folder.id) }}
          className="shrink-0 w-4 flex items-center justify-center"
        >
          {children.length > 0 ? (
            isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />
          ) : (
            <span className="w-3" />
          )}
        </button>

        {/* Folder icon + name */}
        <div
          className="flex items-center gap-1.5 flex-1 min-w-0"
          onClick={() => onSelect(folder.id)}
        >
          {isExpanded ? <FolderOpen size={13} className="shrink-0" /> : <Folder size={13} className="shrink-0" />}
          {renaming ? (
            <form onSubmit={handleRenameSubmit} onClick={e => e.stopPropagation()}>
              <input
                autoFocus
                value={renameVal}
                onChange={e => setRenameVal(e.target.value)}
                onBlur={handleRenameSubmit}
                onKeyDown={e => e.key === 'Escape' && setRenaming(false)}
                className="text-xs bg-gray-700 border border-blue-500 rounded px-1 py-0.5 w-full focus:outline-none text-white"
              />
            </form>
          ) : (
            <span className="text-xs truncate">{folder.name}</span>
          )}
          {folder.doc_count > 0 && (
            <span className={`ml-auto shrink-0 text-xs px-1 rounded ${isSelected ? 'text-blue-200' : 'text-gray-600'}`}>
              {folder.doc_count}
            </span>
          )}
        </div>

        {/* Context menu trigger */}
        <div className="shrink-0" onClick={e => e.stopPropagation()}>
          <button
            ref={triggerRef}
            onClick={() => setMenuOpen(v => !v)}
            className={`p-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity ${
              isSelected ? 'hover:bg-blue-500' : 'hover:bg-gray-700'
            }`}
          >
            <MoreHorizontal size={12} />
          </button>

          <PortalMenu
            triggerRef={triggerRef}
            open={menuOpen}
            onClose={() => setMenuOpen(false)}
            width={140}
            estimatedH={110}
          >
            <button
              onClick={() => { setMenuOpen(false); onCreate(folder.id) }}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-gray-300 hover:bg-gray-700"
            >
              <Plus size={11} /> New subfolder
            </button>
            <button
              onClick={() => { setMenuOpen(false); setRenameVal(folder.name); setRenaming(true) }}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-gray-300 hover:bg-gray-700"
            >
              <Pencil size={11} /> Rename
            </button>
            <button
              onClick={() => { setMenuOpen(false); onDelete(folder.id) }}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-red-400 hover:bg-gray-700"
            >
              <Trash2 size={11} /> Delete
            </button>
          </PortalMenu>
        </div>
      </div>

      {/* Children */}
      {isExpanded && children.length > 0 && (
        <ul>
          {children.map(child => (
            <FolderNode
              key={child.id}
              folder={child}
              allFolders={allFolders}
              depth={depth + 1}
              selectedId={selectedId}
              expanded={expanded}
              onToggle={onToggle}
              onSelect={onSelect}
              onRename={onRename}
              onDelete={onDelete}
              onCreate={onCreate}
            />
          ))}
        </ul>
      )}
    </li>
  )
}

export default function FolderTree({ folders, selectedId, onSelect, onCreate, onRename, onDelete }) {
  const [expanded, setExpanded] = useState(new Set())

  const toggle = (id) => setExpanded(prev => {
    const s = new Set(prev)
    if (s.has(id)) s.delete(id)
    else s.add(id)
    return s
  })

  const roots = folders.filter(f => !f.parent_id)

  if (roots.length === 0) {
    return (
      <div className="px-3 py-2 text-xs text-gray-600 flex items-center gap-2">
        <Folder size={13} />
        <span>No folders yet</span>
      </div>
    )
  }

  return (
    <ul className="space-y-0.5">
      {roots.map(folder => (
        <FolderNode
          key={folder.id}
          folder={folder}
          allFolders={folders}
          depth={0}
          selectedId={selectedId}
          expanded={expanded}
          onToggle={toggle}
          onSelect={onSelect}
          onRename={onRename}
          onDelete={onDelete}
          onCreate={onCreate}
        />
      ))}
    </ul>
  )
}
