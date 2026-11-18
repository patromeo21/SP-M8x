import { useEffect } from 'react';

// Mapping QWERTY keys to 4x4 grid coordinates (Row 0-3, Col 0-3)
const KEY_TO_PAD_MAP: Record<string, number> = {
  // Row 0 (Bank A top): Q W E R
  'KeyQ': 0, 'KeyW': 1, 'KeyE': 2, 'KeyR': 3,
  // Row 1: A S D F
  'KeyA': 4, 'KeyS': 5, 'KeyD': 6, 'KeyF': 7,
  // Row 2: Z X C V
  'KeyZ': 8, 'KeyX': 9, 'KeyC': 10, 'KeyV': 11,
  // Row 3 (Bank D bottom): 1 2 3 4
  'Digit1': 12, 'Digit2': 13, 'Digit3': 14, 'Digit4': 15,
};

export function useQwertyPads(onPadTrigger: (padIndex: number) => void, enabled: boolean = true) {
  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement).tagName)) {
        return;
      }
      // Ignore repeating keys if holding down
      if (e.repeat) return;

      const padIndex = KEY_TO_PAD_MAP[e.code];
      if (padIndex !== undefined) {
        e.preventDefault();
        onPadTrigger(padIndex);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onPadTrigger, enabled]);
}