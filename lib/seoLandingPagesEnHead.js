// Ce que le <head> des six guides anglais lit : titre et description (meta),
// surtitre, titre visible et FAQ (JSON-LD Article et FAQPage). Séparé de
// lib/seoLandingPagesEn.js pour que le code commun de toutes les pages
// (components/SeoHead, dans _app) ne charge pas le texte complet des guides.
// lib/seoLandingPagesEn.js reprend le surtitre, le titre et la FAQ d'ici : le
// texte visible et le JSON-LD restent la même chaîne. Clés = path français.

export const SEO_LANDING_HEAD_EN = {
  "/pomodoro": {
    title: "Free Pomodoro timer for studying | Blocus Tracker",
    description:
      "Start a free Pomodoro timer, set your work and break times, and track the time you actually spend studying.",
    eyebrow: "Focus method",
    h1: "Free Pomodoro timer for studying",
    faq: [
      { q: "What's the ideal length of a Pomodoro for revising?", a: "Start with 25 minutes of work and a 5-minute break. For long exercises or past papers, you can move to 45 or 50 minutes as long as your focus stays good." },
      { q: "Is Pomodoro suited to university exams?", a: "Yes, especially to break a large amount of course material into concrete tasks. The method works better when you choose the task before starting the timer." },
      { q: "Do you always need a break after each session?", a: "Yes. The break keeps the method from turning into a plain marathon. Even a short one helps you start the next block with a clearer head." },
    ],
  },

  "/planning-revision": {
    title: "Study planner: build a revision plan that holds up",
    description:
      "Learn how to build a realistic revision plan for your exams, with priorities, goals, breaks and tracking in Blocus Tracker.",
    eyebrow: "Organizing revision",
    h1: "Build a revision plan that actually holds up",
    faq: [
      { q: "How long before exams should you make your plan?", a: "As early as possible, ideally as soon as the dates are known. Even an imperfect plan three weeks out beats a perfect plan the night before." },
      { q: "Do you have to plan every hour of the day?", a: "No. Mainly plan the important blocks, the breaks and the margins. A plan that's too tight breaks at the first surprise." },
      { q: "How do I know if my plan is realistic?", a: "Time a few sessions per subject. If the real time always exceeds your estimate, cut the number of tasks or add slots." },
    ],
  },

  "/stats-etude": {
    title: "Study stats: track your revision time and progress",
    description:
      "Find out which stats to track to study more consistently: study time, streaks, records, goals and progress.",
    eyebrow: "Tracking study time",
    h1: "The study stats that actually help",
    faq: [
      { q: "Why track your study time?", a: "Because how it feels is often misleading. Tracking shows whether you're consistent, which subjects take time and where to adjust your plan." },
      { q: "Is it bad to study fewer hours than planned?", a: "Not necessarily. What matters is the quality of the work and consistency. Stats are there to fix the plan, not to punish yourself." },
      { q: "Are the statistics private?", a: "Yes. In Blocus Tracker, your personal stats are tied to your account and aren't public, indexed pages." },
    ],
  },

  "/objectifs-etude": {
    title: "Study goals: set realistic revision goals",
    description:
      "A simple method to set study goals that are motivating, measurable and suited to your exams, with Blocus Tracker.",
    eyebrow: "Motivation and progress",
    h1: "Set study goals you can actually keep",
    faq: [
      { q: "Which study goal should I pick to start?", a: "Choose a short, checkable goal: a chapter, a set of exercises, a summary sheet or two focus sessions on a specific subject." },
      { q: "Should you aim for a number of hours or a result?", a: "Both can be useful. The result gives meaning, the time gives a frame. For example: 45 minutes to correct a past paper." },
      { q: "How do you stay motivated after missing a goal?", a: "Shrink the next goal and get back to it quickly. Consistency matters more than one perfect day." },
    ],
  },

  "/application-etudiant": {
    title: "Study app: timer, planner and stats for students",
    description:
      "Choose a study app that brings together a timer, a revision planner, stats, goals and motivation from your friends.",
    eyebrow: "Study app",
    h1: "An app to study with, not just one more app",
    faq: [
      { q: "Does Blocus Tracker replace Notion or Google Calendar?", a: "Not necessarily. Blocus Tracker is focused on real studying: timer, goals, exam planning and stats. You can pair it with your notes or calendar tools." },
      { q: "Can you use Blocus Tracker for free?", a: "Yes. The timer is free to try without an account. A free account saves your sessions from then on, with your plan, your stats and your progress." },
      { q: "Is the app suited to mobile?", a: "Yes. Blocus Tracker is a responsive web app, installable as a PWA on mobile or desktop." },
    ],
  },

  "/blocus-belgique": {
    title: "Student blocus in Belgium: definition, planning and tips",
    description:
      "What is the blocus in Belgium, when does it happen and how do you organize it? Definition, exam session dates, a realistic plan and a typical day.",
    eyebrow: "Exams in Belgium",
    h1: "The student blocus in Belgium: how to prepare for it",
    faq: [
      { q: "What is the blocus in Belgium?", a: "It's the class-free period before an exam session in French-speaking Belgian higher education. Students spend it entirely on revision." },
      { q: "When is the blocus?", a: "Mostly in late December, before the January session, and in May, before the June session. A resit session takes place in August-September. The exact dates depend on your institution." },
      { q: "How long does the blocus last?", a: "Often around two weeks, but each institution sets its own calendar. Check your faculty's." },
      { q: "How many hours a day should you study during the blocus?", a: "There's no universal number. Measure your actual focused time for a few days, adjust your plan on that basis and keep time for breaks and sleep." },
      { q: "Is Blocus Tracker only for Belgium?", a: "No. The app works for students anywhere, in French or in English. This page covers the vocabulary and exam periods specific to Belgium." },
    ],
  },
};
