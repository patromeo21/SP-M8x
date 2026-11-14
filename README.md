# SP-M8x
Web based SP/MPC/M8 style sampler/tracker

The shared Web Audio engine lives in `src/audio/audioEngine.ts`. Initialize it
from a user gesture before triggering playback.

Select a pad and press REC to record the iPad's microphone or the system-selected
compatible audio interface; press STOP to finish. Takes stop automatically after
60 seconds or when the page is hidden. Microphone permission and a secure
connection are required. The app does not monitor the input, but speakers or
interface loopback can still cause feedback. Use headphones and check routing.
Safari does not provide direct capture of other iPad apps' system audio.
Imported samples, recordings, and pad settings are saved in this browser using
IndexedDB. Tap a restored pad to decode and play it; its first tap may be slower.
Browser storage can be cleared or reclaimed, so it is not a permanent backup.
Watch the footer for save errors and avoid closing the page while it says SAVING.
Drag the S and E waveform markers to trim; hold P and slide vertically to adjust
pitch in semitones. FRAMES opens precise sample-frame fields (END is exclusive).
The waveform displays the decoded buffer's sample rate, channel count, and
duration. The browser may resample imported audio, so the displayed rate is not
necessarily the original file's sample rate. Audition the selected slice after
editing.

Run `npm test` for the audio-engine checks and `npm run build` for the production
TypeScript and Vite build.
