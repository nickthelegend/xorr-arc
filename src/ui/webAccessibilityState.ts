import type { AccessibilityState } from 'react-native';

/** React Native Web 0.21 consumes individual ARIA props, not native accessibilityState. */
export function webAccessibilityState(state?: AccessibilityState) {
  return {
    'aria-busy': state?.busy,
    'aria-checked': state?.checked,
    'aria-disabled': state?.disabled,
    'aria-expanded': state?.expanded,
    'aria-selected': state?.selected,
  };
}
