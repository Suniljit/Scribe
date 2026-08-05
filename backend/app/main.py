from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import devices, recordings, transcripts

app = FastAPI(title="Transcribe")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5174", "http://127.0.0.1:5174"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(devices.router)
app.include_router(recordings.router)
app.include_router(transcripts.router)


@app.get("/api/health")
def health() -> dict:
    return {"status": "ok"}
