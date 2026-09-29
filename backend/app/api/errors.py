"""Uniform error envelope: {"error": {"code", "message", "details"}}."""
import logging

from fastapi import FastAPI, Request
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from app.ai.errors import AllProvidersFailedError, ProviderNotConfiguredError
from app.exports.exporter import ExportError
from app.generation.context import GenerationError
from app.services.analyze import ModeNotSupportedError

logger = logging.getLogger(__name__)


def _resp(status: int, code: str, message: str, details=None) -> JSONResponse:
    return JSONResponse(
        status_code=status,
        content={"error": jsonable_encoder({"code": code, "message": message, "details": details})},
    )


def register_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(RequestValidationError)
    async def _validation(_: Request, exc: RequestValidationError):
        details = [
            {"field": ".".join(str(p) for p in e["loc"] if p != "body"), "message": e["msg"]}
            for e in exc.errors()
        ]
        return _resp(422, "validation_error", "Request validation failed.", details)

    @app.exception_handler(ProviderNotConfiguredError)
    async def _not_configured(_: Request, exc: ProviderNotConfiguredError):
        return _resp(503, "ai_provider_not_configured", str(exc))

    @app.exception_handler(AllProvidersFailedError)
    async def _all_failed(_: Request, exc: AllProvidersFailedError):
        return _resp(502, "ai_providers_failed", "All configured AI providers failed.", exc.attempts)

    @app.exception_handler(ModeNotSupportedError)
    async def _mode(_: Request, exc: ModeNotSupportedError):
        return _resp(501, "mode_not_supported", str(exc))

    @app.exception_handler(ExportError)
    async def _export(_: Request, exc: ExportError):
        return _resp(422, "export_error", str(exc))

    @app.exception_handler(GenerationError)
    async def _generation(_: Request, exc: GenerationError):
        return _resp(422, "generation_error", str(exc))

    @app.exception_handler(Exception)
    async def _unhandled(_: Request, exc: Exception):
        logger.exception("Unhandled error")
        return _resp(500, "internal_error", "Unexpected server error.")
