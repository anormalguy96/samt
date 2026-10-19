import React from 'react';
import { cn } from '../../utils/cn';
import { Icon, type IconProps } from '../atoms/Icon';
import type { TabId } from '../../types';

export interface TabNavItemProps {
  id: TabId;
  label: string;
  iconName: IconProps['name'];
  isActive: boolean;
  onSelect: (id: TabId) => void;
  badge?: string;
}

export const TabNavItem: React.FC<TabNavItemProps> = ({
  id,
  label,
  iconName,
  isActive,
  onSelect,
  badge,
}) => {
  return (
    <button
      role="tab"
      id={`tab-btn-${id}`}
      aria-selected={isActive}
      aria-controls={`panel-${id}`}
      onClick={() => onSelect(id)}
      className={cn(
        'flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium font-sans whitespace-nowrap transition-all duration-150 select-none focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-primary/50',
        isActive
          ? 'bg-cyan-primary/15 text-cyan-primary border border-cyan-primary/40 shadow-glow font-semibold'
          : 'text-slate-400 hover:text-slate-200 hover:bg-navy-800/60 border border-transparent'
      )}
    >
      <Icon name={iconName} size={14} className={isActive ? 'text-cyan-primary' : 'text-slate-400'} />
      <span>{label}</span>
      {badge && (
        <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-navy-950 text-slate-300 border border-slate-700">
          {badge}
        </span>
      )}
    </button>
  );
};
