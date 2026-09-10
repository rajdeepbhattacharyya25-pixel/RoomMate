import React, { useState } from 'react';
import { User, PersonalExpense } from '../types';
import { Lock, Plus, Trash2, Tag, Calendar, ShieldCheck, Sparkles, Search, Filter } from 'lucide-react';

interface PersonalVaultProps {
  currentUser: User;
  personalExpenses: PersonalExpense[];
  onAddExpense: (data: Omit<PersonalExpense, 'id' | 'userId' | 'createdAt' | 'updatedAt'>) => void;
  onDeleteExpense: (id: string) => void;
}

export const PersonalVault: React.FC<PersonalVaultProps> = ({
  currentUser,
  personalExpenses,
  onAddExpense,
  onDeleteExpense,
}) => {
  const [showAddModal, setShowAddModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');

  // Form State
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState<PersonalExpense['category']>('Food');
  const [notes, setNotes] = useState('');
  const [expenseDate, setExpenseDate] = useState(new Date().toISOString().split('T')[0]);

  const userExpenses = personalExpenses.filter((p) => p.userId === currentUser.id);

  const filteredExpenses = userExpenses.filter((p) => {
    const matchesSearch = p.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (p.notes && p.notes.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesCat = selectedCategory === 'ALL' || p.category === selectedCategory;
    return matchesSearch && matchesCat;
  });

  const totalSpent = userExpenses.reduce((sum, p) => sum + p.amount, 0);

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !amount || Number(amount) <= 0) return;
    onAddExpense({
      title,
      amount: Number(amount),
      category,
      notes,
      expenseDate,
    });
    setTitle('');
    setAmount('');
    setNotes('');
    setShowAddModal(false);
  };

  return (
    <div className="space-y-6">
      {/* Header with Privacy Guarantee Banner */}
      <div className="glass-card p-6 border-emerald-500/30 bg-gradient-to-r from-slate-950 via-slate-900 to-emerald-950/30 relative overflow-hidden">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 relative z-10">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="flex items-center gap-1.5 text-xs font-bold px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                <Lock className="w-3.5 h-3.5" />
                100% PRIVATE & ISOLATED VAULT
              </span>
              <span className="text-xs text-[var(--text-subtle)]">Row-Level Security Enforced</span>
            </div>
            <h1 className="text-2xl font-extrabold text-white tracking-tight flex items-center gap-2">
              <span>Personal Expense Vault</span>
            </h1>
            <p className="text-sm text-[var(--text-muted)] mt-1 max-w-xl">
              Log your individual snacks, shopping, travel, and personal items. Roommates and room admins can <strong>never</strong> view these records.
            </p>
          </div>

          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs shadow-lg shadow-emerald-600/30 transition-all"
          >
            <Plus className="w-4 h-4" />
            <span>Add Private Expense</span>
          </button>
        </div>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="glass-card p-4 border-emerald-500/20">
          <span className="text-xs text-[var(--text-muted)] uppercase tracking-wider font-semibold">Total Private Spending</span>
          <p className="text-2xl font-black text-emerald-400 mt-1">₹{totalSpent.toLocaleString('en-IN')}</p>
          <span className="text-[10px] text-[var(--text-subtle)]">Across {userExpenses.length} transactions</span>
        </div>
        <div className="glass-card p-4 border-indigo-500/20">
          <span className="text-xs text-[var(--text-muted)] uppercase tracking-wider font-semibold">Security State</span>
          <p className="text-sm font-bold text-indigo-300 mt-1 flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>Zero Roommate Leakage</span>
          </p>
          <span className="text-[10px] text-[var(--text-subtle)]">Filtered by user_id = {currentUser.id}</span>
        </div>
        <div className="glass-card p-4 border-purple-500/20">
          <span className="text-xs text-[var(--text-muted)] uppercase tracking-wider font-semibold">Monthly Pocket Budget</span>
          <p className="text-2xl font-black text-purple-300 mt-1">₹5,000</p>
          <div className="w-full h-1.5 bg-slate-800 rounded-full mt-2 overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-indigo-500 to-emerald-400"
              style={{ width: `${Math.min(100, Math.round((totalSpent / 5000) * 100))}%` }}
            />
          </div>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="glass-card p-4 flex flex-col md:flex-row items-center justify-between gap-3">
        <div className="relative w-full md:w-72">
          <Search className="w-4 h-4 text-[var(--text-subtle)] absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search personal expenses..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full !pl-9"
          />
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto overflow-x-auto">
          {['ALL', 'Food', 'Shopping', 'Travel', 'Entertainment', 'Academics'].map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
                selectedCategory === cat
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                  : 'bg-slate-900/60 text-[var(--text-muted)] hover:text-white border border-[var(--border-subtle)]'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Expenses Table / List */}
      <div className="glass-card overflow-hidden">
        <div className="p-4 border-b border-[var(--border-subtle)] flex items-center justify-between">
          <h2 className="text-sm font-bold text-white flex items-center gap-2">
            <span>Private Transactions</span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-gray-400">
              {filteredExpenses.length}
            </span>
          </h2>
        </div>

        {filteredExpenses.length === 0 ? (
          <div className="p-12 text-center space-y-2">
            <Lock className="w-8 h-8 text-[var(--text-subtle)] mx-auto opacity-50" />
            <p className="text-sm text-[var(--text-muted)]">No private expenses found.</p>
            <button
              onClick={() => setShowAddModal(true)}
              className="text-xs text-emerald-400 hover:underline font-semibold"
            >
              Log your first private purchase
            </button>
          </div>
        ) : (
          <div className="divide-y divide-[var(--border-subtle)]">
            {filteredExpenses.map((exp) => (
              <div
                key={exp.id}
                className="p-4 flex items-center justify-between hover:bg-slate-900/40 transition-all group"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-slate-800/80 border border-slate-700/50 flex items-center justify-center text-emerald-400 font-bold text-xs">
                    {exp.category.substring(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white">{exp.title}</h3>
                    <div className="flex items-center gap-2 text-xs text-[var(--text-subtle)] mt-0.5">
                      <span className="text-emerald-400 font-medium">{exp.category}</span>
                      <span>•</span>
                      <span>{exp.expenseDate}</span>
                      {exp.notes && (
                        <>
                          <span>•</span>
                          <span className="italic text-gray-400 truncate max-w-xs">{exp.notes}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  <span className="text-base font-black text-white">
                    ₹{exp.amount.toLocaleString('en-IN')}
                  </span>
                  <button
                    onClick={() => onDeleteExpense(exp.id)}
                    className="opacity-0 group-hover:opacity-100 p-2 text-rose-400 hover:bg-rose-500/10 rounded-lg transition-all"
                    title="Delete expense"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="glass-card max-w-md w-full p-6 border-emerald-500/30 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[var(--border-subtle)]">
              <div className="flex items-center gap-2">
                <Lock className="w-5 h-5 text-emerald-400" />
                <h3 className="text-base font-bold text-white">Add Private Expense</h3>
              </div>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-gray-400 hover:text-white text-xs font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-[var(--text-muted)] block mb-1">
                  Expense Title *
                </label>
                <input
                  type="text"
                  placeholder="e.g. Cafe Latte & Brownie, College Hoodie"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-[var(--text-muted)] block mb-1">
                    Amount (₹) *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="1240"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="w-full"
                    required
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-[var(--text-muted)] block mb-1">
                    Category
                  </label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value as PersonalExpense['category'])}
                    className="w-full"
                  >
                    <option value="Food">Food / Snacks</option>
                    <option value="Shopping">Shopping</option>
                    <option value="Travel">Travel / Metro</option>
                    <option value="Entertainment">Entertainment</option>
                    <option value="Academics">Academics / Books</option>
                    <option value="Health">Health</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-[var(--text-muted)] block mb-1">
                  Date
                </label>
                <input
                  type="date"
                  value={expenseDate}
                  onChange={(e) => setExpenseDate(e.target.value)}
                  className="w-full"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-[var(--text-muted)] block mb-1">
                  Private Notes (Optional)
                </label>
                <textarea
                  rows={2}
                  placeholder="Only you will ever see this note..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-gray-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-600/30"
                >
                  Save to Private Vault
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
