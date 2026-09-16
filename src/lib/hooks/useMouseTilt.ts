import { useState, useRef, useEffect, useCallback } from 'react';

interface UseMouseTiltOptions {
  maxTilt?: number;
  perspective?: number;
  scale?: number;
}

export function useMouseTilt<T extends HTMLElement = HTMLDivElement>(options: UseMouseTiltOptions = {}) {
  const { maxTilt = 6, perspective = 1000, scale = 1.01 } = options;
  const ref = useRef<T | null>(null);
  const [style, setStyle] = useState<React.CSSProperties>({
    transform: 'perspective(1000px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)',
    transition: 'transform 0.4s cubic-bezier(0.16, 1, 0.3, 1)'
  });

  const isTouchDevice = useCallback(() => {
    if (typeof window === 'undefined') return true;
    return !window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  }, []);

  const prefersReducedMotion = useCallback(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }, []);

  useEffect(() => {
    const element = ref.current;
    if (!element || isTouchDevice() || prefersReducedMotion()) return;

    let frameId: number | null = null;

    const handleMouseMove = (e: MouseEvent) => {
      if (frameId) cancelAnimationFrame(frameId);

      frameId = requestAnimationFrame(() => {
        const rect = element.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        const centerX = rect.width / 2;
        const centerY = rect.height / 2;

        const rotateX = -((y - centerY) / centerY) * maxTilt;
        const rotateY = ((x - centerX) / centerX) * maxTilt;

        setStyle({
          transform: `perspective(${perspective}px) rotateX(${rotateX.toFixed(2)}deg) rotateY(${rotateY.toFixed(2)}deg) scale3d(${scale}, ${scale}, 1)`,
          transition: 'transform 0.1s ease-out'
        });
      });
    };

    const handleMouseLeave = () => {
      if (frameId) cancelAnimationFrame(frameId);
      setStyle({
        transform: `perspective(${perspective}px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)`,
        transition: 'transform 0.5s cubic-bezier(0.16, 1, 0.3, 1)'
      });
    };

    element.addEventListener('mousemove', handleMouseMove);
    element.addEventListener('mouseleave', handleMouseLeave);

    return () => {
      if (frameId) cancelAnimationFrame(frameId);
      element.removeEventListener('mousemove', handleMouseMove);
      element.removeEventListener('mouseleave', handleMouseLeave);
    };
  }, [maxTilt, perspective, scale, isTouchDevice, prefersReducedMotion]);

  return { ref, style };
}
