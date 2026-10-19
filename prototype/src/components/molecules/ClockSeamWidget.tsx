import React from 'react';
import { Badge } from '../atoms/Badge';
import { Button } from '../atoms/Button';
import { Icon } from '../atoms/Icon';

export interface ClockSeamWidgetProps {
  simulatedHour: number;
  isNocturnal: boolean;
  onJumpToNight: () => void;
  onResetRealtime: () => void;
  onSetHour: (h: number) => void;
}

export const ClockSeamWidget: React.FC<ClockSeamWidgetProps> = ({
  simulatedHour,
  isNocturnal,
  onJumpToNight,
  onResetRealtime,
  onSetHour,
}) => {
  const formattedTime = `${String(simulatedHour).padStart(2, '0')}:00:00 AZT`;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl bg-navy-900 border border-cyan-primary/20">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-navy-950 text-cyan-primary border border-slate-700">
          <Icon name="clock" size={18} />
        </div>
        <div className="flex flex-col">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold font-mono text-slate-100">{formattedTime}</span>
            <Badge variant={isNocturnal ? 'info' : 'neutral'} showDot={isNocturnal}>
              {isNocturnal ? '02:00–04:00 gecə pəncərəsi (MNF)' : 'Gündüz rejimi'}
            </Badge>
          </div>
          <span className="text-[11px] font-mono text-slate-400">
            İdarə olunan saat seam-i · Deterministik test mühiti
          </span>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant={isNocturnal ? 'primary' : 'secondary'}
          onClick={onJumpToNight}
          leftIcon={<Icon name="zap" size={12} />}
        >
          03:00 gecə rejimi
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={onResetRealtime}
          leftIcon={<Icon name="refresh" size={12} />}
        >
          Real vaxt (14:00)
        </Button>
        <div className="flex items-center gap-1 ml-1">
          <button
            onClick={() => onSetHour((simulatedHour - 1 + 24) % 24)}
            className="px-2 py-1 bg-navy-950 border border-slate-700 rounded text-xs font-mono text-slate-300 hover:text-cyan-primary"
            title="1 saat geri"
          >
            -1h
          </button>
          <button
            onClick={() => onSetHour((simulatedHour + 1) % 24)}
            className="px-2 py-1 bg-navy-950 border border-slate-700 rounded text-xs font-mono text-slate-300 hover:text-cyan-primary"
            title="1 saat irəli"
          >
            +1h
          </button>
        </div>
      </div>
    </div>
  );
};
