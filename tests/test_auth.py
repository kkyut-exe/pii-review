# tests/test_auth.py
from tests.conftest import make_user, auth_headers


def test_login_success(client, db_session):
    make_user(db_session, username="admin", password="admin1234", role="admin")
    resp = client.post("/auth/login", json={"username": "admin", "password": "admin1234"})
    assert resp.status_code == 200
    data = resp.json()
    assert "access_token" in data
    assert data["user"]["username"] == "admin"
    assert data["user"]["role"] == "admin"


def test_login_wrong_password(client, db_session):
    make_user(db_session, username="user1", password="correct", role="reviewer")
    resp = client.post("/auth/login", json={"username": "user1", "password": "wrong"})
    assert resp.status_code == 401


def test_login_unknown_user(client):
    resp = client.post("/auth/login", json={"username": "nobody", "password": "x"})
    assert resp.status_code == 401


def test_get_me(client, db_session):
    user = make_user(db_session, username="me_user", role="reviewer")
    headers = auth_headers(user.id, user.username, user.role)
    resp = client.get("/auth/me", headers=headers)
    assert resp.status_code == 200
    assert resp.json()["username"] == "me_user"


def test_get_me_no_token(client):
    resp = client.get("/auth/me")
    assert resp.status_code == 401
