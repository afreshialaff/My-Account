import { PlannedModulePage } from '@/components/entity/EntityPages'

export default async function Page({ params }: { params: Promise<{ module: string }> }) {
  const { module } = await params
  return <PlannedModulePage module={module} />
}
