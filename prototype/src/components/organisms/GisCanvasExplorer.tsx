import React, { useRef, useEffect } from 'react';
import { Card } from '../atoms/Card';
import { Badge } from '../atoms/Badge';
import { Button } from '../atoms/Button';
import { Icon } from '../atoms/Icon';
import type { DmaNode, PipeEdge } from '../../types';

export interface GisCanvasExplorerProps {
  dmaList: DmaNode[];
  pipes: PipeEdge[];
  selectedDma: DmaNode;
  selectedDmaId: string;
  onSelectDma: (id: string) => void;
  onViewBalance: () => void;
}

export const GisCanvasExplorer: React.FC<GisCanvasExplorerProps> = ({
  dmaList,
  pipes,
  selectedDma,
  selectedDmaId,
  onSelectDma,
  onViewBalance,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    let particles: { pipeIdx: number; t: number; speed: number }[] = [];

    // Initialize flow particles
    for (let i = 0; i < 45; i++) {
      particles.push({
        pipeIdx: Math.floor(Math.random() * pipes.length),
        t: Math.random(),
        speed: 0.003 + Math.random() * 0.004,
      });
    }

    let pulse = 0;

    const render = () => {
      pulse += 0.04;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Background grid
      ctx.strokeStyle = 'rgba(0, 229, 255, 0.04)';
      ctx.lineWidth = 1;
      const step = 40;
      for (let x = 0; x < canvas.width; x += step) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
        ctx.stroke();
      }
      for (let y = 0; y < canvas.height; y += step) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
        ctx.stroke();
      }

      // Draw pipes
      pipes.forEach((pipe) => {
        const from = dmaList[pipe.from];
        const to = dmaList[pipe.to];
        if (!from || !to) return;

        ctx.beginPath();
        ctx.moveTo(from.x, from.y);
        ctx.lineTo(to.x, to.y);
        ctx.strokeStyle = 'rgba(0, 229, 255, 0.25)';
        ctx.lineWidth = 4;
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(from.x, from.y);
        ctx.lineTo(to.x, to.y);
        ctx.strokeStyle = 'rgba(0, 229, 255, 0.7)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      });

      // Draw animated flow particles
      particles.forEach((p) => {
        p.t += p.speed;
        if (p.t > 1) {
          p.t = 0;
          p.pipeIdx = Math.floor(Math.random() * pipes.length);
        }
        const pipe = pipes[p.pipeIdx];
        const from = dmaList[pipe.from];
        const to = dmaList[pipe.to];
        if (!from || !to) return;

        const px = from.x + (to.x - from.x) * p.t;
        const py = from.y + (to.y - from.y) * p.t;

        ctx.beginPath();
        ctx.arc(px, py, 2.5, 0, Math.PI * 2);
        ctx.fillStyle = '#00e5ff';
        ctx.shadowColor = '#00e5ff';
        ctx.shadowBlur = 8;
        ctx.fill();
        ctx.shadowBlur = 0;
      });

      // Draw DMA nodes
      dmaList.forEach((dma) => {
        const isSelected = dma.id === selectedDmaId;

        // Outer glow on critical or selected
        if (dma.status === 'CRITICAL_BURST' || isSelected) {
          const pulseR = dma.radius + Math.sin(pulse) * 6;
          ctx.beginPath();
          ctx.arc(dma.x, dma.y, pulseR, 0, Math.PI * 2);
          ctx.strokeStyle = isSelected ? 'rgba(0, 229, 255, 0.6)' : 'rgba(255, 59, 48, 0.4)';
          ctx.lineWidth = 2;
          ctx.stroke();
        }

        // Main node circle
        ctx.beginPath();
        ctx.arc(dma.x, dma.y, dma.radius, 0, Math.PI * 2);
        ctx.fillStyle = isSelected ? '#131f37' : '#0c1322';
        ctx.fill();
        ctx.strokeStyle = dma.color;
        ctx.lineWidth = isSelected ? 3.5 : 2;
        ctx.stroke();

        // Node ID & Flow text
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 11px JetBrains Mono, monospace';
        ctx.textAlign = 'center';
        ctx.fillText(dma.id.replace('DMA-', ''), dma.x, dma.y - 6);

        ctx.fillStyle = dma.color;
        ctx.font = '10px JetBrains Mono, monospace';
        ctx.fillText(`${dma.inflow} m³/h`, dma.x, dma.y + 10);

        if (dma.status === 'CRITICAL_BURST') {
          ctx.fillStyle = '#ff3b30';
          ctx.font = 'bold 9px JetBrains Mono, monospace';
          ctx.fillText('⚠ Qəza', dma.x, dma.y + 24);
        }
      });

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [dmaList, pipes, selectedDmaId]);

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const mx = (e.clientX - rect.left) * scaleX;
    const my = (e.clientY - rect.top) * scaleY;

    for (const dma of dmaList) {
      const dist = Math.hypot(mx - dma.x, my - dma.y);
      if (dist <= dma.radius) {
        onSelectDma(dma.id);
        break;
      }
    }
  };

  const getStatusText = (status: DmaNode['status']) => {
    switch (status) {
      case 'CRITICAL_BURST': return 'Qəfil partlayış';
      case 'HIGH_BACKGROUND': return 'Yüksək fon sızması';
      case 'MODERATE': return 'Mötədil vəziyyət';
      case 'OPTIMAL': return 'Optimal rejim';
      case 'RESERVOIR_NODE': return 'Su anbarı qovşağı';
      default: return status;
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
      {/* Interactive Topology Canvas */}
      <Card className="lg:col-span-2 p-0 overflow-hidden flex flex-col relative">
        <div className="flex items-center justify-between p-3.5 border-b border-cyan-primary/20 bg-navy-850/50">
          <div className="flex items-center gap-2">
            <Icon name="map" size={16} className="text-cyan-primary" />
            <span className="text-xs font-mono font-bold text-slate-100">
              Bakı-Abşeron mərkəzləşdirilmiş hidravlik şəbəkə topologiyası
            </span>
          </div>
          <Badge variant="info" showDot>
            Sintetik telemetriya axını (Demo)
          </Badge>
        </div>

        <div className="relative w-full aspect-[16/9] min-h-[340px] bg-navy-950 flex items-center justify-center">
          <canvas
            ref={canvasRef}
            width={900}
            height={480}
            onClick={handleCanvasClick}
            className="w-full h-full object-contain cursor-pointer"
            aria-label="Bakı-Abşeron su şəbəkəsi xəritəsi"
          />
          <div className="absolute bottom-2 left-2 text-[10px] font-mono text-slate-400 bg-navy-900/80 px-2 py-1 rounded border border-slate-800">
            Düyünləri seçmək üçün üzərinə klikləyin · Koordinat: 40.4093° N, 49.8671° E
          </div>
        </div>
      </Card>

      {/* Selected DMA Detail Inspector */}
      <Card glow className="flex flex-col justify-between">
        <div className="space-y-4">
          <div className="flex items-start justify-between border-b border-slate-800 pb-3">
            <div>
              <span className="text-xs font-mono text-cyan-primary font-bold">
                {selectedDma.id}
              </span>
              <h3 className="text-sm font-bold text-slate-100 mt-0.5">
                {selectedDma.name}
              </h3>
            </div>
            <Badge
              variant={
                selectedDma.status === 'CRITICAL_BURST'
                  ? 'critical'
                  : selectedDma.status === 'OPTIMAL'
                  ? 'nominal'
                  : 'warning'
              }
              showDot
            >
              {getStatusText(selectedDma.status)}
            </Badge>
          </div>

          <div className="grid grid-cols-2 gap-3 text-xs font-mono">
            <div className="p-2.5 rounded-lg bg-navy-900 border border-slate-800">
              <span className="text-slate-400 block text-[10px]">Daxilolma həcmi</span>
              <span className="text-cyan-primary font-bold text-base">
                {selectedDma.inflow} m³/h
              </span>
            </div>
            <div className="p-2.5 rounded-lg bg-navy-900 border border-slate-800">
              <span className="text-slate-400 block text-[10px]">Çıxış həcmi</span>
              <span className="text-slate-200 font-bold text-base">
                {selectedDma.outflow} m³/h
              </span>
            </div>
            <div className="p-2.5 rounded-lg bg-navy-900 border border-slate-800">
              <span className="text-slate-400 block text-[10px]">İtki dərəcəsi (NRW)</span>
              <span
                className={`font-bold text-base ${
                  selectedDma.nrw > 25 ? 'text-rose-critical' : 'text-emerald-brand'
                }`}
              >
                {selectedDma.nrw}%
              </span>
            </div>
            <div className="p-2.5 rounded-lg bg-navy-900 border border-slate-800">
              <span className="text-slate-400 block text-[10px]">Şəbəkə təzyiqi</span>
              <span className="text-cyan-primary font-bold text-base">
                {selectedDma.pressure} bar
              </span>
            </div>
          </div>

          <div className="space-y-1.5 text-xs font-mono text-slate-300 bg-navy-900/60 p-3 rounded-lg border border-slate-800/80">
            <div className="flex justify-between">
              <span className="text-slate-500">Əhali sayı:</span>
              <span className="text-slate-200">{selectedDma.pop}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Boru şəbəkəsinin uzunluğu:</span>
              <span className="text-slate-200">{selectedDma.len}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Boru materialı:</span>
              <span className="text-slate-200 truncate max-w-[150px]">{selectedDma.mat}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Torpaq korroziyası:</span>
              <span className="text-slate-200">{selectedDma.soil}</span>
            </div>
            <div className="flex justify-between pt-1 border-t border-slate-800">
              <span className="text-slate-400 font-bold">RPN risk balı:</span>
              <span className="text-rose-critical font-bold">{selectedDma.rpn} / 100</span>
            </div>
          </div>
        </div>

        <div className="pt-4 border-t border-slate-800 mt-4 flex items-center gap-2">
          <Button
            className="w-full"
            variant="primary"
            onClick={onViewBalance}
            rightIcon={<Icon name="chart" size={14} />}
          >
            MNF balans analizinə bax
          </Button>
        </div>
      </Card>
    </div>
  );
};
