# tests/test_records.py
import uuid
from datetime import datetime
from tests.conftest import make_user, auth_headers
from server.models import Record


def make_record(db, path="/tmp/test/texts_chunked.json", status="pending"):
    r = Record(
        id=str(uuid.uuid4()),
        path=path,
        source_filename="test.pdf",
        source="text",
        service_started_at=datetime(2026, 4, 10, 12, 0, 0),
        doc_text="sample text",
        pii_dict={"NAME": ["홍길동"], "ADDRESS": [], "POSTAL": [], "RESIDENT": [],
                  "CONTACT": [], "EMAIL": [], "BIRTHDATE": [], "GENDER": [], "AGE": []},
        status=status,
    )
    db.add(r)
    db.commit()
    db.refresh(r)
    return r


def test_list_records(client, db_session):
    user = make_user(db_session)
    make_record(db_session)
    make_record(db_session, path="/tmp/test2/texts_chunked.json")
    headers = auth_headers(user.id, user.username, user.role)
    resp = client.get("/records", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 2
    assert len(data["items"]) == 2


def test_create_manual_record_with_default_pii_dict(client, db_session):
    admin = make_user(db_session, username="admin_manual", role="admin")
    headers = auth_headers(admin.id, admin.username, admin.role)

    resp = client.post("/records/manual", json={"doc_text": "수동 입력 본문"}, headers=headers)
    assert resp.status_code == 201
    data = resp.json()
    assert data["doc_text"] == "수동 입력 본문"
    assert data["status"] == "pending"
    assert data["source"] == "text"
    assert data["source_filename"].startswith("manual-")
    assert data["pii_dict"]["NAME"] == []
    assert data["pii_dict"]["EMAIL"] == []


def test_create_manual_record_parses_pii_dict_string(client, db_session):
    admin = make_user(db_session, username="admin_manual_2", role="admin")
    headers = auth_headers(admin.id, admin.username, admin.role)

    body = {
        "doc_text": "홍길동 이메일은 test@example.com 입니다.",
        "source_filename": "수동등록.txt",
        "pii_dict": "{'NAME': ['홍길동'], 'EMAIL': ['test@example.com']}",
    }
    resp = client.post("/records/manual", json=body, headers=headers)
    assert resp.status_code == 201
    data = resp.json()
    assert data["source_filename"] == "수동등록.txt"
    assert data["pii_dict"]["NAME"] == ["홍길동"]
    assert data["pii_dict"]["EMAIL"] == ["test@example.com"]
    assert data["pii_dict"]["ADDRESS"] == []


def test_create_manual_record_requires_admin(client, db_session):
    reviewer = make_user(db_session, username="review_manual", role="reviewer")
    headers = auth_headers(reviewer.id, reviewer.username, reviewer.role)

    resp = client.post("/records/manual", json={"doc_text": "본문"}, headers=headers)
    assert resp.status_code == 403


def test_create_manual_record_rejects_invalid_pii_string(client, db_session):
    admin = make_user(db_session, username="admin_manual_3", role="admin")
    headers = auth_headers(admin.id, admin.username, admin.role)

    resp = client.post(
        "/records/manual",
        json={"doc_text": "본문", "pii_dict": "{bad json"},
        headers=headers,
    )
    assert resp.status_code == 422


def test_list_records_unauthenticated(client):
    resp = client.get("/records")
    assert resp.status_code == 401


def test_get_record(client, db_session):
    user = make_user(db_session)
    record = make_record(db_session)
    headers = auth_headers(user.id, user.username, user.role)
    resp = client.get(f"/records/{record.id}", headers=headers)
    assert resp.status_code == 200
    assert resp.json()["id"] == record.id


def test_patch_status_pending_to_reviewing(client, db_session):
    user = make_user(db_session)
    record = make_record(db_session, status="pending")
    headers = auth_headers(user.id, user.username, user.role)
    resp = client.patch(f"/records/{record.id}/status",
                        json={"status": "reviewing"}, headers=headers)
    assert resp.status_code == 200
    assert resp.json()["status"] == "reviewing"


def test_patch_status_pending_to_reviewed_forbidden(client, db_session):
    user = make_user(db_session)
    record = make_record(db_session, status="pending")
    headers = auth_headers(user.id, user.username, user.role)
    resp = client.patch(f"/records/{record.id}/status",
                        json={"status": "reviewed"}, headers=headers)
    assert resp.status_code == 422


def test_patch_status_reviewed_to_reviewing_requires_admin(client, db_session):
    reviewer = make_user(db_session, username="rev", role="reviewer")
    admin = make_user(db_session, username="adm", role="admin")
    record = make_record(db_session, status="reviewed")

    # reviewer는 되돌리기 불가
    headers = auth_headers(reviewer.id, reviewer.username, reviewer.role)
    resp = client.patch(f"/records/{record.id}/status",
                        json={"status": "reviewing"}, headers=headers)
    assert resp.status_code == 403

    # admin은 가능
    headers = auth_headers(admin.id, admin.username, admin.role)
    resp = client.patch(f"/records/{record.id}/status",
                        json={"status": "reviewing"}, headers=headers)
    assert resp.status_code == 200


def test_put_review(client, db_session):
    user = make_user(db_session)
    record = make_record(db_session, status="reviewing")
    headers = auth_headers(user.id, user.username, user.role)
    body = {
        "reviewed_pii_dict": {"NAME": ["김철수"], "ADDRESS": [], "POSTAL": [],
                               "RESIDENT": [], "CONTACT": [], "EMAIL": [],
                               "BIRTHDATE": [], "GENDER": [], "AGE": []},
        "complexity": "medium",
    }
    resp = client.put(f"/records/{record.id}/review", json=body, headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "reviewed"
    assert data["complexity"] == "medium"
    assert data["reviewed_by"] == user.id


def test_put_review_requires_reviewing_status(client, db_session):
    user = make_user(db_session)
    record = make_record(db_session, status="pending")
    headers = auth_headers(user.id, user.username, user.role)
    body = {
        "reviewed_pii_dict": {"NAME": ["김철수"]},
        "complexity": "medium",
    }
    resp = client.put(f"/records/{record.id}/review", json=body, headers=headers)
    assert resp.status_code == 422


def test_put_review_missing_complexity(client, db_session):
    user = make_user(db_session)
    record = make_record(db_session, status="reviewing")
    headers = auth_headers(user.id, user.username, user.role)
    body = {"reviewed_pii_dict": {}, "complexity": ""}  # 빈 문자열
    resp = client.put(f"/records/{record.id}/review", json=body, headers=headers)
    assert resp.status_code == 422


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


def test_bulk_status_only_supports_pending_delete(client, db_session):
    user = make_user(db_session)
    record = make_record(db_session)
    headers = auth_headers(user.id, user.username, user.role)

    resp = client.post("/records/bulk-status",
                       json={"ids": [record.id], "status": "reviewing"},
                       headers=headers)
    assert resp.status_code == 422


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


def test_export_reviewed_only(client, db_session):
    user = make_user(db_session)
    make_record(db_session, path="/tmp/a/texts_chunked.json", status="reviewed")
    make_record(db_session, path="/tmp/b/texts_chunked.json", status="pending")
    headers = auth_headers(user.id, user.username, user.role)
    resp = client.get("/records/export", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 1
    assert data[0]["status"] == "reviewed"
