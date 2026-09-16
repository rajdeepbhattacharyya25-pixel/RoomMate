import React, { useState, useEffect, useRef } from 'react';
import {
  Camera,
  Upload,
  QrCode,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  ArrowRight,
  RefreshCw,
  FileImage,
  Clipboard,
} from 'lucide-react';
import { parseUpiQrString, ParsedUpiData } from '../../lib/payments/upiIntentService';
import { hapticImpact, hapticSuccess, hapticWarning, hapticSelection } from '../../lib/native/haptics';
import { MobileBottomSheet } from './MobileBottomSheet';

interface UpiQrScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onScanned: (data: ParsedUpiData) => void;
}

export const UpiQrScannerModal: React.FC<UpiQrScannerModalProps> = ({
  isOpen,
  onClose,
  onScanned,
}) => {
  const [activeMode, setActiveMode] = useState<'camera' | 'upload' | 'manual'>('camera');
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [scannedResult, setScannedResult] = useState<ParsedUpiData | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [manualInput, setManualInput] = useState('');
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const scanIntervalRef = useRef<number | null>(null);

  // Stop camera stream safely
  const stopCamera = () => {
    if (scanIntervalRef.current) {
      window.clearInterval(scanIntervalRef.current);
      scanIntervalRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  };

  // Start live camera stream
  const startCamera = async () => {
    setCameraError(null);
    stopCamera();

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setCameraError('Camera access not supported on this device/browser. Please upload an image instead.');
      setActiveMode('upload');
      return;
    }

    try {
      const constraints: MediaStreamConstraints = {
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setCameraActive(true);
        beginContinuousScanning();
      }
    } catch (err: unknown) {
      console.warn('Camera stream request failed:', err);
      setCameraError('Camera permission denied or camera in use. Switch to gallery upload.');
      setCameraActive(false);
    }
  };

  // Continuous frame analysis for QR code detection
  const beginContinuousScanning = () => {
    if (scanIntervalRef.current) {
      window.clearInterval(scanIntervalRef.current);
    }

    scanIntervalRef.current = window.setInterval(async () => {
      if (!videoRef.current || videoRef.current.readyState < 2 || scannedResult) {
        return;
      }

      // 1. Try native Web API BarcodeDetector (Chrome / Android WebView)
      if ('BarcodeDetector' in window) {
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const detector = new (window as any).BarcodeDetector({ formats: ['qr_code'] });
          const barcodes = await detector.detect(videoRef.current);
          if (barcodes && barcodes.length > 0) {
            const rawValue = barcodes[0].rawValue;
            handleDetectedCode(rawValue);
            return;
          }
        } catch {
          // Barcode detector frame drop, continue
        }
      }
    }, 450);
  };

  // Handle detected QR string from camera, image, or manual input
  const handleDetectedCode = async (rawCode: string) => {
    const parsed = parseUpiQrString(rawCode);
    if (parsed) {
      await hapticSuccess();
      setScannedResult(parsed);
      stopCamera();
    } else {
      await hapticWarning();
      setCameraError(`Recognized QR (${rawCode.slice(0, 30)}...), but could not find a valid UPI VPA.`);
    }
  };

  // Start or stop camera based on modal state and active tab
  useEffect(() => {
    if (isOpen && activeMode === 'camera' && !scannedResult) {
      startCamera();
    } else {
      stopCamera();
    }
    return () => {
      stopCamera();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, activeMode, scannedResult]);

  // Handle uploaded image file
  const handleFileSelected = async (file: File) => {
    setIsProcessing(true);
    setCameraError(null);

    const reader = new FileReader();
    reader.onload = async (e) => {
      const dataUrl = e.target?.result as string;
      setPreviewImage(dataUrl);

      try {
        const img = new Image();
        img.src = dataUrl;
        await img.decode();

        // Check using BarcodeDetector if available
        if ('BarcodeDetector' in window) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const detector = new (window as any).BarcodeDetector({ formats: ['qr_code'] });
          const barcodes = await detector.detect(img);
          if (barcodes && barcodes.length > 0) {
            handleDetectedCode(barcodes[0].rawValue);
            setIsProcessing(false);
            return;
          }
        }

        // Draw to canvas for manual URL/URI inspection or pattern detection
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0);
        }

        // If automatic detection wasn't supported by browser engine, allow user fallback
        setCameraError('Image loaded! If the QR code is not recognized automatically on this browser, enter or verify the UPI ID below.');
      } catch (err) {
        console.warn('Image processing error:', err);
        setCameraError('Unable to process the selected image. Please try another screenshot.');
      } finally {
        setIsProcessing(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleConfirmAndUse = () => {
    if (scannedResult) {
      hapticImpact('MEDIUM');
      onScanned(scannedResult);
      onClose();
    }
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualInput.trim()) return;
    const parsed = parseUpiQrString(manualInput);
    if (parsed) {
      hapticSuccess();
      setScannedResult(parsed);
    } else {
      hapticWarning();
      setCameraError('Invalid UPI ID or link. Expected format: name@bank or upi://pay?pa=...');
    }
  };

  const handlePasteClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setManualInput(text);
        const parsed = parseUpiQrString(text);
        if (parsed) {
          await hapticSuccess();
          setScannedResult(parsed);
        }
      }
    } catch {
      // Ignore clipboard error
    }
  };

  if (!isOpen) return null;

  return (
    <MobileBottomSheet
      isOpen={isOpen}
      onClose={() => {
        stopCamera();
        onClose();
      }}
      title="UPI QR Scanner & Hub"
      subtitle="Scan merchant or roommate QR code"
      icon={<QrCode className="w-4.5 h-4.5" />}
      maxHeight="92vh"
    >
      <div className="space-y-4 pb-4">

        {/* Mode Selector Tabs */}
        {!scannedResult && (
          <div className="flex p-1 bg-slate-100 rounded-xl">
            <button
              onClick={() => {
                hapticSelection();
                setActiveMode('camera');
              }}
              className={`flex-1 py-1.5 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
                activeMode === 'camera'
                  ? 'bg-white text-indigo-600 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Camera className="w-3.5 h-3.5" />
              <span>Live Camera</span>
            </button>
            <button
              onClick={() => {
                hapticSelection();
                setActiveMode('upload');
              }}
              className={`flex-1 py-1.5 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
                activeMode === 'upload'
                  ? 'bg-white text-indigo-600 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Upload className="w-3.5 h-3.5" />
              <span>Upload Image</span>
            </button>
            <button
              onClick={() => {
                hapticSelection();
                setActiveMode('manual');
              }}
              className={`flex-1 py-1.5 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
                activeMode === 'manual'
                  ? 'bg-white text-indigo-600 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Clipboard className="w-3.5 h-3.5" />
              <span>Paste UPI</span>
            </button>
          </div>
        )}

        {/* Scanned Result Card */}
        {scannedResult ? (
          <div className="space-y-4 animate-in fade-in zoom-in-95">
            <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-slate-900 space-y-3">
              <div className="flex items-center space-x-2 text-emerald-700">
                <CheckCircle2 className="w-5 h-5" />
                <span className="text-xs font-bold uppercase tracking-wider">UPI QR Detected!</span>
              </div>

              <div className="space-y-1 bg-white p-3 rounded-xl border border-emerald-100">
                <div className="text-[11px] text-slate-500 font-medium">Payee Name</div>
                <div className="text-sm font-bold text-slate-900">{scannedResult.name}</div>

                <div className="text-[11px] text-slate-500 font-medium pt-1">UPI VPA / ID</div>
                <div className="text-xs font-mono font-bold text-indigo-600 break-all">{scannedResult.vpa}</div>

                {scannedResult.amount !== undefined && (
                  <>
                    <div className="text-[11px] text-slate-500 font-medium pt-1">Requested Amount</div>
                    <div className="text-base font-extrabold text-emerald-700">₹{scannedResult.amount.toFixed(2)}</div>
                  </>
                )}

                {scannedResult.note && (
                  <>
                    <div className="text-[11px] text-slate-500 font-medium pt-1">Transaction Note</div>
                    <div className="text-xs text-slate-700 italic">"{scannedResult.note}"</div>
                  </>
                )}
              </div>
            </div>

            <div className="flex items-center space-x-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  hapticSelection();
                  setScannedResult(null);
                  if (activeMode === 'camera') startCamera();
                }}
                className="flex-1 py-3 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors active:scale-98"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Scan Another</span>
              </button>

              <button
                type="button"
                onClick={handleConfirmAndUse}
                className="flex-[2] py-3 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold flex items-center justify-center gap-2 shadow-md active:scale-98 transition-all"
              >
                <Sparkles className="w-4 h-4" />
                <span>Fill Payment Modal</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Camera Scanner View */}
            {activeMode === 'camera' && (
              <div className="space-y-3">
                <div className="relative w-full aspect-square bg-slate-900 rounded-2xl overflow-hidden flex items-center justify-center border-2 border-slate-800 shadow-inner">
                  <video
                    ref={videoRef}
                    playsInline
                    muted
                    className="w-full h-full object-cover"
                  />

                  {/* Viewfinder Target Overlay */}
                  <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                    <div className="w-56 h-56 border-2 border-indigo-400/80 rounded-2xl relative shadow-[0_0_0_9999px_rgba(0,0,0,0.4)]">
                      {/* Corner marks */}
                      <div className="absolute -top-1 -left-1 w-5 h-5 border-t-4 border-l-4 border-indigo-500 rounded-tl" />
                      <div className="absolute -top-1 -right-1 w-5 h-5 border-t-4 border-r-4 border-indigo-500 rounded-tr" />
                      <div className="absolute -bottom-1 -left-1 w-5 h-5 border-b-4 border-l-4 border-indigo-500 rounded-bl" />
                      <div className="absolute -bottom-1 -right-1 w-5 h-5 border-b-4 border-r-4 border-indigo-500 rounded-br" />

                      {/* Animated Laser Line */}
                      <div className="w-full h-0.5 bg-gradient-to-r from-transparent via-indigo-400 to-transparent animate-pulse absolute top-1/2 -translate-y-1/2 shadow-[0_0_8px_#6366F1]" />
                    </div>
                  </div>

                  {!cameraActive && (
                    <div className="absolute inset-0 bg-slate-900/90 flex flex-col items-center justify-center p-4 text-center space-y-2">
                      <Camera className="w-8 h-8 text-slate-400 animate-pulse" />
                      <p className="text-xs text-slate-300 font-medium">Starting camera...</p>
                    </div>
                  )}
                </div>

                <p className="text-[11px] text-center text-slate-500">
                  Align the QR code within the frame to scan automatically
                </p>
              </div>
            )}

            {/* Gallery Upload View */}
            {activeMode === 'upload' && (
              <div className="space-y-3">
                <input
                  type="file"
                  ref={fileInputRef}
                  accept="image/*"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleFileSelected(file);
                  }}
                  className="hidden"
                />

                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full aspect-video border-2 border-dashed border-slate-300 hover:border-indigo-500 rounded-2xl bg-slate-50 hover:bg-indigo-50/30 flex flex-col items-center justify-center p-6 text-center cursor-pointer transition-all active:scale-98"
                >
                  {previewImage ? (
                    <div className="space-y-2">
                      <img
                        src={previewImage}
                        alt="Uploaded QR"
                        className="max-h-28 mx-auto rounded-lg shadow-xs object-contain"
                      />
                      <p className="text-[11px] text-indigo-600 font-semibold">Tap to select a different screenshot</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="w-12 h-12 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center mx-auto shadow-xs">
                        <FileImage className="w-6 h-6" />
                      </div>
                      <div className="text-xs font-bold text-slate-800">
                        Upload QR Code Screenshot
                      </div>
                      <p className="text-[11px] text-slate-500 max-w-xs">
                        Select a payment QR screenshot from WhatsApp, GPay, or Gallery
                      </p>
                    </div>
                  )}
                </div>

                {isProcessing && (
                  <div className="flex items-center justify-center gap-2 text-xs text-indigo-600 font-semibold">
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Analyzing QR code image...</span>
                  </div>
                )}
              </div>
            )}

            {/* Manual Paste View */}
            {activeMode === 'manual' && (
              <form onSubmit={handleManualSubmit} className="space-y-3">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                      Enter UPI ID or Paste Intent URL
                    </label>
                    <button
                      type="button"
                      onClick={handlePasteClipboard}
                      className="text-[11px] text-indigo-600 hover:text-indigo-700 font-semibold flex items-center gap-1"
                    >
                      <Clipboard className="w-3 h-3" />
                      <span>Paste Clipboard</span>
                    </button>
                  </div>
                  <input
                    type="text"
                    value={manualInput}
                    onChange={(e) => setManualInput(e.target.value)}
                    placeholder="e.g. sneha@okaxis or upi://pay?pa=..."
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono text-slate-900 placeholder-slate-400 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                  />
                </div>

                <button
                  type="submit"
                  disabled={!manualInput.trim()}
                  className="w-full h-11 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-bold flex items-center justify-center gap-2 transition-all active:scale-98"
                >
                  <span>Verify & Use UPI ID</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </form>
            )}

            {/* Error Message */}
            {cameraError && (
              <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs flex items-start space-x-2 animate-in fade-in">
                <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div className="leading-relaxed">{cameraError}</div>
              </div>
            )}
          </>
        )}
      </div>
    </MobileBottomSheet>
  );
};
