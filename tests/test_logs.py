# tests/test_logs.py
import io
from tests.conftest import make_user, auth_headers
from server.models import Record

SIMPLE_LOG = """\
2026-04-10 21:19:56,769 [INFO] 🔍 LLMExtractService 시작 - MODE: ftp, path: /tmp/pdf-260410-abc/texts_chunked.json
2026-04-10 21:19:56,843 [INFO] [Source] source_filename=
test.pdf

2026-04-10 21:19:56,907 [INFO] [preprocess] text_len=100, chunks=1
2026-04-10 21:19:56,907 [INFO] [run_pipeline] doc_text=
Hello world

2026-04-10 21:19:59,623 [INFO] [inference] [1/1] pii_dict=
{'NAME': ['홍길동'], 'ADDRESS': [], 'POSTAL': [], 'RESIDENT': [], 'CONTACT': [], 'EMAIL': [], 'BIRTHDATE': [], 'GENDER': [], 'AGE': []}

"""


def upload_log(client, headers, content: str, filename="test.log"):
    return client.post(
        "/logs/upload",
        files={"file": (filename, io.BytesIO(content.encode("utf-8")), "text/plain")},
        headers=headers,
    )


def test_upload_log_inserts_records(client, db_session):
    user = make_user(db_session, role="admin")
    headers = auth_headers(user.id, user.username, user.role)
    resp = upload_log(client, headers, SIMPLE_LOG)
    assert resp.status_code == 200
    data = resp.json()
    assert data["records_inserted"] == 1
    assert db_session.query(Record).count() == 1


def test_upload_log_deduplication(client, db_session):
    """같은 로그 재업로드 시 중복 INSERT 없음."""
    user = make_user(db_session, role="admin")
    headers = auth_headers(user.id, user.username, user.role)
    upload_log(client, headers, SIMPLE_LOG)
    resp = upload_log(client, headers, SIMPLE_LOG)
    assert resp.status_code == 200
    assert resp.json()["records_inserted"] == 0
    assert db_session.query(Record).count() == 1


def test_upload_log_unauthenticated(client):
    resp = client.post("/logs/upload",
                       files={"file": ("x.log", io.BytesIO(b""), "text/plain")})
    assert resp.status_code == 401


def test_upload_log_requires_admin(client, db_session):
    reviewer = make_user(db_session, username="reviewer", role="reviewer")
    headers = auth_headers(reviewer.id, reviewer.username, reviewer.role)
    resp = upload_log(client, headers, SIMPLE_LOG)
    assert resp.status_code == 403


def test_get_upload_history(client, db_session):
    user = make_user(db_session, role="admin")
    headers = auth_headers(user.id, user.username, user.role)
    upload_log(client, headers, SIMPLE_LOG)
    resp = client.get("/logs/uploads", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 1
    assert data[0]["records_inserted"] == 1
