import DatasetUploadForm from '../components/DatasetUploadForm'
import { useFile } from '../context/FileContext'

export default function DatasetRegisterPage() {
  const { fetchDatasets } = useFile()

  return (
    <div className="min-h-screen bg-surface">
      <div className="max-w-4xl mx-auto px-6 py-8 space-y-6">
        <header>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-ink-muted">Dataset Workspace</p>
          <h1 className="text-2xl font-bold text-ink-strong mt-2">데이터셋 등록</h1>
          <p className="text-sm text-ink-muted mt-2">
            새 Golden Set 또는 Scenario Set 버전을 등록합니다. 기존 이름을 입력하면 같은 데이터셋 아래에 새 버전이 추가됩니다.
          </p>
        </header>

        <DatasetUploadForm onUploaded={fetchDatasets} />
      </div>
    </div>
  )
}
