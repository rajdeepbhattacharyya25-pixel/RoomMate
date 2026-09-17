import React, { forwardRef, useRef, useImperativeHandle } from 'react';

export interface PrefixInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'prefix'> {
  prefix: React.ReactNode | string;
  hasError?: boolean;
  containerClassName?: string;
  prefixClassName?: string;
  focusColor?: 'indigo' | 'emerald' | 'brand';
}

const FOCUS_COLORS = {
  indigo: 'focus-within:border-indigo-500 focus-within:ring-indigo-500/20',
  emerald: 'focus-within:border-emerald-500 focus-within:ring-emerald-500/20',
  brand: 'focus-within:border-brand focus-within:ring-brand/20',
};

export const PrefixInput = forwardRef<HTMLInputElement, PrefixInputProps>(
  (
    {
      prefix,
      hasError = false,
      disabled = false,
      containerClassName = '',
      prefixClassName = '',
      focusColor = 'indigo',
      className = '',
      ...restProps
    },
    ref
  ) => {
    const inputRef = useRef<HTMLInputElement>(null);
    useImperativeHandle(ref, () => inputRef.current as HTMLInputElement);

    const focusRing = FOCUS_COLORS[focusColor] || FOCUS_COLORS.indigo;

    return (
      <div
        className={`flex items-center bg-slate-50 border rounded-xl overflow-hidden transition-all ${
          hasError
            ? 'border-rose-400 bg-rose-50/30 ring-2 ring-rose-500/20 focus-within:border-rose-500'
            : `border-slate-200 focus-within:ring-2 focus-within:bg-white ${focusRing}`
        } ${disabled ? 'opacity-50 pointer-events-none bg-slate-100' : ''} ${containerClassName}`}
      >
        <div
          onClick={() => inputRef.current?.focus()}
          className={`flex items-center justify-center px-3 py-2.5 bg-slate-100/90 border-r border-slate-200 text-slate-500 font-mono font-bold text-xs select-none shrink-0 cursor-pointer ${prefixClassName}`}
          aria-hidden="true"
        >
          {prefix}
        </div>
        <input
          ref={inputRef}
          disabled={disabled}
          className={`w-full px-3 py-2.5 bg-transparent border-0 text-xs font-mono font-medium text-slate-900 outline-none placeholder:text-slate-400 placeholder:font-normal ${className}`}
          {...restProps}
        />
      </div>
    );
  }
);

PrefixInput.displayName = 'PrefixInput';
