import type { Rating } from '@/lib/types';
import { cn } from '@/lib/utils';

interface RatingBadgeProps {
  rating: Rating;
  className?: string;
}

export default function RatingBadge({ rating, className }: RatingBadgeProps) {
  const base = 'inline-flex items-center gap-1 text-xs font-bold px-2.5 py-0.5 rounded-full whitespace-nowrap';
  const styles: Record<Rating, string> = {
    '👑 TIER 1: MONOPOLY':                    'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300',
    '🟢 TIER 2: QUALITY':                     'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300',
    '⚠️ TIER 2: PROVISIONAL (Missing Data)':  'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
    '🟡 TIER 3: EMERGING':                    'bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-300',
    '🔵 TIER 4: MOMENTUM':                    'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
    '🔴 TIER 5: CHOPPY':                      'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
    '🔴 TIER 5: WEAK':                        'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-400',
  };
  return <span className={cn(base, styles[rating], className)}>{rating}</span>;
}
