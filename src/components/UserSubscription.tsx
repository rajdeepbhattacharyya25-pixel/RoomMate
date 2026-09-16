import React, { useState } from 'react';
import { User, UserSubscription, SubscriptionEvent } from '../types';
import { CreditCard, CheckCircle2, Zap, AlertTriangle } from 'lucide-react';
import confetti from 'canvas-confetti';

interface UserSubscriptionProps {
  currentUser: User;
  subscription: UserSubscription | undefined;
  subscriptionEvents: SubscriptionEvent[];
  onTriggerWebhook: (
    eventType: SubscriptionEvent['eventType'],
    eventId: string,
    payload: Record<string, unknown>
  ) => { success: boolean; duplicate: boolean };
}

export const UserSubscriptionView: React.FC<UserSubscriptionProps> = ({
  currentUser,
  subscription,
  subscriptionEvents,
  onTriggerWebhook,
}) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [webhookStatusMsg, setWebhookStatusMsg] = useState<string | null>(null);

  const plans = [
    {
      code: 'FREE',
      name: 'Starter Student',
      price: 0,
      period: 'Forever',
      features: ['1 Active Flat / Room', 'Unlimited Private Expenses', 'Equal Bill Splits', 'UPI Payment Logging'],
      badge: 'Free',
    },
    {
      code: 'PRO',
      name: 'Campus Pro',
      price: 49,
      period: '/month',
      features: [
        'Unlimited Rooms & Hostels',
        'Custom & Unequal Bill Splits',
        'Export Excel & PDF Summaries',
        'Monthly Budgeting & Insights',
        'Priority Sync',
      ],
      badge: 'Most Popular',
      highlighted: true,
    },
    {
      code: 'CAMPUS_MAX',
      name: 'Student Max',
      price: 99,
      period: '/month',
      features: [
        'Everything in Pro',
        'WhatsApp Reminder Bot',
        'Receipt OCR Auto-Scan',
        'Multi-Currency for Study Abroad',
      ],
      badge: 'Power User',
    },
  ];

  // Simulates Razorpay Checkout payment flow
  const handleUpgradeRazorpay = (planCode: string, price: number) => {
    setIsProcessing(true);

    setTimeout(() => {
      const randomEventId = 'evt_rzp_' + Math.random().toString(36).substr(2, 9);
      onTriggerWebhook('subscription.charged', randomEventId, {
        plan: planCode,
        amount: price * 100,
        currency: 'INR',
        gateway: 'Razorpay',
        payment_id: 'pay_rzp_' + Math.random().toString(36).substr(2, 9),
      });

      setIsProcessing(false);
      confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
      setWebhookStatusMsg(`✅ Razorpay Payment Succeeded! Event ID: ${randomEventId}`);
      setTimeout(() => setWebhookStatusMsg(null), 5000);
    }, 1200);
  };

  const simulateWebhook = (eventType: SubscriptionEvent['eventType'], duplicate = false) => {
    const eventId = duplicate ? 'evt_duplicate_sample_01' : 'evt_rzp_' + Math.random().toString(36).substr(2, 9);
    const result = onTriggerWebhook(eventType, eventId, {
      simulation: true,
      timestamp: new Date().toISOString(),
      user: currentUser.email,
    });

    if (result.duplicate) {
      setWebhookStatusMsg(`⚠️ Idempotency Enforced: Event ${eventId} was already processed. Skipped duplicate!`);
    } else {
      setWebhookStatusMsg(`⚡ Webhook Processed: ${eventType} (ID: ${eventId})`);
    }
    setTimeout(() => setWebhookStatusMsg(null), 5000);
  };

  return (
    <div className="space-y-6">
      {/* Current Subscription Status Card */}
      <div className="glass-card p-6 border-indigo-500/20 bg-gradient-to-r from-slate-900 via-indigo-950/30 to-slate-900">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div>
            <span className="text-xs font-bold text-[var(--text-subtle)] uppercase tracking-wider">
              Student Subscription Account
            </span>
            <div className="flex items-center gap-3 mt-1">
              <h1 className="text-2xl font-black text-white">
                {subscription ? subscription.planName : 'Starter Free'}
              </h1>
              {subscription && (
                <span
                  className={`text-xs font-black uppercase px-2.5 py-0.5 rounded-full border ${
                    subscription.status === 'ACTIVE'
                      ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                      : subscription.status === 'GRACE_PERIOD'
                      ? 'bg-amber-500/20 text-amber-400 border-amber-500/30 animate-pulse'
                      : subscription.status === 'SUSPENDED'
                      ? 'bg-rose-500/20 text-rose-400 border-rose-500/30'
                      : 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30'
                  }`}
                >
                  {subscription.status}
                </span>
              )}
            </div>
            <p className="text-xs text-[var(--text-muted)] mt-1">
              Subscriptions belong to your personal student account and unlock unlimited room features.
            </p>
          </div>

          {subscription?.status === 'GRACE_PERIOD' && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs">
              <AlertTriangle className="w-4 h-4" />
              <span>Payment past due. Grace period active until {subscription.gracePeriodUntil?.split('T')[0]}.</span>
            </div>
          )}
        </div>
      </div>

      {/* Plan Tiers Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {plans.map((plan) => {
          const isCurrent = subscription?.planCode === plan.code;

          return (
            <div
              key={plan.code}
              className={`glass-card p-6 flex flex-col justify-between transition-all ${
                plan.highlighted
                  ? 'border-indigo-500 shadow-xl shadow-indigo-500/10 bg-gradient-to-b from-indigo-950/40 to-slate-900'
                  : 'border-[var(--border-subtle)]'
              }`}
            >
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-extrabold uppercase tracking-wider text-indigo-400">
                    {plan.name}
                  </span>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-800 text-gray-300 border border-slate-700">
                    {plan.badge}
                  </span>
                </div>

                <div className="flex items-baseline gap-1">
                  <span className="text-3xl font-black text-white">₹{plan.price}</span>
                  <span className="text-xs text-[var(--text-subtle)]">{plan.period}</span>
                </div>

                <div className="space-y-2 pt-2 border-t border-[var(--border-subtle)]">
                  {plan.features.map((feat, idx) => (
                    <div key={idx} className="flex items-center gap-2 text-xs text-gray-300">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      <span>{feat}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="pt-6">
                {isCurrent ? (
                  <button
                    disabled
                    className="w-full py-2.5 rounded-xl bg-slate-800 text-gray-400 font-bold text-xs cursor-default"
                  >
                    Current Active Plan
                  </button>
                ) : (
                  <button
                    onClick={() => handleUpgradeRazorpay(plan.code, plan.price)}
                    disabled={isProcessing}
                    className={`w-full py-2.5 rounded-xl text-xs font-bold transition-all shadow-lg flex items-center justify-center gap-2 ${
                      plan.highlighted
                        ? 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-600/30'
                        : 'bg-slate-800 hover:bg-slate-700 text-white border border-slate-700'
                    }`}
                  >
                    <CreditCard className="w-3.5 h-3.5" />
                    <span>{plan.price === 0 ? 'Downgrade to Free' : `Pay ₹${plan.price} via Razorpay`}</span>
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Webhook & Idempotency Testing Console */}
      <div className="glass-card p-6 border-purple-500/20 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Zap className="w-5 h-5 text-purple-400" />
            <h3 className="text-sm font-bold text-white">Razorpay Webhook & Idempotency Test Console</h3>
          </div>
          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-purple-500/10 text-purple-300 border border-purple-500/20">
            Dev/Admin Controls
          </span>
        </div>

        <p className="text-xs text-[var(--text-muted)]">
          Simulate verified Razorpay webhook events to test subscription lifecycle states and duplicate event idempotency handling.
        </p>

        {webhookStatusMsg && (
          <div className="p-3 rounded-xl bg-slate-950 border border-indigo-500/40 text-xs font-mono text-indigo-300">
            {webhookStatusMsg}
          </div>
        )}

        <div className="flex flex-wrap gap-2 pt-1">
          <button
            onClick={() => simulateWebhook('subscription.charged')}
            className="px-3 py-1.5 rounded-lg bg-emerald-600/20 text-emerald-300 border border-emerald-500/30 text-xs font-semibold hover:bg-emerald-600/30"
          >
            ⚡ subscription.charged (Active)
          </button>
          <button
            onClick={() => simulateWebhook('payment.failed')}
            className="px-3 py-1.5 rounded-lg bg-amber-600/20 text-amber-300 border border-amber-500/30 text-xs font-semibold hover:bg-amber-600/30"
          >
            ⚠️ payment.failed (Grace Period)
          </button>
          <button
            onClick={() => simulateWebhook('subscription.halted')}
            className="px-3 py-1.5 rounded-lg bg-rose-600/20 text-rose-300 border border-rose-500/30 text-xs font-semibold hover:bg-rose-600/30"
          >
            ⛔ subscription.halted (Suspended)
          </button>
          <button
            onClick={() => simulateWebhook('subscription.charged', true)}
            className="px-3 py-1.5 rounded-lg bg-slate-800 text-purple-300 border border-purple-500/30 text-xs font-semibold hover:bg-slate-700"
          >
            🔁 Fire Duplicate Webhook (Idempotency Test)
          </button>
        </div>

        {/* Webhook History */}
        <div className="pt-3 border-t border-[var(--border-subtle)] space-y-2">
          <span className="text-xs font-bold text-gray-300 block">Processed Webhook Audit Log:</span>
          <div className="space-y-1.5 max-h-40 overflow-y-auto">
            {subscriptionEvents.map((evt) => (
              <div
                key={evt.id}
                className="flex items-center justify-between p-2 rounded-lg bg-slate-950/60 text-[11px] font-mono border border-[var(--border-subtle)]"
              >
                <div className="flex items-center gap-2">
                  <span className="text-emerald-400 font-bold">{evt.eventType}</span>
                  <span className="text-gray-500">[{evt.razorpayEventId}]</span>
                </div>
                <span className="text-gray-400">{evt.processedAt.split('T')[1].substring(0, 8)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
