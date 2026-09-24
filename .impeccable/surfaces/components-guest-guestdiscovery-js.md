# Discovery mode

Mode: Operate. Limited public rehearsal of the established Blocus product, never a landing page or a second visual identity.

## Scope and task

Signed-out visitors can use the real Timer with two local demonstration courses. Planning, Stats, Activity, Friends and Communities show one intentionally limited, synthetic product slice. Seeing and browsing are public; adding, changing, saving or interacting socially opens a contextual account gate. Profile, history and settings remain private rather than receiving fake data.

## Direction

The application shell, typography, semantic tokens, course colours and ordinary product geometry remain visible. Each route answers one product question with the smallest credible data set. There are no marketing heroes, feature chips or repeated conversion banners. The mascot appears only inside a gate after the visitor attempts a locked action.

## Data and safety

`GuestDiscovery.js` owns static demonstration data and imports no persistence client. It must never read Supabase, user analytics, XP, leaderboards, notifications or real social data. The Timer's guest session uses its existing versioned local-storage snapshot only. All demonstration content is labelled in FR and EN.

## Responsive behavior

Desktop uses the normal sidebar. Mobile uses the normal top bar, social tabs and bottom navigation; previews reduce columns and secondary content rather than scaling down mechanically. Contextual gates are centered dialogs from 640px and bottom sheets below it, with focus trapping, Escape close and opener restoration.
