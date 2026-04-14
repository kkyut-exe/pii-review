# 사이드바 + 삭제 대기 기능 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 검수 목록에 체크박스 선택 + 삭제 대기 이동 기능을 추가하고, 좌측 사이드바(대시보드 / 검수 목록 / 삭제 대기 목록)를 구축한다.

**Architecture:** React Router v6 중첩 라우팅으로 `MainLayout`(사이드바 포함)을 App Shell로 사용. `/`, `/list`, `/trash`는 MainLayout 아래에 중첩되고, `/review/:id`는 독립 라우트로 전체 너비 유지. 삭제 대기는 DB `status = 'pending_delete'`로 관리하며 복원 시 `prev_status`로 되돌린다.

**Tech Stack:** FastAPI, SQLAlchemy, SQLite, React 18, React Router v6, Tailwind CSS

**Spec:** `docs/superpowers/specs/2026-04-14-sidebar-deletion-queue-design.md`

---

## 파일 목록

| 파일 | 유형 | 역할 |
|------|------|------|
| `server/models.py` | 수정 | `Record`에 `prev_status` 컬럼 추가 |
| `server/schemas.py` | 수정 | `RecordOut`에 `prev_status` 추가, `BulkStatusUpdate`·`BulkDelete` 스키마 추가 |
| `server/router/records.py` | 수정 | PATCH 상태 업데이트 로직 변경, bulk-status·bulk-delete 엔드포인트 추가 |
| `tests/test_records.py` | 수정 | pending_delete 관련 테스트 추가 |
| `web/src/App.jsx` | 수정 | MainLayout 중첩 라우팅 구조로 변경 |
| `web/src/components/MainLayout.jsx` | 신규 | 사이드바 + `<Outlet />` 래퍼 |
| `web/src/components/Sidebar.jsx` | 신규 | 네비게이션 사이드바 |
| `web/src/pages/DashboardPage.jsx` | 신규 | 상태 카드 5개 + 진행률 바 |
| `web/src/context/FileContext.jsx` | 수정 | `bulkUpdateStatus`, `bulkDelete` 함수 추가 |
| `web/src/pages/ListPage.jsx` | 수정 | 체크박스 열, Bulk Action Bar, `pending_delete` 필터링 |
| `web/src/pages/DeletionQueuePage.jsx` | 신규 | 삭제 대기 목록 + 복원 + 영구 삭제 모달 |

---

## Task 1: 백엔드 — 모델 + 스키마 변경

**Files:**
- Modify: `server/models.py`
- Modify: `server/schemas.py`

- [ ] **Step 1: `Record` 모델에 `prev_status` 컬럼 추가**

`server/models.py`의 `Record` 클래스 `status` 줄 바로 아래에 추가:

```python
status = Column(String, default="pending")  # 'pending' | 'reviewing' | 'reviewed' | 'pending_delete'
prev_status = Column(String, nullable=True)  # pending_delete 이동 전 상태 보존
```

- [ ] **Step 2: `RecordOut` 스키마에 `prev_status` 추가**

`server/schemas.py`의 `RecordOut`에 추가:

```python
class RecordOut(BaseModel):
    id: str
    path: str
    source_filename: Optional[str]
    source: Optional[str]
    service_started_at: Optional[datetime]
    doc_text: Optional[str]
    pii_dict: Optional[dict]
    status: str
    prev_status: Optional[str] = None          # ← 추가
    reviewed_pii_dict: Optional[dict]
    complexity: Optional[str]
    reviewed_by: Optional[int]
    reviewed_at: Optional[datetime]
    reviewer_username: Optional[str] = None

    model_config = {"from_attributes": True}
```

- [ ] **Step 3: `BulkStatusUpdate`, `BulkDelete` 스키마 추가**

`server/schemas.py` 요청 스키마 섹션에 추가:

```python
class BulkStatusUpdate(BaseModel):
    ids: list[str]
    status: str


class BulkDelete(BaseModel):
    ids: list[str]
```

- [ ] **Step 4: 기존 `data/app.db`에 컬럼 마이그레이션**

