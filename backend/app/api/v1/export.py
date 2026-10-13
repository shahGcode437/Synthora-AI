import io

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse

from app.auth.deps import ai_user
from app.exports.exporter import export_data
from app.models.api import ErrorResponse
from app.models.db import User
from app.models.export import ExportRequest

router = APIRouter(prefix="/api/v1", tags=["export"])


@router.post(
    "/export",
    responses={
        200: {"content": {"text/csv": {}, "application/json": {}, "application/zip": {}},
              "description": "The exported file as an attachment"},
        422: {"model": ErrorResponse, "description": "Invalid export request"},
    },
)
def export_endpoint(req: ExportRequest, _user: User | None = Depends(ai_user)) -> StreamingResponse:
    """Turn already-generated data into a downloadable CSV, JSON or ZIP (built in memory)."""
    f = export_data(req.data, req.format, req.filename, req.include_json)
    return StreamingResponse(
        io.BytesIO(f.content),
        media_type=f.media_type,
        headers={
            "Content-Disposition": f'attachment; filename="{f.filename}"',
            "Content-Length": str(len(f.content)),
            "Access-Control-Expose-Headers": "Content-Disposition",
        },
    )
