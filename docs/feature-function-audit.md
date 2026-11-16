# SP-M8x Feature and Function Audit

This is a code-based audit of the current application, not an iPad device test.
“Implemented” means a code path exists; it does not imply that every Safari
version or hardware configuration has been validated. “Partial” means the
feature works in a narrower form than the product description suggests.

## Application and transport

| Control or feature | Status | Findings |
| --- | --- | --- |
| Phrase / Table / Song / Mixer / Sampler tabs | Implemented / partial | Phrase, Table, Mixer, and Sampler views are wired. Song is an explicit “not yet implemented” placeholder. |
| Audio engine status and tap-to-start/resume | Implemented | User gesture initializes or resumes the shared context; errors are surfaced in the footer. Safari interruption recovery still needs device verification. |
| PLAY toggle, STOP, phrase record arm | Implemented | PLAY toggles start/stop; STOP also clears gated voices. Phrase recording only captures live hits while transport is playing and REC is armed. |
| Tempo display | Partial | Tempo is displayed and used by the scheduler; no tempo editor is present in the dashboard shown here. |
| Pattern queue | Implemented with timing constraint | Samples prepare first; the switch is on the next unscheduled 16-step boundary. Late preparation can defer the switch by another boundary. |
| BPM lookahead scheduler | Implemented | Timer-driven lookahead schedules against audio-context time. Browser throttling and actual timing accuracy remain on-device validation items. |
| Song arrangement | Not implemented | The Song tab states this directly. |
| Post-limiter PEAK and saved-local badge | Implemented with measurement limit | Peak is sampled periodically and can miss brief and intersample peaks; it is not a true-peak meter. Save status reflects local storage readiness and current save state. |

## Phrase, table, and recording

| Control or feature | Status | Findings |
| --- | --- | --- |
| Eight phrase tracks; lengths 16 / 32 / 64 | Implemented | Length changes hide rather than truncate allocated later steps. |
| Track selection, phrase selection, new phrase | Implemented | New phrases default to 32 steps. Phrase selection while playing queues; editing pad assignment is disabled during transport. |
| Phrase cells and note editing | Implemented | Cells carry note, pad, velocity, microtiming, table ID, slice index, and FX command data. |
| Phrase FX menu | Implemented | The visible labels are Filter, Drive, Delay, Off; command values are internal mnemonics. |
| Live phrase recording | Implemented with limits | Quantizes to a step and records microtiming; searches across tracks if the preferred track is occupied. No free cell means no event is recorded. |
| Gate NOTE OFF capture | Partial | Release is recorded only if a free cell exists on the same track and within the same phrase. Releases across a phrase boundary or into an occupied cell are reported but not stored. |
| Phrase/table multi-cell delete | Implemented | Selection and confirmation clear notes or populated table ticks; phrase deletion preserves effect commands. |
| 64-row vertical table pages | Implemented | Four pages of 64 rows display two ticks per row (128 ticks per page). |
| Table pitch and FX editor | Implemented | Pitch and Filter/Drive/Delay/Off can be edited. Automation affects newly scheduled voices rather than already-playing voices. |
| Table volume editing | UI omitted; data path remains | `TableStep.volume` and controller support remain in project state, but the current table editor does not expose a volume control. |
| Full table interpreter / normalized scaling | Partial | Core table automation exists, but additional table commands, adjustable rates, and looping are not implemented. Do not equate the four-page display with a complete M8 table interpreter. |
| Phrase swing automation | Not implemented | Step microtiming exists, but no swing ratio, J Dilla timing model, or swing automation control exists. |

## Sampler and pad grid

| Control or feature | Status | Findings |
| --- | --- | --- |
| Active 4×4 pad grid; banks A–D | Implemented | The active UI is `PadBankManager.tsx`; the standalone `src/sampler/PadGrid.tsx` is not mounted by the dashboard and should not be treated as the production pad surface. |
| Multi-touch pad triggering | Implemented; device validation pending | Pointer IDs and pointer capture support concurrent hits. Test on iPad Safari for dropped or cancelled contacts. |
| One-shot / gate / loop | Implemented | Mode is stored per pad. Gate is press/release driven; Loop is a live toggle. Phrase playback treats Loop as one-shot. |
| Gated release ramp and STOP release | Implemented | A short exponential fade is scheduled before stopping; cancellation and lost pointer capture also release. |
| Choke groups | Implemented | Matching voices receive a short fade; queued voices with a start time later than the new trigger are preserved. Generation ownership protects reused slots. |
| Pad assignment, per-pad volume and track routing | Implemented | Per-pad metadata includes target track, volume, and choke group. |
| Volume toggle next to pads | Partial | Individual pad/track levels are available through the sampler controls and Mixer tab; the originally requested dedicated pad-area volume toggle is not present. |
| Load audio samples | Implemented, decoder-dependent | File input accepts generic audio plus WAV, MP3, FLAC, AIFF/AIF, and M4A; actual decoding depends on browser codec support. |
| Recording | Implemented with browser constraints | Uses microphone/selected input capture and is capped at 60 seconds. Requires permission and a secure context; iPadOS input routing must be tested. |
| IndexedDB sample persistence | Implemented with storage caveat | Audio and pad metadata are persisted separately from project JSON. Browser storage may be cleared or reclaimed; this is not backup. |
| SLI marker generation and playback | Implemented | CHOP saves evenly spaced sample-local markers. SLI uses the first ten pads for slices 1–10; extra pads retain normal bank behavior and missing slice indices fall back to the last slice. |
| Assign chopped slices to empty pads | Implemented | Shares source audio and preserves independent markers/settings; refuses to overwrite occupied pads or proceed when space/frames are insufficient. |
| Waveform rendering and trim | Implemented | Batched peak analysis and canvas rendering; start/end markers, frame editor, pitch gesture, zoom/pan, and Snap View are present. |
| Waveform drag-to-audition | Not implemented as a scrub playback path | Dragging the waveform moves a visual scrub line; pad triggering is a separate action. The README currently describes waveform dragging as auditioning and should be corrected. |
| 120 fps waveform target | Unverified | No measured frame-rate evidence or CPU threshold is included in the repository. |

