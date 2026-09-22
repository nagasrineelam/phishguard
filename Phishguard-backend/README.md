# PhishGuard Backend

## Problem

Phishing URLs are designed to look trustworthy while hiding signals such as domain impersonation, obfuscation, suspicious redirects, external form submissions, password fields, and unusual page structure. A simple blacklist is not enough: it misses new domains, gives little explanation, and does not provide a practical workflow for correcting wrong predictions.

PhishGuard's backend is the detection and feedback service behind the full-stack PhishGuard application. It turns a URL into model-compatible features, classifies it as **Phishing** or **Legitimate**, exposes the confidence breakdown to the frontend, and supports a human-review loop for disputed predictions.

## Solution

The service combines four stages:

1. **Safe URL inspection** — validates HTTP/HTTPS URLs, blocks hosts that resolve to private or non-public IP addresses, limits redirects and response size, and checks redirected destinations.
2. **Feature extraction** — prefers a Playwright/Chromium-rendered page so JavaScript-generated content is visible, with a requests + BeautifulSoup fallback when browser rendering is unavailable. It extracts URL, domain, HTML, link, form, script, redirect, favicon, robots.txt, and content signals.
3. **Hybrid ML inference** — combines character-level URL/title text with selected structured features in a TensorFlow model. The text branch uses Embedding → LSTM → Additive Attention → LSTM; the numeric branch uses a Dense layer. The branches are concatenated and classified with a sigmoid output.
4. **Human feedback** — users can submit reports, administrators can verify them, and verified records are appended to a retraining CSV for a later training run.

This backend is used by the React frontend through the `/predict-url` and `/health` endpoints. The frontend persists user analyses, indicators, reports, and model metadata in Supabase; the backend's local SQLite store independently supports its API-level crowdsourcing flow.

## Architecture

```text
React/Vite frontend
  └─ POST /predict-url
       │
       ▼
FastAPI (api/main.py)
  ├─ URL extraction (core/feature_extractor.py)
  │    ├─ SSRF/public-host checks
  │    ├─ Playwright rendered-page fetch
  │    └─ requests + BeautifulSoup fallback
  ├─ PredictionService (core/inference.py)
  │    ├─ tokenizer.pkl
  │    ├─ num_scaler.pkl
  │    ├─ selected_features.pkl
  │    └─ hybrid_model.keras
  ├─ SQLite reports (core/db.py)
  │    └─ verify → artifacts/retrain_dataset.csv
  └─ Admin operations
       ├─ pending reports
       ├─ report verification
       └─ manual retraining trigger

Supabase (frontend application layer)
  ├─ Auth and profiles
  ├─ User-owned analyses
  ├─ User/admin reports
  ├─ model_info
  └─ retrain_logs with Row Level Security
```

### Request flow

`POST /predict-url` receives a URL, calls `extract_features()`, and then passes the extracted title and feature dictionary to the lazily initialized `PredictionService`. The service applies the same text construction, categorical encoding, scaling, feature ordering, and z-score clipping expected by the trained model. The API returns the final URL, extraction warnings, legitimate/phishing probabilities, label, class name, and threshold.

The `/schema/features` endpoint exposes the raw feature contract derived from the saved artifacts, allowing a client to discover the model's required fields rather than hardcoding them. `/report` scores a submission immediately and queues it for review. Verified reports are written to `artifacts/retrain_dataset.csv`; `/admin/retrain` can invoke the training script, but the endpoint is intentionally documented as illustrative because it runs synchronously and does not hot-swap the in-memory model.

## Repository map

```text
Phishguard-backend/
├── api/
│   ├── main.py              FastAPI application and prediction/report routes
│   └── schemas.py           Pydantic request and response contracts
├── core/
│   ├── config.py            Paths, labels, dataset columns, model settings, API config
│   ├── feature_extractor.py Safe fetch/rendering and URL/HTML feature extraction
│   ├── preprocessing.py     Shared cleaning, feature selection, SMOTE, tokenization
│   ├── model_arch.py        Hybrid LSTM + Attention / structured-feature model
│   ├── inference.py         Artifact loading, feature encoding, prediction service
│   ├── db.py                SQLite report queue and retraining CSV export
│   ├── build_extraction_stats.py
│   │                         Dataset-derived TLD, character, and outlier statistics
│   └── validate_extractor.py / extraction validation utilities
├── artifacts/               Model and preprocessing artifacts; generated/required at runtime
├── data/                    PhiUSIIL CSV dataset location
├── phishing-detection.ipynb Exploratory model and dataset work
├── test_extrac.py           Dataset-sample inference smoke test
├── requirements.txt         Python dependencies
└── .env.example             Local API configuration template
```

## Tech stack

