import { Periods } from '@/components/entity/EntityPages'

export default async function Page({ params }: { params: Promise<{ entityId: string }> }) {
  const { entityId } = await params
  return <Periods entityId={entityId} />
}
