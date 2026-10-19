import React from 'react';
import { cn } from '../../utils/cn';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  glow?: boolean;
  hoverable?: boolean;
  borderVariant?: 'default' | 'cyan' | 'critical' | 'emerald';
}

export const Card: React.FC<CardProps> = ({
  children,
  className,
  glow = false,
  hoverable = false,
  borderVariant = 'default',
  ...props
}) => {
  const borderStyles = {
    default: 'border-cyan-primary/15',
    cyan: 'border-cyan-primary/40',
    critical: 'border-rose-critical/40',
    emerald: 'border-emerald-brand/40',
  };

  return (
    <div
      className={cn(
        'bg-navy-800/80 backdrop-blur-md border rounded-xl p-4 transition-all duration-200',
        borderStyles[borderVariant],
        glow && 'shadow-glow',
        hoverable && 'hover:border-cyan-primary/50 hover:bg-navy-800/95 hover:shadow-glow cursor-pointer',
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
};
