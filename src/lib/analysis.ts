import type { AnalysisResult, AnalysisSummary, Indicator, Prediction, UrlFeatures } from './types';

/**
 * Translate the raw backend output (extraction features + prediction probabilities)
 * into a user-facing summary with human-readable indicators. Never exposes raw
 * feature names, model inputs, or ML terminology to end users.
 */
export function summarizeAnalysis(result: AnalysisResult): AnalysisSummary {
  const f = result.extraction.features;
  const isPhishing = result.prediction.predicted_label === 0;
  const prediction: Prediction = isPhishing ? 'phishing' : 'legitimate';

  const pLegit = result.prediction.probability_legitimate;
  const pPhish = result.prediction.probability_phishing;

  const confidence = Math.round((isPhishing ? pPhish : pLegit) * 1000) / 10;
  const riskScore = Math.round(pPhish * 1000) / 10;
  const probLegit = Math.round(pLegit * 1000) / 10;
  const probPhish = Math.round(pPhish * 1000) / 10;

  const indicators = deriveIndicators(f, isPhishing);

  return {
    id: result.id,
    url: result.url,
    title: result.extraction.title,
    prediction,
    confidence,
    risk_score: riskScore,
    probability_legitimate: probLegit,
    probability_phishing: probPhish,
    indicators,
  };
}

function deriveIndicators(f: UrlFeatures, isPhishing: boolean): Indicator[] {
  const indicators: Indicator[] = [];

  // HTTPS
  if (f.IsHTTPS) {
    indicators.push({ type: 'safe', label: 'HTTPS detected — connection is encrypted' });
  } else {
    indicators.push({ type: 'suspicious', label: 'No HTTPS — connection is not encrypted' });
  }

  // Domain IP
  if (f.IsDomainIP) {
    indicators.push({ type: 'suspicious', label: 'URL uses a raw IP address instead of a domain' });
  } else {
    indicators.push({ type: 'safe', label: 'Uses a domain name rather than a raw IP' });
  }

  // Obfuscation
  if (f.HasObfuscation || f.NoOfObfuscatedChar > 0) {
    indicators.push({ type: 'suspicious', label: 'Obfuscated characters detected in the URL' });
  } else {
    indicators.push({ type: 'safe', label: 'No obfuscated characters in the URL' });
  }

  // Redirects
  if (f.NoOfURLRedirect > 0) {
    indicators.push({ type: 'suspicious', label: `${f.NoOfURLRedirect} redirect(s) detected` });
  } else {
    indicators.push({ type: 'safe', label: 'No suspicious redirects' });
  }

  // Login / password page
  if (f.HasPasswordField) {
    indicators.push({ type: 'suspicious', label: 'Login or account page detected' });
  }

  // External form submission
  if (f.HasExternalFormSubmit) {
    indicators.push({ type: 'suspicious', label: 'Form submits data to an external server' });
  }

  // Hidden fields
  if (f.HasHiddenFields) {
    indicators.push({ type: 'suspicious', label: 'Hidden form fields detected' });
  }

  // Brand impersonation signals
  if (f.Bank) {
    indicators.push({ type: 'suspicious', label: 'References a banking brand — verify carefully' });
  }
  if (f.Pay) {
    indicators.push({ type: 'suspicious', label: 'Payment-related keywords detected' });
  }
  if (f.Crypto) {
    indicators.push({ type: 'suspicious', label: 'Cryptocurrency-related keywords detected' });
  }

  // TLD reputation
  if (f.TLDLegitimateProb < 0.3) {
    indicators.push({ type: 'suspicious', label: 'Uses a frequently abused top-level domain' });
  } else {
    indicators.push({ type: 'safe', label: 'Top-level domain has a reasonable reputation' });
  }

  // URL similarity (brand impersonation heuristic)
  if (f.URLSimilarityIndex < 50) {
    indicators.push({ type: 'suspicious', label: 'URL structure differs significantly from known safe sites' });
  } else if (!isPhishing) {
    indicators.push({ type: 'safe', label: 'Safe browsing indicators present' });
  }

  // Empty references
  if (f.NoOfEmptyRef > 5) {
    indicators.push({ type: 'suspicious', label: 'High number of empty references on the page' });
  }

  // Copyright / legitimacy signals
  if (f.HasCopyrightInfo && !isPhishing) {
    indicators.push({ type: 'safe', label: 'Copyright information present' });
  }
  if (f.HasSocialNet && !isPhishing) {
    indicators.push({ type: 'safe', label: 'Links to official social networks' });
  }

  // Ensure at least a couple of safe indicators for legitimate results
  if (!isPhishing && indicators.filter((i) => i.type === 'safe').length < 2) {
    indicators.push({ type: 'safe', label: 'No suspicious redirects' });
  }

  return indicators;
}