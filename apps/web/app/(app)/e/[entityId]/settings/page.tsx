import { EntitySettings } from '@/components/entity/EntityPages'

export default async function Page({ params }: { params: Promise<{ entityId: string }> }) {
  const { entityId } = await params
  return <EntitySettings entityId={entityId} />
}
