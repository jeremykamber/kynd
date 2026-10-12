/**
 * The one place the dashboard's bottom clearance is defined.
 *
 * Four things are pinned near the bottom of a dashboard screen — the mobile tab
 * bar, the floating "Run Analysis" CTA, the interviews page's "Show Progress"
 * button, and the toast stack — and the page content underneath them has to
 * stop short of all four. The audit found three overlaps at 390px (a toast over
 * the tab bar, the dock over another CTA, the tab bar over the last card)
 * because each of those elements carried its own one-off offset.
 *
 * The contract, from DESIGN.md ("Navigation / Primary Nav" → Clearance):
 *
 * - the bottom tab bar owns the bottom edge (`bottom-0`) below `lg`;
 * - a fixed bottom action clears the tab bar below `lg` (`bottom-24` = 96px)
 *   and sits at the page edge from `lg` up (`bottom-6` = 24px);
 * - two fixed actions never share a corner: the dock owns the right one, the
 *   interviews page's progress action takes the left, so neither can be
 *   covered by the other no matter which of them is present;
 * - the content column reserves the tab bar's clearance (`pb-28` below `lg`,
 *   `pb-16` above it);
 * - the toast stack starts above the whole column, and because a toast is only
 *   ever informational its card does not take clicks that belong to the page
 *   (see the root layout's Toaster).
 *
 * Classes and pixel values are the same numbers in two units: Tailwind needs
 * the literals, sonner takes the pixels. Change them together.
 */

/** The mobile tab bar: pinned to the bottom edge, below the fixed actions. */
export const BOTTOM_BAR_POSITION_CLASS = 'fixed inset-x-0 bottom-0 z-40'

/** Where a fixed bottom action lives: clear of the tab bar, at the edge above it. */
export const FIXED_BOTTOM_OFFSET_CLASS = 'bottom-24 lg:bottom-6'

/** What the content column reserves below its last row (`main` in the shell). */
export const CONTENT_BOTTOM_PADDING_CLASS = 'pb-28 lg:pb-16'

/**
 * Where the toast stack starts, in pixels above the viewport bottom: one action
 * height (`h-10` = 40px) plus a gap (12px) above a fixed bottom action. It is
 * one value for every viewport on purpose — sonner only switches to
 * `mobileOffset` below 600px, while the tab bar and the dock are both there
 * until `lg`, so a smaller "desktop" offset would put the stack on top of the
 * dock on a tablet.
 */
export const TOAST_BOTTOM_OFFSET_PX = 148

/** Side inset for the toast stack: the tab bar's inset on a phone. */
export const TOAST_SIDE_OFFSET_PX = { mobile: 16, desktop: 24 } as const
