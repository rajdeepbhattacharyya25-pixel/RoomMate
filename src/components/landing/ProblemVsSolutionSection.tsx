import React from 'react';
import { X, Check, AlertCircle, ShieldCheck } from 'lucide-react';
import { useInView } from '../../lib/hooks/useInView';

export const ProblemVsSolutionSection: React.FC = () => {
  const { ref, inView } = useInView({ threshold: 0.15 });

  return (
    <section ref={ref} className="py-20 md:py-24 bg-white border-y border-brand-border overflow-hidden" data-purpose="comparison-section">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className={`text-center max-w-3xl mx-auto mb-14 transition-all duration-700 ${inView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'}`}>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-50 text-rose-700 border border-rose-200 text-xs font-bold uppercase tracking-wider mb-4">
            <AlertCircle className="w-3.5 h-3.5" />
            <span>The Roommate Dilemma</span>
          </div>
          <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-brand-charcoal mb-3">
            Why campus flatmates fight over money
          </h2>
          <p className="text-brand-slate text-base sm:text-lg">
            Messy WhatsApp group calculations, awkward reminders, and sharing bank statements that accidentally reveal your personal shopping.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-stretch">
          {/* Column 1: The WhatsApp & Excel Chaos */}
          <div
            className={`p-8 sm:p-10 rounded-3xl bg-brand-surface border border-rose-200/70 flex flex-col justify-between transition-all duration-700 delay-100 ${
              inView ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-8'
            }`}
          >
            <div>
              <div className="flex items-center gap-3 mb-6">
                <span className="w-8 h-8 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center font-bold text-xs">
                  <X className="w-4 h-4 stroke-[3]" />
                </span>
                <div>
                  <h3 className="text-base font-bold text-brand-charcoal uppercase tracking-wide">
                    The Chat &amp; Spreadsheet Chaos
                  </h3>
                  <span className="text-xs text-rose-600 font-medium">How most students struggle today</span>
                </div>
              </div>
              <ul className="space-y-4 text-sm text-brand-slate">
                <li className="flex items-start gap-3">
                  <span className="text-rose-500 font-bold shrink-0 mt-0.5">•</span>
                  <span><strong>"Who paid what?"</strong> lost in 500 WhatsApp memes, leading to uncomfortable roommate confrontations.</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-rose-500 font-bold shrink-0 mt-0.5">•</span>
                  <span><strong>Partial payments vanish:</strong> if someone pays ₹295 on a ₹300 bill, standard apps either mark it fully unpaid or lose the ₹5 remainder.</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-rose-500 font-bold shrink-0 mt-0.5">•</span>
                  <span><strong>Zero personal privacy:</strong> sharing UPI screenshots or bank export PDFs accidentally exposes your personal food and shopping.</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-rose-500 font-bold shrink-0 mt-0.5">•</span>
                  <span><strong>Rounding errors:</strong> splitting ₹1,000 among 3 creates ₹333.33 with paisa drift accumulating over semesters.</span>
                </li>
              </ul>
            </div>
            <div className="mt-8 pt-5 border-t border-rose-100 text-xs text-rose-700 font-semibold flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-rose-500" />
              <span>Result: Forgotten debts, financial friction, and lost money.</span>
            </div>
          </div>

          {/* Column 2: The RoomMate Standard */}
          <div
            className={`p-8 sm:p-10 rounded-3xl bg-white border-2 border-brand shadow-fin-card hover:shadow-fin-card-hover flex flex-col justify-between relative overflow-hidden transition-all duration-700 delay-200 ${
              inView ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-8'
            }`}
          >
            <div className="absolute top-0 right-0 bg-brand text-white text-[11px] font-bold px-4 py-1.5 rounded-bl-xl uppercase tracking-wider flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>The RoomMate Standard</span>
            </div>
            <div>
              <div className="flex items-center gap-3 mb-6">
                <span className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-xs">
                  <Check className="w-4 h-4 stroke-[3]" />
                </span>
                <div>
                  <h3 className="text-base font-bold text-brand-charcoal uppercase tracking-wide">
                    The Dual-Engine Solution
                  </h3>
                  <span className="text-xs text-emerald-700 font-medium">Continuous, automated precision</span>
                </div>
              </div>
              <ul className="space-y-4 text-sm text-brand-charcoal">
                <li className="flex items-start gap-3">
                  <span className="text-emerald-600 font-bold shrink-0 mt-0.5">✓</span>
                  <span><strong>Synchronized Room Ledger:</strong> 1 entry updates all roommates instantly. Everyone sees exactly who paid and who owes.</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-emerald-600 font-bold shrink-0 mt-0.5">✓</span>
                  <span><strong>Exact partial payment tracking:</strong> if flatmate pays ₹295 of ₹300, RoomMate precisely tracks the remaining ₹5 until settled.</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-emerald-600 font-bold shrink-0 mt-0.5">✓</span>
                  <span><strong>100% Private Personal Vault:</strong> your private dining, shopping, and habits stay on your device encrypted with AES-GCM-256.</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-emerald-600 font-bold shrink-0 mt-0.5">✓</span>
                  <span><strong>Deterministic Zero-Drift Math:</strong> integer-cent calculations guarantee total debits equal total credits to the exact rupee.</span>
                </li>
              </ul>
            </div>
            <div className="mt-8 pt-5 border-t border-brand-border text-xs text-brand font-bold flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>Zero arguments. Clear balances. Complete personal privacy.</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
