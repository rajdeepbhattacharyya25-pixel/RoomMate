import React from 'react';

export type BadgeVariant =
  | 'success' // Green (Active, Resolved, Operational)
  | 'warning' // Amber/Orange (Reviewing, Pending, Grace, Investigating)
  | 'danger'  // Red (Suspended, Critical, Outage, Failed)
  | 'info'    // Indigo/Blue (Planned, In Progress, Low, Medium)
  | 'neutral'; // Slate (Draft, Archived, Closed, Left)

interface StatusBadgeProps {
  variant?: BadgeVariant;
  label: string;
  size?: 'sm' | 'md';
  dot?: boolean;
  pulse?: boolean;
  icon?: React.ReactNode;
  className?: string;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({
  variant = 'neutral',
  label,
  size = 'md',
  dot = true,
  pulse = false,
  icon,
  className = '',
}) => {
  const variantStyles: Record<BadgeVariant, { bg: string; text: string; border: string; dotColor: string }> = {
    success: {
      bg: 'bg-emerald-50',
      text: 'text-emerald-700',
      border: 'border-emerald-200',
      dotColor: 'bg-emerald-500',
    },
    warning: {
      bg: 'bg-amber-50',
      text: 'text-amber-700',
      border: 'border-amber-200',
      dotColor: 'bg-amber-500',
    },
    danger: {
      bg: 'bg-rose-50',
      text: 'text-rose-700',
      border: 'border-rose-200',
      dotColor: 'bg-rose-500',
    },
    info: {
      bg: 'bg-indigo-50',
      text: 'text-indigo-700',
      border: 'border-indigo-200',
      dotColor: 'bg-indigo-500',
    },
    neutral: {
      bg: 'bg-slate-100',
      text: 'text-slate-600',
      border: 'border-slate-200',
      dotColor: 'bg-slate-400',
    },
  };

  const style = variantStyles[variant];
  const sizeClasses = size === 'sm' ? 'text-[10px] px-2 py-0.5' : 'text-xs px-2.5 py-1';

  return (
    <span
      className={`inline-flex items-center gap-1.5 font-semibold rounded-full border ${style.bg} ${style.text} ${style.border} ${sizeClasses} ${className}`}
    >
      {icon && <span className="shrink-0">{icon}</span>}
      {dot && (
        <span className="relative flex h-1.5 w-1.5 shrink-0">
          {pulse && (
            <span
              className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${style.dotColor}`}
            />
          )}
          <span className={`relative inline-flex rounded-full h-1.5 w-1.5 ${style.dotColor}`} />
        </span>
      )}
      <span>{label}</span>
    </span>
  );
};
