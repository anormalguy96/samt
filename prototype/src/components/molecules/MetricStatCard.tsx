import React from 'react';
import { Card } from '../atoms/Card';
import { Badge } from '../atoms/Badge';
import { Icon, type IconProps } from '../atoms/Icon';
import type { StatusSeverity } from '../../types';

export interface MetricStatCardProps {
  title: string;
  value: string;
  subtitle: string;
  iconName: IconProps['name'];
  badgeText: string;
  badgeVariant: StatusSeverity;
}

export const MetricStatCard: React.FC<MetricStatCardProps> = ({
  title,
  value,
  subtitle,
  iconName,
  badgeText,
  badgeVariant,
}) => {
  return (
    <Card hoverable className="flex flex-col justify-between relative overflow-hidden group">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[11px] font-mono tracking-wider text-slate-400 uppercase font-semibold">
          {title}
        </span>
        <div className="p-1.5 rounded-lg bg-navy-900 border border-slate-700/50 text-cyan-primary group-hover:text-cyan-primary/90 transition-colors">
          <Icon name={iconName} size={15} />
        </div>
      </div>

      <div className="flex items-baseline justify-between mt-1">
        <div className="text-2xl font-bold font-mono text-slate-100 tracking-tight">
          {value}
        </div>
        <Badge variant={badgeVariant} showDot>
          {badgeText}
        </Badge>
      </div>

      <div className="text-[11px] text-slate-400 mt-2 font-mono truncate">
        {subtitle}
      </div>
    </Card>
  );
};
