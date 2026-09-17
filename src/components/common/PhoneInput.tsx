import React, { forwardRef, useRef, useImperativeHandle } from 'react';
import { X } from 'lucide-react';

export interface PhoneInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'> {
  value: string;
  onChange: (cleanDigits: string, formattedDisplay: string) => void;
  hasError?: boolean;
  showFlag?: boolean;
  showClear?: boolean;
  containerClassName?: string;
  prefixClassName?: string;
}

import { extractTenDigits, formatPhoneDisplay } from './phoneFormat';

export const PhoneInput = forwardRef<HTMLInputElement, PhoneInputProps>(
  (
    {
      value,
      onChange,
      hasError = false,
      showFlag = true,
      showClear = true,
      disabled = false,
      placeholder = '98765 43210',
      className = '',
      containerClassName = '',
      prefixClassName = '',
      id = 'phone-number-input',
      autoComplete = 'tel-national',
      ...restProps
    },
    ref
  ) => {
    const inputRef = useRef<HTMLInputElement>(null);
    useImperativeHandle(ref, () => inputRef.current as HTMLInputElement);

    const cleanDigits = extractTenDigits(value || '');
    const displayValue = formatPhoneDisplay(cleanDigits);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const raw = e.target.value;
      const digits = extractTenDigits(raw);
      onChange(digits, formatPhoneDisplay(digits));
    };

    const handleClear = () => {
      onChange('', '');
      inputRef.current?.focus();
    };

    return (
      <div
        className={`flex items-center bg-slate-50 border rounded-xl overflow-hidden transition-all ${
          hasError
            ? 'border-rose-400 bg-rose-50/30 ring-2 ring-rose-500/20 focus-within:border-rose-500'
            : 'border-slate-200 focus-within:border-emerald-500 focus-within:ring-2 focus-within:ring-emerald-500/20 focus-within:bg-white'
        } ${disabled ? 'opacity-50 pointer-events-none bg-slate-100' : ''} ${containerClassName}`}
      >
        <div
          onClick={() => inputRef.current?.focus()}
          className={`flex items-center gap-1.5 px-3 py-2.5 bg-slate-100/90 border-r border-slate-200 text-slate-700 font-mono font-bold text-xs select-none shrink-0 cursor-pointer ${prefixClassName}`}
          aria-hidden="true"
        >
          {showFlag && <span className="text-sm leading-none">🇮🇳</span>}
          <span>+91</span>
        </div>
        <input
          id={id}
          ref={inputRef}
          type="tel"
          inputMode="numeric"
          autoComplete={autoComplete}
          value={displayValue}
          onChange={handleChange}
          disabled={disabled}
          placeholder={placeholder}
          maxLength={11} // 10 digits + 1 space
          className={`w-full px-3 py-2.5 bg-transparent border-0 text-xs font-mono font-bold text-slate-900 outline-none placeholder:text-slate-400 placeholder:font-normal ${className}`}
          {...restProps}
        />
        {showClear && cleanDigits && !disabled && (
          <button
            type="button"
            onClick={handleClear}
            aria-label="Clear phone number"
            className="p-1.5 mr-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 active:scale-95 transition-all shrink-0"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    );
  }
);

PhoneInput.displayName = 'PhoneInput';
