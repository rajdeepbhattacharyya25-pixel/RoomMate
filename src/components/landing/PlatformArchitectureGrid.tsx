import React from 'react';
import { Lock, ShieldCheck, WifiOff, Fingerprint } from 'lucide-react';
import { useInView } from '../../lib/hooks/useInView';

export const PlatformArchitectureGrid: React.FC = () => {
  const { ref, inView } = useInView({ threshold: 0.1 });

  const architectures = [
    {
      icon: <Lock className="w-5 h-5 text-brand" />,
      title: 'Private Student Vault',
      description: 'Segmented database architecture ensures personal spending data is never sent to roommates or the shared cloud ledger.',
    },
    {
      icon: <ShieldCheck className="w-5 h-5 text-brand" />,
      title: 'Zero-Drift Engine',
      description: 'Calculates every split down to the exact rupee with automated integer residual assignment. Zero penny discrepancies.',
    },
    {
      icon: <WifiOff className="w-5 h-5 text-brand" />,
      title: 'Dual-Engine Offline',
      description: 'Fully functional during dorm Wi-Fi outages with local SQLite storage. Syncs queue seamlessly when reconnected.',
    },
    {
      icon: <Fingerprint className="w-5 h-5 text-brand" />,
      title: 'Hardware Keystore',
      description: 'Android BiometricPrompt & Apple LocalAuthentication gateway shield your app when your phone is passed around.',
    },
  ];

  return (
    <section ref={ref} className="py-20 md:py-24 bg-white border-y border-brand-border overflow-hidden" data-purpose="platform-architecture">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className={`text-center max-w-3xl mx-auto mb-16 transition-all duration-700 ${inView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'}`}>
          <span className="text-xs font-bold uppercase tracking-wider text-brand mb-2 block">
            Engineering &amp; Security Pillars
          </span>
          <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-brand-charcoal mb-4">
            Engineered for financial trust &amp; privacy
          </h2>
          <p className="text-brand-slate text-base sm:text-lg">
            Hardware-backed biometric lock, offline local persistence, and cryptographic isolation between private and shared expenses.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {architectures.map((arch, idx) => (
            <div
              key={idx}
              style={{ transitionDelay: inView ? `${idx * 80}ms` : '0ms' }}
              className={`p-7 rounded-2xl bg-brand-surface border border-brand-border hover:border-brand/50 hover:shadow-fin-card transition-all duration-500 hover:-translate-y-1 ${
                inView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
              }`}
            >
              <div className="w-11 h-11 rounded-xl bg-white text-brand flex items-center justify-center mb-5 border border-brand-border shadow-fin-sm">
                {arch.icon}
              </div>
              <h3 className="text-base font-bold text-brand-charcoal mb-2">{arch.title}</h3>
              <p className="text-xs text-brand-slate leading-relaxed">
                {arch.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};
