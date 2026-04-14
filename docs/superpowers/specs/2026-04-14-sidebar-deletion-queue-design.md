# 사이드바 + 삭제 대기 기능 설계

> 작성일: 2026-04-14

---

## 1. 개요

검수 목록에서 다중 선택(체크박스)으로 레코드를 삭제 대기 상태로 이동하고,
admin이 최종 영구 삭제를 확정하는 기능.
좌측 사이드바(대시보드 / 검수 목록 / 삭제 대기 목록)를 추가해 주요 페이지 간 이동을 제공한다.

---

## 2. 확정된 결정 사항

| 항목 | 결정 |
|------|------|
| 레이아웃 방식 | React Router v6 중첩 라우팅 — `MainLayout` App Shell |
| 사이드바 너비 | 240px |
| 사이드바 표시 범위 | `/`, `/list`, `/trash` 에서만 표시. `/review/:id` 는 전체 너비 유지 |
| 삭제 대기 영속성 | DB `records.status = 'pending_delete'` |
| 삭제 대기 추가 권한 | 모든 사용자(reviewer 포함) |
| 영구 삭제 권한 | admin 전용 |
| 복원 시 상태 | 이전 상태(`prev_status`)를 기억했다가 그대로 복원 |
| 영구 삭제 확인 | 모달 UI (브라우저 `confirm()` 사용 안 함) |
| 대시보드 진행률 분모 | `pending_delete` 포함한 전체 레코드 수 |
| 헤더 체크박스 범위 | 현재 페이지 레코드 전체 선택 |
| ListPage 필터 | `pending_delete` 상태는 자동 제외 |

---

## 3. 라우트 변경

```
기존  /           → ListPage
변경  /           → DashboardPage   (MainLayout 안)
      /list       → ListPage        (MainLayout 안)
      /trash      → DeletionQueuePage (MainLayout 안)
      /review/:id → ReviewPage      (MainLayout 밖, 사이드바 없음)
      /login      → LoginPage       (변경 없음)
```

`MainLayout` 은 좌측 240px 사이드바 + 우측 콘텐츠 영역으로 구성된다.

---

## 4. 사이드바 (`Sidebar` 컴포넌트)

**네비게이션 항목**
- 📊 대시보드 → `/`
- 📋 검수 목록 → `/list`
- 🗑️ 삭제 대기 → `/trash` (pending_delete 건수 배지 표시)

**하단**
- 유저 아바타 + username
- 로그아웃 버튼

**활성 상태**: 현재 경로와 일치하는 항목에 좌측 3px 보라색 바 + 배경 강조(`primary-light`)

---

## 5. 대시보드 페이지 (`DashboardPage`)

**상태 카드 5개** (가로 배열)
- 전체 / 검수전 / 검수중 / 완료 / 삭제 대기
- 각 카드는 상태별 색상 토큰 사용

**진행률 섹션**
- 라벨: "전체 검수 진행률"
- 진행률 = `reviewed 건수 / 전체 건수(pending_delete 포함)` × 100
- 그라데이션 progress bar + `N / M 완료 · N%` 메타 텍스트

**데이터 소스**: `GET /records?limit=500` — `pending_delete` 포함 전체 레코드를 가져와 프론트엔드에서 집계.
추가 API 불필요. FileContext의 `records` 상태는 모든 status를 포함한다.

---

## 6. 검수 목록 체크박스 선택 (`ListPage` 변경)

**체크박스 열**
- 테이블 첫 번째 열로 추가, 항상 표시
- 커스텀 CSS 체크박스 (11px, 체크 시 `primary` 보라색)
- 체크박스 클릭과 행 클릭(검수 페이지 이동) 이벤트 분리 (`stopPropagation`)
- 헤더 체크박스: 현재 페이지(`pageRecords`)의 전체 선택/해제

**Bulk Action Bar**
- 1건 이상 선택 시 테이블 하단에 검정 배경 bar 노출
- `N건 선택됨` + `취소` + `🗑️ 삭제 대기로 이동` 버튼
- "삭제 대기로 이동" 클릭 → `POST /records/bulk-status` 호출 → 성공 시 선택 초기화 + 목록 새로고침

**ListPage 필터**: `pending_delete` 상태 레코드는 표시하지 않는다.
클라이언트 필터링으로 처리 — `records` 상태에서 `status !== 'pending_delete'`인 항목만 렌더링.

---

## 7. 삭제 대기 페이지 (`DeletionQueuePage`, `/trash`)

**데이터**: `GET /records?status=pending_delete` 로 조회

**테이블 컬럼**: 체크박스 / 파일명 / 소스 / 이전 상태(`prev_status`) / 추가 날짜

**액션 버튼** (테이블 상단)
- `↩ 복원` — 선택된 항목을 `prev_status`로 되돌림. 누구나 가능.
- `🗑️ 영구 삭제` — admin 전용. 선택된 항목 영구 삭제.
  - 클릭 시 확인 모달 표시: "N건을 영구 삭제합니다. 되돌릴 수 없습니다."
  - 확인 후 `DELETE /records/bulk` 호출

**reviewer 뷰**: "영구 삭제" 버튼 비표시(hidden).

---

## 8. 백엔드 변경

### 8.1 DB

`records.status` 허용값에 `pending_delete` 추가.
`records` 테이블에 `prev_status TEXT` 컬럼 추가 — 삭제 대기 이동 전 상태를 저장.

### 8.2 신규/변경 API

| Method | Path | 설명 | 권한 |
|--------|------|------|------|
| `PATCH` | `/records/{id}/status` | 기존 — `pending_delete` 허용값 추가, `prev_status` 자동 저장 | 전체 |
| `POST` | `/records/bulk-status` | 복수 id를 한 번에 상태 변경. body: `{ids, status}` | 전체 |
| `DELETE` | `/records/{id}` | 단건 영구 삭제 | admin |
| `DELETE` | `/records/bulk` | 복수 id 일괄 영구 삭제. body: `{ids}` | admin |

### 8.3 GET /records 변경

- 기본 동작 변경 없음 — 모든 status 반환 (클라이언트에서 필터링)
- `?status=pending_delete` 쿼리 파라미터는 DeletionQueuePage 전용 조회에 활용 가능 (선택적 구현)

---

## 9. 프론트엔드 파일 변경 목록

| 파일 | 변경 유형 | 내용 |
|------|-----------|------|
| `App.jsx` | 수정 | `MainLayout` 중첩 라우팅 추가, `/` 경로를 DashboardPage로 변경 |
| `components/Sidebar.jsx` | 신규 | 사이드바 컴포넌트 |
| `components/MainLayout.jsx` | 신규 | 사이드바 + 콘텐츠 영역 래퍼 |
| `pages/DashboardPage.jsx` | 신규 | 상태 카드 + 진행률 |
| `pages/DeletionQueuePage.jsx` | 신규 | 삭제 대기 목록 + 복원/삭제 |
| `pages/ListPage.jsx` | 수정 | 체크박스 열, Bulk Action Bar, `pending_delete` 필터링 추가 |
| `context/FileContext.jsx` | 수정 | `bulkUpdateStatus`, `bulkDelete` 함수 추가 |

---

## 10. 미결 사항

없음. 모든 결정 완료.
