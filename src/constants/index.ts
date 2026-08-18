export const ACCOUNT_TYPES = {
  EMPLOYER: 'employer',
  JOB_SEEKER: 'job_seeker',
  OFFICE_EMPLOYEE: 'office_employee',
  ADMIN: 'admin',
} as const;

export type AccountType = (typeof ACCOUNT_TYPES)[keyof typeof ACCOUNT_TYPES];

export const USER_STATUS = {
  ACTIVE: 'active',
  INACTIVE: 'inactive',
  SUSPENDED: 'suspended',
  PENDING: 'pending',
} as const;

export const JOB_STATUS = {
  DRAFT: 'draft',
  PENDING_APPROVAL: 'pending_approval',
  PUBLISHED: 'published',
  REJECTED: 'rejected',
  CLOSED: 'closed',
  EXPIRED: 'expired',
} as const;

export const LEAD_STATUS = {
  IN_PROGRESS: 'in_progress',
  ABANDONED: 'abandoned',
  CONVERTED: 'converted',
  CONTACTED: 'contacted',
} as const;

export const TASK_STATUS = {
  TODO: 'todo',
  IN_PROGRESS: 'in_progress',
  DONE: 'done',
  CANCELLED: 'cancelled',
} as const;

export const ATTENDANCE_STATUS = {
  PRESENT: 'present',
  ABSENT: 'absent',
  HALF_DAY: 'half_day',
  ON_LEAVE: 'on_leave',
} as const;

export const TXN_TYPE = {
  CREDIT: 'credit',
  DEBIT: 'debit',
} as const;

export const SUBSCRIPTION_STATUS = {
  ACTIVE: 'active',
  EXPIRED: 'expired',
  CANCELLED: 'cancelled',
  TRIAL: 'trial',
} as const;

export const LOCALES = ['en', 'hi'] as const;
export type Locale = (typeof LOCALES)[number];

export * from './config.ts';
