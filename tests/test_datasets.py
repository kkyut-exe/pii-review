import io
import json
import unicodedata

from tests.conftest import make_user, auth_headers
from server.models import Record


CSV_CONTENT = """파일명,메모
done.pdf,완료건
pending.pdf,대기건
missing.pdf,없음
"""


def make_record(db, record_id: str, filename: str, status: str):
    record = Record(
        id=record_id,
        path=f"/tmp/{record_id}/texts_chunked.json",
        source_filename=filename,
        source="text",
        service_started_at=None,
        doc_text="sample",
        pii_dict={"NAME": [], "ADDRESS": [], "POSTAL": [], "RESIDENT": [], "CONTACT": [], "EMAIL": [], "BIRTHDATE": [], "GENDER": [], "AGE": []},
        reviewed_pii_dict={"NAME": ["홍길동"]} if status == "reviewed" else None,
        complexity="low" if status == "reviewed" else None,
        status=status,
    )
    db.add(record)
    db.commit()
    db.refresh(record)
    return record


def upload_dataset(client, headers, name="주민센터 골든셋", kind="golden", version="0.1", filename="items.csv"):
    return client.post(
        "/datasets/upload",
        headers=headers,
        data={"name": name, "kind": kind, "version": version},
        files={"file": (filename, io.BytesIO(CSV_CONTENT.encode("utf-8")), "text/csv")},
    )


def test_upload_dataset_creates_items_and_matches(client, db_session):
    admin = make_user(db_session, username="admin1", role="admin")
    done = make_record(db_session, "record-reviewed", "done.pdf", "reviewed")
    pending = make_record(db_session, "record-pending", "pending.pdf", "pending")

    resp = upload_dataset(client, auth_headers(admin.id, admin.username, admin.role))
    assert resp.status_code == 201
    version_id = resp.json()["version_id"]

    detail = client.get(f"/datasets/versions/{version_id}", headers=auth_headers(admin.id, admin.username, admin.role))
    assert detail.status_code == 200
    data = detail.json()
    assert data["dataset_name"] == "주민센터 골든셋"
    assert data["dataset_kind"] == "golden"
    assert data["version"] == "0.1"
    assert data["total_items"] == 3
    assert data["matched_reviewed_count"] == 1
    assert data["matched_not_reviewed_count"] == 1
    assert data["unmatched_count"] == 1
    assert {item["matched_record_id"] for item in data["items"] if item["matched_record_id"]} == {done.id, pending.id}


def test_upload_dataset_requires_admin(client, db_session):
    reviewer = make_user(db_session, username="reviewer1", role="reviewer")
    resp = upload_dataset(client, auth_headers(reviewer.id, reviewer.username, reviewer.role))
    assert resp.status_code == 403


def test_upload_dataset_rejects_duplicate_version(client, db_session):
    admin = make_user(db_session, username="admin2", role="admin")
    headers = auth_headers(admin.id, admin.username, admin.role)

    first = upload_dataset(client, headers)
    assert first.status_code == 201

    second = upload_dataset(client, headers)
    assert second.status_code == 409


def test_list_datasets_groups_versions(client, db_session):
    admin = make_user(db_session, username="admin3", role="admin")
    headers = auth_headers(admin.id, admin.username, admin.role)

    resp = upload_dataset(client, headers, name="시나리오 A", kind="scenario", version="0.1")
    assert resp.status_code == 201

    listing = client.get("/datasets", headers=headers)
    assert listing.status_code == 200
    data = listing.json()
    assert len(data) == 1
    assert data[0]["name"] == "시나리오 A"
    assert data[0]["kind"] == "scenario"
    assert data[0]["versions"][0]["version"] == "0.1"


