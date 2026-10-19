import React from 'react';
import { Badge } from '../atoms/Badge';
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
            <svg viewBox="105 48 145 204" className="w-full h-full" fill="none">
              <path
                d="M 181.60 56.72 C 178.81 56.13, 181.01 50.85, 171.92 57.60 C 162.83 64.35, 136.43 88.55, 127.04 97.20 C 117.65 105.85, 118.68 104.97, 115.60 109.52 C 112.52 114.07, 109.73 120.37, 108.56 124.48 C 107.39 128.59, 107.53 130.64, 108.56 134.16 C 109.59 137.68, 107.68 138.85, 114.72 145.60 C 121.76 152.35, 141.12 174.35, 150.80 174.64 C 160.48 174.93, 169.57 152.49, 172.80 147.36 C 176.03 142.23, 170.31 144.87, 170.16 143.84 C 170.01 142.81, 171.19 140.91, 171.92 141.20 C 172.65 141.49, 171.63 148.83, 174.56 145.60 C 177.49 142.37, 186.88 126.97, 189.52 121.84 C 192.16 116.71, 189.67 115.97, 190.40 114.80 C 191.13 113.63, 190.55 119.05, 193.92 114.80 C 197.29 110.55, 206.83 92.95, 210.64 89.28 C 214.45 85.61, 218.27 88.11, 216.80 92.80 C 215.33 97.49, 202.43 113.77, 201.84 117.44 C 201.25 121.11, 208.88 118.03, 213.28 114.80 C 217.68 111.57, 225.75 102.33, 228.24 98.08 C 230.73 93.83, 228.97 91.33, 228.24 89.28 C 227.51 87.23, 230.73 86.20, 223.84 85.76 C 216.95 85.32, 193.33 86.93, 186.88 86.64 C 180.43 86.35, 184.24 86.05, 185.12 84.00 C 186.00 81.95, 190.99 76.96, 192.16 74.32 C 193.33 71.68, 192.75 70.36, 192.16 68.16 C 191.57 65.96, 190.40 63.03, 188.64 61.12 C 186.88 59.21, 184.39 57.31, 181.60 56.72 Z"
                fill="#0093D0"
              />
              <path
                d="M 198.32 122.72 C 190.11 123.75, 182.04 145.89, 179.84 151.76 C 177.64 157.63, 183.80 155.13, 185.12 157.92 C 186.44 160.71, 187.76 165.25, 187.76 168.48 C 187.76 171.71, 187.76 174.35, 185.12 177.28 C 182.48 180.21, 176.91 184.76, 171.92 186.08 C 166.93 187.40, 161.65 180.95, 155.20 185.20 C 148.75 189.45, 137.60 207.93, 133.20 211.60 C 128.80 215.27, 126.75 211.75, 128.80 207.20 C 130.85 202.65, 143.17 188.28, 145.52 184.32 C 147.87 180.36, 146.55 179.92, 142.88 183.44 C 139.21 186.96, 126.75 200.60, 123.52 205.44 C 120.29 210.28, 122.79 210.72, 123.52 212.48 C 124.25 214.24, 120.88 215.27, 127.92 216.00 C 134.96 216.73, 160.48 215.56, 165.76 216.88 C 171.04 218.20, 160.77 221.43, 159.60 223.92 C 158.43 226.41, 158.28 229.20, 158.72 231.84 C 159.16 234.48, 160.63 237.56, 162.24 239.76 C 163.85 241.96, 165.76 244.16, 168.40 245.04 C 171.04 245.92, 175.29 245.77, 178.08 245.04 C 180.87 244.31, 174.71 250.91, 185.12 240.64 C 195.53 230.37, 231.03 195.47, 240.56 183.44 C 250.09 171.41, 242.91 173.32, 242.32 168.48 C 241.73 163.64, 239.24 158.21, 237.04 154.40 C 234.84 150.59, 235.57 150.88, 229.12 145.60 C 222.67 140.32, 206.53 121.69, 198.32 122.72 Z"
                fill="#00E5FF"
              />
            </svg>
          </div>
          <div>
            <div className="flex items-center gap-2 mt-0.5">
              <h1 className="text-lg font-bold font-sans tracking-tight text-slate-100">
                SAMT
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
