import { createTV } from 'tailwind-variants';

/**
 * The UI Kit's `@theme` block (src/app/globals.css) adds custom scales on
 * top of Tailwind's own - a type scale, radii, shadows, letter-tracking and
 * motion tokens. `tailwind-variants` dedupes conflicting classes via
 * `tailwind-merge`, which doesn't know these scales exist.
 *
 * Left unregistered, `text-*` is the dangerous one: Tailwind overloads that
 * prefix for both font-size (`text-sm`) and text-color (`text-red-500`), so
 * an unrecognized `text-label` silently gets bucketed into the color group
 * and deletes whatever `text-white`/`text-ink` sits next to it in the same
 * class list - the "button font color" bug. Radii/shadows/tracking/motion
 * aren't actively dangerous (they just don't dedupe against Tailwind's own
 * `rounded-lg` etc.), but registering them means a caller's `className`
 * override actually wins instead of both classes surviving and CSS source
 * order deciding.
 *
 * Every component in the kit should import `tv` from here, never straight
 * from `tailwind-variants` - a raw `tv()` reintroduces this bug silently.
 */
export const tv = createTV({
  twMergeConfig: {
    extend: {
      classGroups: {
        'font-size': [
          'nano', 'micro', 'mini', 'meta', 'label', 'field', 'panel', 'body', 'lead', 'resource', 'page', 'kit',
        ].map((v) => `text-${v}`),
        'font-family': ['font-display'],
        rounded: ['badge', 'control', 'menu', 'panel'].map((v) => `rounded-${v}`),
        shadow: [
          'panel', 'raise', 'pop', 'tip', 'toast', 'toast-live', 'modal', 'knob', 'knob-off', 'switch-hover', 'focus', 'focus-paper',
        ].map((v) => `shadow-${v}`),
        tracking: [
          'heading', 'title', 'subhead', 'brand', 'caps', 'caps-wide', 'caps-wider', 'caps-widest',
        ].map((v) => `tracking-${v}`),
        animate: [
          'dot', 'spin-fast', 'shimmer', 'toast-in', 'overlay-in', 'modal-in',
        ].map((v) => `animate-${v}`),
      },
    },
  },
});
