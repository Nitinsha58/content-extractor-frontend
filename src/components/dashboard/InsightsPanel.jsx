import { Clock, FileText, Image, FileQuestion, Zap, BarChart3, Activity } from 'lucide-react'

function RelativeTime({ dateStr }) {
  const now = Date.now()
  const then = new Date(dateStr).getTime()
  const diff = Math.floor((now - then) / 1000)
  if (diff < 60) return <span className="text-gray-600">just now</span>
  if (diff < 3600) return <span className="text-gray-600">{Math.floor(diff / 60)}m ago</span>
  if (diff < 86400) return <span className="text-gray-600">{Math.floor(diff / 3600)}h ago</span>
  return <span className="text-gray-600">{Math.floor(diff / 86400)}d ago</span>
}

function ActivityIcon({ status }) {
  if (status === 'complete') return <div className="w-5 h-5 rounded-full bg-green-900/50 flex items-center justify-center"><Zap size={10} className="text-green-400" /></div>
  if (status === 'processing') return <div className="w-5 h-5 rounded-full bg-blue-900/50 flex items-center justify-center"><Activity size={10} className="text-blue-400" /></div>
  return <div className="w-5 h-5 rounded-full bg-gray-800 flex items-center justify-center"><Clock size={10} className="text-gray-500" /></div>
}

function DocTypeIcon({ filename }) {
  const ext = filename?.split('.').pop()?.toLowerCase()
  if (['jpg', 'jpeg', 'png', 'tif', 'tiff', 'bmp', 'webp'].includes(ext)) {
    return <Image size={13} className="text-purple-400 shrink-0" />
  }
  if (ext === 'pdf') {
    return <FileText size={13} className="text-red-400 shrink-0" />
  }
  return <FileQuestion size={13} className="text-gray-500 shrink-0" />
}

export default function InsightsPanel({ documents = [] }) {
  // Derive stats from current documents list
  const recentDocs = [...documents]
    .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at))
    .slice(0, 6)

  const total = documents.length
  const complete = documents.filter(d => d.status === 'complete').length
  const partial = documents.filter(d => d.status === 'partial').length
  const pdfCount = documents.filter(d => d.filename?.toLowerCase().endsWith('.pdf')).length
  const imgCount = documents.filter(d => {
    const ext = d.filename?.split('.').pop()?.toLowerCase()
    return ['jpg', 'jpeg', 'png', 'tif', 'tiff', 'bmp', 'webp'].includes(ext)
  }).length

  const totalOcrPages = documents.reduce((sum, d) => sum + (d.pages_ocr_done ?? 0), 0)
  const totalPages = documents.reduce((sum, d) => sum + (d.page_count || 0), 0)
  const ocrPct = totalPages > 0 ? Math.round((totalOcrPages / totalPages) * 100) : 0

  // Pie chart segments (simple CSS-based, no recharts needed at skeleton stage)
  const pdfPct = total > 0 ? Math.round((pdfCount / total) * 100) : 0
  const imgPct = total > 0 ? Math.round((imgCount / total) * 100) : 0
  const otherPct = 100 - pdfPct - imgPct

  return (
    <aside className="w-60 shrink-0 bg-gray-900 border-l border-gray-800 flex flex-col h-full overflow-y-auto">
      <div className="px-4 py-3 border-b border-gray-800">
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Insights</h2>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-5">
        {/* Summary stats */}
        <div className="grid grid-cols-2 gap-2">
          {[
            { label: 'Total', value: total, color: 'text-gray-200' },
            { label: 'Complete', value: complete, color: 'text-green-400' },
            { label: 'In Progress', value: partial, color: 'text-yellow-400' },
            { label: 'OCR Pages', value: totalOcrPages, color: 'text-blue-400' },
          ].map(({ label, value, color }) => (
            <div key={label} className="bg-gray-800/60 rounded-lg px-2.5 py-2">
              <p className={`text-base font-bold ${color}`}>{value}</p>
              <p className="text-xs text-gray-600 mt-0.5">{label}</p>
            </div>
          ))}
        </div>

        {/* Recent Activity */}
        <div>
          <div className="flex items-center gap-1.5 mb-2.5">
            <Clock size={13} className="text-gray-500" />
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Recent Activity</h3>
          </div>
          {recentDocs.length === 0 ? (
            <p className="text-xs text-gray-600 py-1">No recent activity</p>
          ) : (
            <ul className="space-y-2">
              {recentDocs.map(doc => (
                <li key={doc.id} className="flex items-start gap-2">
                  <ActivityIcon status={doc.status} />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-gray-300 truncate" title={doc.filename}>{doc.filename}</p>
                    <RelativeTime dateStr={doc.updated_at} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* File types */}
        <div>
          <div className="flex items-center gap-1.5 mb-2.5">
            <BarChart3 size={13} className="text-gray-500" />
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">File Types</h3>
          </div>
          <div className="space-y-1.5">
            {[
              { label: 'PDF', count: pdfCount, pct: pdfPct, barColor: 'bg-red-500' },
              { label: 'Image', count: imgCount, pct: imgPct, barColor: 'bg-purple-500' },
              { label: 'Other', count: total - pdfCount - imgCount, pct: otherPct, barColor: 'bg-gray-600' },
            ].map(({ label, count, pct, barColor }) => (
              <div key={label}>
                <div className="flex justify-between items-center mb-0.5">
                  <span className="text-xs text-gray-400">{label}</span>
                  <span className="text-xs text-gray-600">{count}</span>
                </div>
                <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full ${barColor}`} style={{ width: `${pct}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* OCR Usage */}
        <div>
          <div className="flex items-center gap-1.5 mb-2.5">
            <Zap size={13} className="text-gray-500" />
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">OCR Progress</h3>
          </div>
          <div className="bg-gray-800/60 rounded-lg px-3 py-2.5">
            <div className="flex justify-between text-xs mb-1.5">
              <span className="text-gray-400">{totalOcrPages} pages done</span>
              <span className="text-gray-600">{ocrPct}%</span>
            </div>
            <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-blue-600 to-blue-400 rounded-full transition-all"
                style={{ width: `${ocrPct}%` }}
              />
            </div>
            <p className="text-xs text-gray-600 mt-1.5">{totalPages} total pages</p>
          </div>
        </div>
      </div>
    </aside>
  )
}
