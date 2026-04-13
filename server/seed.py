"""
초기 admin 유저를 생성한다.
사용법: python -m server.seed
"""
from server.database import SessionLocal, engine, Base
from server.models import User
from server.auth import hash_password

Base.metadata.create_all(bind=engine)


def seed():
    db = SessionLocal()
    try:
        existing = db.query(User).filter_by(username="admin").first()
        if existing:
            print("admin 유저가 이미 존재합니다.")
            return
        admin = User(
            username="admin",
            password_hash=hash_password("admin1234"),
            role="admin",
        )
        db.add(admin)
        db.commit()
        print("admin 유저 생성 완료 (username=admin, password=admin1234)")
    finally:
        db.close()


if __name__ == "__main__":
    seed()
