# server/main.py
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from server.database import engine, Base
from server.router import auth, records, logs

# DB 테이블 자동 생성
Base.metadata.create_all(bind=engine)

app = FastAPI(title="PII 검수 시스템")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],  # Vite dev server
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/auth", tags=["auth"])
app.include_router(records.router, prefix="/records", tags=["records"])
app.include_router(logs.router, prefix="/logs", tags=["logs"])


@app.get("/health")
def health():
    return {"status": "ok"}
