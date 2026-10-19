import React from 'react';
import { LanguageToggle } from '../molecules/LanguageToggle';
import type { Language } from '../../types';

export interface HeaderBarProps {
  currentLang: Language;
  onToggleLang: (lang: Language) => void;
  packetRate: number;
  cloudZone: string;
}

export const HeaderBar: React.FC<HeaderBarProps> = ({
  currentLang,
  onToggleLang,
  packetRate,
  cloudZone,
}) => {
  return (
    <header className="border-b border-cyan-primary/20 bg-navy-900/90 backdrop-blur-md sticky top-0 z-40 px-4 py-3 sm:px-6">
      <div className="max-w-[1600px] mx-auto flex flex-col md:flex-row md:items-center justify-between gap-3">
        {/* Brand & Sovereign Emblem */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-primary/20 to-navy-950 border border-cyan-primary/40 flex items-center justify-center shadow-glow flex-shrink-0 p-1.5">
            <svg viewBox="20 34 166 224" className="w-full h-full" fill="none">
              <defs>
                <linearGradient id="headerUpper" x1="146" y1="58" x2="53" y2="166" gradientUnits="userSpaceOnUse">
                  <stop offset="0" stopColor="#A1E8D9" />
                  <stop offset="0.40" stopColor="#9AC8DD" />
                  <stop offset="0.73" stopColor="#737FD1" />
                  <stop offset="1" stopColor="#5D5FC4" />
                </linearGradient>
                <linearGradient id="headerLower" x1="142" y1="121" x2="85" y2="253" gradientUnits="userSpaceOnUse">
                  <stop offset="0" stopColor="#4AB8D4" />
                  <stop offset="0.39" stopColor="#43A9D0" />
                  <stop offset="0.72" stopColor="#73A3D1" />
                  <stop offset="1" stopColor="#5B77C5" />
                </linearGradient>
                <linearGradient id="headerMint" x1="56" y1="191" x2="101" y2="220" gradientUnits="userSpaceOnUse">
                  <stop offset="0" stopColor="#AFE8D3" />
                  <stop offset="1" stopColor="#91DDDC" />
                </linearGradient>
              </defs>
              {/* Mint accent */}
              <path
                fill="url(#headerMint)"
                d="M45 206 C51 196 60 187 70 184 C80 180 91 184 102 189 L122 185 C126 186 129 190 127 196 L110 215 C105 219 100 219 94 219 L52 218 C44 217 42 213 45 206 Z"
              />
              {/* Upper symbol */}
              <path
                fill="url(#headerUpper)"
                d="M97.4 43.7 C103.7 37 111.6 37.5 117.1 42.6 C122.4 47.5 122.3 55.9 117.3 62.6 L110 72.5 L150.2 71.8 C165.3 71.5 168.6 80.3 159.8 91.2 L146.8 106.7 C138.5 115.6 129.8 115.9 119 108.1 L107.8 102.9 C100.5 98.8 93.7 101.3 90.1 107.5 C84.5 117 91.5 129.4 97 139 L104 149 C114.3 161.4 114.5 168.7 108.5 176.2 C100.7 184.1 91.6 182.6 82.2 176 L40 145.9 C24.7 134.4 24.3 119.5 34 107.2 C50.2 86.6 76.4 63 97.4 43.7 Z"
              />
              {/* Lower symbol */}
              <path
                fill="url(#headerLower)"
                d="M101 106.4 C116.4 102.4 129.3 114.9 144 127.2 L161.8 141.8 C176.7 154 183.4 165.3 179.1 177.8 C177.9 186.8 172.9 192.5 164.8 199.8 L110.4 248 C102.3 255.6 94 255.9 87.9 249 C81 241.4 83.1 232.7 90.1 224.8 L107 206.6 C118.7 194.1 122.8 187 116.8 173.4 C122.1 162.9 108.1 149.6 98 139.7 C92.4 131.9 88.6 117.8 93.6 110.9 C95.6 108.2 98.2 107.2 101 106.4 Z"
              />
            </svg>
          </div>
          <div>
            <div className="flex items-center gap-2 mt-0.5">
              <h1 className="text-lg font-bold font-sans tracking-tight text-slate-100">
                SƏMT
              </h1>
            </div>
          </div>
        </div>

        {/* Live Sovereignty Status Ribbon */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-4">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-navy-950/80 border border-slate-800 text-xs font-mono">
            <span className="text-slate-400">Giriş Axını:</span>
            <span className="text-cyan-primary font-bold">{packetRate.toLocaleString('az-AZ')}</span>
            <span className="text-slate-500 text-[10px]">paket/san</span>
          </div>

          <div className="hidden lg:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-navy-950/80 border border-slate-800 text-xs font-mono">
            <span className="w-2 h-2 rounded-full bg-emerald-brand shadow-glow-emerald" />
            <span className="text-slate-300">{cloudZone}</span>
          </div>

          <LanguageToggle currentLang={currentLang} onToggle={onToggleLang} />
        </div>
      </div>
    </header>
  );
};
