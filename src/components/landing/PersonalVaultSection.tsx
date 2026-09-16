import React from 'react';
import { Lock, Check, EyeOff } from 'lucide-react';
import { useInView } from '../../lib/hooks/useInView';
import { useCountUp } from '../../lib/hooks/useCountUp';

export const PersonalVaultSection: React.FC = () => {
  const { ref, inView } = useInView({ threshold: 0.15 });
  const vaultTotal = useCountUp({ target: 2690, duration: 800, startTrigger: inView });

  return (
    <section ref={ref} className="py-20 md:py-24 overflow-hidden" data-purpose="feature-personal-vault" id="personal-vault">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-16 items-center">
          {/* Text Info Column */}
          <div
            className={`lg:col-span-6 space-y-6 transition-all duration-700 ${
              inView ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-8'
            }`}
          >
            <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-brand bg-brand-soft px-3.5 py-1 rounded-full border border-brand-border">
              <Lock className="w-3.5 h-3.5" />
              <span>Step 01 — Personal Vault</span>
            </span>
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-extrabold tracking-tight text-brand-charcoal leading-tight">
              Your private money stays private.
            </h2>
            <p className="text-base sm:text-lg text-brand-slate leading-relaxed">
              Track your daily personal living expenses with zero roommate visibility. Personal food deliveries, clothes, stationery, and subscriptions stay on your device inside an encrypted local vault.
            </p>
            <ul className="space-y-4 pt-2">
              <li className="flex items-start gap-3">
                <div className="w-5 h-5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 flex items-center justify-center mt-1 shrink-0">
                  <Check className="w-3.5 h-3.5 stroke-[3]" />
                </div>
                <span className="text-sm sm:text-base text-brand-charcoal font-medium">
                  <strong>Zero roommate access:</strong> private expenses are never uploaded to group room ledgers.
                </span>
              </li>
              <li className="flex items-start gap-3">
                <div className="w-5 h-5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 flex items-center justify-center mt-1 shrink-0">
                  <Check className="w-3.5 h-3.5 stroke-[3]" />
                </div>
                <span className="text-sm sm:text-base text-brand-charcoal font-medium">
                  <strong>Biometric protection:</strong> unlock with FaceID or Fingerprint on supported devices.
                </span>
              </li>
              <li className="flex items-start gap-3">
                <div className="w-5 h-5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 flex items-center justify-center mt-1 shrink-0">
                  <Check className="w-3.5 h-3.5 stroke-[3]" />
                </div>
                <span className="text-sm sm:text-base text-brand-charcoal font-medium">
                  <strong>Monthly budget pacing:</strong> stay alert before exhausting your monthly student pocket money.
                </span>
              </li>
            </ul>
          </div>

          {/* UI Card Mockup Column */}
          <div
            className={`lg:col-span-6 transition-all duration-700 delay-150 ${
              inView ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-8'
            }`}
          >
            <div className="bg-white rounded-3xl p-6 sm:p-8 border border-brand-border shadow-fin-card relative">
              <div className="flex items-center justify-between pb-5 mb-5 border-b border-brand-border">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs uppercase font-bold text-brand-slate">Personal Vault Spend</span>
                    <Lock className="w-3.5 h-3.5 text-emerald-600" />
                  </div>
                  <div className="text-3xl font-extrabold text-brand-charcoal mt-1 tracking-tight font-tabular">
                    ₹{vaultTotal.toLocaleString('en-IN')}
                  </div>
                </div>
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
                  <EyeOff className="w-3 h-3" />
                  <span>Hidden from Flatmates</span>
                </div>
              </div>

              {/* Categorized spending items matching hero */}
              <div className="space-y-3">
                <div className="flex justify-between items-center p-3.5 rounded-xl bg-brand-surface border border-brand-border/60 hover:border-brand/40 transition-colors">
                  <div className="flex items-center gap-3">
                    <span className="text-xl">🍔</span>
                    <div>
                      <div className="text-sm font-semibold text-brand-charcoal">Food &amp; Dining</div>
                      <div className="text-xs text-brand-slate">Swiggy &amp; Mess dinner</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-sm font-bold text-brand-charcoal font-tabular">₹1,240</span>
                    <span className="text-[10px] text-emerald-600 font-semibold block">🔒 Private</span>
                  </div>
                </div>

                <div className="flex justify-between items-center p-3.5 rounded-xl bg-brand-surface border border-brand-border/60 hover:border-brand/40 transition-colors">
                  <div className="flex items-center gap-3">
                    <span className="text-xl">🛍️</span>
                    <div>
                      <div className="text-sm font-semibold text-brand-charcoal">Personal Shopping</div>
                      <div className="text-xs text-brand-slate">College notebooks &amp; clothes</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-sm font-bold text-brand-charcoal font-tabular">₹850</span>
                    <span className="text-[10px] text-emerald-600 font-semibold block">🔒 Private</span>
                  </div>
                </div>

                <div className="flex justify-between items-center p-3.5 rounded-xl bg-brand-surface border border-brand-border/60 hover:border-brand/40 transition-colors">
                  <div className="flex items-center gap-3">
                    <span className="text-xl">🚇</span>
                    <div>
                      <div className="text-sm font-semibold text-brand-charcoal">Commute &amp; Metro</div>
                      <div className="text-xs text-brand-slate">Smartcard auto-topup</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-sm font-bold text-brand-charcoal font-tabular">₹600</span>
                    <span className="text-[10px] text-emerald-600 font-semibold block">🔒 Private</span>
                  </div>
                </div>
              </div>

              {/* Bottom Budget Burn-down Bar with Smooth Width Transition */}
              <div className="mt-6 pt-4 border-t border-brand-border">
                <div className="flex items-center justify-between text-xs font-semibold mb-2">
                  <span className="text-brand-slate">Monthly Budget Spent (33.6%)</span>
                  <span className="text-brand font-bold font-tabular">₹2,690 / ₹8,000</span>
                </div>
                <div className="w-full h-2.5 bg-brand-surface rounded-full overflow-hidden border border-brand-border/60">
                  <div
                    className="h-full bg-brand rounded-full transition-all duration-1000 ease-out"
                    style={{ width: inView ? '33.6%' : '0%' }}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
