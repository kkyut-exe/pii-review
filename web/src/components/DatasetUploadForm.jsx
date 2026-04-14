import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useFile } from '../context/FileContext'

export default function DatasetUploadForm({ onUploaded }) {
  const navigate = useNavigate()
  const { uploadDatasetVersion } = useFile()
  const [kind, setKind] = useState('golden')
  const [name, setName] = useState('')
  const [version, setVersion] = useState('0.1')
  const [filenameColumn, setFilenameColumn] = useState('')
  const [file, setFile] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    if (!file) {
      setMessage('CSV 파일을 선택해주세요.')
      return
    }
    setSubmitting(true)
    setMessage('')
    try {
      const result = await uploadDatasetVersion({ name, kind, version, filenameColumn, file })
      setMessage('데이터셋 버전이 등록되었습니다.')
      setName('')
      setVersion('0.1')
      setFilenameColumn('')
      setFile(null)
      onUploaded?.()
      navigate(`/datasets/version/${result.version_id}`)
    } catch (err) {
      setMessage(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <section className="bg-card rounded-2xl border border-stroke shadow-sm p-6">
      <div className="mb-5">
        <h2 className="text-lg font-bold text-ink-strong">데이터셋 등록</h2>
        <p className="text-sm text-ink-muted mt-1">Golden/Scenario 타입, 이름, 버전과 CSV를 등록합니다.</p>
      </div>
      <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <label className="block">
          <span className="text-sm font-semibold text-ink-base">유형</span>
          <select
            value={kind}
            onChange={e => setKind(e.target.value)}
            className="mt-1.5 w-full rounded-xl border border-stroke bg-card px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary"
          >
            <option value="golden">Golden Set</option>
            <option value="scenario">Scenario Set</option>
          </select>
        </label>
        <label className="block">
          <span className="text-sm font-semibold text-ink-base">버전</span>
          <input
            value={version}
            onChange={e => setVersion(e.target.value)}
            placeholder="0.1"
            className="mt-1.5 w-full rounded-xl border border-stroke bg-card px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary"
          />
        </label>
        <label className="block md:col-span-2">
          <span className="text-sm font-semibold text-ink-base">데이터셋 이름</span>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="예: 주민센터 민원 골든셋"
            required
            className="mt-1.5 w-full rounded-xl border border-stroke bg-card px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary"
          />
        </label>
        <label className="block">
          <span className="text-sm font-semibold text-ink-base">파일명 컬럼명</span>
          <input
            value={filenameColumn}
            onChange={e => setFilenameColumn(e.target.value)}
            placeholder="비우면 자동 탐지"
            className="mt-1.5 w-full rounded-xl border border-stroke bg-card px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary"
          />
        </label>
        <label className="block">
          <span className="text-sm font-semibold text-ink-base">CSV 파일</span>
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={e => setFile(e.target.files?.[0] ?? null)}
            className="mt-1.5 block w-full text-sm text-ink-base"
          />
        </label>
        {message && (
          <p className="md:col-span-2 text-sm text-ink-muted">{message}</p>
        )}
        <div className="md:col-span-2 flex justify-end">
          <button
            type="submit"
            disabled={submitting}
            className="bg-primary hover:bg-primary-hover text-white text-sm px-4 py-2 rounded-xl font-semibold disabled:opacity-40 transition-colors"
          >
            {submitting ? '등록 중...' : '버전 등록'}
          </button>
        </div>
      </form>
    </section>
  )
}
