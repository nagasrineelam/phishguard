import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  ScanSearch,
  Loader2,
  Globe,
  ShieldCheck,
  ShieldAlert,
  CheckCircle2,
  AlertTriangle,
  Copy,
  Download,
  Share2,
  Flag,
  FileText,
  Activity,
} from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { RiskGauge, ProbabilityBar } from '@/components/charts/risk-charts';
import { ProbabilityPie } from '@/components/charts/probability-pie';
import { ReportDialog } from '@/components/report-dialog';
import { usePredictUrl } from '@/lib/queries';
import { analyzeSchema, type AnalyzeValues } from '@/lib/validations';
import { summarizeAnalysis } from '@/lib/analysis';
import { toast } from 'sonner';
import type { AnalysisResult, AnalysisSummary } from '@/lib/types';
import jsPDF from 'jspdf';

export function AnalyzePage() {
  const navigate = useNavigate();
  const predict = usePredictUrl();
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [reportOpen, setReportOpen] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<AnalyzeValues>({
    resolver: zodResolver(analyzeSchema),
    defaultValues: { url: '' },
  });

  const urlValue = watch('url');
  const summary: AnalysisSummary | null = result ? summarizeAnalysis(result) : null;
  const isPhishing = summary?.prediction === 'phishing';

  const onSubmit = async (values: AnalyzeValues) => {
    try {
      const res = await predict.mutateAsync(values.url);
      setResult(res);
    } catch {
      // handled by interceptor
    }
  };

  const handleCopy = async () => {
    if (!summary) return;
    const text = `PhishGuard Analysis\nURL: ${summary.url}\nPrediction: ${summary.prediction.toUpperCase()}\nConfidence: ${summary.confidence}%\nRisk Score: ${summary.risk_score}%`;
    await navigator.clipboard.writeText(text);
    toast.success('Result copied to clipboard.');
  };

  const handleDownload = () => {
    if (!summary) return;
    const doc = new jsPDF();
    doc.setFillColor(15, 23, 42);
    doc.rect(0, 0, 210, 40, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(20);
    doc.text('PhishGuard Analysis Report', 14, 20);
    doc.setFontSize(10);
    doc.setTextColor(148, 163, 184);
    doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 30);

    doc.setTextColor(15, 23, 42);
    doc.setFontSize(12);
    let y = 55;
    doc.text(`URL: ${summary.url}`, 14, y); y += 10;
    doc.text(`Title: ${summary.title}`, 14, y); y += 10;
    doc.text(`Prediction: ${summary.prediction.toUpperCase()}`, 14, y); y += 10;
    doc.text(`Confidence: ${summary.confidence}%`, 14, y); y += 10;
    doc.text(`Risk Score: ${summary.risk_score}%`, 14, y); y += 10;
    doc.text(`P(Legitimate): ${summary.probability_legitimate}%`, 14, y); y += 10;
    doc.text(`P(Phishing): ${summary.probability_phishing}%`, 14, y); y += 15;

    doc.setFontSize(11);
    doc.text('Indicators:', 14, y); y += 8;
    doc.setFontSize(10);
    for (const ind of summary.indicators) {
      const prefix = ind.type === 'safe' ? '[SAFE]' : '[RISK]';
      doc.setTextColor(ind.type === 'safe' ? 22 : 220, ind.type === 'safe' ? 163 : 38, ind.type === 'safe' ? 74 : 38);
      const lines = doc.splitTextToSize(`${prefix} ${ind.label}`, 180);
      doc.text(lines, 14, y);
      y += 7 * lines.length;
    }

    doc.save(`phishguard-report-${Date.now()}.pdf`);
    toast.success('Report downloaded.');
  };

  const handleShare = async () => {
    if (!summary) return;
    const text = `PhishGuard analyzed ${summary.url}: ${summary.prediction.toUpperCase()} (${summary.confidence}% confidence)`;
    try {
      if (navigator.share) {
        await navigator.share({ title: 'PhishGuard Result', text });
      } else {
        await navigator.clipboard.writeText(text);
        toast.success('Result copied to share.');
      }
    } catch {
      // user cancelled
    }
  };

  return (
    <div>
      <PageHeader
        title="Analyze URL"
        description="Paste any URL below to run an AI-powered phishing analysis."
        breadcrumbs={[{ label: 'Dashboard', to: '/dashboard' }, { label: 'Analyze' }]}
      />

      {/* Input */}
      <Card className="mb-8 glass">
        <CardContent className="pt-6">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <Textarea
                {...register('url')}
                placeholder="https://example.com or example.com/suspicious-page"
                className="min-h-[80px] resize-none font-mono text-sm"
                disabled={predict.isPending}
              />
              {errors.url && <p className="mt-1.5 text-xs text-destructive">{errors.url.message}</p>}
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-muted-foreground">
                We analyze URL structure and indicators — no browsing of the target site.
              </p>
              <Button type="submit" size="lg" disabled={predict.isPending || !urlValue.trim()}>
                {predict.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <ScanSearch className="mr-2 h-4 w-4" />
                )}
                {predict.isPending ? 'Analyzing...' : 'Analyze URL'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Loading animation */}
      <AnimatePresence>
        {predict.isPending && <AnalyzingAnimation url={urlValue} />}
      </AnimatePresence>

      {/* Result */}
      <AnimatePresence>
        {summary && !predict.isPending && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5 }}
          >
            <ResultDisplay summary={summary} isPhishing={!!isPhishing} onReport={() => setReportOpen(true)}
              onCopy={handleCopy} onDownload={handleDownload} onShare={handleShare}
              onViewHistory={() => navigate('/history')}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {summary && (
        <ReportDialog
          open={reportOpen}
          onOpenChange={setReportOpen}
          analysisId={summary.id}
          url={summary.url}
          originalPrediction={summary.prediction}
          probability={summary.probability_phishing}
        />
      )}
    </div>
  );
}

