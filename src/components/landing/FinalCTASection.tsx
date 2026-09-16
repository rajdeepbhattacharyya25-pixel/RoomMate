import React from 'react';
import { ArrowRight, Download, Smartphone, Sparkles } from 'lucide-react';
import { useInView } from '../../lib/hooks/useInView';

interface FinalCTASectionProps {
  onOpenMobilePreview: () => void;
  onDownloadApk: () => void;
}

export const FinalCTASection: React.FC<FinalCTASectionProps> = ({
  onOpenMobilePreview,
  onDownloadApk,
}) => {
  const { ref, inView } = useInView({ threshold: 0.15 });

  return (
    <section ref={ref} className="py-20 md:py-24 overflow-hidden" data-purpose="call-to-action" id="cta">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div
          className={`rounded-3xl sm:rounded-[36px] bg-brand-dark px-8 py-16 sm:p-20 text-center relative overflow-hidden shadow-fin-float transition-all duration-700 ${
            inView ? 'opacity-100 scale-100' : 'opacity-0 scale-95'
          }`}
        >
          {/* Ambient Glow Decorations */}
          <div
            aria-hidden="true"
            className="absolute -top-32 -left-32 w-80 h-80 bg-brand-mint/15 rounded-full blur-3xl pointer-events-none animate-float-slow"
          />
          <div
            aria-hidden="true"
            className="absolute -bottom-32 -right-32 w-80 h-80 bg-emerald-400/10 rounded-full blur-3xl pointer-events-none animate-float-reverse"
          />

          <div className="relative z-10 max-w-2xl mx-auto">
            {/* Official Emblem */}
            <div className="mb-5 flex justify-center">
              <img
                src="/logo.png"
                alt="RoomMate"
                className="w-16 h-16 rounded-2xl object-contain shadow-fin-glow border-2 border-white/20 bg-white/10 backdrop-blur-xs p-1 transform transition-transform hover:scale-105"
              />
            </div>

            <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-emerald-300 bg-white/10 px-3.5 py-1 rounded-full mb-6 border border-white/10">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Free for campus students • Zero ads</span>
            </span>
            <h2 className="text-3xl sm:text-5xl font-extrabold tracking-tight text-white mb-6">
              Stop spreadsheet headaches.<br />Start living peacefully.
            </h2>
            <p className="text-white/80 text-base sm:text-lg mb-10 font-normal leading-relaxed">
              Keep your personal spending private and your shared room expenses transparent. Experience the dual-engine financial companion built for campus life.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <button
                onClick={onOpenMobilePreview}
                type="button"
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2.5 px-8 py-4 rounded-full bg-white text-brand-dark hover:bg-brand-soft font-bold text-sm transition-all shadow-md group cursor-pointer active:scale-95"
              >
                <Smartphone className="w-4 h-4 text-brand-dark" />
                <span>Get Started (Open App)</span>
                <ArrowRight className="w-4 h-4 text-brand-dark transform transition-transform group-hover:translate-x-1" />
              </button>

              <button
                onClick={onDownloadApk}
                type="button"
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-8 py-4 rounded-full bg-transparent text-white hover:bg-white/10 font-semibold text-sm border border-white/25 transition-all cursor-pointer active:scale-95"
              >
                <Download className="w-4 h-4" />
                <span>Download Android APK</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
