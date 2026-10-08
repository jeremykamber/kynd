import { describe, it, expect } from 'vitest'
import { personaRunProgress } from '../personaRunProgress'

// The interview pipeline reports counts with different denominators per step
// (transcripts while extracting, personas while generating). A raw
// completed/total bar rewinds when the denominator changes, which is the bug
// the bands exist to prevent.
const PIPELINE_STEPS = [
  'EXTRACTING',
  'POOLING',
  'SAMPLING',
  'GENERATING',
  'INGESTING',
  'DONE',
] as const

describe('personaRunProgress', () => {
  it('fills the generating band with the personas generated', () => {
    expect(personaRunProgress('GENERATING', 0, 9)).toBe(0.5)
    expect(personaRunProgress('GENERATING', 9, 9)).toBe(0.92)
    // Halfway through the band, not halfway through the run.
    expect(personaRunProgress('GENERATING', 4.5, 9)).toBeCloseTo(0.71, 5)
  })

  it('never rewinds when the denominator changes between steps', () => {
    // The pipeline as the server reports it: 3 transcripts extracted, then 9
    // personas generated, then ingest. Every reading must be >= the previous.
    const readings = [
      personaRunProgress('EXTRACTING', 0, 3),
      personaRunProgress('EXTRACTING', 3, 3),
      personaRunProgress('POOLING'),
      personaRunProgress('SAMPLING'),
      personaRunProgress('GENERATING', 0, 9),
      personaRunProgress('GENERATING', 9, 9),
      personaRunProgress('INGESTING'),
      personaRunProgress('DONE'),
    ]
    for (let i = 1; i < readings.length; i++) {
      expect(readings[i]).toBeGreaterThanOrEqual(readings[i - 1])
    }
    expect(readings[0]).toBeGreaterThan(0)
    expect(readings[readings.length - 1]).toBe(1)
  })

  it('holds a step inside its own band even when counts are stale', () => {
    // storeProgress merges fields, so a step that reports no counts of its own
    // still sees the previous step's. A stale count can fill that step's band
    // but never overrun it, and never move the bar backwards.
    expect(personaRunProgress('POOLING')).toBe(0.3)
    expect(personaRunProgress('POOLING', 3, 3)).toBe(0.4)
    expect(personaRunProgress('POOLING', 99, 3)).toBe(0.4)
  })

  it('clamps counts that overshoot the step total', () => {
    expect(personaRunProgress('GENERATING', 12, 9)).toBe(0.92)
  })

  it('keeps the description pipeline step positions', () => {
    expect(personaRunProgress('BRAINSTORMING_PERSONAS')).toBe(0.1)
    expect(personaRunProgress('GENERATING_INSIGHTS')).toBe(0.75)
  })

  it('reports nothing for a step it has never seen', () => {
    expect(personaRunProgress('SOMETHING_NEW')).toBe(0)
    expect(personaRunProgress(undefined)).toBe(0)
  })

  it('covers every step the generating page maps to a stage', () => {
    for (const step of PIPELINE_STEPS) {
      expect(personaRunProgress(step)).toBeGreaterThan(0)
    }
  })
})
