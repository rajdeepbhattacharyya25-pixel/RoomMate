import { PersonalExpense } from '../../types';

export interface UserCategoryCap {
  category: PersonalExpense['category'];
  capAmount: number;
}

export interface UserBudgetConfig {
  monthlyAllowance: number;
  categoryCaps: Record<string, number>;
  updatedAt: string;
}

const DEFAULT_BUDGET: UserBudgetConfig = {
  monthlyAllowance: 8000,
  categoryCaps: {
    Food: 3500,
    Shopping: 1500,
    Travel: 1000,
    Entertainment: 1000,
    Academics: 500,
    Health: 500,
  },
  updatedAt: new Date().toISOString(),
};

const PRIMARY_STORAGE_PREFIX = 'roommate_budget_user_';
const LEGACY_STORAGE_PREFIX = 'campusflow_budget_user_';

export function getUserBudget(userId: string): UserBudgetConfig {
  if (!userId) return DEFAULT_BUDGET;
  try {
    const raw =
      localStorage.getItem(`${PRIMARY_STORAGE_PREFIX}${userId}`) ||
      localStorage.getItem(`${LEGACY_STORAGE_PREFIX}${userId}`);
    if (!raw) return DEFAULT_BUDGET;
    const parsed = JSON.parse(raw);
    return {
      monthlyAllowance: typeof parsed.monthlyAllowance === 'number' && parsed.monthlyAllowance > 0 ? parsed.monthlyAllowance : DEFAULT_BUDGET.monthlyAllowance,
      categoryCaps: parsed.categoryCaps || DEFAULT_BUDGET.categoryCaps,
      updatedAt: parsed.updatedAt || new Date().toISOString(),
    };
  } catch (err) {
    console.warn('Error reading user budget config, falling back to default:', err);
    return DEFAULT_BUDGET;
  }
}

export function saveUserBudget(userId: string, config: UserBudgetConfig): void {
  if (!userId) return;
  try {
    const dataToSave: UserBudgetConfig = {
      ...config,
      updatedAt: new Date().toISOString(),
    };
    localStorage.setItem(`${PRIMARY_STORAGE_PREFIX}${userId}`, JSON.stringify(dataToSave));
  } catch (err) {
    console.warn('Error saving user budget config:', err);
  }
}
