"""
FastAPI app serving the phishing detection model.

Run:
    uvicorn api.main:app --reload --port 8000

Requires artifacts to exist first:
    python train.py
"""

import subprocess
import sys

from fastapi import FastAPI, HTTPException, Header, Depends
from fastapi.middleware.cors import CORSMiddleware

from core import config
from core import db
from core.inference import get_service, ArtifactsMissingError
from core.feature_extractor import extract_features, FeatureExtractionError
import tldextract
from api.schemas import (
    PredictRequest, PredictResponse,
    FeatureSchemaResponse, FeatureField,
    HealthResponse,
    ExtractRequest, ExtractResponse,
    PredictUrlRequest, PredictUrlResponse,
    ReportRequest, ReportResponse,
    PendingReport, VerifyRequest, VerifyResponse,
)

app = FastAPI(title=config.API_TITLE, version=config.API_VERSION)

app.add_middleware(
    CORSMiddleware,
    allow_origins=config.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------
# Minimal admin auth — placeholder only. Replace with real auth (JWT /
# OAuth / session-based) before deploying anything admin-facing.
# ---------------------------------------------------------------------
def require_admin(x_admin_token: str = Header(default="")):
    if x_admin_token != config.ADMIN_TOKEN:
        raise HTTPException(status_code=401, detail="Invalid or missing admin token")
    return True


# ---------------------------------------------------------------------
# Health & schema
# ---------------------------------------------------------------------
@app.get("/health", response_model=HealthResponse)
def health():
    try:
        service = get_service()
        return HealthResponse(
            status="ok", model_loaded=True,
            num_features_expected=len(service.selected_features),
        )
    except ArtifactsMissingError as e:
        return HealthResponse(status=f"artifacts missing: {e}", model_loaded=False)


@app.get("/schema/features", response_model=FeatureSchemaResponse)
def feature_schema():
    """
    Frontend should call this once (e.g. on page load) to know exactly
    which fields to render in a submission form and how to type/validate
    them, rather than hardcoding the feature list client-side.
    """
    try:
        service = get_service()
    except ArtifactsMissingError as e:
        raise HTTPException(status_code=503, detail=str(e))

    fields = [FeatureField(**f) for f in service.required_feature_schema()]
    return FeatureSchemaResponse(fields=fields)


# ---------------------------------------------------------------------
# Prediction
# ---------------------------------------------------------------------
@app.post("/predict", response_model=PredictResponse)
def predict(payload: PredictRequest):
    try:
        service = get_service()
    except ArtifactsMissingError as e:
        raise HTTPException(status_code=503, detail=str(e))

    try:
        result = service.predict(payload.url, payload.title or "", payload.features)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))

    return PredictResponse(**result)


# ---------------------------------------------------------------------
# Feature extraction ("just paste a URL")
# ---------------------------------------------------------------------
@app.post("/extract", response_model=ExtractResponse)
def extract(payload: ExtractRequest):
    """
    Fetches the URL server-side (requests + BeautifulSoup), computes the
    raw PhiUSIIL-style fields, and returns them in the exact shape
    /predict expects as `features`. Frontend flow for "just paste a URL":
    call this, then POST the result straight into /predict — or skip
    both hops and call /predict-url below.
    """
    try:
        result = extract_features(payload.url)
    except FeatureExtractionError as e:
        raise HTTPException(status_code=422, detail=str(e))

    return ExtractResponse(
        url=result.url, title=result.title,
        features=result.features, warnings=result.warnings,
    )


def _extract_and_predict(url: str) -> PredictUrlResponse:
    try:
        service = get_service()
    except ArtifactsMissingError as e:
        raise HTTPException(status_code=503, detail=str(e)) from e

    try:
        result = extract_features(url)
    except FeatureExtractionError as e:
        raise HTTPException(status_code=422, detail=str(e)) from e

    try:
        prediction = service.predict(result.url, result.title, result.features)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e)) from e

    # Quick whitelist override for well-known trusted registered domains.
    # This is a pragmatic mitigation for training-data gaps (e.g. missing
    # benign YouTube examples). Prefer retraining with corrected labels
    # long-term.
    reg_domain = tldextract.extract(result.url).domain
    if reg_domain in config.TRUSTED_DOMAINS:
        override = {
            "probability_legitimate": 0.99,
            "probability_phishing": 0.01,
            "predicted_label": config.LABEL_LEGITIMATE,
            "predicted_class": "Legitimate",
            "threshold": config.PREDICTION_THRESHOLD,
        }
        return PredictUrlResponse(
            url=result.url,
            extraction=ExtractResponse(
                url=result.url, title=result.title,
                features=result.features, warnings=result.warnings,
            ),
            prediction=PredictResponse(**override),
        )

    return PredictUrlResponse(
        url=result.url,
        extraction=ExtractResponse(
            url=result.url, title=result.title,
            features=result.features, warnings=result.warnings,
        ),
        prediction=PredictResponse(**prediction),
    )


