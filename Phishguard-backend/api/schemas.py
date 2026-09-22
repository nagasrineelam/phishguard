from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field


class PredictRequest(BaseModel):
    url: str = Field(..., description="Full URL to classify")
    title: Optional[str] = Field("", description="Page <title> text, if available")
    features: Dict[str, Any] = Field(
        ..., description="Raw feature values — see GET /schema/features for required keys"
    )


class PredictResponse(BaseModel):
    probability_legitimate: float
    probability_phishing: float
    predicted_label: int
    predicted_class: str
    threshold: float


class FeatureField(BaseModel):
    name: str
    type: str  # "float" | "boolean" | "enum" | "string"
    required: Optional[bool] = True
    options: Optional[List[str]] = None


class FeatureSchemaResponse(BaseModel):
    fields: List[FeatureField]


class HealthResponse(BaseModel):
    status: str
    model_loaded: bool
    num_features_expected: Optional[int] = None


class ExtractRequest(BaseModel):
    url: str = Field(..., description="Full URL to fetch and extract features from")


class ExtractResponse(BaseModel):
    url: str = Field(..., description="Final URL after redirects")
    title: str
    features: Dict[str, Any]
    warnings: List[str] = Field(default_factory=list)


class PredictUrlRequest(BaseModel):
    url: str = Field(..., description="Full URL to fetch, extract features from, and classify")


class PredictUrlResponse(BaseModel):
    url: str
    extraction: ExtractResponse
    prediction: PredictResponse


class ReportRequest(BaseModel):
    url: str
    title: Optional[str] = ""
    features: Dict[str, Any]
    reporter_note: Optional[str] = None


class ReportResponse(BaseModel):
    report_id: int
    status: str
    model_prediction: PredictResponse


class PendingReport(BaseModel):
    id: int
    url: str
    title: Optional[str]
    reporter_note: Optional[str]
    predicted_label: int
    predicted_probability: float
    created_at: str


class VerifyRequest(BaseModel):
    true_label: int = Field(..., description="0 = Phishing, 1 = Legitimate")


class VerifyResponse(BaseModel):
    report_id: int
    status: str
    appended_to_retrain_csv: bool
