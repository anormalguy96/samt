import React from 'react';
import { cn } from '../../utils/cn';
import type { StatusSeverity } from '../../types';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: StatusSeverity;
  showDot?: boolean;
}

export const Badge: React.FC<BadgeProps> = ({
  children,
  className,
  variant = 'info',
  showDot = false,
  ...props
}) => {
  const variantStyles: Record<StatusSeverity, string> = {
    nominal: 'bg-emerald-brand/15 text-emerald-brand border-emerald-brand/30',
    warning: 'bg-amber-warning/15 text-amber-warning border-amber-warning/30',
    critical: 'bg-rose-critical/15 text-rose-critical border-rose-critical/30',
    info: 'bg-cyan-primary/15 text-cyan-primary border-cyan-primary/30',
    neutral: 'bg-slate-700/30 text-slate-300 border-slate-600/30',
  };

  const dotColors: Record<StatusSeverity, string> = {
    nominal: 'bg-emerald-brand shadow-glow-emerald',
    warning: 'bg-amber-warning',
    critical: 'bg-rose-critical animate-pulse',
    info: 'bg-cyan-primary shadow-glow',
    neutral: 'bg-slate-400',
  };

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-mono font-medium border select-none',
        variantStyles[variant],
        className
      )}
      {...props}
    >
      {showDot && <span className={cn('h-1.5 w-1.5 rounded-full', dotColors[variant])} />}
      {children}
    </span>
  );
};
