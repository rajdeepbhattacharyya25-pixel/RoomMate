import React, { useState, useRef, useEffect } from 'react';
import {
  Camera,
  Upload,
  Cpu,
  Sparkles,
  AlertCircle,
  Loader2,
  X,
  ShieldCheck,
  RefreshCw,
} from 'lucide-react';
import { ParsedReceiptData } from '../../lib/ocr/receiptTextParser';
import { preprocessReceiptImage } from '../../lib/ocr/imagePreprocessor';
import { scanAndParseReceipt } from '../../lib/ocr/tesseractService';
import { parseReceiptWithGemini } from '../../lib/ocr/geminiVisionService';

export interface ReceiptCaptureModalProps {
  isOpen: boolean;
  onClose: () => void;
  roomId?: string;
  onScanComplete: (parsedData: ParsedReceiptData) => void;
}

export type ScanEngineMode = 'ON_DEVICE' | 'GEMINI_AI';

export const ReceiptCaptureModal: React.FC<ReceiptCaptureModalProps> = ({
  isOpen,
  onClose,
  roomId,
  onScanComplete,
}) => {
  const [engineMode, setEngineMode] = useState<ScanEngineMode>('ON_DEVICE');
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusMessage, setStatusMessage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  // Clean up object URLs on unmount or reset
  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  if (!isOpen) return null;

  const handleReset = () => {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }
    setIsProcessing(false);
    setProgress(0);
    setStatusMessage('');
    setError(null);
  };

  const handleClose = () => {
    handleReset();
    onClose();
  };

  const processImageFile = async (file: File) => {
    setError(null);
    setIsProcessing(true);
    setProgress(5);

    // Ephemeral preview
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);

    try {
      if (engineMode === 'GEMINI_AI') {
        setStatusMessage('Sending to Gemini Vision AI (Cloud)...');
        setProgress(25);

        try {
          const result = await parseReceiptWithGemini(file, roomId);
          setProgress(100);
          setStatusMessage('Receipt extracted successfully!');
          setTimeout(() => {
            handleClose();
            onScanComplete(result);
          }, 300);
          return;
        } catch (geminiErr: unknown) {
          const err = geminiErr as Error & { code?: string };
          console.warn('[ReceiptCapture] Gemini AI failed, falling back to on-device OCR:', err);
          setStatusMessage('Cloud AI unavailable. Falling back to On-Device OCR...');
          setProgress(30);
          // Fall through to on-device Tesseract OCR
        }
      }

      // On-Device Tesseract OCR Pipeline
      setStatusMessage('Enhancing contrast & resolution in Web Worker...');
      setProgress(20);
      const preprocessed = await preprocessReceiptImage(file);

      setStatusMessage('Running Tesseract WebAssembly engine...');
      setProgress(40);

      const result = await scanAndParseReceipt(preprocessed.processedBlob, (workerProg) => {
        const mapped = 40 + Math.round(workerProg.progress * 55);
        setProgress(Math.min(95, mapped));
        setStatusMessage(
          `Extracting text (${Math.round(workerProg.progress * 100)}%)...`
        );
      });

      setProgress(100);
      setStatusMessage('Receipt processed successfully!');
      setTimeout(() => {
        handleClose();
        onScanComplete(result.parsedData);
      }, 300);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to scan receipt image';
      setError(msg);
      setIsProcessing(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      void processImageFile(file);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
      <div className="glass-card max-w-md w-full p-6 border-indigo-500/30 space-y-5 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-[var(--border-subtle)]">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-indigo-600/20 border border-indigo-500/40 flex items-center justify-center text-indigo-400">
              <Camera className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Scan Receipt (OCR / AI)</h3>
              <p className="text-[11px] text-[var(--text-muted)]">
                Instant line-item bill breakdown & liability split
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            disabled={isProcessing}
            className="text-gray-400 hover:text-white p-1 rounded-md transition-colors disabled:opacity-50"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Engine Mode Selector */}
        {!isProcessing && (
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-[var(--text-muted)]">
              Scan Engine
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setEngineMode('ON_DEVICE')}
                className={`flex items-center gap-2 p-3 rounded-xl border text-left transition-all ${
                  engineMode === 'ON_DEVICE'
                    ? 'bg-indigo-950/70 border-indigo-500 text-white shadow-lg shadow-indigo-500/10'
                    : 'bg-slate-900/50 border-[var(--border-subtle)] text-[var(--text-muted)] hover:border-gray-600'
                }`}
              >
                <Cpu className={`w-4 h-4 shrink-0 ${engineMode === 'ON_DEVICE' ? 'text-indigo-400' : 'text-gray-400'}`} />
                <div>
                  <div className="text-xs font-bold leading-tight">On-Device OCR</div>
                  <div className="text-[10px] opacity-75">Tesseract Wasm • 100% Private</div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setEngineMode('GEMINI_AI')}
                className={`flex items-center gap-2 p-3 rounded-xl border text-left transition-all ${
                  engineMode === 'GEMINI_AI'
                    ? 'bg-indigo-950/70 border-indigo-500 text-white shadow-lg shadow-indigo-500/10'
                    : 'bg-slate-900/50 border-[var(--border-subtle)] text-[var(--text-muted)] hover:border-gray-600'
                }`}
              >
                <Sparkles className={`w-4 h-4 shrink-0 ${engineMode === 'GEMINI_AI' ? 'text-amber-400' : 'text-gray-400'}`} />
                <div>
                  <div className="text-xs font-bold leading-tight">Gemini Vision AI</div>
                  <div className="text-[10px] opacity-75">Deep OCR • Smart Itemizer</div>
                </div>
              </button>
            </div>
          </div>
        )}

        {/* Processing State */}
        {isProcessing && (
          <div className="py-6 px-4 rounded-xl bg-slate-950/80 border border-indigo-500/30 space-y-4 text-center">
            {previewUrl && (
              <div className="w-24 h-24 mx-auto rounded-lg overflow-hidden border border-indigo-500/30 relative">
                <img
                  src={previewUrl}
                  alt="Receipt Preview"
                  className="w-full h-full object-cover filter contrast-125"
                />
                <div className="absolute inset-0 bg-indigo-500/10 animate-pulse" />
              </div>
            )}

            <div className="flex items-center justify-center gap-2 text-indigo-400">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span className="text-sm font-semibold">{statusMessage}</span>
            </div>

            <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden border border-slate-700">
              <div
                className="bg-gradient-to-r from-indigo-500 to-emerald-400 h-2 rounded-full transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
            <div className="text-[11px] text-[var(--text-muted)]">
              {progress}% completed
            </div>
          </div>
        )}

        {/* Error Banner */}
        {error && (
          <div className="p-3 rounded-xl bg-red-950/50 border border-red-500/30 flex items-start gap-2.5 text-xs text-red-200">
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-semibold text-red-300">Scan Error</p>
              <p className="text-[11px] mt-0.5">{error}</p>
            </div>
            <button
              onClick={handleReset}
              className="text-red-300 hover:text-white p-1"
              title="Try Again"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Action Pickers (when idle) */}
        {!isProcessing && (
          <div className="space-y-3">
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handleFileChange}
              className="hidden"
            />
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={handleFileChange}
              className="hidden"
            />

            <button
              type="button"
              onClick={() => cameraInputRef.current?.click()}
              className="w-full py-3 px-4 rounded-xl font-semibold text-sm bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 text-white shadow-lg shadow-indigo-600/25 flex items-center justify-center gap-2 active:scale-[0.98] transition-all"
            >
              <Camera className="w-4 h-4" />
              <span>Take Photo of Receipt</span>
            </button>

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="w-full py-2.5 px-4 rounded-xl font-semibold text-xs bg-slate-900 hover:bg-slate-800 border border-[var(--border-subtle)] text-[var(--text-main)] flex items-center justify-center gap-2 active:scale-[0.98] transition-all"
            >
              <Upload className="w-3.5 h-3.5 text-gray-400" />
              <span>Upload from Gallery / File</span>
            </button>
          </div>
        )}

        {/* Zero-retention Privacy Notice */}
        <div className="pt-2 border-t border-[var(--border-subtle)] flex items-center gap-2 text-[10px] text-[var(--text-muted)]">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
          <span>
            <strong>Zero-retention Guarantee:</strong> Receipt images are processed in transient memory and immediately destroyed. Never uploaded to persistent storage.
          </span>
        </div>
      </div>
    </div>
  );
};
