# Discovery mode

Mode: Operate. Limited public rehearsal of the established Blocus product, never a landing page or a second visual identity.

## Scope and task

Signed-out visitors can use the real Timer with two local demonstration courses. Planning, Stats, Activity, Friends and Communities show one intentionally limited, synthetic product slice. Seeing and browsing are public; adding, changing, saving or interacting socially opens a contextual account gate. Profile, history and settings remain private rather than receiving fake data.

## Direction

The application shell, typography, semantic tokens, course colours and ordinary product geometry remain visible. Each route answers one product question with the smallest credible data set. There are no marketing heroes, feature chips or repeated conversion banners. The mascot appears only inside a gate after the visitor attempts a locked action.

The previews reuse the shipped visual structures rather than naming five parallel demo pages:

- Planning keeps its ink Today summary, real toolbar, segmented Day/Week control, day agenda and week workload rows. It omits the month, quick entry and revision rail.
- Stats renders the real study-time chart and Study by course card only. Their shared total is exactly 8 h 15 and the demo label lives in the card metadata.
- Activity renders the real composer and `ActivityTimeline`, including the ordinary-study and achievement registers, with only four synthetic events.
- Friends keeps the real inbox/search/request hierarchy and desktop empty conversation panel. It does not simulate a full chat.
- Communities keeps the real course-space list and room grammar, with three course spaces, two ordinary messages and one shared exam.

No preview adds a visible page title above the incumbent composition. Demo labels are plain metadata, never conversion copy.

## Data and safety

`GuestDiscovery.js` owns static demonstration data and imports no persistence client. It must never read Supabase, user analytics, XP, leaderboards, notifications or real social data. The Timer's guest session uses its existing versioned local-storage snapshot only. All demonstration content is labelled in FR and EN.

## Responsive behavior

Desktop uses the normal sidebar. Mobile uses the normal top bar, social tabs and bottom navigation; Planning defaults to Day, while opening a course room follows the real full-screen mobile pattern. Previews reduce columns and secondary content rather than scaling down mechanically. Contextual gates are centered dialogs from 640px and bottom sheets below it, with focus trapping, Escape close and opener restoration.
