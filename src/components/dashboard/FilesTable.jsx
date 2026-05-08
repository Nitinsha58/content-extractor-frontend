import { useNavigate } from 'react-router-dom'
import { FileText, Image, FileQuestion, MoreHorizontal, Trash2, ExternalLink, Star, FolderInput, RotateCcw, ChevronLeft } from 'lucide-react'
import { useState, useRef } from 'react'
import PortalMenu from './PortalMenu'

const STATUS_BADGE = {
  uploaded:    { label: 'Uploaded',    cls: 'bg-gray-700/80 text-gray-300' },
  partial:     { label: 'In Progress', cls: 'bg-yellow-900/50 text-yellow-400' },
  complete:    { label: 'Complete',    cls: 'bg-green-900/50 text-green-400' },
  processing:  { label: 'Processing',  cls: 'bg-blue-900/50 text-blue-400' },
  failed:      { label: 'Failed',      cls: 'bg-red-900/50 text-red-400' },
}

function FileTypeIcon({ filename }) {
  const ext = filename?.split('.').pop()?.toLowerCase()
  if (['jpg', 'jpeg', 'png', 'tif', 'tiff', 'bmp', 'webp'].includes(ext)) {
    return <Image size={15} className="text-purple-400 shrink-0" />
  }
  if (ext === 'pdf') return <FileText size={15} className="text-red-400 shrink-0" />
  return <FileQuestion size={15} className="text-gray-500 shrink-0" />
}

