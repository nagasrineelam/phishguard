import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2, Flag } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useReport } from '@/lib/queries';
import { reportSchema, type ReportValues } from '@/lib/validations';
import { toast } from 'sonner';

interface ReportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  analysisId?: string;
  url: string;
  originalPrediction: string;
  probability?: number;
}

const REASONS = [
  'False positive — site is legitimate',
  'False negative — site is phishing',
  'Incorrect risk score',
  'Incorrect website title',
  'Other',
];

export function ReportDialog({
  open,
  onOpenChange,
  analysisId,
  url,
  originalPrediction,
  probability,
}: ReportDialogProps) {
  const report = useReport();
  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm<ReportValues>({
    resolver: zodResolver(reportSchema),
    defaultValues: { reason: '', note: '' },
  });

  const reasonValue = watch('reason');

  useEffect(() => {
    if (!open) {
      reset({ reason: '', note: '' });
    }
  }, [open, reset]);

  const onSubmit = async (values: ReportValues) => {
    try {
      await report.mutateAsync({
        analysis_id: analysisId,
        url,
        original_prediction: originalPrediction,
        probability,
        reason: values.reason,
        note: values.note,
      });
      toast.success('Thank you. Your report has been submitted for verification.');
      reset();
      onOpenChange(false);
    } catch {
      // handled by interceptor
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Flag className="h-5 w-5 text-destructive" />
            Report Incorrect Prediction
          </DialogTitle>
          <DialogDescription>
            Help improve PhishGuard. Tell us what's wrong with this analysis for{' '}
            <span className="font-mono text-foreground">{url}</span>.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label>Reason</Label>
            <Select
              value={reasonValue}
              onValueChange={(v) => setValue('reason', v, { shouldValidate: true })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select a reason" />
              </SelectTrigger>
              <SelectContent>
                {REASONS.map((r) => (
                  <SelectItem key={r} value={r}>{r}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.reason && <p className="text-xs text-destructive">{errors.reason.message}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="note">Additional note (optional)</Label>
            <Textarea
              id="note"
              placeholder="Add any context that helps us verify..."
              className="min-h-[80px]"
              {...register('note')}
            />
            {errors.note && <p className="text-xs text-destructive">{errors.note.message}</p>}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={report.isPending || !reasonValue}>
              {report.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Flag className="mr-2 h-4 w-4" />}
              Submit Report
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}