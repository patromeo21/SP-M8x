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
      user-select: none;
      -webkit-user-select: none;
      -webkit-touch-callout: none;
      overscroll-behavior: none;
      -webkit-overflow-scrolling: touch;
      background-color: #09090b;
      color: #f4f4f5;
    }

    /* Ensure all interactive pads, buttons, and tracker grids capture pointer events instantly without tap highlights */
    button, input, canvas, [role="button"], .phrase-cell-control {
      touch-action: manipulation;
      -webkit-tap-highlight-color: transparent;
      user-select: none;
      -webkit-user-select: none;
    }

    .app-shell, .app-shell * {
      -webkit-touch-callout: none;
      -webkit-user-select: none;
      user-select: none;
      -webkit-user-drag: none;
    }
    .app-shell input:not([type]), .app-shell input[type="text"],
    .app-shell input[type="number"], .app-shell input[type="search"],
    .app-shell input[type="email"], .app-shell input[type="url"],
    .app-shell input[type="password"], .app-shell textarea,
    .app-shell [contenteditable="true"] {
      -webkit-user-select: text;
      user-select: text;
    }
    .pad-trigger, .sampler-waveform, .sampler-waveform * {
      touch-action: none;
    }
  `;

  document.head.appendChild(style);
  const preventZoom = (event: Event) => event.preventDefault();
  document.addEventListener('gesturestart', preventZoom, { passive: false });
  document.addEventListener('gesturechange', preventZoom, { passive: false });
  const preventPerformanceGesture = (event: Event) => {
    const target = event.target;
    if (event.type === 'touchmove' && target instanceof Element && target.closest('.pad-pitch-control')) return;
    if (!(target instanceof Element) || !target.closest('.pad-grid, .sampler-waveform, .macro-trigger, [data-performance-touch]')) return;
    if (event.cancelable) event.preventDefault();
  };
  document.addEventListener('touchmove', preventPerformanceGesture, { passive: false });
  const preventCallout = (event: Event) => {
    const target = event.target;
    if (!(target instanceof Element) || !target.closest('.app-shell')) return;
    if (target.closest('input:not([type]), input[type="text"], input[type="number"], input[type="search"], input[type="email"], input[type="url"], input[type="password"], textarea, [contenteditable="true"]')) return;
    if (event.cancelable) event.preventDefault();
  };
  document.addEventListener('dragstart', preventCallout);
  document.addEventListener('selectstart', preventCallout);
  document.addEventListener('contextmenu', preventCallout);
  console.log('[TouchOptimizer] Applied mobile touch constraints for iPad 9th Gen.');
}