function FileTypeBadge({ filename }) {
  const ext = filename?.split('.').pop()?.toLowerCase() || '?'
  const isImage = ['jpg', 'jpeg', 'png', 'tif', 'tiff', 'bmp', 'webp'].includes(ext)
  return (
    <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
      ext === 'pdf' ? 'bg-red-900/40 text-red-400' :
      isImage ? 'bg-purple-900/40 text-purple-400' :
      'bg-gray-700 text-gray-400'
    }`}>
      {ext.toUpperCase()}
    </span>
  )
}

function ActionsMenu({ doc, folders, view, onDelete, onStar, onMove, onRestore }) {
  const [open, setOpen] = useState(false)
  const [showMoveList, setShowMoveList] = useState(false)
  const triggerRef = useRef(null)
  const navigate = useNavigate()

  const close = () => { setOpen(false); setShowMoveList(false) }

  return (
    <div>
      <button
        ref={triggerRef}
        onClick={e => { e.stopPropagation(); setOpen(v => !v) }}
        className="p-1.5 rounded-md text-gray-500 hover:text-gray-300 hover:bg-gray-700 transition-colors"
      >
        <MoreHorizontal size={14} />
      </button>

      <PortalMenu
        triggerRef={triggerRef}
        open={open}
        onClose={close}
        width={160}
        estimatedH={180}
      >
        {!showMoveList ? (
          <>
            <button
              onClick={e => { e.stopPropagation(); close(); navigate(`/document/${doc.id}`) }}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-gray-300 hover:bg-gray-700 transition-colors"
            >
              <ExternalLink size={13} /> Open
            </button>

            {view !== 'trash' && (
              <>
                <button
                  onClick={e => { e.stopPropagation(); close(); onStar(doc.id) }}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-gray-300 hover:bg-gray-700 transition-colors"
                >
                  <Star size={13} className={doc.is_starred ? 'text-yellow-400 fill-yellow-400' : ''} />
                  {doc.is_starred ? 'Unstar' : 'Star'}
                </button>

                {folders.length > 0 && (
                  <button
                    onClick={e => { e.stopPropagation(); setShowMoveList(true) }}
                    className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-gray-300 hover:bg-gray-700 transition-colors"
                  >
                    <FolderInput size={13} /> Move to…
                  </button>
                )}

                <div className="border-t border-gray-700/50 my-1" />
                <button
                  onClick={e => { e.stopPropagation(); close(); onDelete(doc.id) }}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-red-400 hover:bg-gray-700 transition-colors"
                >
                  <Trash2 size={13} /> Delete
                </button>
              </>
            )}

            {view === 'trash' && (
              <>
                <button
                  onClick={e => { e.stopPropagation(); close(); onRestore(doc.id) }}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-green-400 hover:bg-gray-700 transition-colors"
                >
                  <RotateCcw size={13} /> Restore
                </button>
                <button
                  onClick={e => { e.stopPropagation(); close(); onDelete(doc.id) }}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-red-400 hover:bg-gray-700 transition-colors"
                >
                  <Trash2 size={13} /> Delete permanently
                </button>
              </>
            )}
          </>
        ) : (
          <>
            <button
              onClick={e => { e.stopPropagation(); setShowMoveList(false) }}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-gray-400 hover:bg-gray-700"
            >
              <ChevronLeft size={11} /> Back
            </button>
            <div className="border-t border-gray-700/50 my-1" />
            <div className="max-h-48 overflow-y-auto">
              <button
                onClick={e => { e.stopPropagation(); close(); onMove(doc.id, null) }}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-gray-400 hover:bg-gray-700"
              >
                Root (no folder)
              </button>
              {folders.map(f => (
                <button
                  key={f.id}
                  onClick={e => { e.stopPropagation(); close(); onMove(doc.id, f.id) }}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-gray-300 hover:bg-gray-700"
                >
                  {f.name}
                </button>
              ))}
            </div>
          </>
        )}
      </PortalMenu>
    </div>
  )
}

export default function FilesTable({ documents, folders = [], view = 'all', onDelete, onStar, onMove, onRestore, selectedIds, onToggleSelect }) {
  const navigate = useNavigate()

  if (documents.length === 0) {
    return (
      <div className="text-center py-20 text-gray-600">
        <FileText size={40} className="mx-auto mb-3 opacity-30" />
        <p className="text-sm">No documents here yet</p>
      </div>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-800">
            <th className="w-8 py-2 px-3">
              <input
                type="checkbox"
                className="accent-blue-500 w-3.5 h-3.5"
                checked={documents.length > 0 && selectedIds.size === documents.length}
                onChange={e => documents.forEach(d => onToggleSelect(d.id, e.target.checked))}
              />
            </th>
            <th className="py-2 px-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
            <th className="py-2 px-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider hidden sm:table-cell">Type</th>
            <th className="py-2 px-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              {view === 'trash' ? 'Deleted' : 'OCR Status'}
            </th>
            <th className="py-2 px-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider hidden md:table-cell">Pages</th>
            <th className="py-2 px-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider hidden lg:table-cell">Modified</th>
            <th className="w-10 py-2 px-3" />
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-800/60">
          {documents.map(doc => {
            const badge = STATUS_BADGE[doc.status] || STATUS_BADGE.uploaded
            const pagesOcr = doc.pages_ocr_done ?? 0
            const total = doc.page_count || 0
            const pct = total > 0 ? Math.round((pagesOcr / total) * 100) : 0
            const isSelected = selectedIds.has(doc.id)

            return (
              <tr
                key={doc.id}
                onClick={() => view !== 'trash' && navigate(`/document/${doc.id}`)}
                className={`transition-colors hover:bg-gray-800/50 ${
                  isSelected ? 'bg-blue-900/10' : ''
                } ${view !== 'trash' ? 'cursor-pointer' : ''}`}
              >
                <td className="py-2.5 px-3" onClick={e => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    className="accent-blue-500 w-3.5 h-3.5"
                    checked={isSelected}
                    onChange={e => onToggleSelect(doc.id, e.target.checked)}
                  />
                </td>

                <td className="py-2.5 px-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-10 bg-gray-800 rounded overflow-hidden shrink-0 border border-gray-700/50">
                      {doc.thumbnail_url ? (
                        <img src={doc.thumbnail_url} alt="" className="w-full h-full object-contain" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <FileTypeIcon filename={doc.filename} />
                        </div>
                      )}
                    </div>
                    <div className="min-w-0">
                      <span className="font-medium text-gray-200 truncate block max-w-[180px]" title={doc.filename}>
                        {doc.filename}
                      </span>
                      {doc.is_starred && <Star size={10} className="text-yellow-400 fill-yellow-400 mt-0.5" />}
                    </div>
                  </div>
                </td>

                <td className="py-2.5 px-3 hidden sm:table-cell">
                  <FileTypeBadge filename={doc.filename} />
                </td>

                <td className="py-2.5 px-3">
                  {view === 'trash' ? (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-500">
                        {doc.deleted_at ? new Date(doc.deleted_at).toLocaleDateString() : '—'}
                      </span>
                      <button
                        onClick={e => { e.stopPropagation(); onRestore(doc.id) }}
                        className="text-xs text-green-400 hover:text-green-300 flex items-center gap-1 px-2 py-0.5 rounded border border-green-900/50 hover:border-green-700"
                      >
                        <RotateCcw size={10} /> Restore
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-1">
                      <span className={`text-xs font-medium px-1.5 py-0.5 rounded w-fit ${badge.cls}`}>
                        {badge.label}
                      </span>
                      {total > 0 && (
                        <div className="flex items-center gap-1.5">
                          <div className="h-1 w-20 bg-gray-700 rounded-full overflow-hidden">
                            <div className="h-full bg-green-500 rounded-full" style={{ width: `${pct}%` }} />
                          </div>
                          <span className="text-xs text-gray-600">{pct}%</span>
                        </div>
                      )}
                    </div>
                  )}
                </td>

                <td className="py-2.5 px-3 text-gray-500 text-xs hidden md:table-cell">
                  {total > 0 ? `${pagesOcr} / ${total}` : '—'}
                </td>

                <td className="py-2.5 px-3 text-gray-500 text-xs hidden lg:table-cell">
                  {new Date(doc.updated_at).toLocaleDateString()}
                </td>

                <td className="py-2.5 px-3" onClick={e => e.stopPropagation()}>
                  <ActionsMenu
                    doc={doc}
                    folders={folders}
                    view={view}
                    onDelete={onDelete}
                    onStar={onStar}
                    onMove={onMove}
                    onRestore={onRestore}
                  />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
