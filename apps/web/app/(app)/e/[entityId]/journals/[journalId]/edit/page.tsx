import { JournalEditor } from '@/components/entity/Journals'

export default async function Page({ params }: { params: Promise<{ entityId: string; journalId: string }> }) {
  const { entityId, journalId } = await params
  return <JournalEditor entityId={entityId} journalId={journalId} />
}
