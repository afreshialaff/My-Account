export type AccountCategory =
  | 'cash_bank'
  | 'receivable'
  | 'inventory'
  | 'other_current_asset'
  | 'fixed_asset'
  | 'depreciation'
  | 'other_asset'
  | 'payable'
  | 'other_current_liability'
  | 'long_term_liability'
  | 'equity'
  | 'revenue'
  | 'other_income'
  | 'cogs'
  | 'expense'
  | 'other_expense'

export interface Account {
  id: string
  code: string
  name: string
  category: AccountCategory
  description?: string
  /** System accounts are used by automatic postings and cannot be deleted. */
  system?: boolean
}

export type ContactType = 'customer' | 'supplier' | 'employee' | 'other'

export interface Contact {
  id: string
  type: ContactType
  name: string
  company?: string
  email?: string
  phone?: string
  address?: string
  npwp?: string
}

export interface Product {
  id: string
  code: string
  name: string
  unit: string
  sellPrice: number
  buyPrice: number
  /** Tracked products use the perpetual inventory system with moving-average cost. */
  trackInventory: boolean
  salesAccountId: string
  /** For tracked products this is the inventory account, otherwise an expense account. */
  purchaseAccountId: string
  cogsAccountId: string
  openingQty: number
  openingCost: number
  openingDate: string
}

export interface DocLine {
  id: string
  productId?: string
  /** Used when the line has no product; otherwise the product's account is used. */
  accountId?: string
  description: string
  qty: number
  price: number
  discountPct: number
  taxPct: number
}

export interface Invoice {
  id: string
  number: string
  contactId: string
  date: string
  dueDate: string
  lines: DocLine[]
  memo?: string
  createdAt: number
}

export interface PaymentAllocation {
  invoiceId: string
  amount: number
}

export interface Payment {
  id: string
  /** receive = payment from customer, pay = payment to supplier */
  kind: 'receive' | 'pay'
  number: string
  date: string
  contactId: string
  accountId: string
  allocations: PaymentAllocation[]
  memo?: string
  createdAt: number
}

export interface ExpenseLine {
  id: string
  accountId: string
  description: string
  amount: number
  taxPct: number
}

export interface Expense {
  id: string
  number: string
  date: string
  payFromAccountId: string
  contactId?: string
  lines: ExpenseLine[]
  memo?: string
  createdAt: number
}

export interface CashLine {
  id: string
  accountId: string
  description: string
  amount: number
}

export interface CashTransaction {
  id: string
  kind: 'transfer' | 'receive' | 'spend'
  number: string
  date: string
  /** Bank account affected (source for transfer). */
  accountId: string
  toAccountId?: string
  amount?: number
  contactId?: string
  lines: CashLine[]
  memo?: string
  createdAt: number
}

export interface JournalLineInput {
  id: string
  accountId: string
  description: string
  debit: number
  credit: number
}

export interface ManualJournal {
  id: string
  number: string
  date: string
  memo?: string
  lines: JournalLineInput[]
  createdAt: number
}

export interface Company {
  name: string
  address: string
  phone: string
  email: string
  npwp: string
}

export interface AppData {
  version: number
  company: Company
  accounts: Account[]
  contacts: Contact[]
  products: Product[]
  salesInvoices: Invoice[]
  purchaseInvoices: Invoice[]
  payments: Payment[]
  expenses: Expense[]
  cashTransactions: CashTransaction[]
  journals: ManualJournal[]
}

export type SourceType =
  | 'opening'
  | 'sales_invoice'
  | 'purchase_invoice'
  | 'receive_payment'
  | 'purchase_payment'
  | 'expense'
  | 'bank_transfer'
  | 'bank_deposit'
  | 'bank_withdrawal'
  | 'journal'

export interface LedgerLine {
  accountId: string
  debit: number
  credit: number
  description: string
}

export interface LedgerEntry {
  id: string
  date: string
  number: string
  sourceType: SourceType
  sourceId: string
  contactId?: string
  memo: string
  createdAt: number
  lines: LedgerLine[]
}
