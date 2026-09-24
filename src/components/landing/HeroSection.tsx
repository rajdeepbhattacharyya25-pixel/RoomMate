import React, { useState } from 'react';
import { ArrowRight, Shield, Users, Lock, Sparkles, CheckCircle2, EyeOff, RefreshCw } from 'lucide-react';
import { useMouseTilt } from '../../lib/hooks/useMouseTilt';
import { useInView } from '../../lib/hooks/useInView';
import { useCountUp } from '../../lib/hooks/useCountUp';

interface HeroSectionProps {
  onOpenMobilePreview: () => void;
  onDownloadApk: () => void;
  onOpenGuide: () => void;
}

export const HeroSection: React.FC<HeroSectionProps> = ({
  onOpenMobilePreview,
  onDownloadApk,
  onOpenGuide,
}) => {
  const [activeTab, setActiveTab] = useState<'personal' | 'shared'>('personal');
  const { ref: tiltRef, style: tiltStyle } = useMouseTilt({ maxTilt: 4, scale: 1.005 });
  const { ref: sectionRef, inView } = useInView({ threshold: 0.1 });

  // Animated counters for product hero
  const personalTotal = useCountUp({ target: 2690, duration: 800, startTrigger: inView });
  const sharedBill = useCountUp({ target: 1200, duration: 800, startTrigger: inView });
  const perPersonShare = useCountUp({ target: 300, duration: 800, startTrigger: inView });
  const rajdeepReceives = useCountUp({ target: 900, duration: 800, startTrigger: inView });

  return (
    <section ref={sectionRef} className="relative pt-10 pb-16 md:pt-16 md:pb-24 overflow-hidden" data-purpose="hero-section">
      {/* Floating Ambient Glow Orbs */}
      <div
        aria-hidden="true"
        className="absolute top-12 left-1/4 -translate-x-1/2 w-[550px] h-[450px] bg-brand-mint/30 blur-[120px] rounded-full pointer-events-none -z-10 animate-float-slow"
      />
      <div
        aria-hidden="true"
        className="absolute top-36 right-1/4 translate-x-1/2 w-[450px] h-[400px] bg-emerald-100/30 blur-[130px] rounded-full pointer-events-none -z-10 animate-float-reverse"
      />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        {/* Eyebrow Badge */}
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-brand-mint/80 border border-brand-border text-brand text-xs font-semibold tracking-wide uppercase mb-6 shadow-fin-sm backdrop-blur-sm animate-scale-pop">
          <Sparkles className="w-3.5 h-3.5 text-brand" />
          <span>The Dual-Engine Campus Expense OS</span>
        </div>

        {/* Main Editorial Headline */}
        <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-[64px] font-extrabold tracking-tight text-brand-charcoal max-w-4xl mx-auto leading-[1.1] mb-6 animate-fade-up">
          Split room bills with flatmates.{' '}
          <span className="text-brand">Keep personal spending strictly private.</span>
        </h1>

        {/* Subtitle */}
        <p className="text-base sm:text-lg md:text-xl text-brand-slate max-w-2xl mx-auto font-normal leading-relaxed mb-8 delay-150 animate-fade-up">
          RoomMate divides your financial life cleanly: personal spending stays locked in your private offline vault, while room bills synchronize transparently with mathematical debt-cancellation.
        </p>

        {/* CTA Action Group */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4 mb-4 delay-200 animate-fade-up">
          <button
            onClick={onOpenMobilePreview}
            type="button"
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2.5 px-8 py-3.5 rounded-full bg-brand hover:bg-brand-dark text-white font-semibold text-sm transition-all duration-200 shadow-fin-card hover:shadow-fin-card-hover group active:scale-95 cursor-pointer"
          >
            <span>Get Started Free</span>
            <ArrowRight className="w-4 h-4 transform transition-transform group-hover:translate-x-1" />
          </button>

          <button
            onClick={onDownloadApk}
            type="button"
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-7 py-3.5 rounded-full bg-white hover:bg-brand-soft text-brand-charcoal font-semibold text-sm border border-brand-border transition-all duration-200 shadow-fin-sm active:scale-95 cursor-pointer"
          >
            <svg className="w-4 h-4 text-brand" fill="currentColor" viewBox="0 0 24 24">
              <path d="M17.523 15.3414c-.5511 0-.9993-.4486-.9993-1.0003 0-.5517.4482-1.0003.9993-1.0003.5517 0 .9998.4486.9998 1.0003 0 .5517-.4481 1.0003-.9998 1.0003m-11.046 0c-.5511 0-.9993-.4486-.9993-1.0003 0-.5517.4482-1.0003.9993-1.0003.5517 0 .9998.4486.9998 1.0003 0 .5517-.4481 1.0003-.9998 1.0003m11.4045-6.02l1.996-3.4572c.1561-.2706.0635-.6158-.2071-.7719-.2706-.1562-.6158-.0636-.7719.207l-2.0223 3.5027c-1.4646-.6692-3.1118-1.042-4.8762-1.042-1.7644 0-3.4116.3728-4.8762 1.042L5.1015 5.2993c-.1561-.2706-.5013-.3632-.7719-.207-.2706.1561-.3632.5013-.2071.7719l1.996 3.4572C2.693 11.2335.32 15.0152 0 19.5h24c-.32-4.4848-2.693-8.2665-6.1185-10.1786" />
            </svg>
            <span>Download Android APK</span>
          </button>
        </div>

        {/* Compatibility Note */}
        <p className="text-xs text-brand-slate font-medium mb-10">
          Android 8.0+ &amp; iOS 15.0+ •{' '}
          <button
            onClick={onOpenGuide}
            type="button"
            className="text-brand underline hover:text-brand-dark font-semibold cursor-pointer"
          >
            How to sideload APK (30-sec guide)
          </button>
        </p>

        {/* Interactive Dual-Engine Tab Switcher */}
        <div className="inline-flex items-center p-1.5 rounded-2xl bg-white border border-brand-border shadow-fin-sm mb-8">
          <button
            onClick={() => setActiveTab('personal')}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition-all cursor-pointer ${
              activeTab === 'personal'
                ? 'bg-brand text-white shadow-sm'
                : 'text-brand-slate hover:text-brand hover:bg-brand-soft'
            }`}
            type="button"
          >
            <Lock className="w-4 h-4" />
            <span>Personal Vault 🔒 (Private to You)</span>
          </button>

          <button
            onClick={() => setActiveTab('shared')}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition-all cursor-pointer ${
              activeTab === 'shared'
                ? 'bg-brand text-white shadow-sm'
                : 'text-brand-slate hover:text-brand hover:bg-brand-soft'
            }`}
            type="button"
          >
            <Users className="w-4 h-4" />
            <span>Shared Ledger 👥 (Flat 402 Group)</span>
          </button>
        </div>

        {/* Centerpiece Realistic Product Showcase Mockup with Touch-Safe 3D Tilt */}
        <div ref={tiltRef} style={tiltStyle} className="relative max-w-4xl mx-auto text-left" data-purpose="hero-product-showcase">
          <div className="relative bg-white rounded-3xl sm:rounded-[32px] border border-brand-border shadow-fin-float overflow-hidden">
            
            {/* Authentic App Bar Header */}
            <div className="px-5 sm:px-8 py-4 sm:py-5 bg-brand-surface border-b border-brand-border flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex gap-1.5">
                  <span className="w-3 h-3 rounded-full bg-rose-400/80" />
                  <span className="w-3 h-3 rounded-full bg-amber-400/80" />
                  <span className="w-3 h-3 rounded-full bg-emerald-400/80" />
                </div>
                <div className="h-4 w-px bg-brand-border" />
                <div className="flex items-center gap-2">
                  <img
                    src="/logo.png"
                    alt="RoomMate"
                    className="w-5 h-5 rounded-md object-contain shadow-xs"
                  />
                  <span className="text-xs font-bold text-brand-charcoal">
                    {activeTab === 'personal' ? 'RoomMate Personal Vault' : 'RoomMate Flat 402 Ledger'}
                  </span>
                  <span className="text-[11px] text-brand-slate font-mono">v1.0.4 (Build 10) Verified</span>
                </div>
              </div>

              {/* Status Indicator */}
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white text-[11px] font-semibold text-brand border border-brand-border shadow-fin-sm">
                {activeTab === 'personal' ? (
                  <>
                    <EyeOff className="w-3 h-3 text-emerald-600" />
                    <span>Never Shared with Roommates</span>
                  </>
                ) : (
                  <>
                    <RefreshCw className="w-3 h-3 text-brand animate-spin" style={{ animationDuration: '4s' }} />
                    <span>Synchronized with 4 Roommates</span>
                  </>
                )}
              </div>
            </div>

            {/* TAB 1: Personal Vault View (100% Private) */}
            {activeTab === 'personal' && (
              <div className="p-6 sm:p-8 space-y-6 animate-fade-up">
                {/* Privacy Guarantee Header Card */}
                <div className="bg-emerald-50/70 rounded-2xl p-4 sm:p-5 border border-emerald-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center font-bold">
                      <Lock className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-emerald-950 flex items-center gap-1.5">
                        <span>Personal Spending Vault</span>
                        <span className="text-[10px] bg-emerald-200/60 text-emerald-900 px-2 py-0.5 rounded-full uppercase font-mono">
                          Offline Only
                        </span>
                      </h4>
                      <p className="text-xs text-emerald-800/90">
                        Roommates CANNOT see what you eat, buy, or spend on yourself.
                      </p>
                    </div>
                  </div>
                  <div className="text-left sm:text-right">
                    <span className="text-[11px] font-semibold text-emerald-800 uppercase block">Private Total</span>
                    <span className="text-2xl font-extrabold text-emerald-950 font-tabular">
                      ₹{personalTotal.toLocaleString('en-IN')}
                    </span>
                  </div>
                </div>

                {/* Realistic Private Expense Items */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-xs font-bold text-brand-slate uppercase tracking-wider px-1">
                    <span>Itemized Private Expenses</span>
                    <span>Visibility Status</span>
                  </div>

                  {/* Food ₹1,240 */}
                  <div className="flex items-center justify-between p-3.5 rounded-xl bg-white border border-brand-border hover:border-brand/40 transition-colors shadow-fin-sm">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-100 flex items-center justify-center text-lg">
                        🍔
                      </div>
                      <div>
                        <div className="text-sm font-semibold text-brand-charcoal">Food &amp; Dining</div>
                        <p className="text-xs text-brand-slate">Swiggy &amp; Campus Cafeteria (Dinner)</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-bold text-brand-charcoal font-tabular">₹1,240</div>
                      <span className="inline-flex items-center gap-1 text-[11px] text-emerald-700 font-semibold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                        <Lock className="w-2.5 h-2.5" /> Private
                      </span>
                    </div>
                  </div>

                  {/* Shopping ₹850 */}
                  <div className="flex items-center justify-between p-3.5 rounded-xl bg-white border border-brand-border hover:border-brand/40 transition-colors shadow-fin-sm">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-purple-50 border border-purple-100 flex items-center justify-center text-lg">
                        🛍️
                      </div>
                      <div>
                        <div className="text-sm font-semibold text-brand-charcoal">Personal Shopping</div>
                        <p className="text-xs text-brand-slate">College stationery &amp; personal essentials</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-bold text-brand-charcoal font-tabular">₹850</div>
                      <span className="inline-flex items-center gap-1 text-[11px] text-emerald-700 font-semibold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                        <Lock className="w-2.5 h-2.5" /> Private
                      </span>
                    </div>
                  </div>

                  {/* Transport ₹600 */}
                  <div className="flex items-center justify-between p-3.5 rounded-xl bg-white border border-brand-border hover:border-brand/40 transition-colors shadow-fin-sm">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center text-lg">
                        🚇
                      </div>
                      <div>
                        <div className="text-sm font-semibold text-brand-charcoal">Commute &amp; Metro</div>
                        <p className="text-xs text-brand-slate">Smartcard auto-topup for campus travel</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-bold text-brand-charcoal font-tabular">₹600</div>
                      <span className="inline-flex items-center gap-1 text-[11px] text-emerald-700 font-semibold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                        <Lock className="w-2.5 h-2.5" /> Private
                      </span>
                    </div>
                  </div>
                </div>

                {/* Micro Guarantee Note */}
                <div className="p-3.5 rounded-xl bg-brand-surface border border-brand-border flex items-center justify-between text-xs text-brand-slate">
                  <div className="flex items-center gap-2">
                    <Shield className="w-4 h-4 text-brand" />
                    <span>Encrypted with AES-GCM-256 in local storage. Stays on your device.</span>
                  </div>
                  <button
                    onClick={() => setActiveTab('shared')}
                    type="button"
                    className="text-brand font-semibold hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    <span>View Shared Room Ledger</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}

            {/* TAB 2: Shared Room Ledger (Synchronized with 4 Roommates) */}
            {activeTab === 'shared' && (
              <div className="p-6 sm:p-8 space-y-6 animate-fade-up">
                {/* Shared Headline Card: Electricity ₹1,200 / 4 = ₹300 */}
                <div className="bg-brand-soft rounded-2xl p-5 sm:p-6 border border-brand-border">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold uppercase tracking-wider text-brand">
                          Shared Household Bill
                        </span>
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-white text-brand-charcoal border border-brand-border font-bold">
                          Flat 402 • 4 Members
                        </span>
                      </div>
                      <div className="flex items-baseline gap-2 mt-1">
                        <span className="text-3xl sm:text-4xl font-extrabold text-brand-charcoal tracking-tight font-tabular">
                          ₹{sharedBill.toLocaleString('en-IN')}
                        </span>
                        <span className="text-sm font-semibold text-brand-slate">
                          Electricity Bill (BESCOM)
                        </span>
                      </div>
                    </div>
                    <div className="text-left sm:text-right">
                      <span className="text-xs font-bold text-emerald-800 bg-emerald-100/70 px-3 py-1.5 rounded-full border border-emerald-300 inline-block font-tabular">
                        +₹{rajdeepReceives} Owed to You
                      </span>
                    </div>
                  </div>

                  {/* Mathematical Split Breakdown */}
                  <div className="bg-white rounded-xl p-3.5 border border-brand-border grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                    <div className="p-2 rounded-lg bg-emerald-50/70 border border-emerald-100">
                      <span className="text-[10px] text-emerald-800 uppercase font-bold block">Rajdeep (You)</span>
                      <span className="text-xs font-bold text-brand-charcoal block">Paid ₹1,200</span>
                      <span className="text-[11px] font-bold text-emerald-700 font-tabular">Gets ₹900</span>
                    </div>
                    <div className="p-2 rounded-lg bg-brand-surface border border-brand-border">
                      <span className="text-[10px] text-brand-slate uppercase font-bold block">Ayush</span>
                      <span className="text-xs font-bold text-brand-charcoal block">Share ₹{perPersonShare}</span>
                      <span className="text-[11px] font-bold text-rose-600 font-tabular">Owes ₹300</span>
                    </div>
                    <div className="p-2 rounded-lg bg-brand-surface border border-brand-border">
                      <span className="text-[10px] text-brand-slate uppercase font-bold block">Binod</span>
                      <span className="text-xs font-bold text-brand-charcoal block">Share ₹{perPersonShare}</span>
                      <span className="text-[11px] font-bold text-rose-600 font-tabular">Owes ₹300</span>
                    </div>
                    <div className="p-2 rounded-lg bg-brand-surface border border-brand-border">
                      <span className="text-[10px] text-brand-slate uppercase font-bold block">Chirag</span>
                      <span className="text-xs font-bold text-brand-charcoal block">Share ₹{perPersonShare}</span>
                      <span className="text-[11px] font-bold text-rose-600 font-tabular">Owes ₹300</span>
                    </div>
                  </div>
                </div>

                {/* Outstanding Tracking Notice */}
                <div className="p-4 rounded-xl bg-white border border-brand-border shadow-fin-sm flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-brand text-white flex items-center justify-center font-bold text-sm">
                      <CheckCircle2 className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-brand-charcoal">Continuous Debt Ledger</div>
                      <p className="text-xs text-brand-slate">
                        RoomMate tracks partial payments (e.g. ₹295 paid → ₹5 remaining) until exact ₹0.
                      </p>
                    </div>
                  </div>
                  <a
                    href="#settlement-demo"
                    className="px-3.5 py-1.5 rounded-full bg-brand text-white text-xs font-bold hover:bg-brand-dark transition-colors cursor-pointer"
                  >
                    Try Interactive Story ↓
                  </a>
                </div>
              </div>
            )}

            {/* Bottom Guarantee Micro-Bar */}
            <div className="px-6 py-3.5 bg-brand-surface border-t border-brand-border flex items-center justify-between text-xs text-brand-slate">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                <span>
                  {activeTab === 'personal'
                    ? 'Personal expenses are completely invisible to roommates.'
                    : 'Shared room expenses sync in real-time across all roommates.'}
                </span>
              </div>
              <span className="text-[11px] font-bold text-brand font-mono">
                {activeTab === 'personal' ? '🔒 100% PRIVATE' : '👥 GROUP SYNCED'}
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
