import type { Metadata } from 'next';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { neutralNames } from '@/data/genderless_names';

/**
 * Public landing page.
 *
 * Layout: a report, not a stack of bands. The masthead is a two-column
 * composition (claim at left, an example run at right). Everything below sits
 * in one continuous column with a hairline spine at its left, so the page has a
 * single structure from top to bottom. Two type tiers carry the hierarchy: 36px
 * for the three arguments, 20px for the three mechanics.
 *
 * Every claim maps to a shipped feature: persona generation from a description
 * or interview transcripts, analysis of a URL, screenshot, document or pasted
 * text, the five-stage journey, cohort synthesis, chat and debate, PDF export.
 *
 * The stage names are the ones the report prints (`CognitiveStage`). Renaming
 * them here alone would make this page disagree with the product.
 */
export const metadata: Metadata = {
  title: 'Kynd: find the problems before your users do',
  description:
    'Run AI personas through your landing page, screenshot, or document. See where each one stopped: understanding, belief, motivation, action. Simulated results, not customer research.',
  openGraph: {
    title: 'Kynd: find the problems before your users do',
    description:
      'Run AI personas through your landing page, screenshot, or document. See where each one stopped. Simulated results, not customer research.',
    siteName: 'Kynd',
    type: 'website',
  },
};

const FOLLOW_UPS = [
  {
    title: 'Chat with one persona',
    body: 'Ask why it hesitated. The persona answers from its own traits, its backstory, and the response it already gave.',
  },
  {
    title: 'Ask the whole audience',
    body: 'Ask one question and see how the cohort answers, with the individual responses behind the summary.',
  },
  {
    title: 'Run a debate',
    body: 'Give two to five personas a proposal and let them challenge each other. Useful when your real audience would argue about it.',
  },
];

const RUN = [
  { stage: 'Interpretation', state: 'Reached' },
  { stage: 'Understanding', state: 'Reached' },
  { stage: 'Belief', state: 'Stopped' },
  { stage: 'Motivation', state: 'Not reached' },
  { stage: 'Action', state: 'Not reached' },
] as const;

const AUDIENCE_ROLES = ['Marketing lead', 'Founder', 'Procurement', 'Freelancer'] as const;

/**
 * Example names come from the same seeded generator the product uses for real
 * personas (`neutralNames`), so the page never invents a person. One fixed seed
 * keeps the same five names on every render.
 */
const [firstPersonaName, secondPersonaName, thirdPersonaName, fourthPersonaName, quotedPersonaName] =
  neutralNames('founders and marketing leads', 5);

const AUDIENCE = AUDIENCE_ROLES.map((role, index) => ({
  role,
  name: [firstPersonaName, secondPersonaName, thirdPersonaName, fourthPersonaName][index] ?? 'Persona',
}));

const QUOTED_PERSONA = quotedPersonaName ?? 'Persona';

const ARTIFACT_KINDS = ['Live URL', 'Screenshot', 'Up to 5 documents', 'Pasted text'] as const;

/**
 * Where an example cohort of ten stopped. The bar is the count, so the shape of
 * the group reads before the numbers do.
 */
const COHORT_SPREAD = [
  { stage: 'Interpretation', count: 2 },
  { stage: 'Understanding', count: 3 },
  { stage: 'Belief', count: 4 },
  { stage: 'Motivation', count: 1 },
  { stage: 'Action', count: 0 },
] as const;
const COHORT_TOTAL = 10;
const COHORT_MAX = 4;

const STAGES = [
  { label: 'Interpretation', question: 'What do I think this is?' },
  { label: 'Understanding', question: 'Do I understand it?' },
  { label: 'Belief', question: 'Do I believe it?' },
  { label: 'Motivation', question: 'Do I care enough?' },
  { label: 'Action', question: 'What do I do next?' },
];

/**
 * One block of the report. Uniform vertical rhythm; the variant carries the one
 * moment that earns more air (the limit, 06).
 */
