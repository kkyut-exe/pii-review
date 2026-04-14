import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useFile } from '../context/FileContext'

const KIND_META = {
  golden: { label: 'Golden Set', accent: 'text-amber-700', badge: 'bg-amber-100 text-amber-700' },
  scenario: { label: 'Scenario Set', accent: 'text-sky-700', badge: 'bg-sky-100 text-sky-700' },
}

const MATCH_META = {
  matched_reviewed: { label: '검수완료', className: 'bg-status-reviewed-bg text-status-reviewed-fg' },
  matched_not_reviewed: { label: '미완료 매칭', className: 'bg-status-pending-bg text-status-pending-fg' },
  unmatched: { label: '미매칭', className: 'bg-surface text-ink-muted' },
  ambiguous: { label: '중복 매칭', className: 'bg-red-50 text-red-600' },
}

function sanitizeFilename(value) {
  return value
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, '_')
    .toLowerCase()
}

function SummaryCard({ label, value, hint, tone = 'text-ink-strong' }) {
  return (
    <div className="bg-card rounded-xl border border-stroke px-5 py-4">
      <p className="text-xs text-ink-muted mb-1">{label}</p>
      <p className={`text-2xl font-bold ${tone}`}>{value}</p>
      {hint && <p className="text-xs text-ink-muted mt-2">{hint}</p>}
    </div>
  )
}

