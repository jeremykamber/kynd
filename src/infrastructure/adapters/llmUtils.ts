/**
 * Utility function to strip markdown code fences from a string.
 * This is particularly useful when parsing JSON responses from LLMs that
 * might wrap the JSON in ```json blocks.
 * 
 * @param s - The string to strip code fences from.
 * @returns The cleaned string.
 */
export function stripCodeFence(s: string): string {
  if (!s) return s;
  return s
    .replace(/```json\n?/i, "")
    .replace(/```\n?/g, "")
    .trim();
}
