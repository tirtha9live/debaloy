export const SITE_NAME = 'Debaloy';
export const ASSOCIATION = 'Debaloy Flat Owners Welfare Association';
export const ADDRESS =
  '93 Baguiati Road, 3rd Lane & 68 Baguiati Road, 4th Lane, Kolkata – 700028';
export const FY_LABEL = 'FY 2026-27';
export const FY_RANGE = 'September 2026 to August 2027';

export const SESSION_COOKIE = 'debaloy_sid';
export const SESSION_TTL_SECONDS = 60 * 60 * 24;
/** Engagement rows in Activity → Sessions (visitors + their page views). */
export const ENGAGEMENT_SESSION_KEEP = 100;
/** Ledger change rows in Activity → Ledger changes. */
export const LEDGER_AUDIT_KEEP = 500;
export const LOGIN_LOCK_SECONDS = 3 * 60;
export const LOGIN_FAIL_LIMIT = 3;
export const LOGIN_ATTEMPT_WINDOW_SECONDS = 30 * 60;
export const THEME_STORAGE_KEY = 'theme-preference';
export const THEME_COOKIE = 'debaloy_theme';
export const THEME_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 400;

export const FLATS = [
  { id: '403', resident: 'Rajeshree Saha' },
  { id: '402', resident: 'Poushali Deb Barman' },
  { id: '401', resident: 'Somnath NagChoudhury' },
  { id: '303', resident: 'Sayantan Roy' },
  { id: '302', resident: 'Kumar Dey' },
  { id: '301', resident: 'Souren Dutta' },
  { id: '203', resident: 'Goutam Roy' },
  { id: '202', resident: 'Soumen Dutta' },
  { id: '201', resident: 'Pradip Kumar Sinha' },
  { id: '103', resident: 'Sushanta Pal' },
  { id: '102', resident: 'Saikat Sarkar' },
  { id: '101', resident: 'Tulsi Saha' },
  { id: 'G2', resident: 'Tarak Das' },
  { id: 'G1', resident: 'Protima Das' },
] as const;

export const MONTHS = [
  'Sep-26',
  'Oct-26',
  'Nov-26',
  'Dec-26',
  'Jan-27',
  'Feb-27',
  'Mar-27',
  'Apr-27',
  'May-27',
  'Jun-27',
  'Jul-27',
  'Aug-27',
] as const;

export const INCOME_TYPES = [
  'Special Donation',
  'Bank Interest',
  'Outstanding Dues',
  'Other Income',
] as const;

export const EXPENSE_TYPES = [
  "Sweeper's Salary with Bonus",
  'Lift Maintenance Contract Renewal',
  'Electricity Bill',
  'Water Tank Cleaning Charges',
  'Electrical Maintenance',
  'Printing & Stationery',
  'Donation for Durga Puja & Kali Puja',
  'Fire Extinguisher Installation & Refilling',
  'New Water Pump Installation',
  'Septic Tank Cleaning & Other SDDM Charges',
  'General Charges',
  'Miscellaneous Expenses',
  'Building Maintenance',
  'Bank Charges',
  'Other Expenses',
] as const;

export const MODES = ['Bank', 'Cash'] as const;

export type FlatId = (typeof FLATS)[number]['id'];
export type Month = (typeof MONTHS)[number];
export type PayMode = (typeof MODES)[number];
export type CategoryKind = 'income' | 'expense';

export type HandoverLine = {
  receiptLabel: string | null;
  receiptAmount: number | null;
  receiptSection: boolean;
  paymentLabel: string | null;
  paymentAmount: number | null;
  paymentSection: boolean;
};

