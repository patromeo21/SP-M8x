# Building SP-M8x: Sampler and Tracker Engineering

This guide explains the architecture currently implemented in SP-M8x and why
its pieces are separated. It is intended for readers who know basic TypeScript,
React, and browser APIs. It distinguishes working code from product ideas that
are not implemented yet; it is not a claim of completed iPad certification.

## 1. Start with the browser's audio model

The app's audio engine is a Web Audio API graph, not a software audio callback
written in JavaScript. `audioEngine.ts` owns one `AudioContext`, the sample
buffers, voice routing, and the final output chain. A user gesture initializes
or resumes the context because mobile browsers can suspend audio until the user
has interacted with the page.

Audio flows from a decoded `AudioBuffer` through a short-lived
`AudioBufferSourceNode`, its prewired voice processing slot, a track gain, and
one of the A/B decks. Those decks feed macro buses A and B; both ultimately
feed the master bus, output gain, compressor/limiter stages, and output. A
source node can only be started once, so each trigger needs a new source node.
The reusable part is the 32-slot effect/voice processing pool, not the source
node itself.

One-shot voices play their selected region. Gate voices begin immediately on
pointer-down and release on pointer-up, cancellation, or lost pointer capture.
The release schedules a 4 ms exponential gain ramp before stopping the source,
which avoids an abrupt discontinuity. A choke-group trigger fades matching
voices only if they have already started by that trigger's audio time; queued
future notes are not stolen. Voice generations prevent an old `onended` callback
from releasing a pool slot that has since been reused. The callback also removes
the ended pad's active-voice entry.

This design keeps scheduling and UI allocations on the main/event thread. It
does not claim that JavaScript allocations are absent during a trigger: the
engine creates a source node and bookkeeping objects as needed. Native Web
Audio nodes perform audio rendering; there is no custom AudioWorklet processor.

## 2. Keep musical state separate from sound rendering

`projectController.ts` is the mutable project-state owner. It contains eight
tracks per phrase, pads and their metadata, tables, tempo, and mixer levels.
Mutations notify React subscribers and persist project data in browser
`localStorage`. Sample audio bytes and pad metadata are stored through
`padStorage.ts` in IndexedDB. This split avoids placing large audio buffers in
JSON project state. Imported project JSON is validated and migrated before it
becomes active.

The React dashboard coordinates the sampler, phrase editor, transport, and
audio engine. `trackerBridge.ts` translates project steps into engine actions;
the tracker engine does not need to know about pad buttons or React component
state. This separation makes the same musical data usable by the UI and the
clock-driven scheduler.

## 3. Schedule against audio time, not UI frames

`trackerEngine.ts` checks the timeline on a short JavaScript timer and schedules
events ahead against `AudioContext.currentTime`. The timer wakes roughly every
25 ms and maintains about 100 ms of lookahead. A timer can be delayed by layout,
garbage collection, or background throttling; scheduling each note only when a
timer fires would therefore produce audible jitter. The lookahead lets Web
Audio execute already-scheduled events on its own clock.

That safety margin has a consequence: an event already sent to Web Audio cannot
be casually withdrawn. The RMX repeat mode therefore takes effect on the next
row that has not been scheduled, instead of tearing down future voices. It
repeats a selected bus for one, two, or four rows from the current row, then
rejoins the forward playhead when released. This is a row-repeat mechanism;
there is currently no J Dilla-style swing algorithm, swing ratio control, or
independent swing automation. Per-step microtiming is a separate feature.

Pattern changes are prepared before they are queued. The scheduler switches at
the next unscheduled 16-step boundary and the incoming phrase starts at its
first step. If preparation misses the boundary, the phrase waits for the next
one. This avoids starting a pattern whose samples are not ready, but can add a
bar of wait near a boundary.

## 4. Model phrases and tables as reusable structures

