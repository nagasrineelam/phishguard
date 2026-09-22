# PhishGuard

PhishGuard is an AI-powered phishing URL detection platform that helps users analyze suspicious links, monitor risk indicators, and report incorrect detections. The project combines a modern React + TypeScript frontend, a Supabase-powered data layer, and a Python machine learning backend for URL classification and retraining workflows.

## Project Overview

Phishing attacks often disguise themselves as legitimate websites, login forms, payment portals, or security prompts. PhishGuard was designed to reduce that risk by giving users a fast and clear way to:

- paste or analyze a URL
- get an instant phishing vs legitimate prediction
- inspect risk indicators and confidence scores
- review analysis history
- submit incorrect-result reports for human review
- access admin tools for moderation and model feedback

The platform balances user experience with security intelligence, making it suitable for personal use, team workflows, and administrative review.

## Key Features

### 1. URL Analysis and Risk Scoring
- Users can submit URLs directly through the UI.
- The backend extracts URL features and runs a phishing detection model.
- Results include:
  - phishing or legitimate classification
  - confidence score
  - probability breakdown
  - suspicious indicators
  - risk score visualization

### 2. Historical Analysis Tracking
- Every analysis is saved per authenticated user.
- Users can review previous checks, compare outcomes, and inspect detection metadata.
- A dedicated history page allows filtering and browsing earlier results.

### 3. Reporting and Validation Workflow
- Users can flag wrong model predictions.
- Submitted reports are tracked in a review queue.
- Admins can verify, reject, or classify reports as legitimate or phishing.
- Verified reports can help improve future model quality.

### 4. Admin Dashboard
- Admin users get a dedicated dashboard with operational metrics.
- Includes pending and verified report counts, model statistics, trend data, and retraining progress.
- Helps maintain data quality and monitor system health.

### 5. Modern Frontend Experience
- Built with React, TypeScript, Vite, and Tailwind CSS
- Responsive layout and polished UI components
- Dark/light theme support
- Animated UI with Framer Motion

## Architecture

The system is split into three main layers:

### Frontend (Root Project)
The root application is a React + TypeScript SPA.

Responsibilities:
- user authentication and profile management
- URL analysis workflow
- dashboard and history views
- admin portal
- theme and UI state management

Key frontend files:
- `src/App.tsx` — routing and application structure
- `src/pages/*.tsx` — landing, login, dashboard, analyze, history, settings, profile
- `src/lib/queries.ts` — React Query hooks for data fetching and mutations
- `src/lib/auth-context.tsx` — authentication state management
- `src/lib/api.ts` — API client configuration and shared error handling
- `src/lib/supabase.ts` — Supabase client initialization

### Backend ML API (`Phishguard-backend`)
The backend contains the Python ML pipeline and FastAPI service.

Responsibilities:
- URL feature extraction
- model training
- inference and prediction
- health checks
- crowdsourced report handling
- retraining hooks

The backend folder includes:
- `api/` — API layer and schemas
- `core/` — model logic, preprocessing, inference, config
- `artifacts/` — trained model files and feature metadata
- `data/` — dataset storage
- `test_extrac.py` — extraction and smoke testing
- `phishing-detection.ipynb` — notebook experimentation and model analysis

### Supabase Layer
Supabase provides the persistent application layer for:
- auth
- user profiles
- analysis records
- report records
- admin/moderation data
- model metadata and retraining information

The `supabase/` directory contains database migrations and edge/function support.

## Tech Stack

### Frontend
- React 18
- TypeScript
- Vite
- Tailwind CSS
- shadcn-style UI primitives
- TanStack React Query
- React Router
- Framer Motion
- Recharts
- Supabase JS client

### Backend / ML
- Python
- FastAPI
- TensorFlow / Keras
- scikit-learn style preprocessing pipeline
- Pickle-based model artifacts
- Pandas / NumPy-based dataset processing

### Data / Storage
- Supabase Postgres
- Auth and Row Level Security support
- structured data for users, analyses, reports, and model metadata

## Repository Structure

