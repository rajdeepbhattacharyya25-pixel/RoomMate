import React from 'react';

interface SkeletonProps {
  className?: string;
  count?: number;
}

export const Skeleton: React.FC<SkeletonProps> = ({ className = 'h-4 w-full', count = 1 }) => {
  if (count === 1) {
    return (
      <div
        className={`bg-slate-200/80 rounded-md animate-pulse ${className}`}
      />
    );
  }

  return (
    <div className="space-y-2 w-full">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className={`bg-slate-200/80 rounded-md animate-pulse ${className}`}
        />
      ))}
    </div>
  );
};

export const TableSkeleton: React.FC<{ rows?: number; columns?: number }> = ({
  rows = 5,
  columns = 6,
}) => {
  return (
    <div className="w-full bg-white rounded-xl border border-slate-200 divide-y divide-slate-100 overflow-hidden">
      <div className="p-4 bg-slate-50 flex gap-4">
        {Array.from({ length: columns }).map((_, c) => (
          <div key={c} className="flex-1">
            <Skeleton className="h-4 w-3/4" />
          </div>
        ))}
      </div>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="p-4 flex gap-4 items-center">
          {Array.from({ length: columns }).map((_, c) => (
            <div key={c} className="flex-1">
              <Skeleton className="h-4 w-full" />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
};