- **Runtime and API:** Python, FastAPI, Uvicorn, Pydantic
- **Machine learning:** TensorFlow/Keras, scikit-learn, imbalanced-learn/SMOTE, NumPy, Pandas
- **Feature extraction:** Playwright/Chromium, Requests, BeautifulSoup, `tldextract`
- **Model shape:** character-level tokenizer, 200-character padded input, 50-dimensional embedding, LSTM + Additive Attention text branch, Dense numeric branch
- **Persistence:** SQLite for backend report moderation and CSV export for approved retraining rows; Supabase/Postgres and Row Level Security for the main frontend application
- **Dataset:** [PhiUSIIL Phishing URL Dataset](https://www.kaggle.com/datasets/ndarvind/phiusiil-phishing-url-dataset)

## API surface

| Method | Endpoint | Purpose |
|---|---|---|
| `GET` | `/health` | Reports API availability and whether model artifacts are loaded |
| `GET` | `/schema/features` | Returns the feature fields expected by the current artifacts |
| `POST` | `/predict` | Classifies a URL when the caller already has extracted features |
| `POST` | `/extract` | Fetches a URL and returns extracted features and warnings |
| `POST` | `/predict-url` / `/analyze` | Extracts and classifies a raw URL in one request |
| `POST` | `/report` | Scores a URL and queues a report for review |
| `GET` | `/admin/reports/pending` | Lists unverified backend reports; requires `X-Admin-Token` |
| `POST` | `/admin/reports/{id}/verify` | Verifies a report and exports it for retraining |
| `POST` | `/admin/retrain` | Synchronously invokes `train.py`; illustrative operational hook |

A typical combined request is:

```json
{"url":"https://example.com/login"}
```

The response includes `extraction.warnings` as well as `prediction.probability_legitimate`, `prediction.probability_phishing`, `prediction.predicted_class`, and `prediction.threshold`. Warnings are important: for example, a static fallback means JavaScript-injected images, scripts, styles, iframes, and popups may be undercounted.

## Setup

### 1. Create the environment

```bash
cd Phishguard-backend
python -m venv venv
source venv/bin/activate          # Windows: venv\\Scripts\\activate
pip install -r requirements.txt
```

Install the browser used by the preferred extraction path:

```bash
playwright install chromium
```

Without Chromium, the API can fall back to static HTML extraction, but the resulting features may be less accurate for JavaScript-heavy sites.

### 2. Configure the dataset and API

```bash
cp .env.example .env
```

Relevant variables:

```dotenv
PHIUSIIL_CSV_PATH=./data/PhiUSIIL_Phishing_URL_Dataset.csv
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:5173
ADMIN_TOKEN=replace-with-a-long-random-secret
TRUSTED_DOMAINS=
CLIP_ZSCORE=5.0
```

Place the PhiUSIIL CSV at `data/PhiUSIIL_Phishing_URL_Dataset.csv`, or point `PHIUSIIL_CSV_PATH` to it. The configured label mapping is `0 = Phishing` and `1 = Legitimate`; the training pipeline should validate this mapping before producing artifacts.

### 3. Build optional dataset-derived extraction statistics

This generates TLD legitimacy probabilities, character frequencies, and 99.9th-percentile feature caps used by the live extractor:

```bash
python -m core.build_extraction_stats
```

### 4. Generate model artifacts

The API requires these files in `artifacts/` before prediction is available:

```text
hybrid_model.keras
 tokenizer.pkl
num_scaler.pkl
selected_features.pkl
```

Run the repository's training entry point when it is available in your checkout:

```bash
python train.py
```

Training artifacts are generated assets, not source configuration. Regenerate them when the dataset, preprocessing logic, or model architecture changes. The checked backend tree documents and invokes `train.py`, so deployments should ensure that training entry point is present before enabling `/admin/retrain`.

### 5. Start the API

```bash
uvicorn api.main:app --reload --port 8000
```

The API is then available at `http://localhost:8000`; interactive documentation is available at `/docs`.

## Results and evaluation

The backend is designed to produce an operational phishing-risk result rather than only a binary label:

- model output includes legitimate and phishing probabilities, predicted label, class name, and threshold;
- the extractor returns warnings alongside features so degraded static-fetch results are visible to callers;
- the frontend converts the response into confidence, risk score, safe/suspicious indicators, history records, and downloadable reports;
- the model architecture compiles accuracy, precision, recall, and AUC metrics during training;
- the Supabase migration seeds the application dashboard's model metadata with a baseline record of **94.20% accuracy**, **93.80% precision**, **95.10% recall**, **94.44% F1**, and **97.30% ROC AUC** on a dataset size of **235,370**.

The seeded values are application metadata and should not be treated as a fresh benchmark unless they are reproduced from the current dataset and artifacts. The project itself calls out several approximation boundaries: URL similarity, per-TLD legitimacy, and character probabilities use dataset-derived artifacts when available and documented heuristics otherwise. Production evaluation should therefore include a held-out test set, threshold analysis, false-positive/false-negative review, and tests of rendered and non-rendered pages.

## Security and operational boundaries

- Public URL fetching is guarded against private, loopback, link-local, multicast, reserved, and unspecified IP targets, including redirect destinations and rendered subresources.
- Fetches have redirect, timeout, content-size, and external-script limits.
- `ADMIN_TOKEN` is a minimal placeholder mechanism. Replace it with production authentication/authorization before exposing admin routes.
- Change the default `ADMIN_TOKEN=change-me-before-deploying`; never commit real credentials.
- `/admin/retrain` blocks the request while training runs and does not reload the in-memory model. A production deployment should use a job queue/scheduler, artifact versioning, atomic promotion, and a controlled restart or model reload.
- The backend SQLite report store is intentionally lightweight and has no migration system. Use a managed database for multi-instance or production workloads.
- A phishing prediction is a risk signal, not proof that a site is safe. Users should avoid entering credentials or payment information based solely on the result.

## Validation and smoke testing

After artifacts and the dataset are present, the dataset-sample smoke test can be run from the backend directory:

```bash
python test_extrac.py
```

For a running service, start with:

```bash
curl http://localhost:8000/health
curl -X POST http://localhost:8000/predict-url \\
  -H 'Content-Type: application/json' \\
  -d '{"url":"https://example.com"}'
```

## Relationship to the full repository

The root project is a React 18 + TypeScript + Vite application. `src/lib/api.ts` calls this service at `http://localhost:8000`, `src/lib/queries.ts` stores successful analyses in Supabase, and the protected user/admin routes are defined in `src/App.tsx`. The root `supabase/migrations/` directory defines owner-scoped analyses, report moderation, model metadata, retraining logs, and Row Level Security policies.

The backend README focuses on the detection service itself; the root README describes the complete user-facing application.
