from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.errors import register_exception_handlers
from app.api.v1.analyze import router as analyze_router
from app.api.v1.auth import router as auth_router
from app.api.v1.datasets import router as datasets_router
from app.api.v1.export import router as export_router
from app.api.v1.generate import router as generate_router
from app.api.v1.history import router as history_router
from app.api.v1.sample import router as sample_router
from app.api.v1.schemas import router as schemas_router
from app.config import get_settings
from app.db import dispose_engine, init_db

settings = get_settings()

@asynccontextmanager
async def lifespan(_: FastAPI):
    init_db()  # apply (or verify) Alembic migrations; refuses to start if the schema is behind
    try:
        yield
    finally:
        dispose_engine()  # close pooled database connections on shutdown


app = FastAPI(
    title="Synthora AI API",
    description="AI-powered synthetic data generation platform",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

register_exception_handlers(app)
app.include_router(analyze_router)
app.include_router(sample_router)
app.include_router(generate_router)
app.include_router(export_router)
app.include_router(auth_router)
app.include_router(history_router)
app.include_router(schemas_router)
app.include_router(datasets_router)


@app.get("/")
def root():
    return {
        "name": "Synthora AI",
        "message": "From schema to trustworthy synthetic data.",
    }


@app.get("/health")
def health():
    return {
        "status": "ok",
        "service": "Synthora AI",
        "version": "0.1.0",
    }
