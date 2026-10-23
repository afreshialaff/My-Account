import { BrowserRouter, Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import { Empty } from './components/ui'
import { CashAccount, CashDetail, CashForm, CashList } from './pages/Cash'
import Dashboard from './pages/Dashboard'
import { ExpenseDetail, ExpenseForm, ExpenseList } from './pages/Expenses'
import { InvoiceDetail, InvoiceForm, InvoiceList, PaymentForm, type Kind } from './pages/Invoices'
import { JournalDetail, JournalForm, JournalList } from './pages/Journals'
import { AccountDetail, AccountForm, AccountList, ContactForm, ContactList, ProductForm, ProductList } from './pages/Master'
import {
  AgingReport,
  BalanceSheetReport,
  ByContactReport,
  CashFlowReport,
  EquityReport,
  GeneralLedgerReport,
  InventoryReport,
  JournalReport,
  ProfitLossReport,
  ReportIndex,
  TaxReport,
  TrialBalanceReport,
} from './pages/Reports'
import Settings from './pages/Settings'
import { StoreProvider } from './store/store'

function invoiceRoutes(base: string, kind: Kind) {
  return [
    <Route key={`${kind}-list`} path={base} element={<InvoiceList kind={kind} />} />,
    <Route key={`${kind}-new`} path={`${base}/new`} element={<InvoiceForm key="new" kind={kind} />} />,
    <Route key={`${kind}-pay-new`} path={`${base}/pembayaran/new`} element={<PaymentForm key="new" kind={kind} />} />,
    <Route key={`${kind}-pay`} path={`${base}/pembayaran/:id`} element={<PaymentForm kind={kind} />} />,
    <Route key={`${kind}-detail`} path={`${base}/:id`} element={<InvoiceDetail kind={kind} />} />,
    <Route key={`${kind}-edit`} path={`${base}/:id/edit`} element={<InvoiceForm kind={kind} />} />,
  ]
}

export default function App() {
  return (
    <StoreProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<Dashboard />} />

            {invoiceRoutes('/penjualan', 'sales')}
            {invoiceRoutes('/pembelian', 'purchase')}

            <Route path="/biaya" element={<ExpenseList />} />
            <Route path="/biaya/new" element={<ExpenseForm key="new" />} />
            <Route path="/biaya/:id" element={<ExpenseDetail />} />
            <Route path="/biaya/:id/edit" element={<ExpenseForm />} />

            <Route path="/kas-bank" element={<CashList />} />
            <Route path="/kas-bank/transfer/new" element={<CashForm key="transfer" kind="transfer" />} />
            <Route path="/kas-bank/terima/new" element={<CashForm key="receive" kind="receive" />} />
            <Route path="/kas-bank/kirim/new" element={<CashForm key="spend" kind="spend" />} />
            <Route path="/kas-bank/transaksi/:id" element={<CashDetail />} />
            <Route path="/kas-bank/transaksi/:id/edit" element={<CashForm />} />
            <Route path="/kas-bank/:id" element={<CashAccount />} />

            <Route path="/produk" element={<ProductList />} />
            <Route path="/produk/new" element={<ProductForm key="new" />} />
            <Route path="/produk/:id" element={<ProductForm />} />

            <Route path="/kontak" element={<ContactList />} />
            <Route path="/kontak/new" element={<ContactForm key="new" />} />
            <Route path="/kontak/:id" element={<ContactForm />} />

            <Route path="/akun" element={<AccountList />} />
            <Route path="/akun/new" element={<AccountForm />} />
            <Route path="/akun/:id" element={<AccountDetail />} />

            <Route path="/jurnal" element={<JournalList />} />
            <Route path="/jurnal/new" element={<JournalForm key="new" />} />
            <Route path="/jurnal/:id" element={<JournalDetail />} />
            <Route path="/jurnal/:id/edit" element={<JournalForm />} />

            <Route path="/laporan" element={<ReportIndex />} />
            <Route path="/laporan/neraca" element={<BalanceSheetReport />} />
            <Route path="/laporan/laba-rugi" element={<ProfitLossReport />} />
            <Route path="/laporan/arus-kas" element={<CashFlowReport />} />
            <Route path="/laporan/perubahan-modal" element={<EquityReport />} />
            <Route path="/laporan/neraca-saldo" element={<TrialBalanceReport />} />
            <Route path="/laporan/buku-besar" element={<GeneralLedgerReport />} />
            <Route path="/laporan/jurnal" element={<JournalReport />} />
            <Route path="/laporan/umur-piutang" element={<AgingReport key="ar" kind="receivable" />} />
            <Route path="/laporan/umur-hutang" element={<AgingReport key="ap" kind="payable" />} />
            <Route path="/laporan/penjualan-pelanggan" element={<ByContactReport key="s" kind="sales" />} />
            <Route path="/laporan/pembelian-supplier" element={<ByContactReport key="p" kind="purchase" />} />
            <Route path="/laporan/persediaan" element={<InventoryReport />} />
            <Route path="/laporan/pajak" element={<TaxReport />} />

            <Route path="/pengaturan" element={<Settings />} />
            <Route path="*" element={<Empty>Halaman tidak ditemukan.</Empty>} />
          </Route>
        </Routes>
      </BrowserRouter>
    </StoreProvider>
  )
}
