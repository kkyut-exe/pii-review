import pytest
import os
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

os.environ.setdefault("JWT_SECRET_KEY", "test-secret-key")
os.environ.setdefault("ACCESS_TOKEN_EXPIRE_MINUTES", "480")
os.environ.setdefault("INITIAL_ADMIN_USERNAME", "test-admin")
os.environ.setdefault("INITIAL_ADMIN_PASSWORD", "test-password")

from server.database import Base, get_db
from server.main import app
from server.models import User
from server.auth import hash_password, create_token

TEST_DB_URL = "sqlite:///./data/test.db"


@pytest.fixture(scope="function")
def client():
    engine = create_engine(TEST_DB_URL, connect_args={"check_same_thread": False})
    Base.metadata.create_all(bind=engine)
    TestSession = sessionmaker(bind=engine)

    def override_db():
        db = TestSession()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_db
    with TestClient(app) as c:
        yield c

    Base.metadata.drop_all(bind=engine)
    app.dependency_overrides.clear()


@pytest.fixture
def db_session(client):
    """테스트용 DB 세션 (client fixture와 같은 엔진 사용)."""
    engine = create_engine(TEST_DB_URL, connect_args={"check_same_thread": False})
    TestSession = sessionmaker(bind=engine)
    db = TestSession()
    try:
        yield db
    finally:
        db.close()


def make_user(db, username="reviewer1", password="pass1234", role="reviewer"):
    user = User(
        username=username,
        password_hash=hash_password(password),
        role=role,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def auth_headers(user_id: int, username: str, role: str) -> dict:
    token = create_token(user_id=user_id, username=username, role=role)
    return {"Authorization": f"Bearer {token}"}