@app.post("/predict-url", response_model=PredictUrlResponse)
@app.post("/analyze", response_model=PredictUrlResponse)
def predict_url(payload: PredictUrlRequest):
    """Convenience endpoint: extract features from a raw URL, then classify."""
    return _extract_and_predict(payload.url)


# ---------------------------------------------------------------------
# Crowdsourcing loop (paper Section IV.A.3)
# ---------------------------------------------------------------------
@app.post("/report", response_model=ReportResponse)
def report_url(payload: ReportRequest):
    """
    Public-facing endpoint: a user submits a URL they believe is
    suspicious. The model scores it immediately (for feedback to the
    user) AND the report is queued for admin verification — mirroring
    the paper's human-in-the-loop update mechanism, which requires
    verification before anything is added to the training set.
    """
    try:
        service = get_service()
    except ArtifactsMissingError as e:
        raise HTTPException(status_code=503, detail=str(e))

    try:
        prediction = service.predict(payload.url, payload.title or "", payload.features)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))

    report_id = db.insert_report(
        url=payload.url,
        title=payload.title or "",
        features=payload.features,
        reporter_note=payload.reporter_note,
        predicted_label=prediction["predicted_label"],
        predicted_probability=prediction["probability_legitimate"],
    )

    return ReportResponse(
        report_id=report_id,
        status="queued_for_review",
        model_prediction=PredictResponse(**prediction),
    )


@app.get("/admin/reports/pending", response_model=list[PendingReport])
def pending_reports(_: bool = Depends(require_admin)):
    rows = db.list_pending()
    return [
        PendingReport(
            id=r["id"], url=r["url"], title=r["title"],
            reporter_note=r["reporter_note"],
            predicted_label=r["predicted_label"],
            predicted_probability=r["predicted_probability"],
            created_at=r["created_at"],
        )
        for r in rows
    ]


@app.post("/admin/reports/{report_id}/verify", response_model=VerifyResponse)
def verify_report(report_id: int, payload: VerifyRequest, _: bool = Depends(require_admin)):
    if payload.true_label not in (config.LABEL_LEGITIMATE, config.LABEL_PHISHING):
        raise HTTPException(
            status_code=422,
            detail=f"true_label must be {config.LABEL_LEGITIMATE} (legitimate) "
                   f"or {config.LABEL_PHISHING} (phishing)",
        )

    updated = db.mark_verified(report_id, payload.true_label)
    if not updated:
        raise HTTPException(status_code=404, detail="Report not found")

    db.append_to_retrain_csv(report_id)

    return VerifyResponse(report_id=report_id, status="verified", appended_to_retrain_csv=True)


@app.post("/admin/retrain")
def trigger_retrain(_: bool = Depends(require_admin)):
    """
    Manually triggers train.py as a subprocess. This is illustrative,
    NOT production-grade automation: it blocks the request thread for
    the full training duration, has no job queue, and doesn't merge
    RETRAIN_CSV_PATH into the source dataset automatically — you'd want
    to do that merge (and probably run this as a background job via
    Celery/RQ/cron, not inline in an HTTP handler) before relying on
    this in production.
    """
    result = subprocess.run(
        [sys.executable, "train.py"], capture_output=True, text=True, cwd=config.BASE_DIR
    )
    if result.returncode != 0:
        raise HTTPException(
            status_code=500,
            detail=f"Retraining failed:\n{result.stderr[-2000:]}",
        )
    return {
        "status": "retrained",
        "note": "Restart the API process to load the newly saved artifacts "
                "(this endpoint does not hot-swap the in-memory model).",
        "stdout_tail": result.stdout[-2000:],
    }
