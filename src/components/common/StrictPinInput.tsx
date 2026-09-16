import React, { useState } from 'react';
import { Lock, Eye, EyeOff, AlertCircle } from 'lucide-react';
import { sanitizePinInput } from '../../lib/auth/jwtService';

export interface StrictPinInputProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  onComplete?: (pin: string) => void;
  label?: string;
  sublabel?: string;
  placeholder?: string;
  error?: string | null;
  helperText?: string;
  autoFocus?: boolean;
  disabled?: boolean;
  required?: boolean;
  showToggle?: boolean;
  showDotsIndicator?: boolean;
  centerText?: boolean;
  className?: string;
}

export const StrictPinInput: React.FC<StrictPinInputProps> = ({
  id = 'pin-input',
  value,
  onChange,
  onComplete,
  label,
  sublabel,
  placeholder = '••••',
  error,
  helperText,
  autoFocus = false,
  disabled = false,
  required = false,
  showToggle = true,
  showDotsIndicator = true,
  centerText = false,
  className = '',
}) => {
  const [showPin, setShowPin] = useState(false);
  const [inlineWarning, setInlineWarning] = useState<string | null>(null);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // Allow control keys: Backspace, Tab, Enter, Escape, ArrowLeft, ArrowRight, Delete, etc.
    if (
      e.key === 'Backspace' ||
      e.key === 'Tab' ||
      e.key === 'Enter' ||
      e.key === 'Escape' ||
      e.key === 'ArrowLeft' ||
      e.key === 'ArrowRight' ||
      e.key === 'Delete' ||
      e.ctrlKey ||
      e.metaKey
    ) {
      return;
    }

    // Reject non-numeric keystrokes immediately
    if (e.key.length === 1 && !/^[0-9]$/.test(e.key)) {
      e.preventDefault();
      setInlineWarning('PIN must contain numbers only.');
      setTimeout(() => setInlineWarning(null), 2500);
      return;
    }

    // Reject 5th digit keystroke if already at length 4 and text is not selected
    if (
      e.key.length === 1 &&
      /^[0-9]$/.test(e.key) &&
      value.length >= 4 &&
      e.currentTarget.selectionStart === e.currentTarget.selectionEnd
    ) {
      e.preventDefault();
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    const { value: sanitized, rejectedInvalidChars } = sanitizePinInput(raw);

    if (rejectedInvalidChars) {
      setInlineWarning('PIN must contain numbers only.');
      setTimeout(() => setInlineWarning(null), 2500);
    } else if (inlineWarning) {
      setInlineWarning(null);
    }

    onChange(sanitized);

    if (sanitized.length === 4 && onComplete) {
      onComplete(sanitized);
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text');
    const { value: sanitized, rejectedInvalidChars } = sanitizePinInput(pasted);

    if (rejectedInvalidChars) {
      setInlineWarning('PIN must contain numbers only.');
      setTimeout(() => setInlineWarning(null), 2500);
    }

    onChange(sanitized);

    if (sanitized.length === 4 && onComplete) {
      onComplete(sanitized);
    }
  };

  const activeError = error || inlineWarning;

  return (
    <div className={`space-y-1.5 ${className}`}>
      {(label || sublabel) && (
        <div className="flex items-center justify-between">
          {label && (
            <label htmlFor={id} className="block text-xs font-semibold text-slate-700">
              {label}
            </label>
          )}
          {sublabel && (
            <span className="text-[10px] text-slate-400 font-medium">{sublabel}</span>
          )}
        </div>
      )}

      <div className="relative flex items-center">
        <Lock className="absolute left-3.5 w-4 h-4 text-slate-400 pointer-events-none" />

        <input
          id={id}
          type={showPin ? 'text' : 'password'}
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete="one-time-code"
          maxLength={4}
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          placeholder={placeholder}
          autoFocus={autoFocus}
          disabled={disabled}
          required={required}
          className={`w-full h-12 pl-10 ${showToggle ? 'pr-10' : 'pr-3'} bg-slate-50 border ${
            activeError
              ? 'border-rose-400 focus:border-rose-600 bg-rose-50/20'
              : value.length === 4
              ? 'border-indigo-500 focus:border-indigo-600'
              : 'border-slate-200 focus:border-indigo-600'
          } rounded-xl text-base md:text-sm text-slate-900 font-mono tracking-widest focus:bg-white focus:outline-none transition-colors font-semibold ${
            centerText ? 'text-center' : ''
          } disabled:opacity-60 disabled:cursor-not-allowed`}
        />

        {showToggle && (
          <button
            type="button"
            onClick={() => setShowPin(!showPin)}
            disabled={disabled}
            tabIndex={-1}
            className="absolute right-3 p-1 text-slate-400 hover:text-slate-600 transition-colors focus:outline-none"
            aria-label={showPin ? 'Hide PIN' : 'Show PIN'}
          >
            {showPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        )}
      </div>

      {/* 4-Dot Completeness Indicator */}
      {showDotsIndicator && (
        <div className="flex items-center justify-center gap-2 pt-0.5">
          {[0, 1, 2, 3].map((idx) => {
            const isFilled = value.length > idx;
            const isComplete = value.length === 4;
            return (
              <div
                key={idx}
                className={`h-2 rounded-full transition-all duration-200 ${
                  isFilled
                    ? isComplete
                      ? 'w-4 bg-emerald-500 shadow-xs shadow-emerald-300'
                      : 'w-3.5 bg-indigo-600'
                    : 'w-2 bg-slate-200'
                }`}
              />
            );
          })}
        </div>
      )}

      {/* Inline Warning / Error / Helper */}
      {activeError ? (
        <p className="text-[11px] text-rose-600 flex items-center gap-1 font-medium animate-in fade-in">
          <AlertCircle className="w-3 h-3 shrink-0" />
          <span>{activeError}</span>
        </p>
      ) : helperText ? (
        <p className="text-[10px] text-slate-500 leading-normal">{helperText}</p>
      ) : null}
    </div>
  );
};
