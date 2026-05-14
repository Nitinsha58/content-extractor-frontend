import { useEffect, useState, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { listDocuments, createDocument, deleteDocument } from '../services/extractorApi'
import {
  listFolders, createFolder, renameFolder, deleteFolder,
  listTags, createTag, deleteTag,
  starDocument, moveDocument, restoreDocument, hardDeleteDocument,
  getStorage, exportTrainingData,
} from '../services/dashboardApi'
import DashboardTopBar from '../components/dashboard/DashboardTopBar'
import Sidebar from '../components/dashboard/Sidebar'
import MainWorkspace from '../components/dashboard/MainWorkspace'
import InsightsPanel from '../components/dashboard/InsightsPanel'

// ── New Folder Modal ──────────────────────────────────────────────────────────
function NewFolderModal({ onConfirm, onClose }) {
  const [name, setName] = useState('')
  const inputRef = useRef(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  const submit = (e) => {
    e.preventDefault()
    const trimmed = name.trim()
    if (trimmed) { onConfirm(trimmed); onClose() }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-gray-900 border border-gray-700 rounded-xl shadow-2xl p-5 w-80">
        <h3 className="text-sm font-semibold text-gray-100 mb-3">New Folder</h3>
        <form onSubmit={submit}>
          <input
            ref={inputRef}
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Folder name"
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200
                       placeholder-gray-500 focus:outline-none focus:border-blue-500 mb-3"
          />
          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-1.5 text-sm text-gray-400 hover:text-gray-200 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded-lg transition-colors"
            >
              Create
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Dashboard ─────────────────────────────────────────────────────────────────
export default function Dashboard() {
  const [documents, setDocuments] = useState([])
  const [folders, setFolders] = useState([])
  const [tags, setTags] = useState([])
  const [storage, setStorage] = useState(null)
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [exportingTrainingData, setExportingTrainingData] = useState(false)
  const [error, setError] = useState(null)

  // Layout state
  const [view, setView] = useState('all')
  const [viewMode, setViewMode] = useState('grid')
  const [searchQuery, setSearchQuery] = useState('')
  const [sortBy, setSortBy] = useState('date')
  const [selectedDocIds, setSelectedDocIds] = useState(new Set())

  // Navigation state — persisted in sessionStorage so returning from document editor lands in the same folder
  const [currentFolderId, setCurrentFolderId] = useState(
    () => sessionStorage.getItem('dashboardFolder') || null
  )
  const [currentTagId, setCurrentTagId] = useState(null)

  // Modal state
  const [newFolderParentId, setNewFolderParentId] = useState(null)
  const [showNewFolderModal, setShowNewFolderModal] = useState(false)

  const navigate = useNavigate()

  useEffect(() => {
    if (currentFolderId) sessionStorage.setItem('dashboardFolder', currentFolderId)
    else sessionStorage.removeItem('dashboardFolder')
  }, [currentFolderId])

  // ── Data loading ──────────────────────────────────────────────────────────

  const loadDocuments = useCallback(async () => {
    const params = {}
    if (view === 'starred') params.starred = 1
    else if (view === 'trash') params.deleted = 1
    if (view === 'all' && currentFolderId) params.folder = currentFolderId
    if (currentTagId) params.tag = currentTagId

    try {
      const docs = await listDocuments(params)
      setDocuments(docs)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [view, currentFolderId, currentTagId])

  const loadFoldersAndTags = useCallback(async () => {
    const [folds, tgs, stor] = await Promise.allSettled([
      listFolders(),
      listTags(),
      getStorage(),
    ])
    if (folds.status === 'fulfilled') setFolders(folds.value)
    if (tgs.status === 'fulfilled') setTags(tgs.value)
    if (stor.status === 'fulfilled') setStorage(stor.value)
  }, [])

  useEffect(() => { loadDocuments() }, [loadDocuments])
  useEffect(() => { loadFoldersAndTags() }, [loadFoldersAndTags])

  // ── Upload ─────────────────────────────────────────────────────────────────

  const handleUpload = useCallback(async (files) => {
    setUploading(true)
    if (files.length === 1) {
      try {
        const doc = await createDocument(files[0], 0, currentFolderId)
        setUploading(false)
        navigate(`/document/${doc.id}`, { state: { freshUpload: true, pdfFile: files[0] } })
      } catch (err) {
        alert(`Upload failed: ${err.message}`)
        setUploading(false)
      }
    } else {
      try {
        await Promise.all(files.map(f => createDocument(f, 0, currentFolderId)))
        await loadDocuments()
      } catch (err) {
        alert(`Some uploads failed: ${err.message}`)
      } finally {
        setUploading(false)
      }
    }
  }, [navigate, loadDocuments, currentFolderId])

  // ── Document actions ───────────────────────────────────────────────────────

  const handleDelete = useCallback(async (docId) => {
    if (view === 'trash') {
      if (!window.confirm('Permanently delete this document? This cannot be undone.')) return
      try {
        await hardDeleteDocument(docId)
        setDocuments(prev => prev.filter(d => d.id !== docId))
        setSelectedDocIds(prev => { const s = new Set(prev); s.delete(docId); return s })
      } catch (e) { alert(`Delete failed: ${e.message}`) }
    } else {
      try {
        await deleteDocument(docId)
        setDocuments(prev => prev.filter(d => d.id !== docId))
        setSelectedDocIds(prev => { const s = new Set(prev); s.delete(docId); return s })
        loadFoldersAndTags() // refresh folder doc_counts
      } catch (e) { alert(`Delete failed: ${e.message}`) }
    }
  }, [view, loadFoldersAndTags])

  const handleStar = useCallback(async (docId) => {
    try {
      const { is_starred } = await starDocument(docId)
      setDocuments(prev => prev.map(d => d.id === docId ? { ...d, is_starred } : d))
    } catch (e) { console.error(e) }
  }, [])

  const handleMove = useCallback(async (docId, folderId) => {
    try {
      await moveDocument(docId, folderId)
      setDocuments(prev => prev.filter(d => d.id !== docId))
      loadFoldersAndTags()
    } catch (e) { alert(`Move failed: ${e.message}`) }
  }, [loadFoldersAndTags])

  const handleRestore = useCallback(async (docId) => {
    try {
      await restoreDocument(docId)
      setDocuments(prev => prev.filter(d => d.id !== docId))
    } catch (e) { alert(`Restore failed: ${e.message}`) }
  }, [])

  const handleToggleSelect = useCallback((docId, checked) => {
    setSelectedDocIds(prev => {
      const s = new Set(prev)
      if (checked) s.add(docId); else s.delete(docId)
      return s
    })
  }, [])

  // ── Folder actions ─────────────────────────────────────────────────────────

  const openNewFolderModal = useCallback((parentId = null) => {
    setNewFolderParentId(parentId ?? currentFolderId)
    setShowNewFolderModal(true)
  }, [currentFolderId])

  const handleCreateFolder = useCallback(async (name) => {
    try {
      await createFolder(name, newFolderParentId)
      await loadFoldersAndTags()
    } catch (e) { alert(`Create folder failed: ${e.message}`) }
  }, [newFolderParentId, loadFoldersAndTags])

  const handleRenameFolder = useCallback(async (id, name) => {
    try {
      await renameFolder(id, name)
      setFolders(prev => prev.map(f => f.id === id ? { ...f, name } : f))
    } catch (e) { alert(`Rename failed: ${e.message}`) }
  }, [])

  const handleDeleteFolder = useCallback(async (id) => {
    if (!window.confirm('Delete this folder? Files inside will be moved to root.')) return
    try {
      await deleteFolder(id)
      if (currentFolderId === id) setCurrentFolderId(null)
      await loadFoldersAndTags()
      await loadDocuments()
    } catch (e) { alert(`Delete folder failed: ${e.message}`) }
  }, [currentFolderId, loadFoldersAndTags, loadDocuments])

  const handleFolderNavigate = useCallback((id) => {
    setCurrentFolderId(id)
    setCurrentTagId(null)
    if (id !== null) setView('all')
    setSearchQuery('')
  }, [])

  // ── Tag actions ────────────────────────────────────────────────────────────

  const handleCreateTag = useCallback(async (name, color) => {
    try {
      const tag = await createTag(name, color)
      setTags(prev => [...prev, tag])
    } catch (e) { alert(`Create tag failed: ${e.message}`) }
  }, [])

  const handleDeleteTag = useCallback(async (id) => {
    try {
      await deleteTag(id)
      setTags(prev => prev.filter(t => t.id !== id))
      if (currentTagId === id) setCurrentTagId(null)
    } catch (e) { alert(`Delete tag failed: ${e.message}`) }
  }, [currentTagId])

  const handleTagSelect = useCallback((id) => {
    setCurrentTagId(id)
    setCurrentFolderId(null)
    setSearchQuery('')
  }, [])

  // ── View change ────────────────────────────────────────────────────────────

  const handleViewChange = useCallback((v) => {
    setView(v)
    setSearchQuery('')
    setCurrentFolderId(null)
    setCurrentTagId(null)
  }, [])

  // ── Training data export ───────────────────────────────────────────────────
  const annotatedPageCount = documents.reduce(
    (sum, d) => sum + (d.pages_layout_done || 0) + (d.pages_ocr_done || 0), 0
  )

  const handleExportTrainingData = useCallback(async () => {
    setExportingTrainingData(true)
    try {
      await exportTrainingData()
    } catch (e) {
      alert(e.message)
    } finally {
      setExportingTrainingData(false)
    }
  }, [])

  // ── Counts for sidebar badges ──────────────────────────────────────────────
  const docCounts = {
    all: documents.length,
    recent: documents.filter(d => new Date(d.updated_at).getTime() > Date.now() - 7 * 24 * 3600 * 1000).length,
  }

  return (
    <div className="h-screen bg-gray-950 text-white flex flex-col overflow-hidden">
      <DashboardTopBar
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        onUpload={handleUpload}
        onNewFolder={() => openNewFolderModal(currentFolderId)}
        uploading={uploading}
        onExportTrainingData={handleExportTrainingData}
        annotatedPageCount={annotatedPageCount}
        exportingTrainingData={exportingTrainingData}
      />

      <div className="flex flex-1 min-h-0">
        <Sidebar
          view={view}
          onViewChange={handleViewChange}
          docCounts={docCounts}
          folders={folders}
          tags={tags}
          selectedFolderId={currentFolderId}
          selectedTagId={currentTagId}
          onFolderSelect={handleFolderNavigate}
          onTagSelect={handleTagSelect}
          onNewFolder={openNewFolderModal}
          onRenameFolder={handleRenameFolder}
          onDeleteFolder={handleDeleteFolder}
          onCreateTag={handleCreateTag}
          onDeleteTag={handleDeleteTag}
          storage={storage}
        />

        <main className="flex-1 min-w-0 flex flex-col">
          {loading ? (
            <div className="flex-1 flex items-center justify-center text-gray-600 text-sm">Loading…</div>
          ) : error ? (
            <div className="flex-1 flex items-center justify-center text-red-400 text-sm">{error}</div>
          ) : (
            <MainWorkspace
              view={view}
              viewMode={viewMode}
              documents={documents}
              folders={folders}
              searchQuery={searchQuery}
              sortBy={sortBy}
              onSortChange={setSortBy}
              currentFolderId={currentFolderId}
              onFolderNavigate={handleFolderNavigate}
              onFolderRename={handleRenameFolder}
              onFolderDelete={handleDeleteFolder}
              onDelete={handleDelete}
              onStar={handleStar}
              onMove={handleMove}
              onRestore={handleRestore}
              selectedIds={selectedDocIds}
              onToggleSelect={handleToggleSelect}
            />
          )}
        </main>

        <InsightsPanel documents={documents} />
      </div>

      {showNewFolderModal && (
        <NewFolderModal
          onConfirm={handleCreateFolder}
          onClose={() => setShowNewFolderModal(false)}
        />
      )}
    </div>
  )
}
