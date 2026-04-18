// web/src/pages/EvalNewPage.jsx
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useEvalsApi } from '../context/EvalContext'
import { useFile } from '../context/FileContext'

const KIND_LABELS = {
  golden: 'Golden Set',
  scenario: 'Scenario Set',
}

export default function EvalNewPage() {
  const api = useEvalsApi()
  const { datasets } = useFile()
  const navigate = useNavigate()

  const [name, setName] = useState('')
  const [modelName, setModelName] = useState('lora_extract')
  const [serverUrl, setServerUrl] = useState('http://192.168.5.11:8000')
  const [chunkChars, setChunkChars] = useState('')
  const [overlap, setOverlap] = useState(0)
  const [goldenSource, setGoldenSource] = useState('db')
  const [dbMode, setDbMode] = useState('versions') // 'versions' | 'all'
  const [selectedVersionIds, setSelectedVersionIds] = useState(new Set())
  const [uploadInfo, setUploadInfo] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  const grouped = useMemo(() => ({
    golden: datasets.filter(d => d.kind === 'golden'),
    scenario: datasets.filter(d => d.kind === 'scenario'),
  }), [datasets])

  function toggleVersion(id) {
    setSelectedVersionIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function handleFileChange(e) {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const info = await api.uploadGolden(file)
      setUploadInfo(info)
      setError(null)
    } catch (err) {
      setError(`업로드 실패: ${err.message}`)
      setUploadInfo(null)
    }
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    if (!name.trim()) {
      setError('평가 이름을 입력하세요.')
      return
    }
    if (goldenSource === 'upload' && !uploadInfo) {
      setError('Golden Set 파일을 업로드하세요.')
      return
    }
    if (goldenSource === 'db' && dbMode === 'versions' && selectedVersionIds.size === 0) {
      setError('데이터셋 버전을 최소 1개 선택하세요.')
      return
    }

    setSubmitting(true)
    try {
      const body = {
        name: name.trim(),
        model_name: modelName.trim(),
        server_url: serverUrl.trim(),
        chunk_chars: chunkChars === '' ? null : Number(chunkChars),
        overlap: Number(overlap) || 0,
        golden_source: goldenSource,
        golden_upload_id: goldenSource === 'upload' ? uploadInfo.upload_id : null,
        golden_dataset_version_ids:
          goldenSource === 'db' && dbMode === 'versions'
            ? [...selectedVersionIds]
            : null,
      }
      const runs = await api.createRun(body)
      if (Array.isArray(runs) && runs.length === 1) {
        navigate(`/evals/${runs[0].id}`)
      } else {
        navigate('/evals')
      }
    } catch (err) {
      setError(err.message)
      setSubmitting(false)
    }
  }

  const selectedCount = selectedVersionIds.size
  const willSpawn = goldenSource === 'upload'
    ? 1
    : dbMode === 'all' ? 1 : selectedCount

  return (
    <div className="min-h-screen bg-surface">
      <div className="max-w-2xl mx-auto px-6 py-8 space-y-6">
        <header>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-ink-muted">LLM Eval</p>
          <h1 className="text-2xl font-bold text-ink-strong mt-2">평가 생성</h1>
          <p className="text-sm text-ink-muted mt-2">
            추론 서버와 Golden Set 을 선택하세요. 여러 버전을 선택하면 버전별로 Run 이 각각 생성됩니다.
          </p>
        </header>

        <form onSubmit={handleSubmit} className="bg-card rounded-xl border border-stroke p-5 space-y-4">
          <Field label="평가 이름" required>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="v0.1 baseline"
              className="w-full text-sm border border-stroke rounded px-3 py-2 bg-surface focus:outline-none focus:border-primary"
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="모델명" required>
              <input
                value={modelName}
                onChange={e => setModelName(e.target.value)}
                className="w-full text-sm border border-stroke rounded px-3 py-2 bg-surface focus:outline-none focus:border-primary"
              />
            </Field>
            <Field label="추론 서버 URL" required>
              <input
                value={serverUrl}
                onChange={e => setServerUrl(e.target.value)}
                className="w-full text-sm border border-stroke rounded px-3 py-2 bg-surface focus:outline-none focus:border-primary"
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="청크 크기 (글자수, 비우면 청킹 안함)">
              <input
                type="number"
                min={0}
                value={chunkChars}
                onChange={e => setChunkChars(e.target.value)}
                placeholder="None"
                className="w-full text-sm border border-stroke rounded px-3 py-2 bg-surface focus:outline-none focus:border-primary"
              />
            </Field>
            <Field label="청크 overlap">
              <input
                type="number"
                min={0}
                value={overlap}
                onChange={e => setOverlap(e.target.value)}
                className="w-full text-sm border border-stroke rounded px-3 py-2 bg-surface focus:outline-none focus:border-primary"
              />
            </Field>
          </div>

          <Field label="Golden Set 소스">
            <div className="flex gap-4">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  checked={goldenSource === 'db'}
                  onChange={() => setGoldenSource('db')}
                />
                <span>DB 데이터셋</span>
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  checked={goldenSource === 'upload'}
                  onChange={() => setGoldenSource('upload')}
                />
                <span>파일 업로드 (.jsonl)</span>
              </label>
            </div>
          </Field>

          {goldenSource === 'db' && (
            <div className="bg-surface rounded-lg p-3 space-y-3">
              <div className="flex gap-4 text-xs">
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    checked={dbMode === 'versions'}
                    onChange={() => setDbMode('versions')}
                  />
                  <span>데이터셋 버전 선택</span>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    checked={dbMode === 'all'}
                    onChange={() => setDbMode('all')}
                  />
                  <span>전체 reviewed 레코드</span>
                </label>
              </div>

              {dbMode === 'versions' && (
                <div className="space-y-3">
                  {['golden', 'scenario'].map(kind => (
                    <div key={kind}>
                      <p className="text-xs font-semibold text-ink-strong mb-1.5">
                        {KIND_LABELS[kind]}
                      </p>
                      {grouped[kind].length === 0 && (
                        <p className="text-xs text-ink-muted pl-2">등록된 데이터셋 없음</p>
                      )}
                      <div className="space-y-2">
                        {grouped[kind].map(dataset => (
                          <div key={dataset.id} className="bg-card rounded border border-stroke px-3 py-2">
                            <p className="text-xs font-semibold text-ink-base mb-1">{dataset.name}</p>
                            <div className="space-y-1">
                              {dataset.versions.map(v => {
                                const disabled = (v.matched_reviewed_count || 0) === 0
                                const checked = selectedVersionIds.has(v.id)
                                return (
                                  <label
                                    key={v.id}
                                    className={`flex items-center gap-2 text-xs ${
                                      disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'
                                    }`}
                                  >
                                    <input
                                      type="checkbox"
                                      checked={checked}
                                      disabled={disabled}
                                      onChange={() => toggleVersion(v.id)}
                                    />
                                    <span>v{v.version}</span>
                                    <span className="text-ink-muted ml-auto">
                                      reviewed {v.matched_reviewed_count}/{v.total_items}
                                    </span>
                                  </label>
                                )
                              })}
                              {dataset.versions.length === 0 && (
                                <p className="text-xs text-ink-muted">버전 없음</p>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {goldenSource === 'upload' && (
            <div className="bg-surface rounded-lg p-3 space-y-2">
              <input
                type="file"
                accept=".jsonl,application/jsonl"
                onChange={handleFileChange}
                className="text-xs"
              />
              {uploadInfo && (
                <p className="text-xs text-ink-muted">
                  ✓ <span>{uploadInfo.filename}</span> · {uploadInfo.total_docs} docs
                </p>
              )}
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-xs text-red-700">
              {error}
            </div>
          )}

          <div className="flex items-center justify-between pt-2">
            <p className="text-xs text-ink-muted">
              {willSpawn > 0 && `평가 ${willSpawn}개 생성`}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => navigate('/evals')}
                className="px-4 py-2 text-sm border border-stroke rounded-lg bg-card hover:bg-surface"
              >
                취소
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-4 py-2 text-sm font-semibold bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50"
              >
                {submitting ? '생성 중...' : '평가 시작'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}

function Field({ label, required, children }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-ink-base mb-1">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      {children}
    </div>
  )
}
