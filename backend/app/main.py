from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.errors import register_exception_handlers
from app.api.v1.analyze import router as analyze_router
from app.config import get_settings

settings = get_settings()

app = FastAPI(
    title="Synthora AI API",
    description="AI-powered synthetic data generation platform",
    version="0.1.0",
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
