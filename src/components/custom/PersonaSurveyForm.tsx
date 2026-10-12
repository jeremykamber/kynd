"use client"

import { useState, type ReactNode } from "react"
import { Textarea } from "@/components/ui/textarea"
import type { PersonaSurvey } from "@/lib/surveyToPrompt"
import {
  GOAL_OPTIONS,
  FRUSTRATION_OPTIONS,
  SOLUTION_OPTIONS,
  DECISION_FACTOR_OPTIONS,
  AUDIENCE_KNOWLEDGE_OPTIONS,
  DECISION_TYPE_OPTIONS,
} from "@/lib/surveyToPrompt"
import { SparklesIcon } from "lucide-react"

interface PersonaSurveyFormProps {
  onSubmit: (survey: PersonaSurvey) => void
  /** A run is in flight: every control in the form is locked. */
  isSubmitting: boolean
  error?: string | null
  /**
   * Content rendered directly above the action row (i.e. the persona-count
   * control), so the guided mode matches the freeform mode's field order.
   */
  beforeActions?: ReactNode
}

/** The question groups the guided form requires, in page order. */
const REQUIRED_GROUPS = [
  { id: "audience", label: "Who you are targeting" },
  { id: "goals", label: "What they are trying to accomplish" },
  { id: "frustration", label: "Their biggest frustration" },
  { id: "solution", label: "How they solve it today" },
  { id: "decisionFactors", label: "What makes them choose a product" },
  { id: "audienceKnowledge", label: "How well you know this audience" },
  { id: "decisionTypes", label: "What decisions to model" },
] as const

type GroupId = (typeof REQUIRED_GROUPS)[number]["id"]

/**
 * The submit control for both setup modes.
 *
 * Freeform and guided must not drift: one component decides the disabled state,
 * the "Generating…" label and the padding, so a run looks and feels identical
 * whichever mode started it.
 */
export function PersonaSubmitButton({
  isSubmitting,
  disabled,
  onClick,
}: {
  isSubmitting: boolean
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || isSubmitting}
      className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-primary px-6 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
    >
      {isSubmitting ? (
        <>Generating…</>
      ) : (
        <>
          Generate Personas
          <SparklesIcon className="h-4 w-4" />
        </>
      )}
    </button>
  )
}

function OptionGroup({
  options,
  value,
  onChange,
  max,
  label,
  unmet,
}: {
  options: readonly string[]
  /** Selected values. A single-select group (`max` omitted) holds one at most. */
  value: string[]
  onChange: (values: string[]) => void
  /** The cap for a multi-select group; omit it for a single-select group. */
  max?: number
  label: string
  unmet: boolean
}) {
  const isMulti = max !== undefined

  const toggle = (opt: string) => {
    if (!isMulti) {
      onChange([opt])
      return
    }
    if (value.includes(opt)) {
      onChange(value.filter((v) => v !== opt))
    } else if (value.length < max) {
      onChange([...value, opt])
    }
  }

  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="text-sm font-semibold text-foreground mb-1">
        {label}
        {isMulti ? ` (choose up to ${max})` : ""}
        {unmet && (
          <span className="ml-2 align-middle micro-label text-warning-foreground">Required</span>
        )}
      </legend>
      <div className="flex flex-wrap gap-2">
        {options.map((opt) => {
          const isSelected = value.includes(opt)
          return (
            <button
              key={opt}
              type="button"
              onClick={() => toggle(opt)}
              className={`inline-flex items-center rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
                isSelected
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-secondary/50 text-muted-foreground hover:border-primary/50 hover:text-foreground"
              }`}
            >
              {isSelected && <span className="mr-1.5">{isMulti ? "✓" : "●"}</span>}
              {opt}
            </button>
          )
        })}
      </div>
    </fieldset>
  )
}

/**
 * Guided questionnaire (audience, goals, frustrations, decision factors) that
 * turns free-text answers, including "Other" write-ins, into the `PersonaSurvey`
 * consumed by the prompt compiler. Every group is required; unsatisfied groups
 * carry a "Required" marker and the action row names what is still missing, so
 * a disabled Generate button always says why. The freeform switch lives in the
 * card header, next to the mode's own description, not in this form.
 */
