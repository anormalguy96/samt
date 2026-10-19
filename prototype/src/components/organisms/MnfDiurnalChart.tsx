import React, { useRef, useEffect } from 'react';
import { Card } from '../atoms/Card';
import { Badge } from '../atoms/Badge';
import { Button } from '../atoms/Button';
import { Icon } from '../atoms/Icon';
import type { HourlyFlowPoint } from '../../hooks/useMnfAnalysis';

export interface MnfDiurnalChartProps {
  hourlyData: HourlyFlowPoint[];
  mnfStats: {
    mnfTotal: number;
    legitimateDomestic: number;
    tankRefillChattering: number;
    netPhysicalLoss: number;
    nrwNightSharePct: number;
  };
  hasBurstAnomaly: boolean;
  onToggleBurstAnomaly: (val: boolean) => void;
}

export const MnfDiurnalChart: React.FC<MnfDiurnalChartProps> = ({
  hourlyData,
  mnfStats,
  hasBurstAnomaly,
  onToggleBurstAnomaly,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const padL = 50;
    const padR = 20;
    const padT = 30;
    const padB = 40;
    const w = canvas.width - padL - padR;
    const h = canvas.height - padT - padB;
    const maxVal = 500;

    // Background nocturnal shading (02:00 - 04:00)
    const nightX1 = padL + (2 / 23) * w;
    const nightX2 = padL + (4 / 23) * w;
    ctx.fillStyle = 'rgba(0, 229, 255, 0.08)';
    ctx.fillRect(nightX1, padT, nightX2 - nightX1, h);

    // Nocturnal text label
    ctx.fillStyle = '#00e5ff';
    ctx.font = '10px JetBrains Mono, monospace';
    ctx.textAlign = 'center';
    ctx.fillText('02:00–04:00 MNF pəncərəsi', (nightX1 + nightX2) / 2, padT - 10);

    // Grid lines
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.07)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 5; i++) {
      const y = padT + (h / 5) * i;
      ctx.beginPath();
      ctx.moveTo(padL, y);
      ctx.lineTo(canvas.width - padR, y);
      ctx.stroke();

      ctx.fillStyle = '#64748b';
      ctx.font = '10px JetBrains Mono, monospace';
      ctx.textAlign = 'right';
      ctx.fillText(String(Math.round(maxVal - (maxVal / 5) * i)), padL - 8, y + 3);
    }

    // X-axis hour labels
    for (let hour = 0; hour < 24; hour += 2) {
      const x = padL + (hour / 23) * w;
      ctx.fillStyle = '#64748b';
      ctx.font = '10px JetBrains Mono, monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`${String(hour).padStart(2, '0')}:00`, x, canvas.height - 15);
    }

    // Draw stacked or layered curves
    const drawCurve = (
      points: number[],
      strokeColor: string,
      fillColor?: string,
      lineWidth = 2
    ) => {
      ctx.beginPath();
      points.forEach((val, i) => {
        const x = padL + (i / 23) * w;
        const y = padT + h - (val / maxVal) * h;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });

      if (fillColor) {
        ctx.lineTo(padL + w, padT + h);
        ctx.lineTo(padL, padT + h);
        ctx.closePath();
        ctx.fillStyle = fillColor;
        ctx.fill();
      }

      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = lineWidth;
      ctx.stroke();
    };

    // 1. Total Inflow Curve
    const totalPoints = hourlyData.map((d) => d.totalFlow);
    drawCurve(totalPoints, '#00e5ff', 'rgba(0, 229, 255, 0.12)', 2.5);

    // 2. Legitimate Usage
    const legitPoints = hourlyData.map((d) => d.legitimateUsage);
    drawCurve(legitPoints, '#00e676', undefined, 1.5);

    // 3. Tank Refill Chattering
    const tankPoints = hourlyData.map((d) => d.legitimateUsage + d.tankRefill);
    drawCurve(tankPoints, '#ffab00', undefined, 1.5);

    // Data points on Total Curve
    totalPoints.forEach((val, i) => {
      const x = padL + (i / 23) * w;
      const y = padT + h - (val / maxVal) * h;
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fillStyle = '#070a11';
      ctx.fill();
      ctx.strokeStyle = '#00e5ff';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    });
  }, [hourlyData]);

  return (
    <div className="space-y-5">
      <Card className="p-0 overflow-hidden">
        <div className="flex flex-wrap items-center justify-between p-4 border-b border-cyan-primary/20 bg-navy-850/50 gap-3">
          <div>
            <h3 className="text-sm font-bold font-mono text-slate-100 flex items-center gap-2">
              <Icon name="chart" size={16} className="text-cyan-primary" />
              24 saatlıq hidravlik diurnal axın profili və MNF analizi
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Gecə saatlarında binaların dam çənlərinin dolması və fiziki sızmanın ayrılması
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Button
              size="sm"
              variant={hasBurstAnomaly ? 'danger' : 'outline'}
              onClick={() => onToggleBurstAnomaly(!hasBurstAnomaly)}
              leftIcon={<Icon name="zap" size={13} />}
            >
              {hasBurstAnomaly ? 'Süni qəza pikini söndür' : 'Süni qəza piki əlavə et'}
            </Button>
          </div>
        </div>

        <div className="p-4 bg-navy-950 flex flex-col items-center">
          <div className="w-full aspect-[2/1] max-h-[380px]">
            <canvas
              ref={canvasRef}
              width={860}
              height={360}
              className="w-full h-full object-contain"
            />
          </div>

          {/* Legend */}
          <div className="flex flex-wrap items-center justify-center gap-5 mt-4 pt-3 border-t border-slate-800 text-xs font-mono">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-cyan-primary shadow-glow" />
              <span className="text-slate-300">Ümumi giriş axını (m³/saat)</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-emerald-brand shadow-glow-emerald" />
              <span className="text-slate-300">Qanuni abonent istehlakı</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-amber-warning" />
              <span className="text-slate-300">Dam çənlərinin dolması (üzgəc klapan)</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded bg-cyan-primary/20 border border-cyan-primary" />
              <span className="text-slate-300">02:00–04:00 gecə pəncərəsi (MNF)</span>
            </div>
          </div>
        </div>
      </Card>

      {/* MNF Decomposition Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <span className="text-[11px] font-mono text-slate-400 block">
            03:00 orta axını (MNF)
          </span>
          <span className="text-xl font-bold font-mono text-cyan-primary mt-1 block">
            {mnfStats.mnfTotal} m³/h
          </span>
          <span className="text-[10px] text-slate-500 font-mono">Bütün komponentlər daxil</span>
        </Card>

        <Card>
          <span className="text-[11px] font-mono text-slate-400 block">
            Dam çənlərinin dolması
          </span>
          <span className="text-xl font-bold font-mono text-amber-warning mt-1 block">
            {mnfStats.tankRefillChattering} m³/h
          </span>
          <span className="text-[10px] text-slate-500 font-mono">Klapan səs-küyü çıxıldı</span>
        </Card>

        <Card borderVariant="critical">
          <span className="text-[11px] font-mono text-rose-critical block">
            Xalis fiziki itki (sızma)
          </span>
          <span className="text-xl font-bold font-mono text-rose-critical mt-1 block">
            {mnfStats.netPhysicalLoss} m³/h
          </span>
          <span className="text-[10px] text-slate-500 font-mono">Təcili təmir tələb edir</span>
        </Card>

        <Card>
          <span className="text-[11px] font-mono text-slate-400 block">
            Gecə vaxtı itki payı (NRW)
          </span>
          <div className="flex items-center justify-between mt-1">
            <span className="text-xl font-bold font-mono text-slate-100">
              {mnfStats.nrwNightSharePct}%
            </span>
            <Badge variant={mnfStats.nrwNightSharePct > 30 ? 'critical' : 'warning'}>
              {mnfStats.nrwNightSharePct > 30 ? 'Yüksək' : 'Normal'}
            </Badge>
          </div>
          <span className="text-[10px] text-slate-500 font-mono">Qəbul edilən limit: &lt; 20%</span>
        </Card>
      </div>
    </div>
  );
};