A pattern has eight tracks and a configured length of 16, 32, or 64 steps.
Every track retains its allocated step array when the visible phrase length is
shortened. The editor only exposes the configured portion, so increasing the
length later restores hidden steps instead of deleting them.

Each phrase step can hold a note, pad/instrument ID, velocity, signed
eighth-step microtiming, table reference, slice index, and an effect command.
While phrase recording is armed, live pad hits are placed at the nearest step
and retain their measured microtiming. The recorder prefers the pad's target
track, updates an identical event, or searches other tracks for a free cell.
If all tracks at that step are occupied, the live hit still sounds but cannot
be recorded.

Tables are stored as four pages of 128 ticks (512 ticks total). The editor
shows each page as 64 vertical rows, with two ticks represented per row. Table
steps support pitch, volume data, and FX commands in the model; the current
editor exposes pitch and FX but not volume. Table automation is applied to
newly scheduled voices, not retroactively to audio already playing. The
implemented automation should not be confused with a complete tracker-table
interpreter: looping rates and additional command families remain future work.

## 5. Separate live performance FX from step commands

Step-level phrase and table commands are deterministic instructions associated
with scheduled events. The live macro dock is different: its five pointer-held
triggers are Filter, RMX, Lo-Fi, Chorus, and Punch-Mute, and its selector
targets Deck A, Deck B, or Master. Filter, Lo-Fi, Chorus, and Punch-Mute use
the macro bus graph; RMX changes which tracker rows are scheduled. RMX presets
select one, two, or four rows.

The engine builds filter, waveshaper/quantization, and modulated-delay nodes
in the macro bus graph. These are Web Audio implementations, not imported
open-source DSP algorithms. The separate A/B performance-deck chains are
distinct from the macro dock. FX interactions that require audio wait for
engine initialization and are cleared on pointer release, cancellation, or
lost capture.

## 6. Treat touch as input, not decoration

`PadBankManager.tsx` uses Pointer Events and pointer capture so a finger can
remain associated with its pad after moving outside its original bounds. It
tracks multiple pointer IDs, which is essential for simultaneous pad hits.
Gated pads and macro buttons release on both normal pointer-up and interrupted
pointer lifecycles. The waveform editor separately handles pointer scrubbing,
trim handles, pitch gestures, and two-pointer zoom/pan.

`touchOptimizer.ts` applies app-wide selection/gesture restrictions and
additional prevention to performance surfaces. Scrolling and zooming are
deliberately not disabled identically everywhere: waveform gestures and normal
controls have different jobs. These are browser-specific behaviors and must be
checked on the target iPadOS Safari version; desktop builds cannot establish
that pointer capture, audio unlock, microphone permission, and pinch behavior
are reliable on-device.

## 7. Optimize for a constrained mobile device

The 32-slot pool and prewired processing nodes avoid rebuilding an entire
effects chain for every hit. Waveform peaks are computed in batches and drawn
to a canvas rather than represented by thousands of DOM elements. The tracker
uses a bounded lookahead, and the workspace uses viewport-constrained flex/grid
layouts. These choices reduce UI and scheduling work, but they do not prove a
120 fps rendering target or a particular CPU ceiling. Measure on the target
device before making those claims.

The `AudioVisualizerService` and its React hook exist, but the live analyser
canvas is not mounted in the current dashboard. The waveform editor's sample
overview is a separate canvas implementation.

## 8. Suggested reading order

1. `src/project/projectController.ts` for musical data and persistence.
2. `src/audio/audioEngine.ts` and `src/fx/VoiceFxPool.ts` for voice lifecycle.
3. `src/tracker/trackerEngine.ts` and `src/tracker/trackerBridge.ts` for timing.
4. `src/sampler/usePadBank.ts` and `src/sampler/PadBankManager.tsx` for sample
   loading and touch input.
5. `src/fx/FxStrip.tsx` and `src/fx/fxEngine.ts` for live macro FX and RMX.

For the state of individual controls, known limitations, and device-validation
gaps, see [the feature and function audit](feature-function-audit.md).
