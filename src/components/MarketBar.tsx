import { TrendingUp, TrendingDown } from 'lucide-react';
import type { MarketIndex } from '@/lib/types';
import { fmtINR, fmtPct } from '@/lib/utils';

interface MarketBarProps {
  indices: MarketIndex[];
}

export default function MarketBar({ indices }: MarketBarProps) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
      {indices.map(idx => {
        const up = idx.change >= 0;
        return (
          <div
            key={idx.name}
            className={`metric-card p-4 border-l-4 ${up ? 'border-l-emerald-500' : 'border-l-red-500'}`}
          >
            <p className="metric-label">{idx.name}</p>
            <p className={`font-mono text-2xl font-bold ${up ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
              {fmtINR(idx.price)}
            </p>
            <p className={`flex items-center gap-1 text-sm font-semibold mt-1 ${up ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
              {up ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
              {fmtPct(idx.change)}
            </p>
          </div>
        );
      })}
    </div>
  );
}