export const HANDOVER_LINES: HandoverLine[] = [
  { receiptLabel: 'Opening Balances', receiptAmount: null, receiptSection: true, paymentLabel: 'Operating Expenses', paymentAmount: null, paymentSection: true },
  { receiptLabel: '  Bank Balance (Brought Forward)', receiptAmount: 198600.14, receiptSection: false, paymentLabel: '  Sweeper Salary & Bonus', paymentAmount: 42000.0, paymentSection: false },
  { receiptLabel: '  Cash Balance (Brought Forward)', receiptAmount: 15570.0, receiptSection: false, paymentLabel: '  Lift Maintenance Renewal (2024-2027)', paymentAmount: 27030.0, paymentSection: false },
  { receiptLabel: 'Collections', receiptAmount: null, receiptSection: true, paymentLabel: '  Electricity Bill', paymentAmount: 49590.0, paymentSection: false },
  { receiptLabel: '  Maintenance Collection (Bank)', receiptAmount: 82520.0, receiptSection: false, paymentLabel: '  Water Tank Cleaning', paymentAmount: 5000.0, paymentSection: false },
  { receiptLabel: '  Maintenance Collection (Cash)', receiptAmount: 93780.0, receiptSection: false, paymentLabel: '  Electrical Maintenance', paymentAmount: 2340.0, paymentSection: false },
  { receiptLabel: '  Outstanding - Souren Dutta (Bank)', receiptAmount: 3000.0, receiptSection: false, paymentLabel: '  Printing & Stationery', paymentAmount: 1972.0, paymentSection: false },
  { receiptLabel: 'Festival & Donations Received', receiptAmount: null, receiptSection: true, paymentLabel: 'Festival & Event Expenses', paymentAmount: null, paymentSection: true },
  { receiptLabel: '  Durga Puja Collection (Bank)', receiptAmount: 2000.0, receiptSection: false, paymentLabel: '  Donation - Durga Puja & Kali Puja', paymentAmount: 22500.0, paymentSection: false },
  { receiptLabel: '  Durga Puja Collection (Cash)', receiptAmount: 12000.0, receiptSection: false, paymentLabel: 'Infrastructure & Safety', paymentAmount: null, paymentSection: true },
  { receiptLabel: '  Special Donation - Mr. K. Dey', receiptAmount: 1000.0, receiptSection: false, paymentLabel: '  Fire Extinguisher Install & Refilling', paymentAmount: 2600.0, paymentSection: false },
  { receiptLabel: 'Other Income', receiptAmount: null, receiptSection: true, paymentLabel: '  New Water Pump Installation', paymentAmount: 19020.0, paymentSection: false },
  { receiptLabel: '  Bank Interest Earned', receiptAmount: 11216.0, receiptSection: false, paymentLabel: '  Septic Tank Cleaning & Others (SDDM)', paymentAmount: 10490.0, paymentSection: false },
  { receiptLabel: null, receiptAmount: null, receiptSection: false, paymentLabel: 'Miscellaneous', paymentAmount: null, paymentSection: true },
  { receiptLabel: null, receiptAmount: null, receiptSection: false, paymentLabel: '  General Charges', paymentAmount: 4614.0, paymentSection: false },
  { receiptLabel: null, receiptAmount: null, receiptSection: false, paymentLabel: '  Miscellaneous Expenses', paymentAmount: 250.0, paymentSection: false },
  { receiptLabel: null, receiptAmount: null, receiptSection: false, paymentLabel: '  Building Maintenance', paymentAmount: 1300.0, paymentSection: false },
  { receiptLabel: null, receiptAmount: null, receiptSection: false, paymentLabel: '  Bank Charges', paymentAmount: 155.24, paymentSection: false },
  { receiptLabel: null, receiptAmount: null, receiptSection: false, paymentLabel: 'Closing Balances', paymentAmount: null, paymentSection: true },
  { receiptLabel: null, receiptAmount: null, receiptSection: false, paymentLabel: '  Cash in Hand', paymentAmount: 1364.0, paymentSection: false },
  { receiptLabel: null, receiptAmount: null, receiptSection: false, paymentLabel: '  Cash in Bank', paymentAmount: 229460.9, paymentSection: false },
];

export const HANDOVER_CLOSING_BANK = 229460.9;
export const HANDOVER_CLOSING_CASH = 1364.0;

export const SHEETS = [
  { slug: 'handover', href: '/ledger/handover', label: 'Archive', hint: 'Takeover record and closed years' },
  { slug: 'maintenance', href: '/ledger/maintenance', label: 'Maintenance', hint: 'Monthly collections' },
  { slug: 'puja', href: '/ledger/puja', label: 'Puja Contribution', hint: 'Cash contribution' },
  { slug: 'income', href: '/ledger/income', label: 'Other Collections', hint: 'Other receipts' },
  { slug: 'expenses', href: '/ledger/expenses', label: 'Expenses', hint: 'Payments log' },
  { slug: 'withdrawals', href: '/ledger/withdrawals', label: 'Withdrawals', hint: 'Bank to cash in hand' },
  { slug: 'receipts', href: '/ledger/receipts', label: 'This year', hint: 'FY statement · updates with new data' },
  { slug: 'years', href: '/ledger/years', label: 'Years', hint: 'Close books on the meeting date' },
] as const;

export type SheetSlug = (typeof SHEETS)[number]['slug'];
