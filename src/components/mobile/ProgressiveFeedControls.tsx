import React from 'react';
import { ChevronDown, ChevronUp, CheckCircle2, ListFilter } from 'lucide-react';
import { hapticSelection, hapticImpact } from '../../lib/native/haptics';

export interface ProgressiveFeedControlsProps {
  currentCount: number;
  totalCount: number;
  pageSize?: number;
  onShowMore: () => void;
  onViewAll: () => void;
  onShowLess: () => void;
  itemLabel?: string;
  className?: string;
}

export const ProgressiveFeedControls: React.FC<ProgressiveFeedControlsProps> = ({
  currentCount,
  totalCount,
  pageSize = 15,
  onShowMore,
  onViewAll,
  onShowLess,
  itemLabel = 'records',
  className = '',
}) => {
  // If total items don't exceed the initial page size, do not render controls
  if (totalCount <= pageSize) {
    return null;
  }

  const isFullyExpanded = currentCount >= totalCount;
  const isPartiallyExpanded = currentCount > pageSize && !isFullyExpanded;
  const remaining = totalCount - currentCount;
  const nextBatch = Math.min(pageSize, remaining);
  const progressPercent = Math.min(100, Math.round((currentCount / totalCount) * 100));

  const handleShowMoreClick = () => {
    hapticSelection();
    onShowMore();
  };

  const handleViewAllClick = () => {
    hapticSelection();
    onViewAll();
  };

  const handleShowLessClick = () => {
    hapticImpact('LIGHT');
    onShowLess();
  };

  return (
    <div
      className={`p-3 rounded-2xl bg-white dark:bg-[#1C1C25] border border-slate-200/80 dark:border-[#27354A] shadow-[0_1px_3px_0_rgba(0,0,0,0.03)] dark:shadow-none space-y-2.5 transition-all ${className}`}
    >
      {/* Progress & Counter Header */}
      <div className="flex items-center justify-between text-[11px] px-0.5">
        <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400 font-medium">
          {isFullyExpanded ? (
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 dark:text-emerald-400" />
          ) : (
            <ListFilter className="w-3.5 h-3.5 text-indigo-500 dark:text-indigo-400" />
          )}
          <span>
            {isFullyExpanded ? (
              <>
                All <strong className="text-slate-800 dark:text-slate-200 font-semibold tabular-nums">{totalCount}</strong> {itemLabel} displayed
              </>
            ) : (
              <>
                Showing <strong className="text-slate-800 dark:text-slate-200 font-semibold tabular-nums">{currentCount}</strong> of{' '}
                <strong className="text-slate-800 dark:text-slate-200 font-semibold tabular-nums">{totalCount}</strong> {itemLabel}
              </>
            )}
          </span>
        </div>
        <span className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/60 px-2 py-0.5 rounded-full border border-indigo-100 dark:border-indigo-900/40 tabular-nums">
          {progressPercent}%
        </span>
      </div>

      {/* Progress Bar Track */}
      <div className="w-full h-1 bg-slate-100 dark:bg-[#20202A] rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-300 ease-out ${
            isFullyExpanded
              ? 'bg-emerald-500 dark:bg-emerald-400'
              : 'bg-indigo-600 dark:bg-indigo-500'
          }`}
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      {/* Action Buttons */}
      {!isFullyExpanded ? (
        <div className="space-y-2 pt-0.5">
          <div className="flex items-center gap-2">
            {/* Primary Action: Show Next Batch */}
            <button
              type="button"
              onClick={handleShowMoreClick}
              className="flex-1 h-10 px-3 rounded-xl bg-indigo-50 hover:bg-indigo-100/90 dark:bg-indigo-950/50 dark:hover:bg-indigo-900/60 border border-indigo-200/80 dark:border-indigo-800/50 text-indigo-700 dark:text-indigo-300 text-xs font-semibold flex items-center justify-center gap-1.5 active:scale-[0.98] transition-all shadow-2xs"
            >
              <ChevronDown className="w-4 h-4 stroke-[2.2] animate-bounce-subtle" />
              <span>Show {nextBatch} More</span>
              <span className="text-[10px] opacity-75 font-normal">
                ({remaining} remaining)
              </span>
            </button>

            {/* View All Quick Action */}
            <button
              type="button"
              onClick={handleViewAllClick}
              className="h-10 px-3.5 rounded-xl bg-slate-50 hover:bg-slate-100 dark:bg-[#20202A] dark:hover:bg-[#27354A] border border-slate-200/80 dark:border-[#27354A] text-slate-700 dark:text-slate-300 text-xs font-medium flex items-center justify-center whitespace-nowrap active:scale-[0.98] transition-all"
            >
              <span>View All</span>
            </button>
          </div>

          {/* If partially expanded, allow collapsing back to Top 15 without waiting to reach the end */}
          {isPartiallyExpanded && (
            <div className="text-center pt-0.5">
              <button
                type="button"
                onClick={handleShowLessClick}
                className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 transition-colors py-1 px-2.5 rounded-lg hover:bg-slate-100 dark:hover:bg-[#20202A]"
              >
                <ChevronUp className="w-3.5 h-3.5" />
                <span>Collapse to Top {pageSize}</span>
              </button>
            </div>
          )}
        </div>
      ) : (
        /* Fully Expanded: Offer collapse button */
        <div className="pt-0.5">
          <button
            type="button"
            onClick={handleShowLessClick}
            className="w-full h-10 px-3 rounded-xl bg-slate-50 hover:bg-slate-100 dark:bg-[#20202A] dark:hover:bg-[#27354A] border border-slate-200/80 dark:border-[#27354A] text-slate-700 dark:text-slate-300 text-xs font-semibold flex items-center justify-center gap-1.5 active:scale-[0.98] transition-all shadow-2xs"
          >
            <ChevronUp className="w-4 h-4 stroke-[2.2]" />
            <span>Show Less (Collapse to Top {pageSize})</span>
          </button>
        </div>
      )}
    </div>
  );
};
