import { describe, expect, it } from 'vitest'
import { reviewContext, structuralFailures } from '../scripts/quality-floor'

function run() {
  return {
    input: { text: 'A pricing page.' },
    responses: [
      { personaId: 'p1', personaProfile: { name: 'Ada' }, rawAnalysis: 'I would not pay. quote one' },
      { personaId: 'p2', personaProfile: { name: 'Ben' }, rawAnalysis: 'The price is fair. quote two' },
      { personaId: 'p3', personaProfile: { name: 'Cara' }, rawAnalysis: 'No view yet.' },
    ],
    synthesis: {
      overview: 'Two personas split on price.',
      researchQuestionAnswer: 'Price is the barrier.',
      topFindings: [
        {
          groupId: 'g1',
          observation: 'Price is the barrier.',
          impact: 'They stop.',
          affectedPersonaCount: 2,
          totalPersonaCount: 3,
          citations: [{ personaId: 'p1', personaName: 'Ada', quote: 'quote one' }],
        },
      ],
      disagreements: [
        {
          groupId: 'g2',
          topic: 'price',
          split: [
            { view: 'Too expensive', personaCount: 1 },
            { view: 'Fair', personaCount: 1 },
            { view: 'No clear view', personaCount: 1 },
          ],
        },
      ],
      biggestFrictions: ['Price.'],
      completedCount: 3,
      failedCount: 0,
      totalPersonaCount: 3,
      verdicts: { adopt: 0, trial: 1, reject: 1, undecided: 1 },
      claimGroups: [
        {
          id: 'g1',
          topic: 'price',
          personaCount: 2,
          supports: 1,
          opposes: 1,
          neutral: 0,
          claims: [
            { id: 'p1:0', personaId: 'p1', topic: 'price', observation: 'Price blocks.', stance: 'opposes', quote: 'quote one' },
            { id: 'p2:0', personaId: 'p2', topic: 'price', observation: 'Price is fair.', stance: 'supports', quote: 'quote two' },
          ],
          citations: [{ personaId: 'p1', personaName: 'Ada', quote: 'quote one' }],
        },
      ],
      degraded: [],
      missingClaimPersonaIds: [],
      validationWarnings: [],
    },
  }
}

describe('quality-floor structural gate', () => {
  it('passes a report that keeps the ledger invariants', () => {
    expect(structuralFailures(run()).failures).toEqual([])
  })

  it('fails a citation whose quote is not in the transcript', () => {
    const tampered = run()
    tampered.synthesis.topFindings[0].citations[0].quote = 'a sentence never said'
    expect(structuralFailures(tampered).failures.join(' ')).toMatch(/not in Ada's transcript/)
  })

  it('fails a split that does not sum to the completed count', () => {
    const tampered = run()
    tampered.synthesis.disagreements[0].split[0].personaCount = 2
    expect(structuralFailures(tampered).failures.join(' ')).toMatch(/sums to 4/)
  })

  it('fails a split without a No clear view bucket', () => {
    const tampered = run()
    tampered.synthesis.disagreements[0].split[2].view = 'Unclear'
    expect(structuralFailures(tampered).failures.join(' ')).toMatch(/No clear view/)
  })

  it('fails more than one marked field', () => {
    const tampered = run()
    ;(tampered.synthesis as any).validationWarnings = ['overview: a', 'split:g2: b']
    expect(structuralFailures(tampered).failures.join(' ')).toMatch(/2 marked fields/)
  })

  it('fails a finding below the cohort floor', () => {
    const tampered = run()
    tampered.synthesis.topFindings[0].affectedPersonaCount = 1
    expect(structuralFailures(tampered).failures.join(' ')).toMatch(/floor 2/)
  })

  it('fails a validator violation that is not a stored warning', () => {
    const tampered = run()
    tampered.synthesis.overview = 'All 99 personas stopped.'
    expect(structuralFailures(tampered).failures.join(' ')).toMatch(/unmarked validator violation/)
  })

  it('writes a blind context without a run id or fixture path', () => {
    const text = reviewContext(run())
    expect(text).toContain('# User-research report')
    expect(text).not.toContain('runId')
    expect(text).not.toContain('/home/')
  })
})
