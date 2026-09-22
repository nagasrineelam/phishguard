import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import {
  Flag,
  CheckCircle2,
  Database,
  Cpu,
  Target,
  Activity,
  Clock,
  ScanSearch,
  ArrowRight,
  Loader2,
} from 'lucide-react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useAdminStats, useHealth } from '@/lib/queries';

export function AdminDashboardPage() {
  const { data: stats, isLoading } = useAdminStats();
  const { data: health } = useHealth();

  const cards = [
    { label: 'Pending Reports', value: stats?.pendingReports, icon: Flag, color: 'text-warning', bg: 'bg-warning/10' },
    { label: 'Verified Reports', value: stats?.verifiedReports, icon: CheckCircle2, color: 'text-success', bg: 'bg-success/10' },
    { label: 'Dataset Size', value: stats?.datasetSize?.toLocaleString(), icon: Database, color: 'text-primary', bg: 'bg-primary/10' },
    { label: 'Prediction Count', value: stats?.predictionCount?.toLocaleString(), icon: ScanSearch, color: 'text-primary', bg: 'bg-primary/10' },
  ];

  const trendData = (stats?.trend ?? []).map((d) => ({
    date: d.date.slice(5),
    legitimate: d.legitimate,
    phishing: d.phishing,
  }));

  return (
    <div>
      <PageHeader
        title="Admin Dashboard"
        description="System overview and report moderation."
        breadcrumbs={[{ label: 'Admin', to: '/admin' }, { label: 'Dashboard' }]}
      />

      {/* Stat cards */}
      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((c, i) => (
          <motion.div key={c.label} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
            <Card className="glass">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div className="min-w-0">
                    <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{c.label}</div>
                    <div className="mt-2 truncate text-2xl font-bold capitalize tabular-nums">
                      {isLoading ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /> : c.value ?? '—'}
                    </div>
                  </div>
                  <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${c.bg} ${c.color}`}>
                    <c.icon className="h-5 w-5" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Charts */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="glass">
          <CardHeader>
            <CardTitle className="text-base">Prediction Trends</CardTitle>
            <CardDescription>Last 14 days</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trendData}>
                  <defs>
                    <linearGradient id="legitGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--chart-1))" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="hsl(var(--chart-1))" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="phishGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--chart-5))" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="hsl(var(--chart-5))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                  <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '0.5rem', fontSize: '0.75rem' }} />
                  <Legend formatter={(v) => <span className="text-xs text-muted-foreground capitalize">{v}</span>} />
                  <Area type="monotone" dataKey="legitimate" stroke="hsl(var(--chart-1))" fill="url(#legitGrad)" strokeWidth={2} />
                  <Area type="monotone" dataKey="phishing" stroke="hsl(var(--chart-5))" fill="url(#phishGrad)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="glass">
          <CardHeader>
            <CardTitle className="text-base">Quick Actions</CardTitle>
            <CardDescription>Admin operations</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <Link to="/admin/reports" className="flex items-center justify-between rounded-lg border border-border/60 bg-background/40 p-3 transition-colors hover:bg-muted/40">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Flag className="h-4 w-4" />
                </div>
                <span className="text-sm font-medium">Review pending reports</span>
              </div>
              <div className="flex items-center gap-2">
                {stats?.pendingReports != null && stats.pendingReports > 0 && (
                  <Badge variant="default" className="bg-warning text-warning-foreground">{stats.pendingReports}</Badge>
                )}
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
              </div>
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}