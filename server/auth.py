from datetime import datetime, timedelta, UTC
from jose import jwt, JWTError  # noqa: F401 (re-exported for callers)
from passlib.context import CryptContext
from server.settings import JWT_SECRET_KEY, ACCESS_TOKEN_EXPIRE_MINUTES

ALGORITHM = "HS256"

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


def create_token(user_id: int, username: str, role: str) -> str:
    expire = datetime.now(UTC) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    return jwt.encode(
        {"sub": str(user_id), "username": username, "role": role, "exp": expire},
        JWT_SECRET_KEY,
        algorithm=ALGORITHM,
    )


def decode_token(token: str) -> dict:
    """JWTError를 raise하면 호출부에서 처리."""
    return jwt.decode(token, JWT_SECRET_KEY, algorithms=[ALGORITHM])
