import { useState, useEffect, useRef } from 'react';

interface UseCountUpOptions {
  target: number;
  duration?: number;
  startTrigger?: boolean;
  startFrom?: number;
  decimals?: number;
}

export function useCountUp({
  target,
  duration = 900,
  startTrigger = true,
  startFrom = 0,
  decimals = 0
}: UseCountUpOptions): number {
  const [value, setValue] = useState(startFrom);
  const startTimeRef = useRef<number | null>(null);
  const frameRef = useRef<number | null>(null);

  useEffect(() => {
    if (!startTrigger) {
      setValue(startFrom);
      return;
    }

    // Check for reduced motion preference
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setValue(target);
      return;
    }

    startTimeRef.current = null;

    const animate = (timestamp: number) => {
      if (!startTimeRef.current) startTimeRef.current = timestamp;
      const elapsed = timestamp - startTimeRef.current;
      const progress = Math.min(elapsed / duration, 1);

      // Cubic ease-out: 1 - (1 - t)^3
      const easeProgress = 1 - Math.pow(1 - progress, 3);
      const currentVal = startFrom + (target - startFrom) * easeProgress;

      setValue(decimals === 0 ? Math.round(currentVal) : parseFloat(currentVal.toFixed(decimals)));

      if (progress < 1) {
        frameRef.current = requestAnimationFrame(animate);
      } else {
        setValue(target);
      }
    };

    frameRef.current = requestAnimationFrame(animate);

    return () => {
      if (frameRef.current) {
        cancelAnimationFrame(frameRef.current);
      }
    };
  }, [target, duration, startTrigger, startFrom, decimals]);

  return value;
}
