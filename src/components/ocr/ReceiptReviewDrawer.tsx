import React, { useState, useMemo } from 'react';
import {
  Receipt,
  Sparkles,
  Users,
  CheckCircle2,
  AlertTriangle,
  Trash2,
  Plus,
  ArrowRight,
  ShieldCheck,
  Edit2,
  Check,
  X,
} from 'lucide-react';
import { ParsedReceiptData } from '../../lib/ocr/receiptTextParser';
import {
  ItemAssignmentInput,
  calculateReceiptItemSplits,
  UserItemSplitCalculation,
  ReceiptAllocationSummary,
} from '../../lib/ocr/itemSplitAllocation';
import { UserAvatar } from '../common/UserAvatar';
import { SharedExpense, SplitMethod } from '../../types';

export interface RoomMemberItem {
  userId: string;
  name: string;
  avatarUrl?: string;
}

export interface EditableReceiptItem {
  id: string;
  name: string;
  quantity: number;
  pricePaise: number;
  assignedUserIds: string[];
}

export interface ReceiptReviewDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  parsedData: ParsedReceiptData;
  members: RoomMemberItem[];
  currentUserId: string;
  onSaveExpense: (expense: {
    title: string;
    totalAmount: number;
    category: SharedExpense['category'];
    paidBy: string;
    splitMethod: SplitMethod;
    participantUserIds: string[];
    customValues: Record<string, number>;
    notes: string;
    expenseDate?: string;
  }) => void;
  onSwitchToManual?: (prefill: {
    title: string;
    amount: number;
    notes: string;
    date?: string;
  }) => void;
}

