/**
 * SP-M8x Hybrid Music Production Suite
 * touchOptimizer.ts — Mobile Touch Constraints & Performance Optimization
 */

export function applyTouchOptimizations(): void {
  if (typeof document === 'undefined') return;

  const styleId = 'sp-m8x-touch-optimizations';
  if (document.getElementById(styleId)) return;

  const style = document.createElement('style');
  style.id = styleId;
  style.innerHTML = `
    /* Disable default iOS touch gestures, rubber-banding, and text selection for tactile performance */
    html, body, #root {
      touch-action: none;
      user-select: none;
      -webkit-user-select: none;
      -webkit-touch-callout: none;
      overscroll-behavior: none;
      -webkit-overflow-scrolling: touch;
      background-color: #09090b;
      color: #f4f4f5;
    }

    /* Ensure all interactive pads, buttons, and tracker grids capture pointer events instantly without tap highlights */
    button, input, canvas, [role="button"], .tracker-cell {
      touch-action: manipulation;
      -webkit-tap-highlight-color: transparent;
      user-select: none;
      -webkit-user-select: none;
    }

    .pad-trigger {
      touch-action: none;
    }
  `;

  document.head.appendChild(style);
  const preventZoom = (event: Event) => event.preventDefault();
  document.addEventListener('gesturestart', preventZoom, { passive: false });
  document.addEventListener('gesturechange', preventZoom, { passive: false });
  console.log('[TouchOptimizer] Applied mobile touch constraints for iPad 9th Gen.');
}