import Link from 'next/link'
import Image from 'next/image'
import { MinimalCard } from '@/components/custom/MinimalCard'
import { PersonaAvatar } from '@/components/custom/PersonaAvatar'
import { StatusBadge } from '@/components/custom/StatusBadge'

export default function MarketingPage() {
  return (
    <div className="flex flex-col items-center w-full">
      <section className="w-full relative overflow-hidden py-32 md:py-48 flex flex-col items-center justify-center text-center px-4 md:px-8">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-ink/5 blur-[120px] rounded-full pointer-events-none -z-10" />

        <div className="max-w-4xl mx-auto flex flex-col items-center gap-8">
          <StatusBadge variant="secondary" className="px-4 py-1.5 text-sm mb-4 animate-fade-in">
            Meet Kynd
          </StatusBadge>
          
          <h1 className="text-5xl md:text-7xl lg:text-8xl font-bold tracking-tighter text-balance leading-[1.1] animate-fade-in" style={{ fontFamily: 'var(--font-fraunces)' }}>
            Know your user before you build.
          </h1>
          
          <p className="text-xl md:text-2xl text-muted-foreground max-w-2xl text-balance leading-relaxed animate-fade-in">
            Generate thoughtful AI personas from a simple description. Watch them explore your product, share genuine reactions, and reveal what your customers truly need.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 mt-8 animate-fade-in">
            <Link 
              href="/dashboard"
              className="inline-flex h-14 items-center justify-center rounded-xl bg-foreground px-10 text-base font-semibold text-background shadow-lg shadow-foreground/20 transition-all hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Start Listening
            </Link>
            <Link 
              href="#features"
              className="inline-flex h-14 items-center justify-center rounded-xl border border-[rgba(26,26,27,0.15)] bg-transparent px-10 text-base font-semibold text-foreground transition-all hover:bg-secondary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              See How It Works
            </Link>
          </div>
        </div>
      </section>

      <section id="features" className="w-full py-24 md:py-32 bg-[#F8F7F2]">
        <div className="container max-w-screen-xl mx-auto px-4 md:px-8">
          <div className="flex flex-col md:flex-row gap-16 lg:gap-24 items-center">
            
            <div className="flex-1 flex flex-col gap-6">
              <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold tracking-tight text-balance" style={{ fontFamily: 'var(--font-fraunces)' }}>
                Instant insight.
              </h2>
              <p className="text-lg text-muted-foreground leading-relaxed">
                Share a brief about who you are trying to reach. Kynd crafts distinct personas—each with their own voice, concerns, and way of seeing the world. Then watch as they share unfiltered thoughts about your product.
              </p>
              <ul className="flex flex-col gap-4 mt-4">
                {[
                  'Deep psychological profiling',
                  'Real conversation with your audience',
                  'Visual reaction analysis'
                ].map(feature => (
                  <li key={feature} className="flex items-center gap-3 text-foreground font-medium">
                    <div className="h-2 w-2 rounded-full bg-foreground" />
                    {feature}
                  </li>
                ))}
              </ul>
            </div>

            <div className="flex-1 w-full relative">
              <div className="absolute inset-0 bg-gradient-to-tr from-ink/5 to-transparent blur-3xl -z-10 rounded-full" />
              
              <div className="grid gap-6 relative">
                <MinimalCard className="relative md:translate-x-8 md:rotate-2 shadow-2xl z-20" hoverable>
                  <div className="flex items-start gap-4">
                    <PersonaAvatar name="Sarah Jenkins" size="lg" className="border-[rgba(26,26,27,0.1)]" />
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center justify-between gap-4">
                        <span className="font-semibold text-lg">Sarah Jenkins</span>
                        <StatusBadge variant="default">Pensive</StatusBadge>
                      </div>
                      <span className="text-sm text-muted-foreground uppercase tracking-wider">VP of Engineering</span>
                      <p className="text-sm mt-3 text-foreground/80 leading-relaxed">
                        &quot;The pricing page feels like it is hiding something. I need to understand the true cost before I can recommend this to my team.&quot;
                      </p>
                    </div>
                  </div>
                </MinimalCard>

                <MinimalCard className="relative md:-translate-x-8 md:-rotate-1 shadow-xl z-10 opacity-90" hoverable>
                  <div className="flex items-start gap-4">
                    <PersonaAvatar name="Marcus Chen" size="lg" />
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center justify-between gap-4">
                        <span className="font-semibold text-lg">Marcus Chen</span>
                        <StatusBadge variant="outline">Curious</StatusBadge>
                      </div>
                      <span className="text-sm text-muted-foreground uppercase tracking-wider">Startup Founder</span>
                    </div>
                  </div>
                </MinimalCard>
              </div>
            </div>

          </div>
        </div>
      </section>

      <section className="w-full py-32 flex flex-col items-center justify-center text-center px-4 border-t border-[rgba(26,26,27,0.1)]">
        <div className="max-w-3xl mx-auto flex flex-col items-center gap-8">
          <h2 className="text-4xl md:text-5xl font-bold tracking-tight text-balance" style={{ fontFamily: 'var(--font-fraunces)' }}>
            Ready to listen?
          </h2>
          <p className="text-xl text-muted-foreground text-balance">
            Step into the dashboard. No credit card required—just an open mind.
          </p>
          <Link 
            href="/dashboard"
            className="mt-4 inline-flex h-14 items-center justify-center rounded-xl bg-foreground px-10 text-base font-semibold text-background shadow transition-all hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Go to Dashboard &rarr;
          </Link>
        </div>
      </section>
    </div>
  )
}