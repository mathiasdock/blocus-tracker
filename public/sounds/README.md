# Blocus Tracker sound effects

All effects are local, cached MP3s. No ElevenLabs request is made by the app.
The five selected candidates were generated in ElevenLabs Sound Effects on
October 6, 2026, chosen by Mathias and integrated after the trigger cleanup.
Start/resume remain byte-for-byte unchanged; Focus ambience is independent.

- `bt-start.mp3`: "Crisp tab snap" — https://elevenlabs.io/sound-effects/user-interface
- `bt-resume.mp3`: "Light pop popup" — https://elevenlabs.io/sound-effects/user-interface

## Selected generated effects

| Asset | Candidate | Duration | LUFS (final mono MP3) | True peak dBTP | Bytes |
| --- | --- | --- | --- | --- | --- |
| `bt-session-complete.mp3` | Session v1 / output #1 | 1.00 s | −22.91 | −3.92 | 8,612 |
| `bt-break-end.mp3` | Pomodoro break v2 / output #2 | 0.60 s | −22.97 | −6.38 | 5,268 |
| `bt-achievement.mp3` | Achievement v2 / output #2 | 0.88 s | −23.17 | −7.26 | 7,567 |
| `bt-level-up.mp3` | Level up v1 / output #1 | 1.28 s | −23.04 | −7.65 | 10,701 |
| `bt-social-incoming.mp3` | Social v3 / output #1, second social series | 0.60 s | −22.96 | −6.64 | 5,268 |

Five new files total **37,416 bytes** (~36.5 KiB). Mono / 44.1 kHz / 64 kbps,
metadata stripped. Loudness matched to −23 LUFS within 0.3 LU, verified AFTER
MP3 encoding. Gain only after downmix: no limiter, EQ, added effect, time
stretch or intentional timbre change. Compression/downmix can affect the
rendering; short-cue LUFS matching is a useful baseline, not a guarantee of
identical perceived loudness on every speaker. Controller gain 0.4 is common
to these five families; timer start/pause/resume gains are unchanged.

Original chosen files remain outside the repo in Mathias’s candidate folder.
Reproduce with FFmpeg installed:

```sh
node scripts/prepare-sound-assets.mjs /absolute/path/to/candidates
```

The social input is the v3 audition MP3, not a different generated variant.
The preparation script measures mono integrated loudness, applies gain,
encodes, remeasures and rejects insufficient peak headroom. It is an offline
asset tool, not a build/runtime dependency. Old complete/XP/notification
library files were retired; Git retains their previous versions.

### ElevenLabs generation history

- Session: https://elevenlabs.io/app/sound-effects/history?id=1awblSiyAeaTsJiz1f7X
- Break: https://elevenlabs.io/app/sound-effects/history?id=FmOuBQNg1tEVSJFVjtC5
- Achievement: https://elevenlabs.io/app/sound-effects/history?id=45dgE0mulQFguhjM4Hwd
- Level: https://elevenlabs.io/app/sound-effects/history?id=GiBEFdoIIH9qtIVpceAs
- Social: https://elevenlabs.io/app/sound-effects/history?id=CWOcnYWXUCY6g0q4j4Dc

Start/resume source: ElevenLabs Sound Effects Library. Library assets require
attribution when used under the ElevenLabs Free plan. See the current terms on
the source pages before redistributing the unmodified source files. Generated
effect usage rights depend on the originating ElevenLabs account plan; this
asset integration does not independently establish commercial licensing.
