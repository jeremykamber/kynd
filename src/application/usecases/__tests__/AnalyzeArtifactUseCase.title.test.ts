import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AnalyzeArtifactUseCase, type AnalysisProgress } from '../AnalyzeArtifactUseCase'
import { ArtifactIntakeAdapter } from '@/infrastructure/adapters/ArtifactIntakeAdapter'
import { LlmServicePort } from '@/domain/ports/LlmServicePort'
import type { ArtifactIntake } from '@/domain/entities/ArtifactIntake'

describe('AnalyzeArtifactUseCase title generation', () => {
  let useCase: AnalyzeArtifactUseCase
  let mockIntake: { intake: ReturnType<typeof vi.fn> }
  let mockLlm: LlmServicePort

  const intake: ArtifactIntake = {
    screenshotBase64: 'base64img',
    url: 'https://example.com',
    summaryPromise: Promise.resolve('A B2B pricing page.'),
    pageHtml: '<html><body>pricing</body></html>',
  }

  beforeEach(() => {
    mockIntake = { intake: vi.fn().mockResolvedValue(intake) }
    mockLlm = {
      generateSimulationTitle: vi.fn().mockResolvedValue('Example title'),
    } as any
    useCase = new AnalyzeArtifactUseCase(mockIntake as any, mockLlm)
  })

  it('generates a title from the research context + artifact and streams it via onProgress', async () => {
    vi.mocked(mockLlm.generateSimulationTitle).mockResolvedValue('Pricing Friction Diagnostic')

    const progress: AnalysisProgress[] = []
    await useCase.execute(
      { type: 'url', url: 'https://example.com' },
      [],
      'Increase conversions',
      'Why do founders hesitate?',
      (p) => progress.push(p),
    )

    // The title is generated from the caller-owned research context. The
    // artifact-derived fields (url/summary/screenshot) are not pinned: what
    // the caller observes is the title itself, asserted below.
    expect(mockLlm.generateSimulationTitle).toHaveBeenCalledWith(
      expect.objectContaining({
        businessGoal: 'Increase conversions',
        researchQuestion: 'Why do founders hesitate?',
      }),
      expect.anything(),
    )

    // The title reaches the caller through a progress event. The call is
    // fire-and-forget and concurrent with persona analysis, so wait for the
    // event instead of assuming it lands before execute resolves.
    await vi.waitFor(() => {
      expect(progress.find((p) => p.title)).toMatchObject({
        step: 'ANALYZING',
        title: 'Pricing Friction Diagnostic',
      })
    })
  })

  it('does not fail the run when title generation throws (nice-to-have)', async () => {
    (mockLlm.generateSimulationTitle as any).mockRejectedValue(new Error('model down'))

    await expect(
      useCase.execute({ type: 'url', url: 'https://example.com' }, [], 'goal', 'question'),
    ).resolves.toEqual([])
  })
})
