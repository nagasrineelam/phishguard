import { useState } from 'react';
import { motion } from 'framer-motion';
import { Search, Loader2, Flag, CheckCircle2, ShieldAlert, ShieldCheck, XCircle, Download } from 'lucide-react';
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { usePendingReports, useResolveReport } from '@/lib/queries';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import type { ReportRecord } from '@/lib/types';

type Action = 'verify_legitimate' | 'verify_phishing' | 'reject';

function exportReportsCsv(reports: ReportRecord[]) {
  const headers = ['URL', 'Original Prediction', 'Probability', 'Reason', 'Note', 'Status', 'Submitted'];
  const rows = reports.map((r) => [
    r.url,
    r.original_prediction,
    r.probability != null ? `${r.probability}%` : '',
    r.reason,
    r.note ?? '',
    r.status,
    new Date(r.created_at).toISOString(),
  ]);
  const csv = [headers, ...rows]
    .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    .join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `pending-reports-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function AdminPendingReportsPage() {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [confirm, setConfirm] = useState<{ reportId: string; action: Action } | null>(null);
  const perPage = 8;

  const { data, isLoading } = usePendingReports(page, perPage, search);
  const resolve = useResolveReport();

  const actionConfig: Record<Action, { label: string; icon: typeof CheckCircle2; variant: 'default' | 'destructive' | 'outline'; confirmText: string }> = {
    verify_legitimate: { label: 'Verify Legitimate', icon: ShieldCheck, variant: 'outline', confirmText: 'Mark this URL as legitimate and add it to the training dataset?' },
    verify_phishing: { label: 'Verify Phishing', icon: ShieldAlert, variant: 'destructive', confirmText: 'Mark this URL as phishing and add it to the training dataset?' },
    reject: { label: 'Reject', icon: XCircle, variant: 'outline', confirmText: 'Reject this report? The original prediction will remain unchanged.' },
  };

  const handleConfirm = () => {
    if (!confirm) return;
    resolve.mutate({ reportId: confirm.reportId, action: confirm.action }, {
      onSuccess: () => setConfirm(null),
    });
  };

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
        title="Pending Reports"
        description="Review user-submitted incorrect prediction reports."
        breadcrumbs={[{ label: 'Admin', to: '/admin' }, { label: 'Pending Reports' }]}
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
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-success/10 text-success">
                <CheckCircle2 className="h-6 w-6" />
              </div>
              <p className="text-sm font-medium">No pending reports</p>
              <p className="mt-1 text-xs text-muted-foreground">All reports have been reviewed.</p>
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>URL</TableHead>
                    <TableHead>Original Prediction</TableHead>
                    <TableHead>Probability</TableHead>
                    <TableHead className="hidden md:table-cell">Reason</TableHead>
                    <TableHead className="hidden lg:table-cell">Note</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.reports.map((r, i) => (
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
                      <TableCell className="hidden max-w-[200px] md:table-cell">
                        <div className="truncate text-xs">{r.reason}</div>
                      </TableCell>
                      <TableCell className="hidden max-w-[180px] lg:table-cell">
                        <div className="truncate text-xs text-muted-foreground">{r.note || '—'}</div>
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-1.5">
                          <Button size="sm" variant="outline" onClick={() => setConfirm({ reportId: r.id, action: 'verify_legitimate' })} className="h-8 text-success hover:text-success">
                            <ShieldCheck className="mr-1 h-3.5 w-3.5" /> Legit
                          </Button>
                          <Button size="sm" variant="destructive" onClick={() => setConfirm({ reportId: r.id, action: 'verify_phishing' })} className="h-8">
                            <ShieldAlert className="mr-1 h-3.5 w-3.5" /> Phish
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setConfirm({ reportId: r.id, action: 'reject' })} className="h-8">
                            <XCircle className="mr-1 h-3.5 w-3.5" /> Reject
                          </Button>
                        </div>
                      </TableCell>
                    </motion.tr>
                  ))}
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

      <AlertDialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              {confirm && (() => {
                const cfg = actionConfig[confirm.action];
                const Icon = cfg.icon;
                return <><Icon className="h-5 w-5" /> Confirm action</>;
              })()}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirm ? actionConfig[confirm.action].confirmText : ''}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirm}
              disabled={resolve.isPending}
              className={confirm?.action === 'verify_phishing' ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90' : ''}
            >
              {resolve.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}