```bash
python -c "
import sqlite3, os
path = 'data/app.db'
if not os.path.exists(path):
    print('DB 없음, 스킵')
else:
    conn = sqlite3.connect(path)
    try:
        conn.execute('ALTER TABLE records ADD COLUMN prev_status TEXT')
        conn.commit()
        print('마이그레이션 완료')
    except Exception as e:
        print(f'스킵 (이미 존재하거나 오류): {e}')
    finally:
        conn.close()
"
```

Expected: `마이그레이션 완료` 또는 `스킵 ...`

- [ ] **Step 5: 커밋**

```bash
git add server/models.py server/schemas.py
git commit -m "feat: add prev_status column and bulk operation schemas"
```

---

## Task 2: 백엔드 — PATCH /records/{id}/status 변경

**Files:**
- Modify: `server/router/records.py`
- Modify: `tests/test_records.py`

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/test_records.py` 하단에 추가:

```python
def test_patch_status_to_pending_delete_saves_prev_status(client, db_session):
    user = make_user(db_session)
    record = make_record(db_session, status="reviewing")
    headers = auth_headers(user.id, user.username, user.role)

    resp = client.patch(f"/records/{record.id}/status",
                        json={"status": "pending_delete"}, headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "pending_delete"
    assert data["prev_status"] == "reviewing"


def test_patch_status_invalid(client, db_session):
    user = make_user(db_session)
    record = make_record(db_session)
    headers = auth_headers(user.id, user.username, user.role)

    resp = client.patch(f"/records/{record.id}/status",
                        json={"status": "invalid_status"}, headers=headers)
    assert resp.status_code == 422
```

- [ ] **Step 2: 테스트 실패 확인**

```bash
pytest tests/test_records.py::test_patch_status_to_pending_delete_saves_prev_status tests/test_records.py::test_patch_status_invalid -v
```

Expected: FAIL (422 반환 로직, prev_status 저장 로직 없음)

- [ ] **Step 3: `update_status` 엔드포인트 수정**

`server/router/records.py`의 `update_status` 함수를 아래로 교체:

```python
VALID_STATUSES = {"pending", "reviewing", "reviewed", "pending_delete"}


@router.patch("/{record_id}/status", response_model=RecordOut)
def update_status(
    record_id: str,
    body: StatusUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if body.status not in VALID_STATUSES:
        raise HTTPException(status_code=422, detail=f"Invalid status: {body.status}")

    record = db.query(Record).filter_by(id=record_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="Record not found")

    # reviewed → reviewing 되돌리기는 admin만 가능
    if record.status == "reviewed" and body.status == "reviewing":
        if current_user.role != "admin":
            raise HTTPException(status_code=403, detail="Admin only")

    # pending_delete 이동 시 이전 상태 저장
    if body.status == "pending_delete":
        record.prev_status = record.status

    record.status = body.status
    db.commit()
    db.refresh(record)
    return _to_record_out(record)
```

imports 줄에 `VALID_STATUSES` 정의를 파일 상단 `VALID_COMPLEXITY` 바로 아래에 위치시킨다.

- [ ] **Step 4: 테스트 통과 확인**

```bash
pytest tests/test_records.py -v
```

Expected: 모두 PASS

- [ ] **Step 5: 커밋**

```bash
git add server/router/records.py tests/test_records.py
git commit -m "feat: allow pending_delete status and save prev_status on transition"
```

---

## Task 3: 백엔드 — POST /records/bulk-status

**Files:**
- Modify: `server/router/records.py`
- Modify: `server/schemas.py` (import 반영)
- Modify: `tests/test_records.py`

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/test_records.py` 하단에 추가:

```python
def test_bulk_status_to_pending_delete(client, db_session):
    user = make_user(db_session)
    r1 = make_record(db_session, path="/tmp/a/texts_chunked.json", status="pending")
    r2 = make_record(db_session, path="/tmp/b/texts_chunked.json", status="reviewing")
    headers = auth_headers(user.id, user.username, user.role)

    resp = client.post("/records/bulk-status",
                       json={"ids": [r1.id, r2.id], "status": "pending_delete"},
                       headers=headers)
    assert resp.status_code == 200
    assert resp.json()["updated"] == 2

    # prev_status 저장 확인
    resp1 = client.get(f"/records/{r1.id}", headers=headers)
    assert resp1.json()["status"] == "pending_delete"
    assert resp1.json()["prev_status"] == "pending"

    resp2 = client.get(f"/records/{r2.id}", headers=headers)
    assert resp2.json()["prev_status"] == "reviewing"


def test_bulk_status_invalid_status(client, db_session):
    user = make_user(db_session)
    record = make_record(db_session)
    headers = auth_headers(user.id, user.username, user.role)

    resp = client.post("/records/bulk-status",
                       json={"ids": [record.id], "status": "bad"},
                       headers=headers)
    assert resp.status_code == 422
```

- [ ] **Step 2: 테스트 실패 확인**

```bash
pytest tests/test_records.py::test_bulk_status_to_pending_delete tests/test_records.py::test_bulk_status_invalid_status -v
```

Expected: FAIL (엔드포인트 없음)

- [ ] **Step 3: bulk-status 엔드포인트 추가**

`server/router/records.py` import 줄에 `BulkStatusUpdate` 추가:

```python
from server.schemas import RecordOut, RecordListOut, StatusUpdate, ReviewUpdate, BulkStatusUpdate, BulkDelete
```

`router.get("/export")` 바로 위에 추가 (라우트 순서 중요):

```python
@router.post("/bulk-status")
def bulk_update_status(
    body: BulkStatusUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if body.status not in VALID_STATUSES:
        raise HTTPException(status_code=422, detail=f"Invalid status: {body.status}")

    records = db.query(Record).filter(Record.id.in_(body.ids)).all()
    for record in records:
        if body.status == "pending_delete":
            record.prev_status = record.status
        record.status = body.status

    db.commit()
    return {"updated": len(records)}
```

- [ ] **Step 4: 테스트 통과 확인**

```bash
pytest tests/test_records.py -v
```

Expected: 모두 PASS

- [ ] **Step 5: 커밋**

```bash
git add server/router/records.py server/schemas.py tests/test_records.py
git commit -m "feat: add POST /records/bulk-status endpoint"
```

---

## Task 4: 백엔드 — DELETE 엔드포인트 (admin 전용)

**Files:**
- Modify: `server/router/records.py`
- Modify: `tests/test_records.py`

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/test_records.py` 하단에 추가:

```python
def test_bulk_delete_admin_only(client, db_session):
    reviewer = make_user(db_session, username="rev", role="reviewer")
    admin = make_user(db_session, username="adm", role="admin")
    r1 = make_record(db_session, path="/tmp/x/texts_chunked.json", status="pending_delete")
    r2 = make_record(db_session, path="/tmp/y/texts_chunked.json", status="pending_delete")

    # reviewer 거부
    headers_rev = auth_headers(reviewer.id, reviewer.username, reviewer.role)
    resp = client.request("DELETE", "/records/bulk",
                          json={"ids": [r1.id]}, headers=headers_rev)
    assert resp.status_code == 403

    # admin 성공
    headers_adm = auth_headers(admin.id, admin.username, admin.role)
    resp = client.request("DELETE", "/records/bulk",
                          json={"ids": [r1.id, r2.id]}, headers=headers_adm)
    assert resp.status_code == 204

    # DB에서 삭제됐는지 확인
    resp = client.get(f"/records/{r1.id}", headers=headers_adm)
    assert resp.status_code == 404


def test_delete_single_admin_only(client, db_session):
    reviewer = make_user(db_session, username="rev2", role="reviewer")
    admin = make_user(db_session, username="adm2", role="admin")
    record = make_record(db_session)

    headers_rev = auth_headers(reviewer.id, reviewer.username, reviewer.role)
    resp = client.delete(f"/records/{record.id}", headers=headers_rev)
    assert resp.status_code == 403

    headers_adm = auth_headers(admin.id, admin.username, admin.role)
    resp = client.delete(f"/records/{record.id}", headers=headers_adm)
    assert resp.status_code == 204
```

- [ ] **Step 2: 테스트 실패 확인**

```bash
pytest tests/test_records.py::test_bulk_delete_admin_only tests/test_records.py::test_delete_single_admin_only -v
```

Expected: FAIL (엔드포인트 없음)

- [ ] **Step 3: DELETE 엔드포인트 추가**

`server/router/records.py`에서 `bulk_update_status` 바로 아래에 추가 (`/{record_id}` GET 라우트보다 먼저 위치해야 함):

```python
@router.delete("/bulk", status_code=204)
def bulk_delete_records(
    body: BulkDelete,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    db.query(Record).filter(Record.id.in_(body.ids)).delete(synchronize_session=False)
    db.commit()


@router.delete("/{record_id}", status_code=204)
def delete_record(
    record_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    record = db.query(Record).filter_by(id=record_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="Record not found")
    db.delete(record)
    db.commit()
```

- [ ] **Step 4: 전체 테스트 통과 확인**

```bash
pytest tests/ -v
```

Expected: 모두 PASS

- [ ] **Step 5: 커밋**

```bash
git add server/router/records.py tests/test_records.py
git commit -m "feat: add DELETE /records/bulk and DELETE /records/{id} (admin only)"
```

---

## Task 5: 프론트엔드 — MainLayout + Sidebar + App.jsx 라우팅

**Files:**
- Create: `web/src/components/MainLayout.jsx`
- Create: `web/src/components/Sidebar.jsx`
- Modify: `web/src/App.jsx`

- [ ] **Step 1: `MainLayout.jsx` 생성**

```jsx
// web/src/components/MainLayout.jsx
import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'

export default function MainLayout() {
  return (
    <div className="flex min-h-screen bg-surface">
      <Sidebar />
      <main className="flex-1 min-w-0">
        <Outlet />
      </main>
    </div>
  )
}
```

- [ ] **Step 2: `Sidebar.jsx` 생성**

```jsx
// web/src/components/Sidebar.jsx
import { NavLink } from 'react-router-dom'
import { useFile } from '../context/FileContext'

const NAV_ITEMS = [
  { to: '/',      end: true,  icon: '📊', label: '대시보드' },
  { to: '/list',  end: false, icon: '📋', label: '검수 목록' },
  { to: '/trash', end: false, icon: '🗑️', label: '삭제 대기' },
]

export default function Sidebar() {
  const { currentUser, records, logout } = useFile()
  const pendingDeleteCount = records.filter(r => r.status === 'pending_delete').length

  return (
    <aside className="w-60 min-h-screen bg-card border-r border-stroke flex flex-col shrink-0">
      {/* 로고 */}
      <div className="px-5 py-5 border-b border-stroke">
        <span className="text-sm font-bold text-ink-strong">
          PII <span className="text-primary">Review</span>
        </span>
      </div>

      {/* 네비게이션 */}
      <nav className="flex-1 py-2">
        {NAV_ITEMS.map(({ to, end, icon, label }) => {
          const badge = to === '/trash' ? pendingDeleteCount : 0
          return (
            <NavLink key={to} to={to} end={end} className="block">
              {({ isActive }) => (
                <div className={`relative flex items-center gap-3 px-5 py-2.5 text-sm cursor-pointer transition-colors
                  ${isActive
                    ? 'bg-primary-light text-primary font-semibold'
                    : 'text-ink-base hover:bg-primary-light'}`}>
                  {isActive && (
                    <span className="absolute left-0 top-1 bottom-1 w-[3px] bg-primary rounded-r" />
                  )}
                  <span>{icon}</span>
                  <span>{label}</span>
                  {badge > 0 && (
                    <span className="ml-auto bg-red-500 text-white text-[10px] font-bold rounded-full px-1.5 py-px leading-none">
                      {badge}
                    </span>
                  )}
                </div>
              )}
            </NavLink>
          )
        })}
      </nav>

      {/* 유저 / 로그아웃 */}
      <div className="px-5 py-3 border-t border-stroke">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-full bg-primary-light text-primary text-[11px] font-bold flex items-center justify-center shrink-0">
            {currentUser?.username?.[0]?.toUpperCase()}
          </div>
          <span className="text-xs text-ink-muted flex-1 truncate">{currentUser?.username}</span>
          <button
            onClick={logout}
            className="text-xs text-ink-muted hover:text-ink-base px-1.5 py-0.5 rounded hover:bg-primary-light transition-colors"
          >
            로그아웃
          </button>
        </div>
      </div>
    </aside>
  )
}
```

- [ ] **Step 3: `App.jsx` 라우팅 재구성**

```jsx
// web/src/App.jsx
import { createHashRouter, RouterProvider, Navigate } from 'react-router-dom'
import { FileProvider, useFile } from './context/FileContext'
import MainLayout from './components/MainLayout'
import ListPage from './pages/ListPage'
import ReviewPage from './pages/ReviewPage'
import LoginPage from './pages/LoginPage'
import DashboardPage from './pages/DashboardPage'
import DeletionQueuePage from './pages/DeletionQueuePage'

function RequireAuth({ children }) {
  const { currentUser } = useFile()
  if (!currentUser) return <Navigate to="/login" replace />
  return children
}

const router = createHashRouter([
  { path: '/login', element: <LoginPage /> },
  {
    path: '/review/:id',
    element: <RequireAuth><ReviewPage /></RequireAuth>,
  },
  {
    path: '/',
    element: <RequireAuth><MainLayout /></RequireAuth>,
    children: [
      { index: true, element: <DashboardPage /> },
      { path: 'list', element: <ListPage /> },
      { path: 'trash', element: <DeletionQueuePage /> },
    ],
  },
])

export default function App() {
  return (
    <FileProvider>
      <RouterProvider router={router} />
    </FileProvider>
  )
}
```

- [ ] **Step 4: 개발 서버에서 사이드바 + 라우팅 동작 확인**

```bash
cd web && npm run dev
```

- `/` → 빈 DashboardPage (아직 미구현) + 사이드바 표시
- `/list` → 기존 ListPage + 사이드바 표시
- `/review/:id` → 사이드바 없이 ReviewPage 표시
- 네비게이션 클릭 시 활성 항목 강조 확인

- [ ] **Step 5: 커밋**

```bash
git add web/src/App.jsx web/src/components/MainLayout.jsx web/src/components/Sidebar.jsx
git commit -m "feat: add MainLayout, Sidebar, and nested routing structure"
```

---

## Task 6: 프론트엔드 — DashboardPage

**Files:**
- Create: `web/src/pages/DashboardPage.jsx`

- [ ] **Step 1: `DashboardPage.jsx` 생성**

```jsx
// web/src/pages/DashboardPage.jsx
import { useFile } from '../context/FileContext'

const CARDS = [
  { key: 'all',            label: '전체',     color: 'text-ink-strong' },
  { key: 'pending',        label: '검수전',   color: 'text-status-pending-fg' },
  { key: 'reviewing',      label: '검수중',   color: 'text-status-reviewing-fg' },
  { key: 'reviewed',       label: '완료',     color: 'text-status-reviewed-fg' },
  { key: 'pending_delete', label: '삭제 대기', color: 'text-red-500' },
]

export default function DashboardPage() {
  const { records } = useFile()

  const counts = {
    all:            records.length,
    pending:        records.filter(r => r.status === 'pending').length,
    reviewing:      records.filter(r => r.status === 'reviewing').length,
    reviewed:       records.filter(r => r.status === 'reviewed').length,
    pending_delete: records.filter(r => r.status === 'pending_delete').length,
  }

  const progress = counts.all > 0
    ? Math.round((counts.reviewed / counts.all) * 100)
    : 0

  return (
    <div className="p-8">
      <h1 className="text-xl font-bold text-ink-strong mb-6">대시보드</h1>

      {/* 상태 카드 */}
      <div className="flex gap-4 mb-6">
        {CARDS.map(({ key, label, color }) => (
          <div key={key} className="flex-1 bg-card rounded-xl border border-stroke px-5 py-4">
            <p className="text-xs text-ink-muted mb-1">{label}</p>
            <p className={`text-3xl font-bold ${color}`}>{counts[key]}</p>
          </div>
        ))}
      </div>

      {/* 진행률 */}
      <div className="bg-card rounded-xl border border-stroke px-5 py-4">
        <p className="text-sm font-semibold text-ink-base mb-3">전체 검수 진행률</p>
        <div className="bg-surface rounded-full h-3 overflow-hidden mb-2">
          <div
            className="h-full bg-gradient-to-r from-primary to-purple-400 rounded-full transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
        <p className="text-xs text-ink-muted">
          {counts.reviewed} / {counts.all} 완료 · {progress}%
        </p>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: 브라우저에서 `/` 경로 확인**

카드 5개와 진행률 바가 올바르게 표시되는지 확인. 레코드가 없을 때 모두 0 · 0% 표시 확인.

- [ ] **Step 3: 커밋**

```bash
git add web/src/pages/DashboardPage.jsx
git commit -m "feat: add DashboardPage with status cards and progress bar"
```

---

## Task 7: 프론트엔드 — FileContext `bulkUpdateStatus` + `bulkDelete`

**Files:**
- Modify: `web/src/context/FileContext.jsx`

- [ ] **Step 1: `FileContext.jsx`에 두 함수 추가**

`exportReviewed` 함수 바로 아래에 추가:

```js
async function bulkUpdateStatus(ids, newStatus) {
  await apiFetch('/records/bulk-status', {
    method: 'POST',
    body: JSON.stringify({ ids, status: newStatus }),
  })
  await fetchRecords()
}

async function bulkDelete(ids) {
  await apiFetch('/records/bulk', {
    method: 'DELETE',
    body: JSON.stringify({ ids }),
  })
  await fetchRecords()
}
```

- [ ] **Step 2: Provider의 value에 두 함수 노출**

`FileContext.Provider value={{...}}` 안에 추가:

```jsx
<FileContext.Provider value={{
  currentUser,
  records,
  login,
  logout,
  setRecordStatus,
  saveReview,
  uploadLog,
  exportReviewed,
  fetchRecords,
  bulkUpdateStatus,   // ← 추가
  bulkDelete,         // ← 추가
}}>
```

- [ ] **Step 3: 커밋**

```bash
git add web/src/context/FileContext.jsx
git commit -m "feat: add bulkUpdateStatus and bulkDelete to FileContext"
```

---

## Task 8: 프론트엔드 — ListPage 체크박스 + Bulk Action Bar

**Files:**
- Modify: `web/src/pages/ListPage.jsx`

- [ ] **Step 1: import와 상태 변수 추가**

`ListPage.jsx` 상단 import에 추가:

```js
import { useState, useRef, useMemo, useEffect, useCallback } from 'react'
```

`useFile()` 구조분해에 `bulkUpdateStatus` 추가:

```js
const { currentUser, records, exportReviewed, uploadLog, logout, bulkUpdateStatus } = useFile()
```

상태 변수 추가 (기존 `const [uploading, ...]` 아래):

```js
const [selectedIds, setSelectedIds] = useState(new Set())
```

- [ ] **Step 2: `pending_delete` 레코드 필터링 추가**

`filteredSorted` useMemo 첫 줄을 수정:

```js
const filteredSorted = useMemo(() => {
  let result = records.filter(r => r.status !== 'pending_delete')  // ← 추가
  if (filter !== 'all') result = result.filter(r => r.status === filter)
  // ... 이하 기존 코드 동일
```

- [ ] **Step 3: 체크박스 헬퍼 함수 추가**

`handleSearch` 함수 아래에 추가:

```js
const allPageSelected = pageRecords.length > 0 && pageRecords.every(r => selectedIds.has(r.id))

function toggleSelectAll(checked) {
  setSelectedIds(prev => {
    const next = new Set(prev)
    if (checked) pageRecords.forEach(r => next.add(r.id))
    else pageRecords.forEach(r => next.delete(r.id))
    return next
  })
}

function toggleSelectOne(id) {
  setSelectedIds(prev => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  })
}

async function handleMoveToTrash() {
  try {
    await bulkUpdateStatus([...selectedIds], 'pending_delete')
    setSelectedIds(new Set())
  } catch (err) {
    alert(`실패: ${err.message}`)
  }
}
```

- [ ] **Step 4: 테이블 헤더에 체크박스 열 추가**

헤더 `<tr>` 첫 번째 `<th>` 앞에 추가:

```jsx
<th className="w-10 px-4 py-3">
  <input
    type="checkbox"
    checked={allPageSelected}
    onChange={e => toggleSelectAll(e.target.checked)}
    className="w-3 h-3 accent-primary cursor-pointer"
  />
</th>
```

- [ ] **Step 5: 테이블 바디 각 행에 체크박스 열 추가**

`pageRecords.map(record => ...)` 안의 `<tr>`에서:

```jsx
<tr
  key={record.id}
  onClick={() => navigate(`/review/${record.id}`)}
  className="hover:bg-primary-light cursor-pointer transition-colors group"
>
  <td
    className="px-4 py-3.5"
    onClick={e => e.stopPropagation()}
  >
    <input
      type="checkbox"
      checked={selectedIds.has(record.id)}
      onChange={() => toggleSelectOne(record.id)}
      className="w-3 h-3 accent-primary cursor-pointer"
    />
  </td>
  {/* 기존 td들 그대로 유지 */}
```

- [ ] **Step 6: Bulk Action Bar 추가**

테이블 `</div>` (`.bg-card rounded-xl ...` 컨테이너) 닫기 태그 바로 앞에 조건부 렌더링 추가:

```jsx
{selectedIds.size > 0 && (
  <div className="flex items-center gap-3 bg-ink-strong text-white px-5 py-3 rounded-b-xl -mt-px">
    <span className="text-sm font-bold text-purple-300">{selectedIds.size}건</span>
    <span className="text-sm text-white/70">선택됨</span>
    <button
      onClick={() => setSelectedIds(new Set())}
      className="text-sm text-white/50 border border-white/20 rounded-lg px-3 py-1 hover:text-white hover:border-white/40 transition-colors"
    >
      취소
    </button>
    <button
      onClick={handleMoveToTrash}
      className="ml-auto text-sm bg-red-500 hover:bg-red-600 text-white font-semibold rounded-lg px-4 py-1.5 transition-colors"
    >
      🗑️ 삭제 대기로 이동
    </button>
  </div>
)}
```

- [ ] **Step 7: 브라우저에서 동작 확인**

- 체크박스 클릭 시 행 이동 없이 선택만 됨
- 헤더 체크박스로 현재 페이지 전체 선택/해제
- 1건 이상 선택 시 Bulk Action Bar 등장
- "삭제 대기로 이동" 클릭 후 해당 레코드가 목록에서 사라지고 선택 초기화

- [ ] **Step 8: 커밋**

```bash
git add web/src/pages/ListPage.jsx
git commit -m "feat: add checkbox selection and bulk action bar to ListPage"
```

---

## Task 9: 프론트엔드 — DeletionQueuePage

**Files:**
- Create: `web/src/pages/DeletionQueuePage.jsx`

- [ ] **Step 1: `DeletionQueuePage.jsx` 생성**

```jsx
// web/src/pages/DeletionQueuePage.jsx
import { useState } from 'react'
import { useFile } from '../context/FileContext'

function ConfirmModal({ count, onConfirm, onCancel }) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-card rounded-xl border border-stroke p-6 w-80 shadow-xl">
        <h3 className="text-base font-bold text-ink-strong mb-2">영구 삭제 확인</h3>
        <p className="text-sm text-ink-base mb-6">
          {count}건을 영구 삭제합니다. 이 작업은 되돌릴 수 없습니다.
        </p>
        <div className="flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="text-sm text-ink-muted px-4 py-2 rounded-lg hover:bg-primary-light transition-colors"
          >
            취소
          </button>
          <button
            onClick={onConfirm}
            className="text-sm bg-red-500 hover:bg-red-600 text-white font-semibold px-4 py-2 rounded-lg transition-colors"
          >
            삭제
          </button>
        </div>
      </div>
    </div>
  )
}

export default function DeletionQueuePage() {
  const { currentUser, records, setRecordStatus, bulkDelete } = useFile()
  const [selectedIds, setSelectedIds] = useState(new Set())
  const [showModal, setShowModal] = useState(false)

  const trashRecords = records.filter(r => r.status === 'pending_delete')
  const allSelected = trashRecords.length > 0 && trashRecords.every(r => selectedIds.has(r.id))

  function toggleSelectAll(checked) {
    setSelectedIds(checked ? new Set(trashRecords.map(r => r.id)) : new Set())
  }

  function toggleSelectOne(id) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function handleRestore() {
    if (selectedIds.size === 0) return
    try {
      // 레코드마다 prev_status가 다를 수 있어 순차 호출 (race condition 방지)
      const selected = trashRecords.filter(r => selectedIds.has(r.id))
      for (const r of selected) {
        await setRecordStatus(r.id, r.prev_status ?? 'pending')
      }
      setSelectedIds(new Set())
    } catch (err) {
      alert(`복원 실패: ${err.message}`)
    }
  }

  async function handleDeleteConfirm() {
    try {
      await bulkDelete([...selectedIds])
      setSelectedIds(new Set())
    } catch (err) {
      alert(`삭제 실패: ${err.message}`)
    } finally {
      setShowModal(false)
    }
  }

  return (
    <div className="min-h-screen bg-surface">
      <div className="max-w-5xl mx-auto px-6 py-8">

        {/* 헤더 */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold text-ink-strong">삭제 대기 목록</h1>
            <p className="text-sm text-ink-muted mt-1">전체 {trashRecords.length}건</p>
          </div>
          {selectedIds.size > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-ink-muted">{selectedIds.size}건 선택</span>
              <button
                onClick={handleRestore}
                className="text-sm border border-stroke text-ink-base px-3 py-1.5 rounded-lg hover:bg-primary-light transition-colors"
              >
                ↩ 복원
              </button>
              {currentUser?.role === 'admin' && (
                <button
                  onClick={() => setShowModal(true)}
                  className="text-sm bg-red-500 hover:bg-red-600 text-white font-semibold px-3 py-1.5 rounded-lg transition-colors"
                >
                  🗑️ 영구 삭제
                </button>
              )}
            </div>
          )}
        </div>

        {/* 테이블 */}
        <div className="bg-card rounded-xl border border-stroke shadow-sm overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="bg-surface border-b border-stroke">
                <th className="w-10 px-4 py-3">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={e => toggleSelectAll(e.target.checked)}
                    className="w-3 h-3 accent-primary cursor-pointer"
                  />
                </th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-ink-muted uppercase tracking-wide">파일명</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-ink-muted uppercase tracking-wide">소스</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-ink-muted uppercase tracking-wide">이전 상태</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stroke">
              {trashRecords.map(record => (
                <tr key={record.id} className="hover:bg-primary-light transition-colors">
                  <td
                    className="px-4 py-3.5"
                    onClick={e => e.stopPropagation()}
                  >
                    <input
                      type="checkbox"
                      checked={selectedIds.has(record.id)}
                      onChange={() => toggleSelectOne(record.id)}
                      className="w-3 h-3 accent-primary cursor-pointer"
                    />
                  </td>
                  <td className="px-5 py-3.5 text-sm font-semibold text-ink-strong">📄 {record.source_filename}</td>
                  <td className="px-5 py-3.5 text-xs text-ink-muted">{record.source}</td>
                  <td className="px-5 py-3.5">
                    <span className="text-xs text-ink-muted bg-surface px-2 py-0.5 rounded-full">
                      {record.prev_status ?? 'pending'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {trashRecords.length === 0 && (
            <div className="text-center py-12 text-sm text-ink-muted">
              삭제 대기 중인 항목이 없습니다.
            </div>
          )}
        </div>
      </div>

      {showModal && (
        <ConfirmModal
          count={selectedIds.size}
          onConfirm={handleDeleteConfirm}
          onCancel={() => setShowModal(false)}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 2: 브라우저에서 전체 흐름 확인**

1. `/list`에서 레코드 체크 → "삭제 대기로 이동" 클릭
2. 사이드바 삭제 대기 배지 숫자 증가 확인
3. `/trash`에서 해당 레코드 + 이전 상태 컬럼 확인
4. 복원 버튼 → `/list`에 다시 나타나는지 확인
5. admin 계정으로 영구 삭제 → 모달 확인 → DB에서 제거 확인
6. reviewer 계정에서 "영구 삭제" 버튼 비표시 확인

- [ ] **Step 3: 커밋**

```bash
git add web/src/pages/DeletionQueuePage.jsx
git commit -m "feat: add DeletionQueuePage with restore and permanent delete"
```

---

## 최종 확인

- [ ] 전체 pytest 통과: `pytest tests/ -v`
- [ ] 개발 서버에서 전체 흐름 재확인 (admin + reviewer 각각)
- [ ] ListPage의 `pending_delete` 레코드가 필터 탭 카운트에서도 제외되는지 확인

