import { JournalList } from '@/components/entity/Journals'

export default async function Page({ params }: { params: Promise<{ entityId: string }> }) {
  const { entityId } = await params
  return <JournalList entityId={entityId} />
}
