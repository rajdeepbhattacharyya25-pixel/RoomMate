import React, { useState } from 'react';
import { Users, RefreshCw, Zap } from 'lucide-react';
import { useInView } from '../../lib/hooks/useInView';
import { useCountUp } from '../../lib/hooks/useCountUp';

export const SharedLedgerSection: React.FC = () => {
  const { ref, inView } = useInView({ threshold: 0.15 });
  const [flatmatesCount, setFlatmatesCount] = useState<number>(4);
  const totalBill = 1200;
  const rawEachShare = Math.round(totalBill / flatmatesCount);
  const animatedShare = useCountUp({ target: rawEachShare, duration: 400, startTrigger: inView });
  const rajdeepReceives = totalBill - rawEachShare;
  const kabirOwes = Math.max(0, rawEachShare - 200);

  return (
    <section ref={ref} className="py-20 md:py-24 bg-white border-y border-brand-border overflow-hidden" data-purpose="feature-shared-ledger" id="shared-ledger">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-16 items-center">
          
          {/* Simulation Interactive Card */}
          <div
            className={`lg:col-span-6 order-2 lg:order-1 transition-all duration-700 ${
              inView ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-8'
            }`}
          >
            <div className="bg-brand-surface rounded-3xl p-6 sm:p-8 border border-brand-border shadow-fin-card">
              
              {/* Ledger Header */}
              <div className="flex flex-wrap items-center justify-between gap-3 pb-4 mb-5 border-b border-brand-border">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="w-7 h-7 rounded-lg bg-amber-500/10 text-amber-600 flex items-center justify-center font-bold text-xs">
                      ⚡
                    </span>
                    <h3 className="text-sm font-bold text-brand-charcoal">Electricity Bill — BESCOM</h3>
                  </div>
                  <span className="text-xs text-brand-slate">Paid by Rajdeep • Flat 402 Room Ledger</span>
                </div>

                {/* Flatmate Counter selector pill */}
                <div className="inline-flex items-center bg-white border border-brand-border rounded-xl p-1 text-xs shadow-xs">
                  <span className="px-2 py-0.5 text-brand-slate font-medium">Flatmates:</span>
                  {[2, 3, 4, 5].map((count) => (
                    <button
                      key={count}
                      onClick={() => setFlatmatesCount(count)}
                      type="button"
                      className={`px-2.5 py-0.5 rounded-lg font-bold cursor-pointer transition-all ${
                        flatmatesCount === count
                          ? 'bg-brand text-white shadow-xs'
                          : 'text-brand-slate hover:text-brand hover:bg-brand-soft'
                      }`}
                    >
                      {count}
                    </button>
                  ))}
                </div>
              </div>

              {/* Calculation Metrics */}
              <div className="grid grid-cols-3 gap-3 mb-6 text-center">
                <div className="p-3 bg-white rounded-xl border border-brand-border shadow-fin-sm">
                  <span className="text-[11px] text-brand-slate font-semibold uppercase">Total Bill</span>
                  <div className="text-lg sm:text-xl font-extrabold text-brand-charcoal mt-0.5 font-tabular">
                    ₹{totalBill}
                  </div>
                  <span className="text-[10px] text-emerald-600 font-medium">Paid by Rajdeep</span>
                </div>

                <div className="p-3 bg-white rounded-xl border border-brand-border shadow-fin-sm">
                  <span className="text-[11px] text-brand-slate font-semibold uppercase">Split Mode</span>
                  <div className="text-lg sm:text-xl font-extrabold text-brand mt-0.5">Equally</div>
                  <span className="text-[10px] text-brand-slate font-medium">Zero-drift math</span>
                </div>

                <div className="p-3 bg-brand-soft rounded-xl border border-brand-border shadow-fin-sm">
                  <span className="text-[11px] text-brand font-bold uppercase">Each Flatmate</span>
                  <div className="text-lg sm:text-xl font-extrabold text-brand mt-0.5 font-tabular">
                    ₹{animatedShare}
                  </div>
                  <span className="text-[10px] text-brand font-semibold">Exact share</span>
                </div>
              </div>

              {/* Member row pills with Status Chips */}
              <div className="space-y-2.5">
                {/* Rajdeep (Payer) */}
                <div className="flex justify-between items-center p-3 rounded-xl bg-emerald-50/80 border border-emerald-200/80 text-xs">
                  <div className="flex items-center gap-2.5">
                    <div className="w-6 h-6 rounded-full bg-emerald-600 text-white flex items-center justify-center font-bold text-[10px]">
                      R
                    </div>
                    <span className="font-bold text-emerald-950">Rajdeep (Payer)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-200 text-emerald-900">
                      Paid In Full
                    </span>
                    <span className="font-bold text-emerald-800 font-tabular">+₹{rajdeepReceives} to receive</span>
                  </div>
                </div>

                {/* Aarav */}
                <div className="flex justify-between items-center p-3 rounded-xl bg-white border border-brand-border text-xs shadow-fin-sm">
                  <div className="flex items-center gap-2.5">
                    <div className="w-6 h-6 rounded-full bg-brand-surface text-brand-charcoal border border-brand-border flex items-center justify-center font-bold text-[10px]">
                      A
                    </div>
                    <span className="font-medium text-brand-charcoal">Aarav</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                      Pending
                    </span>
                    <span className="font-semibold text-brand-slate font-tabular">Owes ₹{rawEachShare}</span>
                  </div>
                </div>

                {/* Kabir (Partial Payment Demo) */}
                <div className="flex justify-between items-center p-3 rounded-xl bg-white border border-brand-border text-xs shadow-fin-sm">
                  <div className="flex items-center gap-2.5">
                    <div className="w-6 h-6 rounded-full bg-brand-surface text-brand-charcoal border border-brand-border flex items-center justify-center font-bold text-[10px]">
                      K
                    </div>
                    <span className="font-medium text-brand-charcoal">Kabir</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                      Part-Paid ₹200
                    </span>
                    <span className="font-semibold text-brand-slate font-tabular">Owes ₹{kabirOwes}</span>
                  </div>
                </div>

                {/* Rohan */}
                <div className="flex justify-between items-center p-3 rounded-xl bg-white border border-brand-border text-xs shadow-fin-sm">
                  <div className="flex items-center gap-2.5">
                    <div className="w-6 h-6 rounded-full bg-brand-surface text-brand-charcoal border border-brand-border flex items-center justify-center font-bold text-[10px]">
                      R
                    </div>
                    <span className="font-medium text-brand-charcoal">Rohan</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                      Settled
                    </span>
                    <span className="font-semibold text-brand-slate font-tabular">Paid ₹{rawEachShare}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Description Column */}
          <div
            className={`lg:col-span-6 order-1 lg:order-2 space-y-6 transition-all duration-700 delay-150 ${
              inView ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-8'
            }`}
          >
            <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-brand bg-brand-soft px-3.5 py-1 rounded-full border border-brand-border">
              <Users className="w-3.5 h-3.5" />
              <span>Step 02 — Shared Household Ledger</span>
            </span>
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-extrabold tracking-tight text-brand-charcoal leading-tight">
              Shared expenses stay synchronized with the flat.
            </h2>
            <p className="text-base sm:text-lg text-brand-slate leading-relaxed">
              When someone pays for the Wi-Fi, electricity, or groceries, log it once. RoomMate synchronizes everyone's balances immediately and maintains transparent debt tracking for the entire room.
            </p>
            
            <div className="space-y-3 pt-1">
              <div className="p-4 rounded-2xl bg-brand-surface border border-brand-border flex items-start gap-3">
                <RefreshCw className="w-5 h-5 text-brand shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-sm font-bold text-brand-charcoal">Live Supabase Sync</h4>
                  <p className="text-xs text-brand-slate mt-0.5 leading-relaxed">
                    Whenever an expense or settlement is recorded, all roommates receive instantaneous updates across devices.
                  </p>
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-brand-surface border border-brand-border flex items-start gap-3">
                <Zap className="w-5 h-5 text-brand shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-sm font-bold text-brand-charcoal">Continuous Partial Payment Tracking</h4>
                  <p className="text-xs text-brand-slate mt-0.5 leading-relaxed">
                    Whether a flatmate pays ₹100 today and ₹200 next week, RoomMate keeps the exact running ledger balance.
                  </p>
                </div>
              </div>
            </div>
          </div>

        </div>
      </div>
    </section>
  );
};