function ReportSection({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <section className={`py-12 md:py-16 ${className}`}>{children}</section>;
}

export default function MarketingPage() {
  return (
    <div className="w-full">
      {/* Masthead: the headline is the design. Output sits beside it, not below. */}
      <section className="mx-auto max-w-6xl px-6 pb-12 pt-12 md:px-8 md:pb-16 md:pt-16">
        <div className="grid items-start gap-12 lg:grid-cols-[1.35fr_1fr] lg:gap-16">
          <div className="flex flex-col gap-6">
            <h1 className="max-w-[14ch] text-4xl font-semibold tracking-tight leading-display text-balance sm:text-5xl">
              Find the problems before your users do.
            </h1>

            <p className="max-w-[46ch] text-base text-pretty leading-relaxed text-foreground/80">
              Kynd puts your page in front of AI personas built from your audience description or interview transcripts.
            </p>

            <div className="mt-2 flex flex-col gap-3 sm:flex-row">
              <Button asChild size="lg" className="focus-ring">
                <Link href="/dashboard">Create your first persona</Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="focus-ring">
                <Link href="#how-it-works">See how it works</Link>
              </Button>
            </div>
          </div>

          {/*
            The shape of the output: a run, read as a scale. No card — the
            report is a set of ruled rows in the product too, and a card here
            would read as a testimonial from a real customer.
          */}
          <div className="w-full max-w-[27rem] lg:ml-auto">
            <div className="flex items-center justify-between gap-4 border-b border-border/60 pb-2">
              <span className="micro-label text-muted-foreground">Example run</span>
              <span className="micro-label text-muted-foreground">Simulated</span>
            </div>

            <ol aria-label="Example persona journey">
              {RUN.map((row) => (
                <li
                  key={row.stage}
                  className="flex items-baseline justify-between gap-6 border-b border-border/40 py-2"
                >
                  <span className="text-base font-semibold">{row.stage}</span>
                  {row.state === 'Stopped' ? (
                    <span className="inline-flex items-center gap-2 text-sm font-medium text-warning-foreground">
                      <span className="size-1.5 rounded-full bg-current" />
                      Stopped
                    </span>
                  ) : (
                    <span
                      className={
                        row.state === 'Reached'
                          ? 'text-sm text-foreground/70'
                          : 'text-sm text-muted-foreground'
                      }
                    >
                      {row.state}
                    </span>
                  )}
                </li>
              ))}
            </ol>

            <figure className="mt-6">
              <blockquote className="text-base text-pretty leading-relaxed text-foreground/80">
                ‘I can see what it does. There is no price on this page, and I would not book a call to find it out.’
              </blockquote>
              <figcaption className="mt-2 text-sm text-muted-foreground">
                {QUOTED_PERSONA}, VP of Engineering
              </figcaption>
            </figure>
          </div>
        </div>
      </section>

      {/* The report: one column, one spine, numbered margin. */}
      <div className="mx-auto max-w-6xl px-6 md:px-8">
        <div className="border-l border-border/40 pl-4 md:pl-12 lg:pl-16">
          {/* 01 — the problem */}
          <ReportSection>
            <div className="flex max-w-[62ch] flex-col gap-6">
              <h2 className="text-4xl font-semibold tracking-tight text-balance">
                You know what you mean. Do your users?
              </h2>
              <p className="text-base text-pretty leading-relaxed text-muted-foreground">
                Your team built the product. Your visitors meet it for the first time. A headline that reads clearly to you can leave them unsure what you sell. A price you explain on a call can read as a missing price on the page.
              </p>
              <p className="text-base text-pretty leading-relaxed text-muted-foreground">
                These gaps cost you customers quietly. Kynd makes them visible while the page is still a draft.
              </p>
            </div>
          </ReportSection>

          {/*
            02 — the workflow. Three steps, each shown as the artifact it leaves
            behind: a cohort roster, the reading surface, the spread of stops.
            The objects differ on purpose; three identical text columns read as
            template.
          */}
          <ReportSection>
            <div id="how-it-works" className="flex flex-col gap-10 scroll-mt-24">
              <h2 className="text-xl font-semibold tracking-tight">From a sentence to a report.</h2>

              <ol className="flex flex-col">
                <li className="grid gap-6 border-t border-border/60 py-8 first:border-t-0 first:pt-0 md:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] md:gap-12">
                  <div className="flex flex-col gap-3">
                    <div className="flex items-baseline gap-3">
                      <span className="micro-label text-muted-foreground">01</span>
                      <h3 className="text-base font-semibold">Build your audience</h3>
                    </div>
                    <p className="max-w-[44ch] text-base text-pretty leading-relaxed text-muted-foreground">
                      Describe them, answer the guided questions, or upload interview transcripts. Choose 1 to 20 personas.
                    </p>
                  </div>

                  <div className="flex flex-col">
                    <div className="flex items-baseline justify-between gap-4 border-b border-border/60 pb-2">
                      <span className="micro-label text-muted-foreground">Example cohort</span>
                      <span className="micro-label text-muted-foreground">10 personas</span>
                    </div>
                    <ul>
                      {AUDIENCE.map((person) => (
                        <li
                          key={person.name}
                          className="flex items-baseline justify-between gap-4 border-b border-border/40 py-2"
                        >
                          <span className="text-sm font-medium">{person.name}</span>
                          <span className="text-sm text-muted-foreground">{person.role}</span>
                        </li>
                      ))}
                      <li className="flex items-baseline justify-between gap-4 py-2 text-sm text-muted-foreground/70">
                        <span>+ 6 more</span>
                        <span>Same brief</span>
                      </li>
                    </ul>
                  </div>
                </li>

                <li className="grid gap-6 border-t border-border/60 py-8 md:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] md:gap-12">
                  <div className="flex flex-col gap-3">
                    <div className="flex items-baseline gap-3">
                      <span className="micro-label text-muted-foreground">02</span>
                      <h3 className="text-base font-semibold">Put your work in front of them</h3>
                    </div>
                    <p className="max-w-[44ch] text-base text-pretty leading-relaxed text-muted-foreground">
                      Each persona reads the artifact as a first-time visitor.
                    </p>
                  </div>

                  <div className="flex flex-col gap-3">
                    <div className="flex items-baseline justify-between gap-4 border-b border-border/60 pb-2">
                      <span className="micro-label text-muted-foreground">Artifact</span>
                      <span className="micro-label text-muted-foreground">Read once per persona</span>
                    </div>
                    <p className="overflow-hidden text-ellipsis whitespace-nowrap rounded-md border border-border px-3 py-2 font-mono text-sm text-foreground/80">
                      https://your-site.com/pricing
                    </p>
                    <ul className="grid grid-cols-2 gap-x-6">
                      {ARTIFACT_KINDS.map((kind, index) => (
                        <li
                          key={kind}
                          className={`flex items-center gap-2 border-b border-border/40 py-2 text-sm ${
                            index === 0 ? 'text-foreground' : 'text-muted-foreground'
                          }`}
                        >
                          <span
                            aria-hidden="true"
                            className={`size-1.5 shrink-0 rounded-full ${
                              index === 0 ? 'bg-foreground' : 'border border-muted-foreground/60'
                            }`}
                          />
                          {kind}
                        </li>
                      ))}
                    </ul>
                  </div>
                </li>

                <li className="grid gap-6 border-t border-border/60 py-8 md:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] md:gap-12">
                  <div className="flex flex-col gap-3">
                    <div className="flex items-baseline gap-3">
                      <span className="micro-label text-muted-foreground">03</span>
                      <h3 className="text-base font-semibold">Find out what breaks</h3>
                    </div>
                    <p className="max-w-[44ch] text-base text-pretty leading-relaxed text-muted-foreground">
                      The stage where each persona stopped, the sentence that caused it, and the pattern across the group. Export the report as a PDF.
                    </p>
                  </div>

                  <div className="flex flex-col">
                    <div className="flex items-baseline justify-between gap-4 border-b border-border/60 pb-2">
                      <span className="micro-label text-muted-foreground">Stopped at</span>
                      <span className="micro-label text-muted-foreground">Example · {COHORT_TOTAL} personas</span>
                    </div>
                    <ul>
                      {COHORT_SPREAD.map((row) => (
                        <li
                          key={row.stage}
                          className="grid grid-cols-[minmax(0,7.5rem)_1fr] items-center gap-4 border-b border-border/40 py-2 last:border-b-0"
                        >
                          <span className="text-sm">{row.stage}</span>
                          <span className="flex items-center gap-3">
                            <span className="w-4 shrink-0 text-right font-mono text-xs tabular-nums text-muted-foreground">
                              {row.count}
                            </span>
                            <span className="h-1.5 flex-1 overflow-hidden bg-muted">
                              <span
                                className="block h-full bg-foreground/60"
                                style={{ width: `${(row.count / COHORT_MAX) * 100}%` }}
                              />
                            </span>
                          </span>
                        </li>
                      ))}
                    </ul>
                    <p className="pt-3 text-sm text-muted-foreground">
                      Most stopped at Belief, where they did not trust the claim.
                    </p>
                  </div>
                </li>
              </ol>
            </div>
          </ReportSection>

          {/* 03 — the differentiator */}
          <ReportSection>
            <div id="features" className="grid gap-12 scroll-mt-24 lg:grid-cols-[1fr_1.05fr] lg:gap-16">
              <div className="flex max-w-[46ch] flex-col gap-6">
                <h2 className="text-4xl font-semibold tracking-tight text-balance">
                  Don’t just find out what’s wrong. Find out where it went wrong.
                </h2>
                <p className="text-base text-pretty leading-relaxed text-muted-foreground">
                  Every persona moves through the same five stages, from the first glance to the decision to act. It does not simply fail your page. It stops at a stage, and the stage tells you what to fix.
                </p>
                <p className="text-base text-pretty leading-relaxed text-muted-foreground">
                  The report names that stage, quotes the sentence behind it, and shows where the rest of the cohort stopped.
                </p>
              </div>

              <div className="flex flex-col">
                <div className="flex items-baseline justify-between gap-6 border-b border-border/60 pb-2">
                  <span className="micro-label text-muted-foreground">Stage</span>
                  <span className="micro-label text-muted-foreground">Question</span>
                </div>
                <ol className="flex flex-col">
                  {STAGES.map((stage) => (
                    <li
                      key={stage.label}
                      className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-b border-border/40 py-4"
                    >
                      <span className="text-xl font-semibold tracking-tight">{stage.label}</span>
                      <span className="text-sm text-muted-foreground">{stage.question}</span>
                    </li>
                  ))}
                </ol>
              </div>
            </div>
          </ReportSection>

          {/* 04 — what follows the report */}
          <ReportSection>
            <div className="flex flex-col gap-8">
              <div className="flex max-w-[52ch] flex-col gap-3">
                <h2 className="text-xl font-semibold tracking-tight">Ask the follow-up question.</h2>
                <p className="text-base text-pretty leading-relaxed text-muted-foreground">
                  A report answers what you asked. These answer what you ask next.
                </p>
              </div>
              <dl className="flex flex-col">
                {FOLLOW_UPS.map((item) => (
                  <div
                    key={item.title}
                    className="grid gap-2 border-t border-border/60 py-6 first:border-t-0 first:pt-0 md:grid-cols-[1fr_1.6fr] md:gap-8"
                  >
                    <dt className="text-base font-semibold">{item.title}</dt>
                    <dd className="text-base text-pretty leading-relaxed text-muted-foreground">
                      {item.body}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          </ReportSection>

          {/* 05 — grounding */}
          <ReportSection>
            <div className="flex max-w-[62ch] flex-col gap-3">
              <h2 className="text-xl font-semibold tracking-tight">
                Or start from the interviews you already ran.
              </h2>
              <p className="text-base text-pretty leading-relaxed text-muted-foreground">
                Upload your transcripts (.txt) and Kynd builds personas from what people actually said. Each trait keeps the quote it came from, so you can check the reasoning before you trust the conclusion.
              </p>
            </div>
          </ReportSection>

          {/* 06 — the limit. Given the most air on the page on purpose. */}
          <ReportSection className="mt-6 md:mt-12">
            <div className="flex max-w-[62ch] flex-col gap-4">
              <h2 className="text-4xl font-semibold tracking-tight text-balance">
                These are hypotheses, not customer evidence.
              </h2>
              <p className="text-base text-pretty leading-relaxed text-muted-foreground">
                Kynd simulates first-time user perspectives to help you find potential problems before you invest in another research round. Use the findings to decide what deserves testing, then validate the decisions that matter with real people.
              </p>
            </div>
          </ReportSection>
        </div>
      </div>

      {/* Close: the one full-width block after the report. */}
      <div className="mx-auto max-w-6xl px-6 md:px-8">
        <section className="border-t border-border/50 py-12 md:py-16">
          <div className="flex max-w-[62ch] flex-col gap-6">
            <h2 className="text-4xl font-semibold tracking-tight text-balance">
              Find out what your users might be missing.
            </h2>
            <p className="text-base text-pretty leading-relaxed text-muted-foreground">
              Create your first persona, run your landing page through it, and see where your message breaks down. No recruiting, no scheduling, no research project.
            </p>
            <div className="mt-2">
              <Button asChild size="lg" className="focus-ring">
                <Link href="/dashboard">Create your first persona</Link>
              </Button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
