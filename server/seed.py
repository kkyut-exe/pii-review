"""
초기 admin 유저를 생성한다.
사용법: python -m server.seed
"""
from server.database import SessionLocal, engine, Base
from server.models import User
from server.auth import hash_password
from server.settings import INITIAL_ADMIN_USERNAME, INITIAL_ADMIN_PASSWORD

Base.metadata.create_all(bind=engine)


def seed():
    if not INITIAL_ADMIN_USERNAME or not INITIAL_ADMIN_PASSWORD:
        raise RuntimeError(
            "INITIAL_ADMIN_USERNAME and INITIAL_ADMIN_PASSWORD environment variables are required"
        )

    db = SessionLocal()
    try:
        existing = db.query(User).filter_by(username=INITIAL_ADMIN_USERNAME).first()
        if existing:
            print(f"{INITIAL_ADMIN_USERNAME} 유저가 이미 존재합니다.")
            return
        admin = User(
            username=INITIAL_ADMIN_USERNAME,
            password_hash=hash_password(INITIAL_ADMIN_PASSWORD),
            role="admin",
        )
        db.add(admin)
        db.commit()
        print(f"admin 유저 생성 완료 (username={INITIAL_ADMIN_USERNAME})")
    finally:
        db.close()


if __name__ == "__main__":
    seed()
