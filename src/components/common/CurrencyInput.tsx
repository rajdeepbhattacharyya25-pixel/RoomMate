import React, { forwardRef, useRef, useImperativeHandle } from 'react';
import { X } from 'lucide-react';

export interface CurrencyInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size' | 'onChange'> {
  value: string | number;
  onChange: (value: string, numericValue: number) => void;
  currencySymbol?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  hasError?: boolean;
  showClear?: boolean;
  containerClassName?: string;
  prefixClassName?: string;
}

const SIZE_STYLES = {
  sm: {
    container: 'rounded-lg text-xs',
    prefix: 'px-2 py-1 text-xs font-bold',
    input: 'px-2 py-1 text-xs font-bold',
    clearBtn: 'p-1 mr-1',
    clearIcon: 'w-3 h-3',
  },
  md: {
    container: 'rounded-xl text-sm',
    prefix: 'px-3 py-2 text-base font-bold',
    input: 'px-3 py-2 text-base font-bold',
    clearBtn: 'p-1.5 mr-1.5',
    clearIcon: 'w-3.5 h-3.5',
  },
  lg: {
    container: 'rounded-xl text-base',
    prefix: 'px-3.5 py-2.5 text-lg font-bold',
    input: 'px-3.5 py-2.5 text-xl font-bold',
    clearBtn: 'p-1.5 mr-1.5',
    clearIcon: 'w-4 h-4',
  },
  xl: {
    container: 'rounded-2xl text-lg',
    prefix: 'px-4 py-3 text-xl font-black',
    input: 'px-4 py-3 text-2xl font-black',
    clearBtn: 'p-2 mr-2',
    clearIcon: 'w-4 h-4',
  },
};

export const CurrencyInput = forwardRef<HTMLInputElement, CurrencyInputProps>(
  (
    {
      value,
      onChange,
      currencySymbol = '₹',
      size = 'md',
      hasError = false,
      showClear = false,
      disabled = false,
      placeholder = '0',
      className = '',
      containerClassName = '',
      prefixClassName = '',
      type = 'number',
      step = 'any',
      ...restProps
    },
    ref
  ) => {
    const inputRef = useRef<HTMLInputElement>(null);
    useImperativeHandle(ref, () => inputRef.current as HTMLInputElement);

    const sizeConfig = SIZE_STYLES[size] || SIZE_STYLES.md;
    const stringVal = value === undefined || value === null ? '' : String(value);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const raw = e.target.value;
      const num = parseFloat(raw);
      onChange(raw, isNaN(num) ? 0 : num);
    };

    const handleClear = () => {
      onChange('', 0);
      inputRef.current?.focus();
    };

    return (
      <div
        className={`flex items-center bg-slate-50 border transition-all overflow-hidden ${
          sizeConfig.container
        } ${
          hasError
            ? 'border-rose-400 bg-rose-50/30 ring-2 ring-rose-500/20 focus-within:border-rose-500'
            : 'border-slate-200 focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-500/20 focus-within:bg-white'
        } ${disabled ? 'opacity-50 pointer-events-none bg-slate-100' : ''} ${containerClassName}`}
      >
        <div
          onClick={() => inputRef.current?.focus()}
          className={`flex items-center justify-center shrink-0 select-none cursor-pointer border-r border-slate-200 bg-slate-100/90 text-indigo-600 transition-colors ${sizeConfig.prefix} ${prefixClassName}`}
          aria-hidden="true"
        >
          {currencySymbol}
        </div>
        <input
          ref={inputRef}
          type={type}
          step={step}
          inputMode="decimal"
          value={stringVal}
          onChange={handleChange}
          disabled={disabled}
          placeholder={placeholder}
          className={`w-full bg-transparent border-0 outline-none tabular-nums text-slate-900 placeholder:text-slate-400 placeholder:font-normal ${sizeConfig.input} ${className}`}
          {...restProps}
        />
        {showClear && stringVal && !disabled && (
          <button
            type="button"
            onClick={handleClear}
            aria-label="Clear amount"
            className={`text-slate-400 hover:text-slate-600 active:scale-95 transition-all rounded-lg hover:bg-slate-200/60 shrink-0 ${sizeConfig.clearBtn}`}
          >
            <X className={sizeConfig.clearIcon} />
          </button>
        )}
      </div>
    );
  }
);

CurrencyInput.displayName = 'CurrencyInput';
