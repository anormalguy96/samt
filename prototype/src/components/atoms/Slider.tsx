import React from 'react';
import { cn } from '../../utils/cn';

export interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  onChange: (val: number) => void;
  className?: string;
  disabled?: boolean;
}

export const Slider: React.FC<SliderProps> = ({
  label,
  value,
  min,
  max,
  step = 1,
  unit = '',
  onChange,
  className,
  disabled = false,
}) => {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <div className="flex items-center justify-between text-xs font-mono">
        <span className="text-slate-300">{label}</span>
        <span className="text-cyan-primary font-bold">
          {value} {unit}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full h-1.5 bg-navy-900 rounded-lg appearance-none cursor-pointer accent-cyan-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-primary/50 disabled:opacity-50 disabled:cursor-not-allowed"
        aria-label={label}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
      />
    </div>
  );
};
