import React from 'react';
import { useInView } from '../../lib/hooks/useInView';

export const CampusExpenseCategoriesGrid: React.FC = () => {
  const { ref, inView } = useInView({ threshold: 0.1 });

  const categories = [
    {
      emoji: '🏠',
      title: 'PG & Flat Rent',
      badge: 'Recurring Monthly',
      description: 'Rent & security deposit split with room member shares and automatic individual balance adjustment.',
      linkText: 'Deposit lock & rent share',
    },
    {
      emoji: '⚡',
      title: 'Electricity Bills',
      badge: 'Equal / Unit Split',
      description: 'BESCOM, Tata Power & state board bills divided by flatmate headcount or room AC sub-meters.',
      linkText: 'Unit split calculation',
    },
    {
      emoji: '🛒',
      title: 'Groceries & Supplies',
      badge: 'Itemized Group',
      description: 'Zepto, Blinkit & Instamart shared household grocery pools so no one pays for another flatmate’s personal treats.',
      linkText: 'Itemized assignment',
    },
    {
      emoji: '📶',
      title: 'High-Speed Wi-Fi',
      badge: 'Equal Split',
      description: 'Monthly broadband recharge split equally on auto-pilot with recurring reminders before disconnection.',
      linkText: 'Auto-renew tracking',
    },
    {
      emoji: '🍲',
      title: 'Common Cook / Mess',
      badge: 'Shared Pot',
      description: 'Cook, maid salary, LPG refills, and night mess pool managed with continuous balance tracking.',
      linkText: 'Shared kitchen pot',
    },
    {
      emoji: '🔥',
      title: 'LPG Gas Cylinder',
      badge: 'Stay-Adjusted',
      description: 'Domestic cylinder refills shared fairly, accounting for residents away on semester holidays.',
      linkText: 'Presence-based split',
    },
  ];

  return (
    <section ref={ref} className="py-20 bg-brand-surface/40 border-b border-brand-border overflow-hidden" data-purpose="categories-grid" id="categories">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div
          className={`text-center max-w-3xl mx-auto mb-14 transition-all duration-700 ${
            inView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'
          }`}
        >
          <span className="text-xs font-bold uppercase tracking-wider text-brand mb-2 block">
            Everyday Campus Life
          </span>
          <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-brand-charcoal mb-4">
            Built for how student flats actually run
          </h2>
          <p className="text-brand-slate text-base sm:text-lg">
            PG, flat, hostel, or shared floor — log common household costs without mixing them with your private food and shopping.
          </p>
        </div>

        {/* Staggered Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {categories.map((cat, idx) => (
            <div
              key={idx}
              style={{ transitionDelay: inView ? `${idx * 80}ms` : '0ms' }}
              className={`p-7 rounded-2xl bg-white border border-brand-border hover:border-brand/40 hover:shadow-fin-card-hover transition-all duration-500 group flex flex-col justify-between hover:-translate-y-1 ${
                inView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
              }`}
            >
              <div>
                <div className="w-12 h-12 rounded-xl bg-brand-surface border border-brand-border flex items-center justify-center text-brand font-bold text-xl mb-5 group-hover:scale-110 transition-transform shadow-fin-sm">
                  {cat.emoji}
                </div>
                <div className="flex items-center gap-2 mb-2">
                  <h3 className="text-lg font-bold text-brand-charcoal">{cat.title}</h3>
                  <span className="text-[10px] font-bold bg-brand-soft text-brand px-2 py-0.5 rounded border border-brand-border font-mono">
                    {cat.badge}
                  </span>
                </div>
                <p className="text-sm text-brand-slate leading-relaxed">
                  {cat.description}
                </p>
              </div>

              <div className="mt-6 pt-4 border-t border-brand-border/70 flex items-center justify-between text-xs text-brand font-semibold">
                <span>{cat.linkText}</span>
                <span className="transform group-hover:translate-x-1.5 transition-transform font-bold">→</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};