function ConfirmModal({ title, body, confirmLabel, onConfirm, onCancel, destructive = false }) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
      <div className="w-full max-w-md bg-card rounded-2xl border border-stroke shadow-xl p-6">
        <h3 className="text-lg font-bold text-ink-strong">{title}</h3>
        <p className="text-sm text-ink-base mt-3 whitespace-pre-line">{body}</p>
        <div className="flex justify-end gap-2 mt-6">
          <button
            onClick={onCancel}
            className="text-sm text-ink-muted px-4 py-2 rounded-lg hover:bg-primary-light transition-colors"
          >
            취소
          </button>
          <button
            onClick={onConfirm}
            className={`text-sm px-4 py-2 rounded-lg text-white font-semibold transition-colors ${
              destructive ? 'bg-red-500 hover:bg-red-600' : 'bg-primary hover:bg-primary-hover'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

function DatasetOverview({ datasets, currentUser, onDeleteDataset }) {
  const grouped = useMemo(() => ({
    golden: datasets.filter(dataset => dataset.kind === 'golden'),
    scenario: datasets.filter(dataset => dataset.kind === 'scenario'),
  }), [datasets])

  return (
    <div className="space-y-6">
      {Object.entries(grouped).map(([kind, items]) => {
        const meta = KIND_META[kind]
        return (
          <section key={kind} className="bg-card rounded-2xl border border-stroke shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-stroke flex items-center justify-between">
              <div>
                <h2 className={`text-lg font-bold ${meta.accent}`}>{meta.label}</h2>
                <p className="text-sm text-ink-muted mt-1">{items.length}개 데이터셋</p>
              </div>
            </div>
            {items.length === 0 ? (
              <div className="px-6 py-10 text-sm text-ink-muted">아직 등록된 데이터셋이 없습니다.</div>
            ) : (
              <div className="divide-y divide-stroke">
                {items.map(dataset => (
                  <div key={dataset.id} className="px-6 py-5">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <h3 className="text-base font-bold text-ink-strong">{dataset.name}</h3>
                        <p className="text-xs text-ink-muted mt-1">버전 {dataset.versions.length}개</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`text-xs font-semibold rounded-full px-2 py-1 ${meta.badge}`}>
                          {meta.label}
                        </span>
                        {currentUser?.role === 'admin' && (
                          <button
                            onClick={() => onDeleteDataset(dataset)}
                            className="text-xs text-red-500 border border-red-200 rounded-full px-2.5 py-1 hover:bg-red-50 transition-colors"
                          >
                            데이터셋 삭제
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2 mt-4">
                      {dataset.versions.map(version => (
                        <Link
                          key={version.id}
                          to={`/datasets/version/${version.id}`}
                          className="border border-stroke rounded-xl px-3 py-2 text-sm hover:bg-primary-light transition-colors min-w-[180px]"
                        >
                          <div className="font-semibold text-ink-strong">v{version.version}</div>
                          <div className="text-xs text-ink-muted mt-1">
                            {version.matched_reviewed_count}/{version.total_items} export 가능
                          </div>
                        </Link>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )
      })}
    </div>
  )
}

function DatasetDetail({ versionDetail, currentUser, onDeleteVersion }) {
  const { exportDatasetVersion } = useFile()

  async function handleExport() {
    const filename = sanitizeFilename(
      `${versionDetail.dataset_kind}_${versionDetail.dataset_name}_v${versionDetail.version}.jsonl`,
    )
    await exportDatasetVersion(versionDetail.id, filename)
  }

  return (
    <div className="space-y-6">
      <section className="bg-card rounded-2xl border border-stroke shadow-sm p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className={`text-xs font-semibold rounded-full px-2 py-1 ${KIND_META[versionDetail.dataset_kind]?.badge ?? 'bg-surface text-ink-muted'}`}>
                {KIND_META[versionDetail.dataset_kind]?.label ?? versionDetail.dataset_kind}
              </span>
              <span className="text-xs text-ink-muted">v{versionDetail.version}</span>
            </div>
            <h2 className="text-2xl font-bold text-ink-strong mt-3">{versionDetail.dataset_name}</h2>
            <p className="text-sm text-ink-muted mt-1">
              {versionDetail.source_csv_filename} · 파일명 컬럼 {versionDetail.filename_column ?? '-'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {currentUser?.role === 'admin' && (
              <button
                onClick={() => onDeleteVersion(versionDetail)}
                className="border border-red-200 px-4 py-2 rounded-xl text-sm text-red-500 hover:bg-red-50 transition-colors"
              >
                버전 삭제
              </button>
            )}
            <button
              onClick={handleExport}
              disabled={versionDetail.matched_reviewed_count === 0}
              className="border border-stroke px-4 py-2 rounded-xl text-sm text-ink-base hover:bg-primary-light disabled:opacity-40 transition-colors"
            >
              검수완료 항목 Export
            </button>
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mt-6">
          <SummaryCard label="전체 행" value={versionDetail.total_items} />
          <SummaryCard label="검수완료 매칭" value={versionDetail.matched_reviewed_count} tone="text-status-reviewed-fg" />
          <SummaryCard label="미완료 매칭" value={versionDetail.matched_not_reviewed_count} tone="text-status-pending-fg" />
          <SummaryCard label="미매칭" value={versionDetail.unmatched_count} tone="text-ink-muted" />
          <SummaryCard label="중복 매칭" value={versionDetail.ambiguous_count} tone="text-red-500" />
        </div>
      </section>

      <section className="bg-card rounded-2xl border border-stroke shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-stroke">
          <h3 className="text-base font-bold text-ink-strong">버전 항목</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[920px]">
            <thead>
              <tr className="bg-surface border-b border-stroke">
                <th className="text-left px-5 py-3 text-xs font-semibold text-ink-muted uppercase tracking-wide">행</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-ink-muted uppercase tracking-wide">CSV 파일명</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-ink-muted uppercase tracking-wide">매칭 상태</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-ink-muted uppercase tracking-wide">검수 레코드</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-ink-muted uppercase tracking-wide">검수자</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-ink-muted uppercase tracking-wide">이동</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stroke">
              {versionDetail.items.map(item => {
                const matchMeta = MATCH_META[item.match_status] ?? MATCH_META.unmatched
                return (
                  <tr key={item.id} className="hover:bg-primary-light transition-colors">
                    <td className="px-5 py-3.5 text-sm text-ink-muted">{item.row_index}</td>
                    <td className="px-5 py-3.5 text-sm font-semibold text-ink-strong">{item.original_filename || '-'}</td>
                    <td className="px-5 py-3.5">
                      <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-semibold ${matchMeta.className}`}>
                        {matchMeta.label}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-sm text-ink-base">
                      {item.matched_record_source_filename ?? '-'}
                    </td>
                    <td className="px-5 py-3.5 text-sm text-ink-muted">
                      {item.reviewer_username ?? '-'}
                    </td>
                    <td className="px-5 py-3.5 text-sm">
                      {item.matched_record_id ? (
                        <Link to={`/review/${item.matched_record_id}`} className="text-primary hover:underline">
                          검수 화면
                        </Link>
                      ) : (
                        <span className="text-ink-muted">-</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}

export default function DatasetsPage() {
  const { versionId } = useParams()
  const navigate = useNavigate()
  const { currentUser, datasets, getDatasetVersion, deleteDataset, deleteDatasetVersion } = useFile()
  const [versionDetail, setVersionDetail] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [confirmState, setConfirmState] = useState(null)

  useEffect(() => {
    if (!versionId) {
      setVersionDetail(null)
      setError('')
      return
    }
    setLoading(true)
    setError('')
    getDatasetVersion(versionId)
      .then(data => setVersionDetail(data))
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [versionId, getDatasetVersion])

  async function handleConfirmAction() {
    if (!confirmState) return
    try {
      if (confirmState.type === 'dataset') {
        await deleteDataset(confirmState.dataset.id)
        if (versionDetail?.dataset_id === confirmState.dataset.id) {
          navigate('/datasets')
        }
      } else if (confirmState.type === 'version') {
        await deleteDatasetVersion(confirmState.version.id)
        if (versionDetail?.id === confirmState.version.id) {
          navigate('/datasets')
        }
      }
      setConfirmState(null)
    } catch (err) {
      setError(err.message)
      setConfirmState(null)
    }
  }

  return (
    <div className="min-h-screen bg-surface">
      <div className="max-w-7xl mx-auto px-6 py-8 space-y-6">
        <header className="flex items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-ink-muted">Dataset Workspace</p>
            <h1 className="text-2xl font-bold text-ink-strong mt-2">데이터셋 목록</h1>
            <p className="text-sm text-ink-muted mt-2">
              Golden Set과 Scenario Set 버전을 관리하고, 검수 완료된 항목만 별도 포맷으로 export합니다.
            </p>
          </div>
        </header>

        <DatasetOverview
          datasets={datasets}
          currentUser={currentUser}
          onDeleteDataset={dataset => setConfirmState({
            type: 'dataset',
            dataset,
            title: '데이터셋 삭제',
            body: `${dataset.name} 데이터셋과 모든 버전을 삭제합니다.\n이 작업은 되돌릴 수 없습니다.`,
            confirmLabel: '데이터셋 삭제',
          })}
        />

        {loading && (
          <div className="bg-card rounded-2xl border border-stroke p-8 text-sm text-ink-muted">
            데이터셋 버전 정보를 불러오는 중입니다...
          </div>
        )}

        {error && (
          <div className="bg-card rounded-2xl border border-red-200 p-8 text-sm text-red-600">
            {error}
          </div>
        )}

        {versionDetail && !loading && !error && (
          <DatasetDetail
            versionDetail={versionDetail}
            currentUser={currentUser}
            onDeleteVersion={version => setConfirmState({
              type: 'version',
              version,
              title: '버전 삭제',
              body: `v${version.version} 버전을 삭제합니다.\n마지막 버전이면 데이터셋 자체도 함께 제거됩니다.`,
              confirmLabel: '버전 삭제',
            })}
          />
        )}
      </div>
      {confirmState && (
        <ConfirmModal
          title={confirmState.title}
          body={confirmState.body}
          confirmLabel={confirmState.confirmLabel}
          destructive
          onCancel={() => setConfirmState(null)}
          onConfirm={handleConfirmAction}
        />
      )}
    </div>
  )
}
