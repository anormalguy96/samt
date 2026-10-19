import React from 'react';

export const FooterBar: React.FC = () => {
  return (
    <footer className="border-t border-cyan-primary/20 bg-navy-900/90 text-slate-400 py-4 px-4 sm:px-6 mt-12 text-xs font-mono">
      <div className="max-w-[1600px] mx-auto flex flex-col md:flex-row items-center justify-between gap-3 text-center md:text-left">
        <div className="flex flex-wrap items-center justify-center gap-3 text-[11px] text-slate-500">
        </div>
      </div>
    </footer>
  );
};
