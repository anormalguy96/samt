import React from 'react';
import type { Language } from '../../types';
import { cn } from '../../utils/cn';

export interface LanguageToggleProps {
  currentLang: Language;
  onToggle: (lang: Language) => void;
}

export const LanguageToggle: React.FC<LanguageToggleProps> = ({ currentLang, onToggle }) => {
  return (
    <div className="inline-flex items-center p-0.5 rounded-lg bg-navy-900 border border-slate-700/60 font-mono text-xs select-none">
      <button
        onClick={() => onToggle('az')}
        className={cn(
          'px-2.5 py-1 rounded-md transition-all font-semibold',
          currentLang === 'az'
            ? 'bg-cyan-primary text-navy-950 shadow-glow'
            : 'text-slate-400 hover:text-slate-200'
        )}
      >
        AZE
      </button>
      <button
        onClick={() => onToggle('en')}
        className={cn(
          'px-2.5 py-1 rounded-md transition-all font-semibold',
          currentLang === 'en'
            ? 'bg-cyan-primary text-navy-950 shadow-glow'
            : 'text-slate-400 hover:text-slate-200'
        )}
      >
        ENG
      </button>
    </div>
  );
};
