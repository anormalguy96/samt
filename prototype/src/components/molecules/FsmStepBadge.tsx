import React from 'react';
import { cn } from '../../utils/cn';

export interface FsmStepBadgeProps {
  stepNumber: number;
  label: string;
  subLabel: string;
  status: 'active' | 'completed' | 'upcoming';
}

export const FsmStepBadge: React.FC<FsmStepBadgeProps> = ({
  stepNumber,
  label,
  subLabel,
  status,
}) => {
  return (
    <div
      className={cn(
        'flex items-center gap-3 p-3 rounded-xl border transition-all duration-200 flex-1 min-w-[140px]',
        status === 'active' && 'bg-cyan-primary/10 border-cyan-primary shadow-glow',
        status === 'completed' && 'bg-emerald-brand/10 border-emerald-brand/40 text-emerald-brand',
        status === 'upcoming' && 'bg-navy-900/50 border-slate-800 text-slate-500 opacity-60'
      )}
    >
      <div
        className={cn(
          'w-7 h-7 rounded-full flex items-center justify-center text-xs font-mono font-bold border',
          status === 'active' && 'bg-cyan-primary text-navy-950 border-cyan-primary shadow-glow',
          status === 'completed' && 'bg-emerald-brand text-navy-950 border-emerald-brand',
          status === 'upcoming' && 'bg-navy-950 text-slate-500 border-slate-700'
        )}
      >
        {status === 'completed' ? '✓' : stepNumber}
      </div>

      <div className="flex flex-col">
        <span
          className={cn(
            'text-xs font-bold uppercase tracking-wider font-mono',
            status === 'active' && 'text-cyan-primary',
            status === 'completed' && 'text-emerald-brand',
            status === 'upcoming' && 'text-slate-400'
          )}
        >
          {label}
        </span>
        <span className="text-[10px] text-slate-400 truncate">{subLabel}</span>
      </div>
    </div>
  );
};