export function PersonaSurveyForm({ onSubmit, isSubmitting, error, beforeActions }: PersonaSurveyFormProps) {
  const [targetAudience, setTargetAudience] = useState("")
  const [goals, setGoals] = useState<string[]>([])
  const [frustration, setFrustration] = useState("")
  const [currentSolution, setCurrentSolution] = useState("")
  const [decisionFactors, setDecisionFactors] = useState<string[]>([])
  const [audienceKnowledge, setAudienceKnowledge] = useState("")
  const [decisionTypes, setDecisionTypes] = useState<string[]>([])
  const [additionalNotes, setAdditionalNotes] = useState("")
  const [frustrationCustom, setFrustrationCustom] = useState("")
  const [solutionCustom, setSolutionCustom] = useState("")
  const [goalCustom, setGoalCustom] = useState("")

  const hasGoalCustom = goals.includes("Something else")
  const isOtherFrustration = frustration === "Other"
  const isOtherSolution = currentSolution === "Other"

  // One source of truth for what is answered: the helper line, the required
  // markers and the submit button's disabled state all read this map.
  const answered: Record<GroupId, boolean> = {
    audience: targetAudience.trim().length > 0,
    goals: goals.length > 0 && (!hasGoalCustom || goalCustom.trim().length > 0),
    frustration: frustration.length > 0 && (!isOtherFrustration || frustrationCustom.trim().length > 0),
    solution: currentSolution.length > 0 && (!isOtherSolution || solutionCustom.trim().length > 0),
    decisionFactors: decisionFactors.length > 0,
    audienceKnowledge: audienceKnowledge.length > 0,
    decisionTypes: decisionTypes.length > 0,
  }
  const missingGroups = REQUIRED_GROUPS.filter((group) => !answered[group.id])
  const isComplete = missingGroups.length === 0

  const handleSubmit = () => {
    if (!isComplete) return

    const resolveCustom = (val: string, custom: string) =>
      val === "Other" && custom.trim() ? custom.trim() : val
    const resolveGoalCustom = (g: string) =>
      g === "Something else" && goalCustom.trim() ? goalCustom.trim() : g

    onSubmit({
      targetAudience: targetAudience.trim(),
      goals: goals.map(resolveGoalCustom),
      frustration: resolveCustom(frustration, frustrationCustom),
      currentSolution: resolveCustom(currentSolution, solutionCustom),
      decisionFactors,
      audienceKnowledge,
      decisionTypes,
      additionalNotes: additionalNotes.trim() || undefined,
    })
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium text-foreground">
          Who are you targeting?
          {!answered.audience && (
            <span className="ml-2 align-middle micro-label text-warning-foreground">Required</span>
          )}
        </label>
        <p className="text-sm text-muted-foreground">Describe your audience in a few words.</p>
        <input
          type="text"
          value={targetAudience}
          onChange={(e) => setTargetAudience(e.target.value)}
          placeholder="e.g. Small business owners, Frontend engineers, HR managers"
          disabled={isSubmitting}
          className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
        />
      </div>

      <OptionGroup
        options={GOAL_OPTIONS}
        value={goals}
        onChange={setGoals}
        max={3}
        label="What are they trying to accomplish?"
        unmet={!answered.goals}
      />
      {hasGoalCustom && (
        <input
          type="text"
          value={goalCustom}
          onChange={(e) => setGoalCustom(e.target.value)}
          placeholder="Describe their goal..."
          disabled={isSubmitting}
          className="-mt-2 h-10 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
        />
      )}

      <OptionGroup
        options={FRUSTRATION_OPTIONS}
        value={frustration ? [frustration] : []}
        onChange={(values) => setFrustration(values[0] ?? "")}
        label="What is their biggest frustration?"
        unmet={!answered.frustration}
      />
      {isOtherFrustration && (
        <input
          type="text"
          value={frustrationCustom}
          onChange={(e) => setFrustrationCustom(e.target.value)}
          placeholder="Describe their frustration..."
          disabled={isSubmitting}
          className="-mt-2 h-10 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
        />
      )}

      <OptionGroup
        options={SOLUTION_OPTIONS}
        value={currentSolution ? [currentSolution] : []}
        onChange={(values) => setCurrentSolution(values[0] ?? "")}
        label="How do they solve this today?"
        unmet={!answered.solution}
      />
      {isOtherSolution && (
        <input
          type="text"
          value={solutionCustom}
          onChange={(e) => setSolutionCustom(e.target.value)}
          placeholder="Describe their current solution..."
          disabled={isSubmitting}
          className="-mt-2 h-10 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
        />
      )}

      <OptionGroup
        options={DECISION_FACTOR_OPTIONS}
        value={decisionFactors}
        onChange={setDecisionFactors}
        max={3}
        label="What makes them choose a product?"
        unmet={!answered.decisionFactors}
      />

      <OptionGroup
        options={AUDIENCE_KNOWLEDGE_OPTIONS}
        value={audienceKnowledge ? [audienceKnowledge] : []}
        onChange={(values) => setAudienceKnowledge(values[0] ?? "")}
        label="How well do you know this audience?"
        unmet={!answered.audienceKnowledge}
      />

      <OptionGroup
        options={DECISION_TYPE_OPTIONS}
        value={decisionTypes}
        onChange={setDecisionTypes}
        max={5}
        label="What kind of decisions do you want these personas to help you evaluate?"
        unmet={!answered.decisionTypes}
      />

      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium text-foreground">Anything else we should know? <span className="text-muted-foreground font-normal">(optional)</span></label>
        <Textarea
          value={additionalNotes}
          onChange={(e) => setAdditionalNotes(e.target.value)}
          placeholder="Any additional context about your audience..."
          disabled={isSubmitting}
          className="min-h-[80px] resize-y"
        />
      </div>

      {beforeActions}

      <div className="flex flex-col gap-3">
        {!isComplete && (
          <p className="text-sm text-muted-foreground">
            Still needed: {missingGroups.map((group) => group.label).join(" · ")}
          </p>
        )}
        <div className="flex items-center justify-end">
          <PersonaSubmitButton
            isSubmitting={isSubmitting}
            disabled={!isComplete}
            onClick={handleSubmit}
          />
        </div>
      </div>

      {error && (
        <p className="text-sm text-destructive font-medium bg-destructive/10 p-3 rounded-md">{error}</p>
      )}
    </div>
  )
}