def test_export_dataset_returns_reviewed_matches_only(client, db_session):
    admin = make_user(db_session, username="admin4", role="admin")
    headers = auth_headers(admin.id, admin.username, admin.role)
    reviewed = make_record(db_session, "record-reviewed-2", "done.pdf", "reviewed")
    make_record(db_session, "record-pending-2", "pending.pdf", "pending")

    csv_content = """번호,타입,발급자,파일명
0021,사업자등록증,국세청,done.pdf
0022,사업자등록증,국세청,pending.pdf
"""
    resp = client.post(
        "/datasets/upload",
        headers=headers,
        data={"name": "Export 테스트", "kind": "golden", "version": "1.0"},
        files={"file": ("export.csv", io.BytesIO(csv_content.encode("utf-8")), "text/csv")},
    )
    version_id = resp.json()["version_id"]

    exported = client.get(f"/datasets/versions/{version_id}/export", headers=headers)
    assert exported.status_code == 200
    assert "application/x-ndjson" in exported.headers["content-type"]
    lines = [line for line in exported.text.splitlines() if line.strip()]
    assert len(lines) == 1

    data = json.loads(lines[0])
    assert data["id"] == "0021"
    assert data["input"] == reviewed.doc_text
    assert data["char_len"] == len(reviewed.doc_text)
    assert data["label"] == {"NAME": ["홍길동"]}
    assert data["source"] == "text"
    assert data["doc_type"] == "사업자등록증"
    assert data["complexity"] == "easy"


def test_upload_dataset_matches_hangul_filenames_with_unicode_normalization(client, db_session):
    admin = make_user(db_session, username="admin5", role="admin")
    headers = auth_headers(admin.id, admin.username, admin.role)

    source_filename = unicodedata.normalize("NFD", "가나다.pdf")
    make_record(db_session, "record-hangul", source_filename, "reviewed")

    csv_content = "파일명\n가나다.pdf\n"
    resp = client.post(
        "/datasets/upload",
        headers=headers,
        data={"name": "한글 골든셋", "kind": "golden", "version": "0.2"},
        files={"file": ("hangul.csv", io.BytesIO(csv_content.encode("utf-8")), "text/csv")},
    )
    assert resp.status_code == 201
    version_id = resp.json()["version_id"]

    detail = client.get(f"/datasets/versions/{version_id}", headers=headers)
    assert detail.status_code == 200
    data = detail.json()
    assert data["matched_reviewed_count"] == 1
    assert data["items"][0]["matched_record_id"] == "record-hangul"


def test_delete_dataset_requires_admin(client, db_session):
    admin = make_user(db_session, username="admin6", role="admin")
    reviewer = make_user(db_session, username="reviewer6", role="reviewer")
    headers_admin = auth_headers(admin.id, admin.username, admin.role)
    headers_reviewer = auth_headers(reviewer.id, reviewer.username, reviewer.role)

    created = upload_dataset(client, headers_admin, name="삭제 테스트", kind="golden", version="0.1")
    version_id = created.json()["version_id"]
    listing = client.get("/datasets", headers=headers_admin).json()
    dataset_id = listing[0]["id"]

    denied = client.delete(f"/datasets/{dataset_id}", headers=headers_reviewer)
    assert denied.status_code == 403

    deleted = client.delete(f"/datasets/{dataset_id}", headers=headers_admin)
    assert deleted.status_code == 204

    listing_after = client.get("/datasets", headers=headers_admin)
    assert listing_after.status_code == 200
    assert listing_after.json() == []

    missing_detail = client.get(f"/datasets/versions/{version_id}", headers=headers_admin)
    assert missing_detail.status_code == 404


def test_delete_dataset_version_removes_empty_dataset(client, db_session):
    admin = make_user(db_session, username="admin7", role="admin")
    headers = auth_headers(admin.id, admin.username, admin.role)

    created = upload_dataset(client, headers, name="버전 삭제 테스트", kind="scenario", version="0.1")
    version_id = created.json()["version_id"]

    deleted = client.delete(f"/datasets/versions/{version_id}", headers=headers)
    assert deleted.status_code == 204

    listing = client.get("/datasets", headers=headers)
    assert listing.status_code == 200
    assert listing.json() == []
