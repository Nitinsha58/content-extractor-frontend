import { useCallback, useRef, useState } from 'react'
import { useParams, useLocation, useNavigate } from 'react-router-dom'
import App from '../App'
import { createDocument } from '../services/extractorApi'

const ACCEPTED_EXTS = /\.(pdf|jpe?g|png|tiff?|bmp|webp)$/i
const ACCEPTED_MIME = new Set([
  'application/pdf', 'image/jpeg', 'image/png', 'image/tiff',
  'image/bmp', 'image/webp', 'image/gif',
])

export default function EditorPage() {
  const { docId } = useParams()
  const { state } = useLocation()
  const navigate = useNavigate()

  const [isDragOver, setIsDragOver] = useState(false)
  const dragCounterRef = useRef(0)

  const handleDragEnter = useCallback((e) => {
    e.preventDefault()
    dragCounterRef.current++
    setIsDragOver(true)
  }, [])

  const handleDragLeave = useCallback((e) => {
    e.preventDefault()
    if (--dragCounterRef.current <= 0) {
      dragCounterRef.current = 0
      setIsDragOver(false)
    }
  }, [])

  const handleDragOver = useCallback((e) => { e.preventDefault() }, [])

  const handleDrop = useCallback(async (e) => {
    e.preventDefault()
    dragCounterRef.current = 0
    setIsDragOver(false)
    const files = Array.from(e.dataTransfer.files).filter(
      f => ACCEPTED_MIME.has(f.type) || ACCEPTED_EXTS.test(f.name)
    )
    if (!files.length) return
    try {
      const docs = await Promise.all(files.map(f => createDocument(f, 0, null)))
      docs.forEach(doc => window.open(`/document/${doc.id}`, '_blank'))
    } catch (err) {
      alert(`Upload failed: ${err.message}`)
    }
  }, [])

  return (
    <div
      className="h-screen relative"
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {isDragOver && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-blue-950/80 border-4 border-dashed border-blue-400 pointer-events-none">
          <div className="flex flex-col items-center gap-3 text-blue-200">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M12 4v12M8 8l4-4 4 4" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <span className="text-lg font-semibold">Drop to open in new tab</span>
          </div>
        </div>
      )}
      <App
        docId={docId}
        freshUpload={state?.freshUpload ?? false}
        initialPdfFile={state?.pdfFile ?? null}
        onNavigateToDashboard={() => navigate('/')}
      />
    </div>
  )
}
