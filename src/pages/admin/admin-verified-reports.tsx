import { useState } from 'react';
import { motion } from 'framer-motion';
import { Search, Loader2, CheckCircle2, ShieldCheck, ShieldAlert, XCircle, Download } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from '@/components/ui/table';
import { useVerifiedReports } from '@/lib/queries';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import type { ReportRecord } from '@/lib/types';

function exportReportsCsv(reports: ReportRecord[]) {
  const headers = ['URL', 'Original Prediction', 'Probability', 'Reason', 'Note', 'Status', 'Verified Label', 'Resolved By', 'Submitted', 'Resolved'];
  const rows = reports.map((r) => [
    r.url,
    r.original_prediction,
    r.probability != null ? `${r.probability}%` : '',
    r.reason,
    r.note ?? '',
    r.status,
    r.verified_label ?? '',
    r.resolved_by ?? '',
    new Date(r.created_at).toISOString(),
    r.resolved_at ? new Date(r.resolved_at).toISOString() : '',
  ]);
  const csv = [headers, ...rows]
    .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    .join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `verified-reports-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

const statusConfig: Record<string, { label: string; icon: typeof CheckCircle2; badgeClass: string }> = {
  verified_legitimate: { label: 'Verified Legitimate', icon: ShieldCheck, badgeClass: 'bg-success text-success-foreground' },
  verified_phishing: { label: 'Verified Phishing', icon: ShieldAlert, badgeClass: 'bg-destructive text-destructive-foreground' },
  rejected: { label: 'Rejected', icon: XCircle, badgeClass: 'bg-muted text-muted-foreground' },
};

export function AdminVerifiedReportsPage() {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const perPage = 8;

  const { data, isLoading } = useVerifiedReports(page, perPage, search);

  const handleExport = () => {
    if (!data || data.reports.length === 0) {
      toast.error('No reports to export.');
      return;
    }
    exportReportsCsv(data.reports);
    toast.success(`Exported ${data.reports.length} reports to CSV.`);
  };

  const totalPages = Math.max(1, Math.ceil((data?.total ?? 0) / perPage));

  return (
    <div>
      <PageHeader
        title="Verified Reports"
        description="Review reports that have been resolved by admins."
        breadcrumbs={[{ label: 'Admin', to: '/admin' }, { label: 'Verified Reports' }]}
        actions={
          <Button variant="outline" size="sm" onClick={handleExport} disabled={!data || data.reports.length === 0}>
            <Download className="mr-2 h-4 w-4" />
            Export CSV
          </Button>
        }
      />

      <Card className="glass mb-6">
        <CardContent className="pt-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by URL or reason..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className="pl-9"
            />
          </div>
        </CardContent>
      </Card>

      <Card className="glass">
        <CardContent className="pt-6">
          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : !data || data.reports.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-muted text-muted-foreground">
                <CheckCircle2 className="h-6 w-6" />
              </div>
              <p className="text-sm font-medium">No verified reports</p>
              <p className="mt-1 text-xs text-muted-foreground">Resolved reports will appear here.</p>
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>URL</TableHead>
                    <TableHead>Original Prediction</TableHead>
                    <TableHead>Probability</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="hidden md:table-cell">Reason</TableHead>
                    <TableHead className="hidden lg:table-cell">Resolved</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.reports.map((r, i) => {
                    const cfg = statusConfig[r.status] ?? statusConfig.rejected;
                    const StatusIcon = cfg.icon;
                    return (
                      <motion.tr
                        key={r.id}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: i * 0.03 }}
                      >
                        <TableCell className="max-w-[200px]">
                          <div className="truncate font-mono text-xs">{r.url}</div>
                          <div className="text-[10px] text-muted-foreground">
                            {new Date(r.created_at).toLocaleString()}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={r.original_prediction === 'phishing' ? 'destructive' : 'default'} className={r.original_prediction === 'legitimate' ? 'bg-success text-success-foreground' : ''}>
                            {r.original_prediction}
                          </Badge>
                        </TableCell>
                        <TableCell className="tabular-nums">{r.probability != null ? `${r.probability}%` : '—'}</TableCell>
                        <TableCell>
                          <Badge className={cfg.badgeClass}>
                            <StatusIcon className="mr-1 h-3 w-3" />
                            {cfg.label}
                          </Badge>
                        </TableCell>
                        <TableCell className="hidden max-w-[200px] md:table-cell">
                          <div className="truncate text-xs">{r.reason}</div>
                        </TableCell>
                        <TableCell className="hidden lg:table-cell">
                          <div className="text-xs text-muted-foreground">
                            {r.resolved_at ? new Date(r.resolved_at).toLocaleString() : '—'}
                          </div>
                        </TableCell>
                      </motion.tr>
                    );
                  })}
                </TableBody>
              </Table>

              {totalPages > 1 && (
                <div className="mt-4 flex items-center justify-center gap-2">
                  <Button variant="outline" size="icon" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="text-sm text-muted-foreground">Page {page} of {totalPages}</span>
                  <Button variant="outline" size="icon" disabled={page === totalPages} onClick={() => setPage((p) => p + 1)}>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}