```text
phishguard/
├── README.md
├── index.html
├── package.json
├── package-lock.json
├── vite.config.ts
├── tsconfig.json
├── tailwind.config.js
├── postcss.config.js
├── eslint.config.js
├── components.json
├── src/
│   ├── App.tsx
│   ├── main.tsx
│   ├── index.css
│   ├── components/
│   ├── hooks/
│   ├── lib/
│   └── pages/
├��─ supabase/
│   ├── functions/
│   ├── migrations/
│   └── .temp/
├── Phishguard-backend/
│   ├── api/
│   ├── core/
│   ├── data/
│   ├── artifacts/
│   ├── requirements.txt
│   ├── README.md
│   ├── .env.example
│   ├── test_extrac.py
│   └── phishing-detection.ipynb
└── .gitignore
```

## Getting Started

### Prerequisites
- Node.js 18+
- npm or yarn
- Python 3.10+
- Supabase project configuration
- Optional: Kaggle API access for dataset download

### 1. Install Frontend Dependencies

```bash
npm install
```

### 2. Configure Environment Variables
Create a `.env` file in the project root for frontend values if needed:

```bash
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

### 3. Set Up the Backend
Navigate to `Phishguard-backend` and install Python dependencies:

```bash
cd Phishguard-backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

Copy the example environment file:

```bash
cp .env.example .env
```

Then update the environment values as needed, especially authentication tokens for admin or deployed environments.

### 4. Download Dataset for the Model
The backend is designed around the PhiUSIIL phishing URL dataset.

```bash
pip install kaggle
kaggle datasets download -d ndarvind/phiusiil-phishing-url-dataset -p ./data --unzip
```

### 5. Train the Model

```bash
cd Phishguard-backend
python train.py
```

The training pipeline writes model artifacts into the `artifacts/` directory.

## Running the Application

### Frontend

```bash
npm run dev
```

### Backend API

```bash
cd Phishguard-backend
uvicorn api.main:app --reload --port 8000
```

## Runtime Workflow

1. A user signs in or registers.
2. The user submits a URL in the analysis page.
3. The frontend sends the request to the ML backend.
4. The model extracts suspicious indicators and predicts phishing likelihood.
5. The result is displayed to the user with risk visuals and summary details.
6. The analysis is saved under the user’s account.
7. The user can report incorrect predictions for admin review.
8. Admins verify each report, improving the model feedback loop.

## Key Data Model Concepts

### Analysis
Each analysis stores:
- user ID
- URL
- title
- prediction label
- confidence
- risk score
- probability breakdown
- extracted indicators
- raw model response

### Report
Each report stores:
- original prediction
- probability
- reason
- note
- status (pending, verified_legitimate, verified_phishing, rejected)

### Model Metadata
The model information table tracks:
- version
- dataset size
- accuracy
- precision
- recall
- F1 score
- ROC AUC
- training date
- status

## Admin Capabilities

Admin users can access a separate portal for:
- pending report review
- verified report history
- overview of prediction trends
- dataset and model health statistics
- retraining log monitoring

## Security and Data Handling Notes

- Auth is handled with Supabase authentication.
- Sensitive or environment-specific configuration should never be committed directly.
- Model artifacts and training outputs should be treated as generated assets.
- API tokens and admin tokens must be protected before deployment in production.

## Challenges Solved by the Project

- phishing detection is not a simple blacklist check; it requires analysis of structure, indicators, and model risk patterns
- users need both prediction and explainability, not just raw labels
- crowd-sourced reporting adds human feedback to improve reliability
- admin review gives a way to validate suspicious cases and update training data

## Future Improvements

- stronger model evaluation with explainable AI output
- more phishing heuristics and domain reputation checks
- user-specific alert settings
- browser extension integration
- notification system for suspicious activity
- production-grade deployment with CI/CD and monitoring

## Summary

PhishGuard is a full-stack phishing detection system that combines the power of machine learning, user-friendly interfaces, and operational review workflows. It helps people quickly assess whether a URL is suspicious while creating a feedback loop for ongoing model improvement.

This project demonstrates an end-to-end pattern for AI-driven security tools: detect, explain, validate, and improve.

## License

This project is provided as a software project for demonstration and development. License terms should be reviewed and applied according to the repository owner’s requirements.

---

If you want to continue improving the project, the most valuable next steps are:
- complete backend deployment setup
- configure Supabase tables and policies
- validate the ML pipeline on a production-grade dataset
- add CI checks for frontend and backend quality
- add automated smoke tests around prediction and auth flows



