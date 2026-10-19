import React from 'react';
import { Badge } from '../atoms/Badge';

export interface DbcControlRowProps {
  label: string;
  contractRule: string;
  status: 'valid' | 'invalid' | 'warning';
  statusText: string;
  children: React.ReactNode;
}

export const DbcControlRow: React.FC<DbcControlRowProps> = ({
  label,
  contractRule,
  status,
  statusText,
  children,
}) => {
  const variantMap = {
    valid: 'nominal',
    invalid: 'critical',
    warning: 'warning',
  } as const;

  return (
    <div className="flex flex-col gap-2 p-3 rounded-lg bg-navy-900/70 border border-slate-800">
      <div className="flex items-center justify-between">
        <div className="flex flex-col">
          <span className="text-xs font-semibold text-slate-200">{label}</span>
          <span className="text-[11px] font-mono text-cyan-primary/80">{contractRule}</span>
        </div>
        <Badge variant={variantMap[status]} showDot>
          {statusText}
        </Badge>
      </div>
      <div className="mt-1">{children}</div>
    </div>
  );
};
