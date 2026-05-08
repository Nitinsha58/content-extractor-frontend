import { useParams, useLocation, useNavigate } from 'react-router-dom'
import App from '../App'

export default function EditorPage() {
  const { docId } = useParams()
  const { state } = useLocation()
  const navigate = useNavigate()

  return (
    <App
      docId={docId}
      freshUpload={state?.freshUpload ?? false}
      initialPdfFile={state?.pdfFile ?? null}
      onNavigateToDashboard={() => navigate('/')}
    />
  )
}
