import { notFound } from 'next/navigation'
import { Suspense } from 'react'
import { BalanceSheet, GeneralLedger, ProfitLoss, TrialBalance } from '@/components/entity/Reports'

const REPORTS = { 'balance-sheet': BalanceSheet, 'profit-loss': ProfitLoss, 'trial-balance': TrialBalance, 'general-ledger': GeneralLedger }

export default async function Page({ params }: { params: Promise<{ entityId: string; report: string }> }) {
  const { entityId, report } = await params
  const Report = REPORTS[report as keyof typeof REPORTS]
  if (!Report) notFound()
  return (
    <Suspense>
      <Report entityId={entityId} />
    </Suspense>
  )
}
