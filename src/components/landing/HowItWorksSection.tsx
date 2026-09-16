import React from 'react';
import { useInView } from '../../lib/hooks/useInView';
import { ArrowRight } from 'lucide-react';

export const HowItWorksSection: React.FC = () => {
  const { ref, inView } = useInView({ threshold: 0.15 });

  const steps = [
    {
      num: '01',
      title: 'Add an Expense',
      description: 'Log in 5 seconds or extract directly from UPI transaction alerts and payment screenshots.',
      sampleTitle: 'Wi-Fi Fiber Monthly — ₹799',
      sampleMeta: 'Paid By: Kabir (Room 402)',
    },
    {
      num: '02',
      title: 'Auto-Split Without Drift',
      description: 'Select room flatmates. The engine divides using integer arithmetic so debits match credits exactly.',
      sampleTitle: '₹199.75 → Exact ₹200 balanced',
      sampleMeta: 'Assigned to 4 roommates',
    },
    {
      num: '03',
      title: '1-Tap UPI Settlement',
      description: 'Pay via any installed UPI app (GPay, PhonePe, Paytm). RoomMate tracks partial payments automatically.',
      sampleTitle: 'UPI Intent Deep-Link',
      sampleMeta: 'Pre-filled VPA & amount',
    },
  ];

  return (
    <section ref={ref} className="py-20 md:py-24 bg-brand-dark text-white relative overflow-hidden" data-purpose="how-it-works" id="how-it-works">
      {/* Ambient Glow */}
      <div aria-hidden="true" className="absolute -top-40 -left-40 w-96 h-96 bg-brand-mint/10 rounded-full blur-3xl pointer-events-none" />
      <div aria-hidden="true" className="absolute -bottom-40 -right-40 w-96 h-96 bg-emerald-400/10 rounded-full blur-3xl pointer-events-none" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <div className={`text-center max-w-3xl mx-auto mb-16 transition-all duration-700 ${inView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'}`}>
          <span className="text-xs font-bold uppercase tracking-wider text-emerald-300 bg-white/10 px-3.5 py-1 rounded-full mb-3 inline-block border border-white/10">
            Effortless Flow
          </span>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-extrabold tracking-tight text-white mb-4">
            How it works in 3 simple steps
          </h2>
          <p className="text-white/80 text-base sm:text-lg">
            Designed for busy college students. Add, split, and settle in seconds with complete peace of mind.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {steps.map((step, idx) => (
            <div
              key={idx}
              style={{ transitionDelay: inView ? `${idx * 120}ms` : '0ms' }}
              className={`p-8 rounded-3xl bg-brand-darker/80 border border-white/10 shadow-fin-card flex flex-col justify-between backdrop-blur-sm transition-all duration-700 hover:border-emerald-400/40 hover:-translate-y-1 ${
                inView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'
              }`}
            >
              <div>
                <div className="flex items-center justify-between mb-6">
                  <div className="w-12 h-12 rounded-2xl bg-white/10 border border-white/15 text-emerald-300 font-extrabold text-base flex items-center justify-center">
                    {step.num}
                  </div>
                  {idx < 2 && (
                    <ArrowRight className="hidden md:block w-5 h-5 text-white/20" />
                  )}
                </div>
                <h3 className="text-xl font-bold text-white mb-3">{step.title}</h3>
                <p className="text-sm text-white/75 leading-relaxed mb-6">
                  {step.description}
                </p>
              </div>
              <div className="p-4 rounded-xl bg-white/5 border border-white/10 text-xs">
                <span className="text-white/60 font-medium block mb-1">Example:</span>
                <div className="font-bold text-white font-tabular">{step.sampleTitle}</div>
                <div className="text-white/60 mt-0.5">{step.sampleMeta}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};