export const ReceiptReviewDrawer: React.FC<ReceiptReviewDrawerProps> = ({
  isOpen,
  onClose,
  parsedData,
  members,
  currentUserId,
  onSaveExpense,
  onSwitchToManual,
}) => {
  const memberUserIds = useMemo(() => members.map((m) => m.userId), [members]);

  // Header State
  const [vendor, setVendor] = useState(parsedData.vendor || 'Grocery / Store Receipt');
  const [isEditingVendor, setIsEditingVendor] = useState(false);
  const [expenseDate, setExpenseDate] = useState(
    parsedData.date || new Date().toISOString().split('T')[0]
  );
  const [category, setCategory] = useState<SharedExpense['category']>('Groceries');
  const [paidBy, setPaidBy] = useState(currentUserId);

  // Line items initialized with all members assigned by default
  const [items, setItems] = useState<EditableReceiptItem[]>(() => {
    if (parsedData.items.length > 0) {
      return parsedData.items.map((it) => ({
        id: it.id,
        name: it.name,
        quantity: it.quantity || 1,
        pricePaise: it.totalPricePaise,
        assignedUserIds: [...memberUserIds],
      }));
    }
    // Default single item if nothing was extracted
    return [
      {
        id: 'manual_item_1',
        name: 'General Items',
        quantity: 1,
        pricePaise: parsedData.totalPaise || 10000,
        assignedUserIds: [...memberUserIds],
      },
    ];
  });

  // Overheads State in Rupees for easy editing
  const [taxRupees, setTaxRupees] = useState((parsedData.taxPaise / 100).toString());
  const [deliveryRupees, setDeliveryRupees] = useState(
    (parsedData.deliveryPaise / 100).toString()
  );
  const [discountRupees, setDiscountRupees] = useState(
    (parsedData.discountPaise / 100).toString()
  );
  const [isOverheadsExpanded, setIsOverheadsExpanded] = useState(
    parsedData.taxPaise > 0 || parsedData.deliveryPaise > 0 || parsedData.discountPaise > 0
  );

  // Convert overheads to integer paise safely
  const taxPaise = Math.max(0, Math.round((parseFloat(taxRupees) || 0) * 100));
  const deliveryPaise = Math.max(0, Math.round((parseFloat(deliveryRupees) || 0) * 100));
  const discountPaise = Math.max(0, Math.round((parseFloat(discountRupees) || 0) * 100));

  // Compute exact allocation via integer paise math engine
  const allocation: ReceiptAllocationSummary = useMemo(() => {
    const totalItemsPaise = items.reduce((sum, it) => sum + it.pricePaise, 0);
    const calculatedTotalPaise = totalItemsPaise + taxPaise + deliveryPaise - discountPaise;
    const totalReceiptPaise = Math.max(0, calculatedTotalPaise);

    const assignmentInputs: ItemAssignmentInput[] = items.map((it) => ({
      item: {
        id: it.id,
        name: it.name,
        quantity: it.quantity,
        unitPricePaise: it.pricePaise,
        totalPricePaise: it.pricePaise,
        confidence: 'HIGH',
        rawLine: `${it.name} ${it.pricePaise / 100}`,
      },
      assignedUserIds: it.assignedUserIds.length > 0 ? it.assignedUserIds : memberUserIds,
    }));

    return calculateReceiptItemSplits({
      items: assignmentInputs,
      taxPaise,
      deliveryPaise,
      discountPaise,
      totalReceiptPaise,
      fallbackPayerUserId: paidBy,
    });
  }, [items, taxPaise, deliveryPaise, discountPaise, memberUserIds, paidBy]);

  if (!isOpen) return null;

  // Item Management Handlers
  const handleToggleRoommate = (itemId: string, userId: string) => {
    setItems((prev) =>
      prev.map((item) => {
        if (item.id !== itemId) return item;
        const exists = item.assignedUserIds.includes(userId);
        const next = exists
          ? item.assignedUserIds.filter((id: string) => id !== userId)
          : [...item.assignedUserIds, userId];
        return { ...item, assignedUserIds: next };
      })
    );
  };

  const handleAssignAll = (itemId: string) => {
    setItems((prev) =>
      prev.map((it) => (it.id === itemId ? { ...it, assignedUserIds: [...memberUserIds] } : it))
    );
  };

  const handleAssignOnlyMe = (itemId: string) => {
    setItems((prev) =>
      prev.map((it) => (it.id === itemId ? { ...it, assignedUserIds: [currentUserId] } : it))
    );
  };

  const handleItemNameChange = (itemId: string, newName: string) => {
    setItems((prev) =>
      prev.map((it) => (it.id === itemId ? { ...it, name: newName } : it))
    );
  };

  const handleItemPriceChange = (itemId: string, newPriceRupees: string) => {
    const paise = Math.max(0, Math.round((parseFloat(newPriceRupees) || 0) * 100));
    setItems((prev) =>
      prev.map((it) => (it.id === itemId ? { ...it, pricePaise: paise } : it))
    );
  };

  const handleDeleteItem = (itemId: string) => {
    setItems((prev) => prev.filter((it) => it.id !== itemId));
  };

  const handleAddItem = () => {
    const newItem: EditableReceiptItem = {
      id: `custom_item_${Date.now()}`,
      name: 'New Line Item',
      quantity: 1,
      pricePaise: 5000,
      assignedUserIds: [...memberUserIds],
    };
    setItems((prev) => [...prev, newItem]);
  };

  const handleSave = () => {
    if (!allocation.isReconciled || allocation.totalReceiptPaise <= 0) return;

    // Build custom values map for exact split (amount in Rupees)
    const customValues: Record<string, number> = {};
    const participantUserIds: string[] = [];

    for (const [uid, liability] of Object.entries(allocation.userAllocations)) {
      const splitLiability = liability as UserItemSplitCalculation;
      if (splitLiability.totalOwedPaise > 0) {
        participantUserIds.push(uid);
        customValues[uid] = splitLiability.totalOwedRupees;
      }
    }

    // Build clear human-readable note breakdown
    const itemLines = items
      .map((it) => {
        const assignedNames = it.assignedUserIds
          .map((uid: string) => members.find((m) => m.userId === uid)?.name || 'Unknown')
          .join(', ');
        return `• ${it.name}: ₹${(it.pricePaise / 100).toFixed(2)} [${assignedNames}]`;
      })
      .join('\n');

    const overheadsSummary = [
      taxPaise > 0 ? `Tax: ₹${(taxPaise / 100).toFixed(2)}` : null,
      deliveryPaise > 0 ? `Delivery: ₹${(deliveryPaise / 100).toFixed(2)}` : null,
      discountPaise > 0 ? `Discount: -₹${(discountPaise / 100).toFixed(2)}` : null,
    ]
      .filter(Boolean)
      .join(' | ');

    const notes = [
      `🧾 Itemized Receipt Split (${vendor})`,
      itemLines,
      overheadsSummary ? `Overheads: ${overheadsSummary}` : '',
      `Total: ₹${(allocation.totalReceiptPaise / 100).toFixed(2)} (Reconciled with 0 paise drift)`,
    ]
      .filter(Boolean)
      .join('\n');

    onSaveExpense({
      title: vendor,
      totalAmount: allocation.totalReceiptPaise / 100,
      category,
      paidBy,
      splitMethod: 'EXACT',
      participantUserIds,
      customValues,
      notes,
      expenseDate,
    });

    onClose();
  };

  const handleManualSwitch = () => {
    if (onSwitchToManual) {
      onSwitchToManual({
        title: vendor,
        amount: allocation.totalReceiptPaise / 100,
        notes: `Extracted from receipt (${vendor})`,
        date: expenseDate,
      });
    }
    onClose();
  };

  // Confidence pill badge color
  const confidenceColor =
    parsedData.confidence === 'HIGH'
      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
      : parsedData.confidence === 'MEDIUM'
      ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
      : 'bg-red-500/10 text-red-400 border-red-500/30';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md">
      <div className="bg-white dark:bg-[#1C1C25] border border-slate-200/90 dark:border-[#27354A] shadow-2xl rounded-2xl max-w-2xl w-full p-5 sm:p-6 space-y-4.5 max-h-[92vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-start justify-between pb-3 border-b border-slate-100 dark:border-[#27354A]/80">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800/40 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
                <Receipt className="w-4.5 h-4.5" />
              </div>
              <div className="flex items-center gap-2">
                {isEditingVendor ? (
                  <div className="flex items-center gap-1.5">
                    <input
                      type="text"
                      value={vendor}
                      onChange={(e) => setVendor(e.target.value)}
                      className="text-sm font-bold bg-slate-900 border border-indigo-500/50 rounded px-2 py-0.5 text-white"
                      autoFocus
                    />
                    <button
                      onClick={() => setIsEditingVendor(false)}
                      className="text-emerald-400 p-1"
                    >
                      <Check className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5">
                    <h3 className="text-base font-bold text-slate-900 dark:text-white">{vendor}</h3>
                    <button
                      onClick={() => setIsEditingVendor(true)}
                      className="text-slate-400 hover:text-slate-700 dark:hover:text-white p-0.5 cursor-pointer"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}

                <span
                  className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full border ${confidenceColor}`}
                >
                  {parsedData.confidence} Confidence
                </span>
              </div>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Assign line items to individual roommates. Taxes and delivery will be prorated automatically.
            </p>
          </div>

          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 dark:hover:text-white p-1 rounded-md transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Basic Fields Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="text-[11px] font-semibold text-[var(--text-muted)] block mb-1">
              Category
            </label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as SharedExpense['category'])}
              className="w-full text-xs"
            >
              <option value="Groceries">Groceries</option>
              <option value="Food">Common Food</option>
              <option value="Electricity">Electricity</option>
              <option value="Wi-Fi">Wi-Fi / Broadband</option>
              <option value="Gas">Gas Cylinder</option>
              <option value="Water">Water Supply</option>
              <option value="Cleaning">Cleaning / Maid</option>
              <option value="Rent">Rent</option>
              <option value="Other">Other</option>
            </select>
          </div>

          <div>
            <label className="text-[11px] font-semibold text-[var(--text-muted)] block mb-1">
              Paid Out-of-Pocket By
            </label>
            <select
              value={paidBy}
              onChange={(e) => setPaidBy(e.target.value)}
              className="w-full text-xs"
            >
              {members.map((m) => (
                <option key={m.userId} value={m.userId}>
                  {m.name} {m.userId === currentUserId ? '(You)' : ''}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-[11px] font-semibold text-[var(--text-muted)] block mb-1">
              Receipt Date
            </label>
            <input
              type="date"
              value={expenseDate}
              onChange={(e) => setExpenseDate(e.target.value)}
              className="w-full text-xs"
            />
          </div>
        </div>

        {/* Itemized Line Items List */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
              <span>Receipt Items ({items.length})</span>
            </h4>
            <button
              type="button"
              onClick={handleAddItem}
              className="text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 flex items-center gap-1 transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Item</span>
            </button>
          </div>

          <div className="space-y-2.5 max-h-64 overflow-y-auto pr-1">
            {items.map((item) => {
              const assignedCount = item.assignedUserIds.length;
              const perPersonPaise = assignedCount > 0 ? Math.round(item.pricePaise / assignedCount) : 0;

              return (
                <div
                  key={item.id}
                  className={`p-3 rounded-xl border transition-all ${
                    assignedCount === 0
                      ? 'bg-amber-50/70 dark:bg-amber-950/20 border-amber-300 dark:border-amber-500/40'
                      : 'bg-slate-50/80 dark:bg-slate-900/60 border-slate-200/90 dark:border-slate-800 hover:border-indigo-400/60'
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    {/* Item Name Input */}
                    <input
                      type="text"
                      value={item.name}
                      onChange={(e) => handleItemNameChange(item.id, e.target.value)}
                      className="bg-transparent text-xs font-semibold text-slate-900 dark:text-white focus:bg-white dark:focus:bg-slate-950/80 px-2 py-1 rounded border border-transparent focus:border-indigo-500/50 flex-1"
                    />

                    {/* Price Input */}
                    <div className="flex items-center gap-1 shrink-0">
                      <span className="text-xs text-slate-400 font-medium">₹</span>
                      <input
                        type="number"
                        step="0.01"
                        value={(item.pricePaise / 100).toString()}
                        onChange={(e) => handleItemPriceChange(item.id, e.target.value)}
                        className="w-20 text-xs font-bold text-right bg-white dark:bg-slate-950/80 px-2 py-1 rounded border border-slate-200 dark:border-indigo-500/30 text-slate-900 dark:text-white"
                      />
                    </div>

                    {/* Delete Item */}
                    <button
                      type="button"
                      onClick={() => handleDeleteItem(item.id)}
                      className="text-gray-500 hover:text-red-400 p-1 transition-colors"
                      title="Remove Item"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Roommate Assignment Row */}
                  <div className="mt-2.5 pt-2 border-t border-slate-200/70 dark:border-slate-800/80 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <button
                        type="button"
                        onClick={() => handleAssignAll(item.id)}
                        className={`text-[10px] px-2 py-0.5 rounded-full font-semibold border transition-all cursor-pointer ${
                          assignedCount === memberUserIds.length
                            ? 'bg-indigo-50 dark:bg-indigo-600/30 border-indigo-400 dark:border-indigo-500 text-indigo-700 dark:text-indigo-300'
                            : 'bg-white dark:bg-slate-800/50 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-gray-400 hover:text-slate-900 dark:hover:text-white'
                        }`}
                      >
                        All
                      </button>
                      <button
                        type="button"
                        onClick={() => handleAssignOnlyMe(item.id)}
                        className={`text-[10px] px-2 py-0.5 rounded-full font-semibold border transition-all cursor-pointer ${
                          assignedCount === 1 && item.assignedUserIds[0] === currentUserId
                            ? 'bg-indigo-50 dark:bg-indigo-600/30 border-indigo-400 dark:border-indigo-500 text-indigo-700 dark:text-indigo-300'
                            : 'bg-white dark:bg-slate-800/50 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-gray-400 hover:text-slate-900 dark:hover:text-white'
                        }`}
                      >
                        Only Me
                      </button>

                      {/* Avatar Selector Chips */}
                      <div className="flex items-center gap-1 ml-1">
                        {members.map((member) => {
                          const isAssigned = item.assignedUserIds.includes(member.userId);
                          return (
                            <button
                              key={member.userId}
                              type="button"
                              onClick={() => handleToggleRoommate(item.id, member.userId)}
                              title={`${member.name} (${isAssigned ? 'Assigned' : 'Excluded'})`}
                              className={`relative rounded-full transition-all p-0.5 cursor-pointer ${
                                isAssigned
                                  ? 'ring-2 ring-indigo-500 scale-105 opacity-100'
                                  : 'opacity-35 hover:opacity-75 grayscale'
                              }`}
                            >
                              <UserAvatar
                                src={member.avatarUrl}
                                name={member.name}
                                size="xs"
                              />
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Per-person estimate label */}
                    <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">
                      {assignedCount === 0 ? (
                        <span className="text-amber-500 dark:text-amber-400 font-semibold">⚠️ Unassigned</span>
                      ) : (
                        `₹${(perPersonPaise / 100).toFixed(2)}/person (${assignedCount})`
                      )}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Taxes, Delivery & Overheads Toggle Card */}
        <div className="rounded-xl border border-slate-200/90 dark:border-[#27354A] bg-slate-50/70 dark:bg-slate-900/50 p-3 space-y-2.5">
          <button
            type="button"
            onClick={() => setIsOverheadsExpanded(!isOverheadsExpanded)}
            className="w-full flex items-center justify-between text-xs font-semibold text-slate-700 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-white transition-colors cursor-pointer"
          >
            <div className="flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-indigo-500 dark:text-indigo-400" />
              <span>Taxes, Delivery Charges & Discounts</span>
            </div>
            <span className="text-[11px] text-indigo-600 dark:text-indigo-400 font-bold">
              {isOverheadsExpanded ? '▲ Hide' : '▼ Edit Overheads'}
            </span>
          </button>

          {isOverheadsExpanded && (
            <div className="grid grid-cols-3 gap-2.5 pt-2 border-t border-slate-200/80 dark:border-slate-800">
              <div>
                <label className="text-[10px] font-semibold text-slate-600 dark:text-slate-400 block mb-1">
                  Tax / GST (₹)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={taxRupees}
                  onChange={(e) => setTaxRupees(e.target.value)}
                  className="w-full text-xs bg-white dark:bg-slate-950/80 px-2 py-1 rounded border border-slate-200 dark:border-indigo-500/30 text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="text-[10px] font-semibold text-slate-600 dark:text-slate-400 block mb-1">
                  Delivery Fee (₹)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={deliveryRupees}
                  onChange={(e) => setDeliveryRupees(e.target.value)}
                  className="w-full text-xs bg-white dark:bg-slate-950/80 px-2 py-1 rounded border border-slate-200 dark:border-indigo-500/30 text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="text-[10px] font-semibold text-slate-600 dark:text-slate-400 block mb-1">
                  Discount (₹)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={discountRupees}
                  onChange={(e) => setDiscountRupees(e.target.value)}
                  className="w-full text-xs bg-white dark:bg-slate-950/80 px-2 py-1 rounded border border-slate-200 dark:border-indigo-500/30 text-slate-900 dark:text-white"
                />
              </div>
            </div>
          )}
        </div>

        {/* Calculated Roommate Liabilities Breakdown */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5 text-indigo-500 dark:text-indigo-400" />
              <span>Calculated Roommate Liabilities</span>
            </span>
            <span className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">
              Integer-Paise Precision
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {members.map((member) => {
              const liab: UserItemSplitCalculation | undefined = allocation.userAllocations[member.userId];
              const owedRupees = liab ? liab.totalOwedRupees : 0;

              return (
                <div
                  key={member.userId}
                  className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900/80 border border-slate-200/90 dark:border-slate-800 flex items-center gap-2"
                >
                  <UserAvatar
                    src={member.avatarUrl}
                    name={member.name}
                    size="sm"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                      {member.name}
                    </p>
                    <p className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400">
                      ₹{owedRupees.toFixed(2)}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Financial Reconciliation Status Banner */}
        <div
          className={`p-3 rounded-xl border flex items-center justify-between gap-3 text-xs ${
            allocation.isReconciled
              ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-500/40 text-emerald-800 dark:text-emerald-300'
              : 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-500/40 text-amber-800 dark:text-amber-300'
          }`}
        >
          <div className="flex items-center gap-2">
            {allocation.isReconciled ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
            )}
            <div>
              <div className="font-bold">
                Total Bill: ₹{(allocation.totalReceiptPaise / 100).toFixed(2)}
              </div>
              <div className="text-[11px] opacity-80">
                {allocation.isReconciled
                  ? 'Perfect Reconciliation: Individual shares match receipt total exactly (0 paise drift)'
                  : `Unassigned items or drift of ₹${(allocation.reconciliationDeltaPaise / 100).toFixed(2)}`}
              </div>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-[#27354A]/80">
          <button
            type="button"
            onClick={handleSave}
            disabled={!allocation.isReconciled || allocation.totalReceiptPaise <= 0}
            className="w-full py-3 px-4 rounded-xl font-bold text-sm bg-indigo-600 hover:bg-indigo-700 text-white shadow-md shadow-indigo-600/25 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98] transition-all cursor-pointer"
          >
            <span>Confirm & Split Bill to Room Ledger</span>
            <ArrowRight className="w-4 h-4" />
          </button>

          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={handleManualSwitch}
              className="text-xs text-slate-500 hover:text-slate-900 dark:hover:text-white py-1 transition-colors cursor-pointer"
            >
              Switch to Standard Manual Form
            </button>
            <button
              type="button"
              onClick={onClose}
              className="text-xs text-slate-400 hover:text-rose-500 py-1 transition-colors cursor-pointer"
            >
              Discard
            </button>
          </div>
        </div>

        {/* Zero-retention Privacy Notice */}
        <div className="flex items-center gap-2 text-[10px] text-[var(--text-muted)] pt-1">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
          <span>
            Zero-retention Guarantee: Receipt images are discarded immediately and never stored.
          </span>
        </div>
      </div>
    </div>
  );
};
