import { describe, it, expect } from 'vitest';

describe('Progressive Feed Pagination Logic Suite (Option C)', () => {
  const DEFAULT_PAGE_SIZE = 15;

  const calculatePaginationState = (
    totalCount: number,
    currentVisibleLimit: number,
    pageSize: number = DEFAULT_PAGE_SIZE
  ) => {
    const isUnderLimit = totalCount <= pageSize;
    const effectiveLimit = Math.min(currentVisibleLimit, totalCount);
    const isFullyExpanded = effectiveLimit >= totalCount;
    const remaining = Math.max(0, totalCount - effectiveLimit);
    const nextBatch = Math.min(pageSize, remaining);
    const progressPercent = totalCount === 0 ? 100 : Math.min(100, Math.round((effectiveLimit / totalCount) * 100));

    return {
      isUnderLimit,
      effectiveLimit,
      isFullyExpanded,
      remaining,
      nextBatch,
      progressPercent,
    };
  };

  it('hides pagination bar when total items <= 15', () => {
    const state0 = calculatePaginationState(0, 15);
    expect(state0.isUnderLimit).toBe(true);

    const state10 = calculatePaginationState(10, 15);
    expect(state10.isUnderLimit).toBe(true);

    const state15 = calculatePaginationState(15, 15);
    expect(state15.isUnderLimit).toBe(true);
  });

  it('correctly calculates initial batch for 42 items', () => {
    const state = calculatePaginationState(42, 15);
    expect(state.isUnderLimit).toBe(false);
    expect(state.effectiveLimit).toBe(15);
    expect(state.isFullyExpanded).toBe(false);
    expect(state.remaining).toBe(27);
    expect(state.nextBatch).toBe(15);
    expect(state.progressPercent).toBe(36);
  });

  it('correctly calculates second batch (limit = 30 of 42 items)', () => {
    const state = calculatePaginationState(42, 30);
    expect(state.effectiveLimit).toBe(30);
    expect(state.isFullyExpanded).toBe(false);
    expect(state.remaining).toBe(12);
    expect(state.nextBatch).toBe(12); // Less than 15 items remaining
    expect(state.progressPercent).toBe(71);
  });

  it('marks as fully expanded when limit exceeds total items', () => {
    const state = calculatePaginationState(42, 45);
    expect(state.effectiveLimit).toBe(42);
    expect(state.isFullyExpanded).toBe(true);
    expect(state.remaining).toBe(0);
    expect(state.nextBatch).toBe(0);
    expect(state.progressPercent).toBe(100);
  });

  it('collapses cleanly back to page size of 15', () => {
    let visibleLimit = 42;
    // User taps "Show Less (Top 15)"
    visibleLimit = DEFAULT_PAGE_SIZE;
    const state = calculatePaginationState(42, visibleLimit);
    expect(state.effectiveLimit).toBe(15);
    expect(state.isFullyExpanded).toBe(false);
    expect(state.remaining).toBe(27);
  });

  it('handles boundary case of exactly 16 items (1 remaining)', () => {
    const state = calculatePaginationState(16, 15);
    expect(state.isUnderLimit).toBe(false);
    expect(state.remaining).toBe(1);
    expect(state.nextBatch).toBe(1);
    expect(state.progressPercent).toBe(94);
  });
});
