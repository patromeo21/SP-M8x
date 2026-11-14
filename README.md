# SP-M8x
Web based SP/MPC/M8 style sampler/tracker

The shared Web Audio engine lives in `src/audio/audioEngine.ts`. Initialize it
from a user gesture before triggering playback.
If iPadOS interrupts audio, the footer shows a resume button. Tap it after the
interruption ends; Safari can require another user gesture before audio resumes.

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
necessarily the original file's sample rate. Trigger the pad to audition while
moving a marker. Marker changes are saved on release and cancelled if the
gesture is interrupted.
Use the waveform −/+ buttons to zoom (up to 32×); drag the waveform itself to
pan. Peak analysis is batched and restarts after panning settles.
The white playhead follows the most recently triggered sounding voice of the
selected pad using the audio clock; it is not compensated for output-device
latency. The faint vertical lines preview the selected number of grid slices.
Select 2–32 slices and assign the selected S/E region to empty
pads. Up to 16 slices use the current bank; larger counts continue through later banks,
wrapping from D to A. Change banks to choose a starting destination. The source is
unchanged; existing pads are never overwritten, and the operation fails if
there are not enough empty pads or frames. Slices share their source audio but
have independently editable markers, pitch, and playback mode. Uneven frame
counts are distributed between adjacent slices without gaps.
The waveform combines the signed peaks of all channels at screen resolution;
long samples are analyzed in small batches to keep pad controls responsive.
Choose DELETE PADS above the grid, tap one or more occupied pads (bank changes
are allowed), and confirm deletion. Shared source audio remains available to
other pads until its last reference is removed.
Turn on COPY above the pads and drag a loaded pad onto an empty pad in the
same bank. The new pad shares audio but has independent editing parameters.
Tap the playback mode button to cycle ONE-SHOT (plays the selected region),
GATE (plays while held, up to the end of the region), and LOOP (tap to start
or stop the region). Modes are saved per pad. Switching to GATE stops active
voices for that pad.
On the first tap after a reload, a saved sample may need to decode; a gate
released before loading completes will not play.

The footer PLAY starts the active 64-step phrase at the saved tempo and STOP
cancels notes that have not yet started. PHRASE REC arms pad capture while the
transport runs. Each sounding pad is placed on the nearest step with signed
eighth-step timing; a step holds one pad, and occupied steps are not overwritten.
Tap a recorded step in the workspace grid and confirm to clear its note.
Changes inside the scheduler's lookahead may not play until the next loop.
Phrase playback currently triggers each sample as a one-shot; gate lengths, loop
recording, effects, and song arrangement are not yet implemented. Restored pads
used by the phrase are decoded before playback starts. Phrase data is saved in
browser local storage, separately from pad audio; check for save errors.

The MASTER slider changes output gain. PEAK is a sampled stereo output level,
not a continuous clip detector or a limiter: it can miss brief peaks and does
not measure true peaks. Multiple pads can overload the output; keep levels low.

Run `npm test` for the audio-engine checks and `npm run build` for the production
TypeScript and Vite build.