function AnalyzingAnimation({ url }: { url: string }) {
  const steps = [
    'Parsing URL structure...',
    'Checking security indicators...',
    'Analyzing domain reputation...',
    'Running AI detection model...',
    'Compiling risk assessment...',
  ];
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="mb-8"
    >
      <Card className="glass overflow-hidden">
        <CardContent className="flex flex-col items-center justify-center py-16">
          <div className="relative mb-8 flex h-24 w-24 items-center justify-center">
            <span className="absolute inline-flex h-full w-full animate-pulse-ring rounded-full bg-primary/30" />
            <span className="absolute inline-flex h-3/4 w-3/4 animate-pulse-ring rounded-full bg-accent/30" style={{ animationDelay: '0.4s' }} />
            <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-accent text-primary-foreground">
              <ScanSearch className="h-8 w-8 animate-pulse" />
            </div>
          </div>
          <div className="mb-1 font-mono text-sm text-muted-foreground">{url}</div>
          <div className="flex items-center gap-2 text-sm font-medium text-primary">
            <Loader2 className="h-4 w-4 animate-spin" />
            AI analysis in progress
          </div>
          <div className="mt-6 w-full max-w-md space-y-2">
            {steps.map((s, i) => (
              <motion.div
                key={s}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.3 }}
                className="flex items-center gap-2 text-xs text-muted-foreground"
              >
                <CheckCircle2 className="h-3.5 w-3.5 text-success" />
                {s}
              </motion.div>
            ))}
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

