import React, { useState } from 'react';
import { Check, MessageSquare, Copy, CheckCircle2, RotateCcw, ArrowRight, Zap, Sparkles, AlertCircle } from 'lucide-react';
import confetti from 'canvas-confetti';
import { useInView } from '../../lib/hooks/useInView';

type DemoStep = 'create' | 'calculated' | 'a_settled' | 'all_settled';

export const SettlementSection: React.FC = () => {
  const { ref, inView } = useInView({ threshold: 0.1 });
  
  // Interactive story states
  const [step, setStep] = useState<DemoStep>('create');
  const [roommateCount, setRoommateCount] = useState<number>(4);
  const [showReminder, setShowReminder] = useState<boolean>(false);
  const [copiedReminder, setCopiedReminder] = useState<boolean>(false);

  const totalBill = 1200;
  const eachShare = Math.round(totalBill / roommateCount);

  const handleSplit = () => {
    setStep('calculated');
    setShowReminder(false);
  };

  const handlePayPartial = () => {
    setStep('a_settled');
  };

  const handleCopyNudge = () => {
    setCopiedReminder(true);
    setTimeout(() => setCopiedReminder(false), 2500);
  };

  const handleSettleAll = () => {
    setStep('all_settled');
    // Elegant, localized confetti burst (NOT screen explosion)
    try {
      confetti({
        particleCount: 40,
        spread: 55,
        origin: { y: 0.7 },
        colors: ['#0C6B70', '#10B981', '#F59E0B', '#E0F2F0'],
      });
    } catch {
      // Fallback silently if canvas-confetti fails in headless or non-canvas environment
    }
  };

  const handleReset = () => {
    setStep('create');
    setShowReminder(false);
    setCopiedReminder(false);
  };

  return (
    <section ref={ref} className="py-20 md:py-24 bg-brand-surface/50 border-b border-brand-border overflow-hidden" data-purpose="feature-settlement" id="settlement-demo">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Section Header */}
        <div className={`text-center max-w-3xl mx-auto mb-14 transition-all duration-700 ${inView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'}`}>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-brand-soft border border-brand-border text-brand text-xs font-bold uppercase tracking-wider mb-4">
            <Zap className="w-3.5 h-3.5" />
            <span>Interactive Settlement Story</span>
          </div>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-extrabold tracking-tight text-brand-charcoal mb-4">
            The power of continuous balance tracking
          </h2>
          <p className="text-brand-slate text-base sm:text-lg">
            See why RoomMate is different from simple bill-splitters: when someone pays partially, the exact remainder is preserved until settled.
          </p>
          <div className="inline-flex items-center gap-1.5 mt-3 text-xs font-semibold text-brand-slate bg-white px-3 py-1 rounded-full border border-brand-border shadow-fin-sm">
            <AlertCircle className="w-3.5 h-3.5 text-amber-500" />
            <span>Interactive accounting demo • No real payments charged</span>
          </div>
        </div>

        {/* Interactive Story Board */}
        <div className="max-w-4xl mx-auto bg-white rounded-3xl p-6 sm:p-10 border-2 border-brand/30 shadow-fin-card">
          
          {/* Top Progress Tracker */}
          <div className="flex items-center justify-between pb-6 mb-6 border-b border-brand-border flex-wrap gap-3">
            <div className="flex items-center gap-2">
              <span className="w-8 h-8 rounded-xl bg-brand text-white flex items-center justify-center font-bold text-xs">
                ⚡
              </span>
              <div>
                <h3 className="text-sm font-bold text-brand-charcoal">Electricity Bill Settlement</h3>
                <span className="text-xs text-brand-slate">Flat 402 • Total ₹1,200</span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-brand-slate">Demo Stage:</span>
              <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-brand-soft text-brand border border-brand-border">
                {step === 'create' && '1. Setup Expense'}
                {step === 'calculated' && '2. Shared Ledger & Partial Debt'}
                {step === 'a_settled' && '3. Remainder & WhatsApp Nudge'}
                {step === 'all_settled' && '4. Zero-Drift Completion'}
              </span>
              {step !== 'create' && (
                <button
                  onClick={handleReset}
                  type="button"
                  className="inline-flex items-center gap-1 text-xs text-brand-slate hover:text-brand px-2 py-1 rounded hover:bg-brand-surface cursor-pointer transition-colors"
                  title="Reset demo"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Reset</span>
                </button>
              )}
            </div>
          </div>

          {/* STEP 1: CREATE EXPENSE */}
          {step === 'create' && (
            <div className="space-y-6 animate-fade-up">
              <div className="text-center sm:text-left">
                <span className="text-xs font-bold uppercase tracking-wider text-brand">Let's settle a shared expense</span>
                <h4 className="text-xl font-bold text-brand-charcoal mt-1">What was the expense?</h4>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="p-4 rounded-2xl bg-brand-surface border border-brand-border">
                  <span className="text-xs text-brand-slate font-medium block">Expense Category</span>
                  <div className="text-base font-bold text-brand-charcoal mt-1 flex items-center gap-1.5">
                    <span>⚡ Electricity Bill</span>
                  </div>
                  <span className="text-xs text-brand-slate mt-0.5 block">BESCOM Monthly Meter</span>
                </div>

                <div className="p-4 rounded-2xl bg-brand-surface border border-brand-border">
                  <span className="text-xs text-brand-slate font-medium block">Total Amount</span>
                  <div className="text-2xl font-extrabold text-brand-charcoal mt-1 font-tabular">₹1,200</div>
                  <span className="text-xs text-emerald-700 font-semibold mt-0.5 block">Paid in full by Rajdeep ✓</span>
                </div>

                <div className="p-4 rounded-2xl bg-brand-surface border border-brand-border">
                  <span className="text-xs text-brand-slate font-medium block">Roommates Sharing</span>
                  <div className="flex items-center gap-3 mt-1.5">
                    <button
                      type="button"
                      disabled={roommateCount <= 2}
                      onClick={() => setRoommateCount(prev => Math.max(2, prev - 1))}
                      className="w-8 h-8 rounded-lg bg-white border border-brand-border hover:bg-brand-soft text-brand font-bold text-sm disabled:opacity-40 cursor-pointer"
                    >
                      −
                    </button>
                    <span className="text-xl font-extrabold text-brand-charcoal font-tabular">{roommateCount}</span>
                    <button
                      type="button"
                      disabled={roommateCount >= 6}
                      onClick={() => setRoommateCount(prev => Math.min(6, prev + 1))}
                      className="w-8 h-8 rounded-lg bg-white border border-brand-border hover:bg-brand-soft text-brand font-bold text-sm disabled:opacity-40 cursor-pointer"
                    >
                      +
                    </button>
                    <span className="text-xs text-brand-slate font-medium">roommates</span>
                  </div>
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-emerald-50/70 border border-emerald-200 text-xs text-emerald-900 flex items-center justify-between">
                <span>Rajdeep pays the entire ₹1,200 upfront for the flat.</span>
                <span className="font-bold font-tabular">Each share: ₹{eachShare}</span>
              </div>

              <button
                onClick={handleSplit}
                type="button"
                className="w-full py-4 rounded-2xl bg-brand hover:bg-brand-dark text-white font-bold text-base transition-all shadow-fin-card hover:shadow-fin-card-hover flex items-center justify-center gap-2 cursor-pointer active:scale-98"
              >
                <span>Split Expense (Calculate Shares)</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* STEP 2: CALCULATED SHARES & PARTIAL DEBT HIGHLIGHT */}
          {step === 'calculated' && (
            <div className="space-y-6 animate-fade-up">
              {/* Formula Callout */}
              <div className="p-4 rounded-2xl bg-brand-soft border border-brand-border flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="text-xl">🧮</div>
                  <div>
                    <div className="text-sm font-bold text-brand-charcoal font-tabular">
                      ₹1,200 ÷ {roommateCount} roommates = ₹{eachShare} each
                    </div>
                    <p className="text-xs text-brand-slate">
                      Rajdeep paid ₹1,200 → <strong>Rajdeep is owed ₹{totalBill - eachShare}</strong>
                    </p>
                  </div>
                </div>
                <span className="text-xs font-bold text-emerald-800 bg-emerald-100/80 px-3 py-1 rounded-full border border-emerald-300 self-start sm:self-auto font-tabular">
                  Rajdeep receives ₹{totalBill - eachShare}
                </span>
              </div>

              {/* The Core Product Concept Callout */}
              <div className="p-4 rounded-2xl bg-amber-50/80 border border-amber-200">
                <div className="flex items-start gap-2.5">
                  <span className="text-lg">💡</span>
                  <div>
                    <h5 className="text-xs font-bold uppercase tracking-wider text-amber-900">
                      The Key RoomMate Concept: Partial Payments
                    </h5>
                    <p className="text-xs text-amber-800 mt-0.5 leading-relaxed">
                      Roommate <strong>Aarav only paid ₹295</strong> (perhaps short on cash). Traditional apps mark Aarav as completely unpaid. In RoomMate, <strong>Aarav owes exactly ₹5</strong>!
                    </p>
                  </div>
                </div>
              </div>

              {/* Household Ledger Table */}
              <div className="border border-brand-border rounded-2xl overflow-hidden shadow-fin-sm">
                <div className="grid grid-cols-4 bg-brand-surface px-4 py-2.5 text-xs font-bold text-brand-slate uppercase tracking-wider border-b border-brand-border">
                  <span>Member</span>
                  <span>Share</span>
                  <span>Paid</span>
                  <span className="text-right">Ledger Status</span>
                </div>

                {/* Rajdeep */}
                <div className="grid grid-cols-4 px-4 py-3 text-xs items-center border-b border-brand-border bg-emerald-50/40">
                  <span className="font-bold text-emerald-950 flex items-center gap-1.5">
                    <span className="w-5 h-5 rounded-full bg-emerald-600 text-white flex items-center justify-center text-[10px] font-bold">R</span>
                    <span>Rajdeep</span>
                  </span>
                  <span className="font-tabular font-semibold text-brand-charcoal">₹{eachShare}</span>
                  <span className="font-tabular font-bold text-emerald-800">₹1,200</span>
                  <span className="font-tabular font-bold text-emerald-700 text-right">
                    Receives ₹{totalBill - eachShare}
                  </span>
                </div>

                {/* Aarav (Paid ₹295 -> Owes ₹5) */}
                <div className="grid grid-cols-4 px-4 py-3 text-xs items-center border-b border-brand-border bg-amber-50/40">
                  <span className="font-bold text-brand-charcoal flex items-center gap-1.5">
                    <span className="w-5 h-5 rounded-full bg-amber-500 text-white flex items-center justify-center text-[10px] font-bold">A</span>
                    <span>Aarav</span>
                  </span>
                  <span className="font-tabular font-semibold text-brand-charcoal">₹{eachShare}</span>
                  <span className="font-tabular font-medium text-amber-900">₹295</span>
                  <span className="font-tabular font-extrabold text-amber-700 text-right">
                    Owes ₹5
                  </span>
                </div>

                {/* Binod */}
                <div className="grid grid-cols-4 px-4 py-3 text-xs items-center border-b border-brand-border">
                  <span className="font-medium text-brand-charcoal flex items-center gap-1.5">
                    <span className="w-5 h-5 rounded-full bg-brand-surface text-brand-slate border border-brand-border flex items-center justify-center text-[10px] font-bold">B</span>
                    <span>Binod</span>
                  </span>
                  <span className="font-tabular text-brand-slate">₹{eachShare}</span>
                  <span className="font-tabular text-brand-slate">₹0</span>
                  <span className="font-tabular font-bold text-rose-600 text-right">
                    Owes ₹{eachShare}
                  </span>
                </div>

                {/* Chirag */}
                <div className="grid grid-cols-4 px-4 py-3 text-xs items-center">
                  <span className="font-medium text-brand-charcoal flex items-center gap-1.5">
                    <span className="w-5 h-5 rounded-full bg-brand-surface text-brand-slate border border-brand-border flex items-center justify-center text-[10px] font-bold">C</span>
                    <span>Chirag</span>
                  </span>
                  <span className="font-tabular text-brand-slate">₹{eachShare}</span>
                  <span className="font-tabular text-brand-slate">₹0</span>
                  <span className="font-tabular font-bold text-rose-600 text-right">
                    Owes ₹{eachShare}
                  </span>
                </div>
              </div>

              {/* Action Button: Simulate Aarav paying ₹5 */}
              <div className="p-4 rounded-2xl bg-brand-surface border border-brand-border flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-bold text-brand-charcoal">Next Action in Story</div>
                  <p className="text-xs text-brand-slate">Aarav transfers the remaining ₹5 via UPI.</p>
                </div>
                <button
                  onClick={handlePayPartial}
                  type="button"
                  className="px-5 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs shadow-sm transition-all flex items-center justify-center gap-1.5 cursor-pointer active:scale-95"
                >
                  <span>Simulate: Aarav pays ₹5 →</span>
                </button>
              </div>
            </div>
          )}

          {/* STEP 3 & 4: AARAV SETTLED + CONTINUOUS OUTSTANDING STATUS */}
          {step === 'a_settled' && (
            <div className="space-y-6 animate-fade-up">
              {/* Success Banner for Aarav */}
              <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center justify-between text-xs">
                <div className="flex items-center gap-2 text-emerald-900 font-bold">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                  <span>Aarav paid ₹5 → Outstanding: ₹0 (✓ Fully Settled!)</span>
                </div>
                <span className="px-2 py-0.5 rounded-full bg-emerald-200 text-emerald-950 font-mono font-bold">
                  Settled
                </span>
              </div>

              {/* Outstanding Balances Box */}
              <div className="p-5 rounded-2xl bg-white border border-brand-border shadow-fin-sm">
                <div className="flex items-center justify-between mb-4">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-brand-slate">
                    Continuous Ledger Status
                  </h4>
                  <span className="text-xs font-bold text-emerald-800 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200 font-tabular">
                    Rajdeep to receive: ₹600 more
                  </span>
                </div>

                <div className="space-y-2.5">
                  <div className="flex items-center justify-between p-3 rounded-xl bg-emerald-50/60 border border-emerald-100 text-xs">
                    <span className="font-semibold text-emerald-950">Aarav</span>
                    <span className="font-bold text-emerald-700">✓ Settled (₹0 owed)</span>
                  </div>

                  <div className="flex items-center justify-between p-3 rounded-xl bg-brand-surface border border-brand-border text-xs">
                    <span className="font-semibold text-brand-charcoal">Binod</span>
                    <div className="flex items-center gap-3">
                      <span className="font-bold text-rose-600 font-tabular">₹300 pending</span>
                      <button
                        onClick={() => setShowReminder(true)}
                        type="button"
                        className="px-2.5 py-1 rounded-lg bg-white border border-brand-border text-brand hover:bg-brand-soft text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                      >
                        <MessageSquare className="w-3 h-3" />
                        <span>Send Reminder</span>
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center justify-between p-3 rounded-xl bg-brand-surface border border-brand-border text-xs">
                    <span className="font-semibold text-brand-charcoal">Chirag</span>
                    <div className="flex items-center gap-3">
                      <span className="font-bold text-rose-600 font-tabular">₹300 pending</span>
                      <button
                        onClick={() => setShowReminder(true)}
                        type="button"
                        className="px-2.5 py-1 rounded-lg bg-white border border-brand-border text-brand hover:bg-brand-soft text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                      >
                        <MessageSquare className="w-3 h-3" />
                        <span>Send Reminder</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* WhatsApp Nudge Preview (When Triggered) */}
              {showReminder && (
                <div className="p-4 rounded-2xl bg-emerald-50/50 border border-emerald-200 animate-fade-up">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-900">
                      <MessageSquare className="w-4 h-4 text-emerald-700" />
                      <span>WhatsApp Nudge Preview</span>
                    </div>
                    <span className="text-[10px] text-emerald-800">Auto-populated with exact remaining debt</span>
                  </div>

                  <div className="bg-white p-3.5 rounded-xl border border-emerald-200 font-mono text-xs text-brand-charcoal mb-3">
                    "Hey! 🤝 ₹300 from the electricity bill is still pending. Settle in 1 tap: upi://pay?pa=rajdeep@okhdfcbank&amp;am=300"
                  </div>

                  <div className="flex items-center justify-between">
                    <button
                      onClick={handleCopyNudge}
                      type="button"
                      className="px-3 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer"
                    >
                      {copiedReminder ? (
                        <>
                          <Check className="w-3.5 h-3.5" />
                          <span>✓ Reminder copied</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>Copy Nudge</span>
                        </>
                      )}
                    </button>
                    <span className="text-[11px] text-brand-slate">Zero awkwardness for roommates</span>
                  </div>
                </div>
              )}

              {/* Completion Action */}
              <div className="pt-2">
                <button
                  onClick={handleSettleAll}
                  type="button"
                  className="w-full py-3.5 rounded-2xl bg-brand hover:bg-brand-dark text-white font-bold text-sm transition-all shadow-fin-sm flex items-center justify-center gap-2 cursor-pointer active:scale-98"
                >
                  <Sparkles className="w-4 h-4" />
                  <span>Settle Remaining Flatmates (Binod &amp; Chirag)</span>
                </button>
              </div>
            </div>
          )}

          {/* STEP 5: HOUSEHOLD SETTLED COMPLETION */}
          {step === 'all_settled' && (
            <div className="text-center py-6 space-y-5 animate-scale-pop">
              <div className="w-16 h-16 rounded-3xl bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto text-2xl font-bold">
                🎉
              </div>

              <div>
                <h4 className="text-2xl font-extrabold text-brand-charcoal">Household Settled!</h4>
                <p className="text-sm text-brand-slate mt-1">
                  ₹1,200 Electricity Bill • 4 Roommates • <span className="font-bold text-emerald-700">₹0 outstanding</span>
                </p>
              </div>

              <div className="max-w-md mx-auto p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-950 font-medium leading-relaxed">
                Total debits exactly match total credits. Zero fractional paisa lost, zero awkward conversations, and personal budgets remain completely confidential.
              </div>

              <div className="pt-3 flex flex-col sm:flex-row items-center justify-center gap-3">
                <button
                  onClick={handleReset}
                  type="button"
                  className="px-6 py-2.5 rounded-full bg-white border border-brand-border text-brand-charcoal text-xs font-bold hover:bg-brand-soft transition-colors cursor-pointer"
                >
                  Replay Interactive Story
                </button>
                <a
                  href="#personal-vault"
                  className="px-6 py-2.5 rounded-full bg-brand text-white text-xs font-bold hover:bg-brand-dark transition-colors cursor-pointer"
                >
                  Explore Personal Vault
                </a>
              </div>
            </div>
          )}

        </div>
      </div>
    </section>
  );
};
