import React from 'react';
import { cn } from '../../utils/cn';

export interface ToggleProps {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  description?: string;
  className?: string;
}

export const Toggle: React.FC<ToggleProps> = ({
  label,
  checked,
  onChange,
  disabled = false,
  description,
  className,
}) => {
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      onChange(!checked);
    }
  };

  return (
    <div className={cn('flex items-center justify-between gap-3 select-none', className)}>
      <div className="flex flex-col">
        <span className="text-xs font-medium text-slate-200">{label}</span>
        {description && <span className="text-[11px] text-slate-400">{description}</span>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        onKeyDown={handleKeyDown}
        className={cn(
          'relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-primary/50 disabled:opacity-50 disabled:cursor-not-allowed',
          checked ? 'bg-cyan-primary' : 'bg-navy-900 border border-slate-700'
        )}
      >
        <span
          className={cn(
            'pointer-events-none inline-block h-4 w-4 transform rounded-full bg-navy-950 shadow ring-0 transition duration-200 ease-in-out',
            checked ? 'translate-x-4 bg-navy-950' : 'translate-x-0 bg-slate-400'
          )}
        />
      </button>
    </div>
  );
};
