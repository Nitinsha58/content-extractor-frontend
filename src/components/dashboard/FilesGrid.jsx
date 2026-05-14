import { Trash2, FileText, Image, FileQuestion, Star, RotateCcw } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

const STATUS_BADGE = {
  uploaded:    { label: 'Uploaded',    cls: 'bg-gray-700 text-gray-300' },
  partial:     { label: 'In Progress', cls: 'bg-yellow-900/60 text-yellow-400' },
  complete:    { label: 'Complete',    cls: 'bg-green-900/60 text-green-400' },
  processing:  { label: 'Processing',  cls: 'bg-blue-900/60 text-blue-400' },
  failed:      { label: 'Failed',      cls: 'bg-red-900/60 text-red-400' },
}

function FileIcon({ filename }) {
  const ext = filename?.split('.').pop()?.toLowerCase()
  if (['jpg', 'jpeg', 'png', 'tif', 'tiff', 'bmp', 'webp'].includes(ext)) {
    return <Image size={32} className="text-purple-400" />
  }
  if (ext === 'pdf') return <FileText size={32} className="text-red-400" />
  return <FileQuestion size={32} className="text-gray-500" />
}

export default function FilesGrid({ documents, view, onDelete, onStar, onRestore }) {
  const navigate = useNavigate()
  const isTrash = view === 'trash'

  if (documents.length === 0) {
    return (
      <div className="text-center py-20 text-gray-600">
        <FileText size={40} className="mx-auto mb-3 opacity-30" />
        <p className="text-sm">{isTrash ? 'Trash is empty' : 'No documents here yet'}</p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
      {documents.map(doc => {
        const badge = STATUS_BADGE[doc.status] || STATUS_BADGE.uploaded
        const pagesOcr = doc.pages_ocr_done ?? 0
        const total = doc.page_count || 0
        const pct = total > 0 ? Math.round((pagesOcr / total) * 100) : 0

        return (
          <div
            key={doc.id}
            onClick={() => !isTrash && navigate(`/document/${doc.id}`)}
            className={`bg-gray-800 rounded-xl border border-gray-700/60 flex flex-col transition-all group
                       ${isTrash ? 'opacity-60' : 'hover:border-blue-500/60 hover:shadow-lg hover:shadow-blue-900/20 cursor-pointer'}`}
          >
            {/* Thumbnail */}
            <div className="aspect-4/3 bg-gray-900/60 rounded-t-xl overflow-hidden relative">
              {doc.thumbnail_url ? (
                <img
                  src={doc.thumbnail_url}
                  alt={doc.filename}
                  className="w-full h-full object-contain"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <FileIcon filename={doc.filename} />
                </div>
              )}
              {/* Star indicator — not shown in trash */}
              {!isTrash && doc.is_starred && (
                <div className="absolute top-1.5 left-1.5">
                  <Star size={12} className="text-yellow-400 fill-yellow-400" />
                </div>
              )}
              {/* Action buttons on hover */}
              <div className="absolute top-1.5 right-1.5 flex gap-1">
                {isTrash ? (
                  <>
                    <button
                      onClick={e => { e.stopPropagation(); onRestore(doc.id) }}
                      className="w-6 h-6 bg-green-600/90 text-white rounded-full flex items-center justify-center
                                 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-green-500"
                      title="Restore"
                    >
                      <RotateCcw size={10} />
                    </button>
                    <button
                      onClick={e => { e.stopPropagation(); onDelete(doc.id) }}
                      className="w-6 h-6 bg-red-600/90 text-white rounded-full flex items-center justify-center
                                 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500"
                      title="Delete permanently"
                    >
                      <Trash2 size={10} />
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={e => { e.stopPropagation(); onStar(doc.id) }}
                      className={`w-6 h-6 rounded-full flex items-center justify-center opacity-0
                                 group-hover:opacity-100 transition-opacity ${
                                   doc.is_starred ? 'bg-yellow-500/80 hover:bg-yellow-400' : 'bg-gray-700/80 hover:bg-gray-600'
                                 }`}
                      title={doc.is_starred ? 'Unstar' : 'Star'}
                    >
                      <Star size={10} className={doc.is_starred ? 'text-white fill-white' : 'text-gray-300'} />
                    </button>
                    <button
                      onClick={e => { e.stopPropagation(); onDelete(doc.id) }}
                      className="w-6 h-6 bg-red-600/90 text-white rounded-full flex items-center justify-center
                                 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500"
                      title="Delete"
                    >
                      <Trash2 size={10} />
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Card body */}
            <div className="p-2.5 flex flex-col gap-1.5">
              <p className="text-xs font-medium text-gray-100 truncate leading-tight" title={doc.filename}>
                {doc.filename}
              </p>
              <p className="text-xs text-gray-600">
                {total > 0 ? `${total} page${total !== 1 ? 's' : ''}` : '—'}
              </p>

              {total > 0 && (
                <div className="h-1 bg-gray-700 rounded-full overflow-hidden">
                  <div className="h-full bg-green-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
                </div>
              )}

              <div className="flex items-center justify-between mt-0.5">
                <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${badge.cls}`}>
                  {badge.label}
                </span>
                <span className="text-xs text-gray-600">
                  {new Date(doc.updated_at).toLocaleDateString()}
                </span>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
