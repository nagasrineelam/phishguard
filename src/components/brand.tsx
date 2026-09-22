import { ShieldCheck } from 'lucide-react';
import { cn } from '@/lib/utils';

export function Brand({ className, showText = true }: { className?: string; showText?: boolean }) {
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <div className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-accent text-primary-foreground shadow-lg shadow-primary/20">
        <ShieldCheck className="h-5 w-5" />
        <span className="absolute inset-0 rounded-xl ring-1 ring-inset ring-white/20" />
      </div>
      {showText && (
        <div className="leading-tight">
          <div className="text-sm font-bold tracking-tight">PhishGuard</div>
          <div className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">AI Detection</div>
        </div>
      )}
    </div>
  );
}
