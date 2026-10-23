import { ClientDetail } from '@/components/firm/FirmPages'

export default async function Page({ params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params
  return <ClientDetail clientId={clientId} />
}
