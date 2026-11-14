# SP-M8x
Web based SP/MPC/M8 style sampler/tracker

The shared Web Audio engine lives in `src/audio/audioEngine.ts`. Initialize it
from a user gesture before triggering playback. Decoded sample buffers are held
in memory and are not restored when the page reloads.

Select a pad and press REC to record the iPad's microphone or the system-selected
compatible audio interface; press STOP to finish. Takes stop automatically after
60 seconds or when the page is hidden. Microphone permission and a secure
connection are required. The app does not monitor the input, but speakers or
interface loopback can still cause feedback. Use headphones and check routing.
Safari does not provide direct capture of other iPad apps' system audio.
Recordings and imported samples are lost on reload.

Run `npm test` for the audio-engine checks and `npm run build` for the production
TypeScript and Vite build.