function ResultDisplay({
  summary,
  isPhishing,
  onReport,
  onCopy,
  onDownload,
  onShare,
  onViewHistory,
}: {
  summary: AnalysisSummary;
  isPhishing: boolean;
  onReport: () => void;
  onCopy: () => void;
  onDownload: () => void;
  onShare: () => void;
  onViewHistory: () => void;
}) {
  const safeIndicators = summary.indicators.filter((i) => i.type === 'safe');
  const riskIndicators = summary.indicators.filter((i) => i.type === 'suspicious');

  return (
    <div className="space-y-6">
      {/* Status banner */}
      <Card className={isPhishing ? 'glass border-destructive/40 glow' : 'glass border-success/40 glow-accent'}>
        <CardContent className="pt-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <div
                className={
                  isPhishing
                    ? 'flex h-14 w-14 items-center justify-center rounded-2xl bg-destructive/10 text-destructive'
                    : 'flex h-14 w-14 items-center justify-center rounded-2xl bg-success/10 text-success'
                }
              >
                {isPhishing ? <ShieldAlert className="h-7 w-7" /> : <ShieldCheck className="h-7 w-7" />}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-muted-foreground">Prediction:</span>
                  <Badge variant={isPhishing ? 'destructive' : 'default'} className={isPhishing ? '' : 'bg-success text-success-foreground'}>
                    {isPhishing ? 'PHISHING' : 'LEGITIMATE'}
                  </Badge>
                </div>
                <div className="mt-1 flex items-center gap-2 text-sm">
                  <Globe className="h-4 w-4 text-muted-foreground" />
                  <span className="font-mono">{summary.url}</span>
                </div>
                <div className="mt-0.5 text-sm text-muted-foreground">{summary.title}</div>
              </div>
            </div>
            <div className="text-right">
              <div className="text-xs text-muted-foreground">Confidence</div>
              <div className={isPhishing ? 'text-3xl font-bold text-destructive' : 'text-3xl font-bold text-success'}>
                {summary.confidence}%
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Risk meter */}
        <Card className="glass lg:col-span-1">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Activity className="h-4 w-4 text-primary" />
              Risk Meter
            </CardTitle>
            <CardDescription>Overall phishing risk score</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center">
            <RiskGauge value={summary.risk_score} label="Risk Score" />
            <div className="mt-4 w-full space-y-3">
              <ProbabilityBar label="Legitimate" value={summary.probability_legitimate} color="primary" />
              <ProbabilityBar label="Phishing" value={summary.probability_phishing} color="destructive" />
            </div>
          </CardContent>
        </Card>

        {/* Probability pie */}
        <Card className="glass lg:col-span-1">
          <CardHeader>
            <CardTitle className="text-base">Probability Distribution</CardTitle>
            <CardDescription>AI model confidence breakdown</CardDescription>
          </CardHeader>
          <CardContent>
            <ProbabilityPie
              legitimate={summary.probability_legitimate}
              phishing={summary.probability_phishing}
            />
          </CardContent>
        </Card>

        {/* Summary */}
        <Card className="glass lg:col-span-1">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <FileText className="h-4 w-4 text-primary" />
              Summary
            </CardTitle>
            <CardDescription>Key findings from the analysis</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {isPhishing ? (
              <>
                {riskIndicators.length > 0 && (
                  <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3">
                    <div className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-destructive">
                      <AlertTriangle className="h-4 w-4" />
                      Suspicious indicators
                    </div>
                    <ul className="space-y-1.5">
                      {riskIndicators.map((ind, i) => (
                        <li key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" />
                          {ind.label}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {safeIndicators.length > 0 && (
                  <div className="rounded-lg border border-success/30 bg-success/5 p-3">
                    <div className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-success">
                      <CheckCircle2 className="h-4 w-4" />
                      Safe indicators
                    </div>
                    <ul className="space-y-1.5">
                      {safeIndicators.map((ind, i) => (
                        <li key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                          <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" />
                          {ind.label}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            ) : (
              <div className="rounded-lg border border-success/30 bg-success/5 p-3">
                <div className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-success">
                  <CheckCircle2 className="h-4 w-4" />
                  Safe indicators detected
                </div>
                <ul className="space-y-1.5">
                  {safeIndicators.map((ind, i) => (
                    <li key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                      <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" />
                      {ind.label}
                    </li>
                  ))}
                </ul>
                {riskIndicators.length > 0 && (
                  <div className="mt-3 border-t border-success/20 pt-3">
                    <div className="mb-1.5 text-xs font-medium text-muted-foreground">Minor flags:</div>
                    <ul className="space-y-1">
                      {riskIndicators.map((ind, i) => (
                        <li key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-warning" />
                          {ind.label}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Actions */}
      <Card className="glass">
        <CardContent className="flex flex-col gap-3 pt-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={onCopy}>
              <Copy className="mr-2 h-4 w-4" /> Copy Result
            </Button>
            <Button variant="outline" size="sm" onClick={onDownload}>
              <Download className="mr-2 h-4 w-4" /> Download Report
            </Button>
            <Button variant="outline" size="sm" onClick={onShare}>
              <Share2 className="mr-2 h-4 w-4" /> Share
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="ghost" size="sm" onClick={onReport} className="text-destructive hover:text-destructive">
              <Flag className="mr-2 h-4 w-4" /> Report Incorrect Result
            </Button>
            <Button variant="ghost" size="sm" onClick={onViewHistory}>
              View History
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}