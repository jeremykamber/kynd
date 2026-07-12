"use client"

import { usePersonaFlow } from '@/ui/hooks/usePersonaFlow'
import { MinimalCard } from '@/components/custom/MinimalCard'
import { MOCK_PERSONAS } from '@/domain/entities/MockPersonas'
import Link from 'next/link'
import { ArrowRightIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'

interface SetupViewProps {
  personaFlow: ReturnType<typeof usePersonaFlow>
  onBack?: () => void
}

export function SetupView({ personaFlow, onBack }: SetupViewProps) {
  return (
    <div className="flex flex-col gap-16 max-w-4xl mx-auto w-full">
      <div className="flex justify-between">
        {onBack && (
          <Button variant="ghost" size="sm" onClick={onBack} className="text-muted-foreground hover:text-foreground">
            ← Back to batches
          </Button>
        )}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => personaFlow.setPersonas(MOCK_PERSONAS)}
          className="text-muted-foreground hover:text-foreground ml-auto"
        >
          Load Demo Personas
        </Button>
      </div>
      <div className="flex flex-col gap-4 text-center items-center">
        <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-balance">
          Define your target market
        </h1>
        <p className="text-lg text-muted-foreground text-balance max-w-2xl">
          Provide a brief description of who you are trying to reach. Kynd will synthesize a set of detailed personas that represent your audience.
        </p>
      </div>

      <div className="grid gap-12">
        <section className="flex flex-col gap-6 relative">
          <div className="absolute -left-12 top-0 flex h-8 w-8 items-center justify-center rounded-full border-2 border-primary text-primary font-bold hidden md:flex">
            1
          </div>
          <MinimalCard>
            <div className="flex flex-col gap-6">
              <div className="flex flex-col gap-2">
                <h2 className="text-xl font-semibold tracking-tight">Audience Description</h2>
                <p className="text-sm text-muted-foreground">Describe your ideal customer, their pain points, and demographics.</p>
              </div>
              <Textarea
                className="w-full min-h-[160px] resize-y"
                placeholder="e.g. B2B SaaS Founders dealing with high churn rates, usually aged 30-45..."
                value={personaFlow.customerProfile}
                onChange={(e) => personaFlow.setCustomerProfile(e.target.value)}
                disabled={personaFlow.isPending}
              />
              <div className="flex flex-col gap-2">
                <label htmlFor="persona-count" className="text-sm font-medium">Number of personas</label>
                <input
                  id="persona-count"
                  type="number"
                  min={1}
                  max={20}
                  value={personaFlow.personaCount}
                  onChange={(e) => {
                    const v = parseInt(e.target.value, 10)
                    if (!isNaN(v) && v >= 1 && v <= 20) personaFlow.setPersonaCount(v)
                  }}
                  disabled={personaFlow.isPending}
                  className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 w-24"
                />
              </div>
              <div className="flex items-center justify-between">
                <Button variant="link" asChild className="h-auto p-0 text-muted-foreground">
                  <Link href="/dashboard/interviews" className="inline-flex items-center gap-1">
                    Have interview transcripts? Generate from interviews
                    <ArrowRightIcon className="h-3.5 w-3.5" />
                  </Link>
                </Button>
                <Button
                  size="lg"
                  disabled={!personaFlow.customerProfile.trim() || personaFlow.isPending}
                  onClick={personaFlow.handleGeneratePersonas}
                >
                  {personaFlow.isPending ? "Generating..." : "Generate Personas"}
                </Button>
              </div>
              {personaFlow.error && (
                <p className="text-sm text-destructive font-medium bg-destructive/10 p-3 rounded-md">{personaFlow.error}</p>
              )}
            </div>
          </MinimalCard>
        </section>
      </div>
    </div>
  )
}
