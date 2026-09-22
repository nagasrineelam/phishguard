import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

interface RiskGaugeProps {
  value: number; // 0-100
  label?: string;
  size?: number;
}

export function RiskGauge({ value, label, size = 180 }: RiskGaugeProps) {
  const v = Math.max(0, Math.min(100, value));
  const radius = (size - 24) / 2;
  const circumference = Math.PI * radius; // semicircle
  const offset = circumference - (v / 100) * circumference;
  const color = v >= 70 ? 'hsl(var(--destructive))' : v >= 40 ? 'hsl(var(--warning))' : 'hsl(var(--success))';

  return (
    <div className="flex flex-col items-center">
      <div className="relative" style={{ width: size, height: size / 2 + 20 }}>
        <svg width={size} height={size / 2 + 20} className="overflow-visible">
          <path
            d={`M 12 ${size / 2} A ${radius} ${radius} 0 0 1 ${size - 12} ${size / 2}`}
            fill="none"
            stroke="hsl(var(--muted))"
            strokeWidth="12"
            strokeLinecap="round"
          />
          <motion.path
            d={`M 12 ${size / 2} A ${radius} ${radius} 0 0 1 ${size - 12} ${size / 2}`}
            fill="none"
            stroke={color}
            strokeWidth="12"
            strokeLinecap="round"
            strokeDasharray={circumference}
            initial={{ strokeDashoffset: circumference }}
            animate={{ strokeDashoffset: offset }}
            transition={{ duration: 1, ease: 'easeOut' }}
          />
        </svg>
        <div className="absolute inset-x-0 bottom-0 flex flex-col items-center">
          <span className="text-3xl font-bold" style={{ color }}>
            {Math.round(v)}%
          </span>
          {label && <span className="text-xs text-muted-foreground">{label}</span>}
        </div>
      </div>
    </div>
  );
}

interface ProbabilityBarProps {
  label: string;
  value: number; // 0-100
  color: 'primary' | 'destructive';
}

export function ProbabilityBar({ label, value, color }: ProbabilityBarProps) {
  const v = Math.max(0, Math.min(100, value));
  const barColor = color === 'primary' ? 'bg-primary' : 'bg-destructive';
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between text-sm">
        <span className="font-medium">{label}</span>
        <span className="font-semibold tabular-nums">{v.toFixed(1)}%</span>
      </div>
      <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
        <motion.div
          className={cn('h-full rounded-full', barColor)}
          initial={{ width: 0 }}
          animate={{ width: `${v}%` }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
        />
      </div>
    </div>
  );
}
