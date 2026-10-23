import { ReportIndex } from '@/components/entity/Reports'

export default async function Page({ params }: { params: Promise<{ entityId: string }> }) {
  const { entityId } = await params
  return <ReportIndex entityId={entityId} />
}
