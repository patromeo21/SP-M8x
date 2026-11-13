# SP-M8x
Web based SP/MPC/M8 style sampler/tracker

The shared Web Audio engine lives in `src/audio/audioEngine.ts`. Initialize it
from a user gesture before triggering playback. Decoded sample buffers are held
in memory and are not restored when the page reloads.

Run `npm test` for the audio-engine checks and `npm run build` for the production
TypeScript and Vite build.
