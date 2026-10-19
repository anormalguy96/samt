import React from 'react';
import { cn } from '../../utils/cn';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
}

export const Input: React.FC<InputProps> = ({
  label,
  error,
  helperText,
  className,
  id,
  disabled,
  ...props
}) => {
  const inputId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);

  return (
    <div className="flex flex-col gap-1 w-full">
      {label && (
        <label htmlFor={inputId} className="text-xs font-mono text-slate-300">
          {label}
        </label>
      )}
      <input
        id={inputId}
        disabled={disabled}
        className={cn(
          'w-full bg-navy-900 border rounded-lg px-3 py-2 text-sm text-slate-100 placeholder-slate-500 font-mono transition-all duration-150 focus:outline-none focus-visible:ring-2 disabled:opacity-50 disabled:cursor-not-allowed',
          error
            ? 'border-rose-critical focus-visible:ring-rose-critical/50'
            : 'border-slate-700 hover:border-slate-600 focus-visible:ring-cyan-primary/50 focus:border-cyan-primary',
          className
        )}
        aria-invalid={!!error}
        aria-describedby={error ? `${inputId}-error` : undefined}
        {...props}
      />
      {error && (
        <span id={`${inputId}-error`} className="text-[11px] text-rose-critical font-mono" role="alert">
          {error}
        </span>
      )}
      {!error && helperText && (
        <span className="text-[11px] text-slate-400 font-mono">{helperText}</span>
      )}
    </div>
  );
};
