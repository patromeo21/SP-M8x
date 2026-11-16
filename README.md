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
Drag the full-height S and E waveform markers to trim; hold P and slide
vertically to adjust pitch in semitones. Drag across the waveform to audition
from the selected sample position; pinch to zoom. FRAMES opens precise
sample-frame fields (END is exclusive).
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
Choose 2–32 slices from CHOP to show the assignment button and assign the selected S/E region to empty
pads. Up to 16 slices use the current bank; larger counts continue through later banks,
wrapping from D to A. Change banks to choose a starting destination. The source is
unchanged; existing pads are never overwritten, and the operation fails if
there are not enough empty pads or frames. Slices share their source audio but
have independently editable markers, pitch, and playback mode. Uneven frame
counts are distributed between adjacent slices without gaps.
Alternatively, choose a CHOP count to immediately save evenly spaced frame
markers on the selected sample without occupying pads. Enable SLI above
the grid: the first ten physical pads play slices 1–10 of that sample, while
the remaining six retain their normal bank behavior. Pads beyond the number
of slices play the last slice. SLI is saved per instrument and requires saved
markers; choose another source in BANK mode. Replacing a sample clears its
markers. Recorded SLI hits retain their slice index; changing the markers later
changes what those hits play.
The waveform combines the signed peaks of all channels at screen resolution;
long samples are analyzed in small batches to keep pad controls responsive.
Choose DEL above the grid, tap one or more occupied pads (bank changes
are allowed), and confirm deletion. Shared source audio remains available to
other pads until its last reference is removed.
Turn on COPY above the pads, tap a loaded source, switch banks if needed, and
tap an empty destination. The new pad shares audio but has independent editing
parameters.
Choose BANK or CHROMATIC above the grid. In chromatic mode the last selected
pad is the source for all 16 keys, spanning -7 to +8 semitones plus ROOT.
Pitch shifting changes sample duration. Recorded notes retain their pitch and
source pad. Mode and ROOT reset when the page is reloaded; select another
source in BANK mode.
Tap the playback mode button to cycle ONE-SHOT (plays the selected region),
GATE (plays while held, up to the end of the region), and LOOP (tap to start
or stop the region). Modes are saved per pad. Switching to GATE leaves an
already-playing one-shot sounding; subsequent triggers stop when released.
Switching away from LOOP stops its active loop.
On the first tap after a reload, a saved sample may need to decode; a gate
released before loading completes will not play.

The footer PLAY starts the active phrase at the saved tempo and STOP
cancels notes that have not yet started. Each phrase has eight tracks; use
TRACK in PHRASE or TABLE to choose which track to edit. The selected pad's
TRACK selector sets its preferred recording track. MIXER adjusts the eight
track levels. Set LENGTH to 16, 32, or 64 while stopped. Shortening a phrase
hides its later steps without deleting them; lengthening it restores them.

PHRASE REC arms pad capture while the transport runs. Each sounding pad is
placed on the nearest step with signed eighth-step timing. A track has one
event per step: an identical instrument, slice, note and offset updates its velocity;
otherwise recording scans from the preferred track, wrapping through the eight
tracks for a free cell. The recorded hit uses the destination track's level.
If every cell is occupied, the hit still sounds live but is not recorded and a
warning is shown. While playing, choose another phrase in PHR to cue it. Its samples are
prepared first, then playback switches to its first step on the next 16-step
bar boundary not already scheduled. A cue close to the boundary or a slow
sample decode can therefore wait an extra bar. The outgoing phrase keeps
playing while preparation is pending. The incoming first step's negative
microtiming is clamped to the boundary. Selecting the scheduled phrase
cancels a cue that has not entered lookahead; STOP clears pending cues.
Gated releases crossing a phrase change are not recorded and show a warning.
The performance macro dock targets bus A (tracks 1–4), B (tracks 5–8), or
MST (both). Hold FILTER, LO-FI, CHORUS, or PUNCH-MUTE for momentary effects;
LO-FI uses amplitude quantization, and CHORUS uses a modulated delay.
The existing Deck A/B controls remain independent. P1, P2, and P3 set RMX
to 1, 2, and 4 rows; hold RMX during playback to repeat forward from the
current row on the selected bus. The other bus continues forward. Already
scheduled notes are not canceled, so pressing or releasing RMX takes effect
at the next unscheduled row and rejoins the forward playhead on release.
GATE releases are recorded as NOTE OFF on the same track and instrument. If
the release's cell is occupied, it is left intact and a warning is shown;
the release must be entered elsewhere manually.
In PHRASE select a step and choose CLEAR NOTE to clear its note after confirmation,
or choose EMPTY in its pad selector.
To clear several notes, hold DEL/OP with one finger and tap occupied steps
with another. Release DEL/OP, then choose DELETE or CANCEL. The operation
clears notes, pad assignments and timing, but preserves effect commands.
In PHRASE the waveform editor and performance pads sit beside the phrase grid.
There are one, two, or four pages of 16 steps. Select a step to
assign a loaded pad, note, velocity, microtiming and an optional table. Stop
transport before changing pad assignments or the active phrase. NEW PHRASE
creates another 32-step phrase; song arrangement is not implemented yet.
The playhead highlights the playing step and page without switching the page
you are editing.
Existing single-track phrases are migrated to track 1 with a local-storage
backup of the old project. Existing 64-step phrases are split into two named
phrases. Each new phrase plays separately;
song arrangement for joining them is not implemented yet.
TABLE shows a 128-tick page for each 16-step phrase page. Each step contains
eight table ticks, including in longer phrases. Reusable tables contain four
128-tick pages. Tables retain their IDs and old 16-tick
tables are expanded into both pages when loaded. Select a tick to edit pitch,
volume, or an FX command. FL (filter), DL (delay), and DR (drive) affect the
triggered voice; FX OFF fades its wet level and feedback without stopping the
dry sample. Phrase FX OFF targets sounding voices on that pad; NOTE OFF releases
matching GATE voices on that track with a 4 ms fade, without stopping one-shots.
Phrase playback treats LOOP pads as one-shots; the LOOP toggle remains live-only.
The fixed delay node's internal buffer cannot be erased, so
rapid reactivation or slot reuse can bring back an old echo. Pitch and volume
events are scheduled on the audio clock; values hold until changed. The DEL/OP gesture clears selected populated table ticks after
confirmation. Table changes affect newly scheduled voices, not voices already
playing.
While the transport runs, the selected table highlights the ticks of sounding
voices that use it; overlapping voices can highlight several ticks. The final
tick remains highlighted while its value holds. Scroll the tick list to reach
rows that do not fit; the current ticks also appear above the list.
Other table commands, looping, adjustable table rates and phrase optcodes are
not yet implemented.
Changes inside the scheduler's lookahead may not play until the next loop.
Loop recording, performance punch-in effects, and song arrangement are not yet implemented. Restored pads
used by the phrase are decoded before playback starts. Phrase data is saved in
browser local storage, separately from pad audio; check for save errors.

The MASTER slider changes output gain before a compressor and soft output
ceiling. PEAK is a sampled post-limiter stereo level, not a continuous clip
detector: it can miss brief peaks and does not measure intersample true peaks.
Heavy overload can still cause audible distortion; keep levels conservative.
The engine preallocates 32 effect slots; a 33rd voice fades the oldest and
starts after 6 ms. When all slots are reserved, future scheduled notes are
dropped with an overload warning instead of stealing a reserved slot. FX automation scheduled far ahead can be cancelled by a
later reset on the same slot; timing and performance need iPad Safari testing.

Run `npm test` for the audio-engine checks and `npm run build` for the production
TypeScript and Vite build.
