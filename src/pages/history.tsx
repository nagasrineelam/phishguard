import { useState, useMemo, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Search,
  ShieldCheck,
  ShieldAlert,
  Loader2,
  History as HistoryIcon,
  ChevronLeft,
  ChevronRight,
  Globe,
  Calendar,
  FileJson,
  ChevronDown,
  ChevronRight as ChevronRightIcon,
} from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { RiskGauge, ProbabilityBar } from '@/components/charts/risk-charts';
import { useAnalyses } from '@/lib/queries';
import type { AnalysisRecord, AnalysisResult } from '@/lib/types';
import { summarizeAnalysis } from '@/lib/analysis';

export function HistoryPage() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<'all' | 'legitimate' | 'phishing'>('all');
  const [sort, setSort] = useState<'newest' | 'oldest'>('newest');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [searchParams, setSearchParams] = useSearchParams();
  const perPage = 8;

  const { data: analyses, isLoading } = useAnalyses({
    search: search || undefined,
    status: status === 'all' ? undefined : status,
    sort,
  });

  const selected = useMemo(
    () => analyses?.find((a) => a.id === selectedId) ?? null,
    [analyses, selectedId],
  );

  useEffect(() => {
    const id = searchParams.get('id');
    if (id) setSelectedId(id);
  }, [searchParams]);

  const paginated = useMemo(() => {
    if (!analyses) return [];
    const start = (page - 1) * perPage;
    return analyses.slice(start, start + perPage);
  }, [analyses, page]);

  const totalPages = Math.max(1, Math.ceil((analyses?.length ?? 0) / perPage));

  return (
    <div>
      <PageHeader
        title="History"
        description="All URLs you have analyzed."
        breadcrumbs={[{ label: 'Dashboard', to: '/dashboard' }, { label: 'History' }]}
      />

      <Card className="glass mb-6">
        <CardContent className="flex flex-col gap-3 pt-6 lg:flex-row lg:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by URL or title..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className="pl-9"
            />
          </div>
          <Select value={status} onValueChange={(v) => { setStatus(v as typeof status); setPage(1); }}>
            <SelectTrigger className="w-full lg:w-44">
              <SelectValue placeholder="Filter" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="legitimate">Legitimate</SelectItem>
              <SelectItem value="phishing">Phishing</SelectItem>
            </SelectContent>
          </Select>
          <Select value={sort} onValueChange={(v) => setSort(v as typeof sort)}>
            <SelectTrigger className="w-full lg:w-44">
              <SelectValue placeholder="Sort" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="newest">Newest first</SelectItem>
              <SelectItem value="oldest">Oldest first</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : !analyses || analyses.length === 0 ? (
        <Card className="glass">
          <CardContent className="flex flex-col items-center justify-center py-20 text-center">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-muted">
              <HistoryIcon className="h-6 w-6 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium">No analyses found</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {search || status !== 'all' ? 'Try adjusting your filters.' : 'Analyze a URL to get started.'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-3">
            {paginated.map((a, i) => (
              <motion.div
                key={a.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04 }}
              >
                <button
                  onClick={() => {
                    setSelectedId(a.id);
                    setSearchParams({ id: a.id });
                  }}
                  className="flex w-full items-center justify-between rounded-xl border border-border/60 bg-card/40 p-4 text-left transition-all hover:border-primary/40 hover:bg-muted/40 hover:glow"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    {a.prediction === 'phishing' ? (
                      <ShieldAlert className="h-5 w-5 shrink-0 text-destructive" />
                    ) : (
                      <ShieldCheck className="h-5 w-5 shrink-0 text-success" />
                    )}
                    <div className="min-w-0">
                      <div className="truncate font-mono text-sm">{a.url}</div>
                      <div className="mt-0.5 flex items-center gap-3 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {new Date(a.created_at).toLocaleString()}
                        </span>
                        {a.title && <span className="hidden sm:inline">{a.title}</span>}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="hidden text-right sm:block">
                      <div className="text-xs text-muted-foreground">Confidence</div>
                      <div className="text-sm font-semibold tabular-nums">{a.confidence}%</div>
                    </div>
                    <Badge variant={a.prediction === 'phishing' ? 'destructive' : 'default'} className={a.prediction === 'legitimate' ? 'bg-success text-success-foreground' : ''}>
                      {a.prediction === 'phishing' ? 'Phishing' : 'Safe'}
                    </Badge>
                  </div>
                </button>
              </motion.div>
            ))}
          </div>

          {totalPages > 1 && (
            <div className="mt-6 flex items-center justify-center gap-2">
              <Button variant="outline" size="icon" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm text-muted-foreground">
                Page {page} of {totalPages}
              </span>
              <Button variant="outline" size="icon" disabled={page === totalPages} onClick={() => setPage((p) => p + 1)}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </>
      )}

      <Sheet open={!!selected} onOpenChange={(o) => { if (!o) { setSelectedId(null); setSearchParams({}); } }}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-lg">
          {selected && <AnalysisDetail analysis={selected} />}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function AnalysisDetail({ analysis }: { analysis: AnalysisRecord }) {
  const isPhishing = analysis.prediction === 'phishing';
  const summary = analysis.raw_response
    ? summarizeAnalysis(analysis.raw_response as AnalysisResult)
    : null;

  const indicators = summary?.indicators ?? analysis.indicators ?? [];

  return (
    <div className="space-y-6 pt-2">
      <SheetHeader>
        <SheetTitle className="flex items-center gap-2">
          {isPhishing ? <ShieldAlert className="h-5 w-5 text-destructive" /> : <ShieldCheck className="h-5 w-5 text-success" />}
          Analysis Detail
        </SheetTitle>
        <SheetDescription>
          <span className="flex items-center gap-1.5 font-mono text-xs">
            <Globe className="h-3 w-3" /> {analysis.url}
          </span>
        </SheetDescription>
      </SheetHeader>

      <div className="flex items-center justify-between rounded-lg border border-border/60 bg-muted/30 p-4">
        <div>
          <div className="text-xs text-muted-foreground">Prediction</div>
          <Badge variant={isPhishing ? 'destructive' : 'default'} className={`mt-1 ${isPhishing ? '' : 'bg-success text-success-foreground'}`}>
            {isPhishing ? 'PHISHING' : 'LEGITIMATE'}
          </Badge>
        </div>
        <div className="text-right">
          <div className="text-xs text-muted-foreground">Confidence</div>
          <div className={isPhishing ? 'text-2xl font-bold text-destructive' : 'text-2xl font-bold text-success'}>
            {analysis.confidence}%
          </div>
        </div>
      </div>

      <div className="flex flex-col items-center">
        <RiskGauge value={analysis.risk_score} label="Risk Score" size={160} />
      </div>

      <div className="space-y-3">
        <ProbabilityBar label="Legitimate" value={analysis.probability_legitimate} color="primary" />
        <ProbabilityBar label="Phishing" value={analysis.probability_phishing} color="destructive" />
      </div>

      <div>
        <h4 className="mb-2 text-sm font-semibold">Indicators</h4>
        <ul className="space-y-1.5">
          {indicators.map((ind, i) => (
            <li key={i} className="flex items-start gap-2 text-xs">
              {ind.type === 'safe' ? (
                <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" />
              ) : (
                <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" />
              )}
              <span className="text-muted-foreground">{ind.label}</span>
            </li>
          ))}
        </ul>
      </div>

      {analysis.raw_response && (
        <RawResponseSection raw={analysis.raw_response as AnalysisResult} />
      )}

      <div className="rounded-lg border border-border/60 bg-muted/30 p-3 text-xs text-muted-foreground">
        Analyzed on {new Date(analysis.created_at).toLocaleString()}
      </div>
    </div>
  );
}

function RawResponseSection({ raw }: { raw: AnalysisResult }) {
  const [open, setOpen] = useState(false);
  const [featuresOpen, setFeaturesOpen] = useState(false);

  return (
    <div className="rounded-lg border border-border/60 bg-muted/20">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between p-3 text-left"
      >
        <span className="flex items-center gap-2 text-sm font-semibold">
          <FileJson className="h-4 w-4 text-primary" />
          Full Analysis Data
        </span>
        {open ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRightIcon className="h-4 w-4 text-muted-foreground" />}
      </button>
      {open && (
        <div className="space-y-3 border-t border-border/40 p-3">
          <DataRow label="URL" value={raw.url} />
          <DataRow label="Title" value={raw.extraction.title} />

          <div>
            <div className="mb-1 text-xs font-medium text-muted-foreground">Prediction</div>
            <div className="space-y-1 rounded-md bg-background/40 p-2 font-mono text-xs">
              <DataRow label="Class" value={raw.prediction.predicted_class} />
              <DataRow label="P(Legitimate)" value={`${(raw.prediction.probability_legitimate * 100).toFixed(2)}%`} />
              <DataRow label="P(Phishing)" value={`${(raw.prediction.probability_phishing * 100).toFixed(2)}%`} />
              <DataRow label="Threshold" value={raw.prediction.threshold.toString()} />
            </div>
          </div>

          <div>
            <button
              onClick={() => setFeaturesOpen((v) => !v)}
              className="flex w-full items-center justify-between text-left"
            >
              <span className="text-xs font-medium text-muted-foreground">Extracted Features ({Object.keys(raw.extraction.features).length})</span>
              {featuresOpen ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRightIcon className="h-3.5 w-3.5 text-muted-foreground" />}
            </button>
            {featuresOpen && (
              <div className="mt-2 max-h-64 overflow-y-auto rounded-md bg-background/40 p-2">
                <table className="w-full text-xs">
                  <tbody>
                    {Object.entries(raw.extraction.features).map(([key, value]) => (
                      <tr key={key} className="border-b border-border/20 last:border-0">
                        <td className="py-1 pr-2 font-mono text-muted-foreground">{key}</td>
                        <td className="py-1 text-right font-mono">{String(value)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {raw.extraction.warnings.length > 0 && (
            <div>
              <div className="mb-1 text-xs font-medium text-muted-foreground">Warnings</div>
              <ul className="space-y-1">
                {raw.extraction.warnings.map((w, i) => (
                  <li key={i} className="rounded-md bg-warning/5 p-2 text-[11px] leading-relaxed text-muted-foreground">
                    {w}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function DataRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className="truncate font-mono">{value}</span>
    </div>
  );
}