import { JournalDetail } from '@/components/entity/Journals'

export default async function Page({ params, searchParams }: { params: Promise<{ entityId: string; journalId: string }>; searchParams: Promise<{ error?: string }> }) {
  const { entityId, journalId } = await params
  const { error } = await searchParams
  return <JournalDetail key={journalId} entityId={entityId} journalId={journalId} initialError={error} />
}