## Effects, routing, and output

| Control or feature | Status | Findings |
| --- | --- | --- |
| A/B track routing and master bus | Implemented | Tracks 1–4 route to A, 5–8 to B, then to the master path. |
| Deck A/B controls | Implemented; device feel pending | Separate performance deck chains remain independent of the macro dock. Their press/hold response should be tested on-device. |
| Macro bus selector A / B / MST | Implemented | Targets one deck bus or the master bus. |
| Filter / RMX / Lo-Fi / Chorus / Punch-Mute triggers | Implemented | Pointer-held macros release on pointer-up, cancel, or lost capture. |
| Filter macro sweep | Implemented | The macro bus filter changes smoothly while held; exact feel and parameter range need listening/device review. |
| Lo-Fi and Chorus processing | Implemented | Lo-Fi uses waveshaper quantization; Chorus uses a modulated delay path. These are local Web Audio node designs, not external DSP algorithms. |
| RMX presets and repeat window | Implemented with lookahead boundary | P1/P2/P3 are one, two, and four rows. RMX repeats the selected bus and takes effect on the next unscheduled row; queued audio is not canceled. |
| J Dilla-style swing in RMX | Not implemented | RMX is a row-repeat loop. No swing/groove algorithm is connected to its timing. |
| Punch-in FX names from earlier specification (SDL, RET, CUT, DEG, TRK_MST, REV) | Not implemented in current macro dock | Current dock triggers are Filter, RMX, Lo-Fi, Chorus, and Punch-Mute. Do not present the earlier list as wired. |
| Phrase/table FX DSP | Implemented in part | Filter, Drive, and Delay command paths are supported for scheduled voices. This is distinct from macro-bus effects; existing delay buffers can retain internal echo state across reuse/reactivation. |
| Master output and limiter | Implemented | Output gain, compressor/limiter processing, and sampled post-limiter meter are wired. Extreme levels can still sound distorted. |

## Touch, viewport, and remaining validation

| Area | Status | Findings |
| --- | --- | --- |
| Pointer cancel / lost capture cleanup | Implemented on primary performance surfaces | Pads, waveform, and macro triggers handle interruption paths. Continue testing real Safari interruptions and app backgrounding. |
| Touch-action and gesture restrictions | Partial / device verification pending | Touch restrictions are applied globally and scoped to performance surfaces. Global iOS gesture suppression may affect browser zoom; waveform pinch behavior and page navigation need on-device verification. |
| Audio unlock during decode / first quick tap | Partial / device verification pending | Audio initialization is gesture-driven and samples may need asynchronous IndexedDB decode before first sound. Validate rapid taps while restoring samples on the target browser. |
| iPad viewport and landscape styling | Implemented in CSS; unverified on hardware | Layout uses viewport-constrained flex/grid sizing. No on-device evidence establishes that all orientations fit without clipping. |
| Live analyser canvas | Not mounted | `AudioVisualizerService` and its hook exist, but the dashboard does not render the analyser canvas. The sample waveform is a different visualization. |
| Automated verification | Repository build checks only for this audit | Requested gate is `npx tsc --noEmit` and `npm run build`. No browser/E2E or iPad verification was run. |

## Suggested next fixes

1. Correct the README's waveform-audition claim and add the course/audit links.
2. Decide whether table-volume editing should remain hidden or be restored as a
   dedicated control; the underlying project data still supports it.
3. Add a dedicated pad-area volume toggle if that remains a UX requirement.
4. Test audio unlock, pointer cancellation, pinch/zoom, viewport fit, routing,
   gate release, and peak behavior on an iPad 9th Gen running the target iPadOS
   Safari version.
5. Treat swing automation, a full table interpreter, Song arrangement, and the
   unused analyser canvas as explicit follow-up features, not completed work.
