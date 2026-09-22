export type Prediction = 'legitimate' | 'phishing';

export type ReportStatus =
  | 'pending'
  | 'verified_legitimate'
  | 'verified_phishing'
  | 'rejected';

export type ModelStatus = 'active' | 'training' | 'failed';

export interface Indicator {
  type: 'safe' | 'suspicious';
  label: string;
}

/** Raw feature set returned by the extraction backend. */
export interface UrlFeatures {
  TLD: string;
  IsHTTPS: boolean;
  IsDomainIP: boolean;
  HasObfuscation: boolean;
  TLDLength: number;
  NoOfSubDomain: number;
  NoOfObfuscatedChar: number;
  ObfuscationRatio: number;
  NoOfLettersInURL: number;
  LetterRatioInURL: number;
  NoOfDegitsInURL: number;
  DegitRatioInURL: number;
  NoOfEqualsInURL: number;
  NoOfQMarkInURL: number;
  NoOfAmpersandInURL: number;
  NoOfOtherSpecialCharsInURL: number;
  SpacialCharRatioInURL: number;
  CharContinuationRate: number;
  Bank: boolean;
  Pay: boolean;
  Crypto: boolean;
  HasTitle: boolean;
  HasFavicon: boolean;
  Robots: boolean;
  IsResponsive: boolean;
  HasDescription: boolean;
  HasExternalFormSubmit: boolean;
  HasSocialNet: boolean;
  HasSubmitButton: boolean;
  HasHiddenFields: boolean;
  HasPasswordField: boolean;
  HasCopyrightInfo: boolean;
  LineOfCode: number;
  LargestLineLength: number;
  DomainTitleMatchScore: number;
  URLTitleMatchScore: number;
  NoOfURLRedirect: number;
  NoOfSelfRedirect: number;
  NoOfPopup: number;
  NoOfiFrame: number;
  NoOfImage: number;
  NoOfCSS: number;
  NoOfJS: number;
  NoOfSelfRef: number;
  NoOfEmptyRef: number;
  NoOfExternalRef: number;
  TLDLegitimateProb: number;
  URLCharProb: number;
  URLSimilarityIndex: number;
}

export interface Extraction {
  url: string;
  title: string;
  features: UrlFeatures;
  warnings: string[];
}

export interface PredictionPayload {
  probability_legitimate: number;
  probability_phishing: number;
  predicted_label: number; // 0 = phishing, 1 = legitimate
  predicted_class: string; // "Phishing" | "Legitimate"
  threshold: number;
}

/** Full response from POST /predict-url. `id` is set after saving to the database. */
export interface AnalysisResult {
  id?: string;
  url: string;
  extraction: Extraction;
  prediction: PredictionPayload;
}

/** Derived, user-facing summary fields computed from AnalysisResult. */
export interface AnalysisSummary {
  id?: string;
  url: string;
  title: string;
  prediction: Prediction;
  confidence: number;
  risk_score: number;
  probability_legitimate: number;
  probability_phishing: number;
  indicators: Indicator[];
}

export interface AnalysisRecord {
  id: string;
  user_id: string;
  url: string;
  title: string | null;
  prediction: Prediction;
  confidence: number;
  risk_score: number;
  probability_legitimate: number;
  probability_phishing: number;
  indicators: Indicator[];
  raw_response: AnalysisResult | null;
  created_at: string;
}

export interface UserProfile {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  role: 'user' | 'admin';
  notifications_enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface ReportRecord {
  id: string;
  analysis_id: string | null;
  user_id: string;
  url: string;
  original_prediction: Prediction;
  probability: number | null;
  reason: string;
  note: string | null;
  status: ReportStatus;
  verified_label: Prediction | null;
  resolved_by: string | null;
  created_at: string;
  resolved_at: string | null;
}

export interface ModelInfo {
  id: number;
  version: string;
  num_features: number;
  training_dataset_size: number;
  accuracy: number;
  precision: number;
  recall: number;
  f1_score: number;
  roc_auc: number;
  training_date: string;
  status: ModelStatus;
}

export interface RetrainLog {
  id: string;
  started_by: string;
  status: 'running' | 'success' | 'failed';
  dataset_size: number | null;
  approved_reports: number | null;
  progress: number;
  logs: { t: string; msg: string }[];
  new_version: string | null;
  accuracy: number | null;
  started_at: string;
  finished_at: string | null;
}

export interface HealthStatus {
  api_status: string;
  model_loaded: boolean;
  expected_features: number;
  database_status: string;
  timestamp: string;
}

export interface PendingReportsResponse {
  reports: ReportRecord[];
  total: number;
  page: number;
  per_page: number;
}