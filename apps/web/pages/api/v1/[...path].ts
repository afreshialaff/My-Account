import type { NextApiRequest, NextApiResponse } from 'next'

// Hosts the NestJS API in this deployment (single Vercel project). Skipped when API_URL points
// to a separately hosted API — then next.config.mjs rewrites /api/v1/* there instead.
export const config = { api: { bodyParser: false, externalResolver: true, responseLimit: false } }

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { handler } = require('@aos/api/dist/serverless') as { handler: (req: NextApiRequest, res: NextApiResponse) => void }

export default function api(req: NextApiRequest, res: NextApiResponse) {
  handler(req, res)
}
