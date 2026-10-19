import React from 'react';
import { Card } from '../atoms/Card';
import { Badge } from '../atoms/Badge';
import { Button } from '../atoms/Button';
import type { WorkOrder } from '../../types';

export interface WorkOrderListItemProps {
  order: WorkOrder;
  onOpenDetails: (order: WorkOrder) => void;
}

export const WorkOrderListItem: React.FC<WorkOrderListItemProps> = ({
  order,
  onOpenDetails,
}) => {
  const statusBadge = {
    ASSIGNED: { variant: 'critical', text: 'Təyin edildi' },
    DISPATCHED: { variant: 'critical', text: 'Yoldadır' },
    IN_PROGRESS: { variant: 'warning', text: 'Təmirdədir' },
    REPAIRED: { variant: 'info', text: 'Təmir olundu' },
    VERIFIED: { variant: 'nominal', text: 'Təsdiqləndi' },
  } as const;

  const currentBadge = statusBadge[order.status];

  return (
    <Card hoverable className="flex flex-col gap-3">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs font-bold text-cyan-primary">{order.id}</span>
            <span className="text-slate-400 text-xs font-mono">· {order.time}</span>
          </div>
          <h4 className="text-sm font-semibold text-slate-100 mt-1">{order.dma}</h4>
        </div>
        <Badge variant={currentBadge.variant} showDot>
          {currentBadge.text}
        </Badge>
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs font-mono py-2 border-y border-slate-800">
        <div>
          <span className="text-slate-500 block">Sızma itkisi:</span>
          <span className="text-rose-critical font-bold">{order.loss}</span>
        </div>
        <div>
          <span className="text-slate-500 block">Təmir briqadası:</span>
          <span className="text-slate-200">{order.crew}</span>
        </div>
      </div>

      <div className="flex items-center justify-between pt-1">
        <span className="text-[11px] font-mono text-slate-400">
          📍 {order.coordinates}
        </span>
        <Button size="sm" variant="secondary" onClick={() => onOpenDetails(order)}>
          Ətraflı bax
        </Button>
      </div>
    </Card>
  );
};
