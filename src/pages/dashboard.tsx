import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ScanSearch,
  ShieldCheck,
  ShieldAlert,
  Flag,
  History,
  ArrowRight,
  TrendingUp,
  Loader2,
} from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useUserStats, useAnalyses } from '@/lib/queries';

export function DashboardPage() {
  const { data: stats, isLoading: statsLoading } = useUserStats();
  const { data: recent, isLoading: recentLoading } = useAnalyses({ sort: 'newest' });

  const statCards = [
    { label: 'Total URLs Checked', value: stats?.total, icon: ScanSearch, color: 'text-primary', bg: 'bg-primary/10' },
    { label: 'Legitimate URLs', value: stats?.legitimate, icon: ShieldCheck, color: 'text-success', bg: 'bg-success/10' },
    { label: 'Phishing URLs', value: stats?.phishing, icon: ShieldAlert, color: 'text-destructive', bg: 'bg-destructive/10' },
    { label: 'Reports Submitted', value: stats?.reports, icon: Flag, color: 'text-warning', bg: 'bg-warning/10' },
  ];

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description="Overview of your phishing detection activity."
        actions={
          <Button asChild>
            <Link to="/analyze">
              <ScanSearch className="mr-2 h-4 w-4" />
              Analyze URL
            </Link>
          </Button>
        }
      />

      {/* Stats */}
      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {statCards.map((s, i) => (
          <motion.div
            key={s.label}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.08 }}
          >
            <Card className="glass">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      {s.label}
                    </div>
                    <div className="mt-2 text-3xl font-bold tabular-nums">
                      {statsLoading ? <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /> : s.value ?? 0}
                    </div>
                  </div>
                  <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${s.bg} ${s.color}`}>
                    <s.icon className="h-5 w-5" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Recent activity */}
      <Card className="glass">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <History className="h-4 w-4 text-primary" />
              Recent Activity
            </CardTitle>
            <CardDescription>Your latest analyzed URLs</CardDescription>
          </div>
          <Button variant="ghost" size="sm" asChild>
            <Link to="/history">View all <ArrowRight className="ml-1 h-3.5 w-3.5" /></Link>
          </Button>
        </CardHeader>
        <CardContent>
          {recentLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : !recent || recent.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-muted">
                <TrendingUp className="h-6 w-6 text-muted-foreground" />
              </div>
              <p className="text-sm font-medium">No analyses yet</p>
              <p className="mt-1 text-xs text-muted-foreground">Analyze your first URL to see it here.</p>
              <Button className="mt-4" size="sm" asChild>
                <Link to="/analyze">Analyze a URL</Link>
              </Button>
            </div>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {recent.slice(0, 8).map((a) => (
                <Link
                  key={a.id}
                  to={`/history?id=${a.id}`}
                  className="flex items-center justify-between rounded-lg border border-border/60 bg-background/40 p-3 transition-colors hover:bg-muted/50"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    {a.prediction === 'phishing' ? (
                      <ShieldAlert className="h-4 w-4 shrink-0 text-destructive" />
                    ) : (
                      <ShieldCheck className="h-4 w-4 shrink-0 text-success" />
                    )}
                    <div className="min-w-0">
                      <div className="truncate font-mono text-xs">{a.url}</div>
                      <div className="text-[10px] text-muted-foreground">
                        {new Date(a.created_at).toLocaleString()}
                      </div>
                    </div>
                  </div>
                  <Badge variant={a.prediction === 'phishing' ? 'destructive' : 'default'} className={a.prediction === 'legitimate' ? 'bg-success text-success-foreground' : ''}>
                    {a.prediction === 'phishing' ? 'Phishing' : 'Safe'}
                  </Badge>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}