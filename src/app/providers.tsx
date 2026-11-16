import { TooltipProvider } from '@radix-ui/react-tooltip'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { useEffect, useState } from 'react'
import { startEndpointRecovery } from '../services/api/recovery.ts'

export function AppProviders({ children }: { children: ReactNode }) {
  const [client] = useState(() => new QueryClient())
  // Deployed sites follow the supervisor-published endpoint; no-op elsewhere.
  useEffect(() => startEndpointRecovery(client), [])
  return (
    <QueryClientProvider client={client}>
      <TooltipProvider delayDuration={200}>{children}</TooltipProvider>
    </QueryClientProvider>
  )
}
