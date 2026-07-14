// Traductions anglaises des CHAMPS VISIBLES des 6 pages SEO. Affichées côté
// client quand l'appareil est anglophone (voir components/SeoLandingPage.js).
// Les meta (title/description) et le JSON-LD restent en français via
// lib/seoLandingPages.js + components/SeoHead.js — c'est ce qui est indexé pour
// les recherches francophones (ces pages ciblent des mots-clés FR). Clés = path.

export const SEO_LANDING_PAGES_EN = {
  "/pomodoro": {
    eyebrow: "Focus method",
    h1: "The Pomodoro method: revise without burning out",
    lead:
      "The Pomodoro method turns a big day of revision into short, measurable, less intimidating blocks. Blocus Tracker helps you launch those blocks, keep the rhythm and see what you actually studied.",
    shortAnswer:
      "The Pomodoro method means working on a single task for 25 minutes, then taking a short break. For students, it works best when each session has a clear goal: exercises, a summary sheet, a chapter, past papers or active recall.",
    ctaLabel: "Try the Pomodoro timer",
    secondaryCtaLabel: "Plan my revision",
    proofPoints: [
      "Pomodoro timer and open timer",
      "Sessions saved with an account",
      "Stats and streaks to stay consistent",
    ],
    sections: [
      {
        title: "Why Pomodoro works well for revision",
        body: [
          "Revising rarely takes a single skill. You have to start, stay focused, take breaks and resume without losing the thread. Pomodoro helps because it shrinks the next action to a short window: you no longer wonder how to finish the whole course, you just choose what you do for the next block.",
          "The classic 25/5 format is a good starting point, but it isn't mandatory. Some students prefer 45 minutes for long exercises, or 50 minutes when preparing a university exam. The right rhythm is the one you can repeat for several days without burning out.",
        ],
        bullets: [
          "Choose a concrete task before you start the timer.",
          "Cut the distractions during the block.",
          "Quickly note what's left to do at the end.",
          "Keep breaks as real breaks, not a mini scrolling session.",
        ],
      },
      {
        title: "How to use it during an intensive study or exam period",
        body: [
          "During an intense period, the method becomes more useful when it's tied to a plan. You can schedule priority subjects in the morning, keep the more mechanical tasks for the afternoon and use Pomodoros as units of progress.",
          "Instead of only counting the pages read, also measure the time actually focused. That's often the data that shows whether your plan is realistic or whether a subject takes twice as long as expected.",
        ],
        bullets: [
          "One block to understand, one to practise, one to check.",
          "Two different subjects in the day to avoid saturation.",
          "A long break after several blocks, especially before switching course.",
        ],
      },
      {
        title: "What Blocus Tracker adds to a plain timer",
        body: [
          "A plain timer helps you start. Blocus Tracker adds the memory of your work: duration, subject, progress, goals, streaks and stats. That's what makes the method more motivating over several weeks.",
          "You can try the timer without an account. If you want to keep your history, find your records and track your goals, an account lets you turn your sessions into real progress.",
        ],
      },
    ],
    featurePanel: {
      title: "Pomodoro in Blocus Tracker",
      items: [
        "Choose a Pomodoro mode or an open session.",
        "Link your sessions to your courses.",
        "Track your study time, records and streaks.",
        "Move from a standalone timer to a full revision routine.",
      ],
    },
    related: [
      { href: "/planning-revision", label: "Build a revision plan", text: "Link your Pomodoro blocks to a real exam calendar." },
      { href: "/stats-etude", label: "Track your study stats", text: "Check whether your sessions are becoming consistent." },
      { href: "/objectifs-etude", label: "Set study goals", text: "Turn your sessions into measurable goals." },
    ],
    faq: [
      { q: "What's the ideal length of a Pomodoro for revising?", a: "Start with 25 minutes of work and a 5-minute break. For long exercises or past papers, you can move to 45 or 50 minutes as long as your focus stays good." },
      { q: "Is Pomodoro suited to university exams?", a: "Yes, especially to break a big syllabus into concrete tasks. The method gets more effective when you prepare the task before starting the timer." },
      { q: "Do you always need a break after each session?", a: "Yes. The break keeps the method from turning into a plain marathon. Even a short one helps you come back to the next block more cleanly." },
    ],
  },

  "/planning-revision": {
    eyebrow: "Organizing revision",
    h1: "Build a revision plan that actually holds up",
    lead:
      "A good revision plan isn't about filling every day. It's about knowing what to do, when to do it, and how to adjust without panicking when a subject takes longer than expected.",
    shortAnswer:
      "To organize your revision, start by listing your exams, the workload of each course, your constraints and the priority subjects. Then plan realistic blocks, with breaks and room to adjust.",
    ctaLabel: "Build my plan in the app",
    secondaryCtaLabel: "Use Pomodoro",
    proofPoints: [
      "Goals and exams in one place",
      "Calendar export available",
      "Actual time compared to the plan",
    ],
    sections: [
      {
        title: "The simple method in 5 steps",
        body: [
          "The classic trap is starting by drawing a perfect week. The right order is the reverse: exams first, then the workload, then the blocks. Your plan should reflect the real difficulty of your courses, not just your urge to be productive.",
        ],
        bullets: [
          "Write down every exam date and deadline.",
          "Estimate each course's workload: chapters, exercises, past papers, summary sheets.",
          "Rank subjects by priority and difficulty.",
          "Save your best slots for the tasks that demand the most energy.",
          "Keep a safety margin for the unexpected.",
        ],
      },
      {
        title: "Why your plan must stay measurable",
        body: [
          "A vague plan like \"revise law\" doesn't tell you whether you're moving forward. A useful plan contains observable actions: redo 20 questions, reread a chapter, correct a past paper, finish a summary sheet or explain a concept without looking at the course.",
          "Measuring your time doesn't replace the quality of the work, but it quickly reveals the gaps. If you thought you'd finish a chapter in 1 hour and it takes 3, you can rebalance before the night before the exam.",
        ],
      },
      {
        title: "How Blocus Tracker helps you adjust",
        body: [
          "In Blocus Tracker, the plan isn't separate from the timer. You can set your goals, launch your sessions, then compare what you imagined with the time actually studied.",
          "That loop is precious: plan, study, measure, adjust. It's what turns a fragile setup into a durable revision system.",
        ],
      },
    ],
    featurePanel: {
      title: "Planning in Blocus Tracker",
      items: [
        "Add your exams, goals and deadlines.",
        "Link your sessions to the subjects you're working on.",
        "See what's moving forward and what's falling behind.",
        "Export your plan to your calendar whenever you need to.",
      ],
    },
    related: [
      { href: "/stats-etude", label: "Analyze your study time", text: "Measure the gap between the plan and the real work." },
      { href: "/objectifs-etude", label: "Set good goals", text: "Turn your plan into concrete actions." },
      { href: "/blocus-belgique", label: "Prepare exam season in Belgium", text: "Adapt your plan to intensive exam periods." },
    ],
    faq: [
      { q: "How long before exams should you make your plan?", a: "As early as possible, ideally as soon as the dates are known. Even an imperfect plan three weeks out beats a perfect plan the night before." },
      { q: "Do you have to plan every hour of the day?", a: "No. Mainly plan the important blocks, the breaks and the margins. A plan that's too tight breaks at the first surprise." },
      { q: "How do I know if my plan is realistic?", a: "Time a few sessions per subject. If the real time always exceeds your estimate, cut the number of tasks or add slots." },
    ],
  },

  "/stats-etude": {
    eyebrow: "Tracking study time",
    h1: "The study stats that actually help",
    lead:
      "Good stats aren't there to judge yourself. They're there to understand your rhythm, spot what works and make your revision less fuzzy.",
    shortAnswer:
      "The most useful stats for a student are actual study time, active days, consistency, breakdown by subject, goals reached and personal records. They should help you adjust, not make you feel guilty.",
    ctaLabel: "See my study stats",
    secondaryCtaLabel: "Set my goals",
    proofPoints: [
      "Total time and sessions per subject",
      "Streaks, records, badges and XP",
      "Clear reading, no complicated tables",
    ],
    sections: [
      {
        title: "Which data to track during revision",
        body: [
          "The number of hours alone isn't enough. Two focused hours on exercises are often worth more than four passive hours of rereading. But without measurement, it's hard to know whether you're consistent or only moving forward in bursts of stress.",
        ],
        bullets: [
          "Actual study time per day and per week.",
          "Breakdown by course or subject.",
          "Active days and consistency streak.",
          "Goals reached or missed.",
          "Personal records to keep a healthy motivation.",
        ],
      },
      {
        title: "Using stats without falling into pressure",
        body: [
          "A useful stat should trigger a simple decision: keep going, ease off, move, prioritize or take a break. If a piece of data only pushes you to feel guilty, it's being misused.",
          "Blocus Tracker focuses on readable trends: recent progress, goals, heatmap, streaks and the most-worked subjects. The goal is to make your effort visible, not to turn studying into a permanent competition.",
        ],
      },
      {
        title: "Why stats make a study app more durable",
        body: [
          "Motivation drops when you can't see what you've already done. Stats give a concrete trace: an active week, a record beaten, a streak that holds, a subject finally picked back up.",
          "That's especially useful during long exam periods, where the days look alike and the brain mostly remembers what's left to do.",
        ],
      },
    ],
    featurePanel: {
      title: "Stats in Blocus Tracker",
      items: [
        "Visualize your hours and active days.",
        "Compare your subjects without losing the detail.",
        "Track your streaks, records, badges and levels.",
        "Spot the times when you work best.",
      ],
    },
    related: [
      { href: "/planning-revision", label: "Build a revision plan", text: "Use your stats to plan more accurately." },
      { href: "/objectifs-etude", label: "Create study goals", text: "Turn the data into next actions." },
      { href: "/application-etudiant", label: "Choose an app to study with", text: "Compare the tools that are useful for a student." },
    ],
    faq: [
      { q: "Why track your study time?", a: "Because how it feels is often misleading. Tracking shows whether you're consistent, which subjects take time and where to adjust your plan." },
      { q: "Is it bad to study fewer hours than planned?", a: "Not necessarily. What matters is the quality of the work and consistency. Stats are there to fix the plan, not to punish yourself." },
      { q: "Are the statistics private?", a: "Yes. In Blocus Tracker, your personal stats are tied to your account and aren't public, indexed pages." },
    ],
  },

  "/objectifs-etude": {
    eyebrow: "Motivation and progress",
    h1: "Set study goals you can actually keep",
    lead:
      "Motivation doesn't last long when the goal is fuzzy. A good study goal tells you what to do, why now, and how to know it's finished.",
    shortAnswer:
      "A good study goal is precise, measurable and tied to a subject or an exam. It's better to aim for a clear action, like finishing 15 exercises, than to vaguely promise to work all day.",
    ctaLabel: "Create my goals",
    secondaryCtaLabel: "See the Pomodoro method",
    proofPoints: [
      "Daily and weekly goals",
      "Progress visible in the stats",
      "Motivation from streaks, XP and badges",
    ],
    sections: [
      {
        title: "The difference between an intention and a goal",
        body: [
          "\"I have to revise\" is an intention. \"Do two Pomodoros of exercises on chapter 4\" is a goal. The first adds pressure, the second gives a next action.",
          "During revision, that precision saves a lot of mental energy. You don't have to renegotiate your program every time you sit down.",
        ],
        bullets: [
          "Start with a subject.",
          "Add an observable action.",
          "Add a time or quantity limit.",
          "Set a clear finish criterion.",
        ],
      },
      {
        title: "Which goals to choose based on your energy level",
        body: [
          "Not all goals demand the same effort. When you're fresh, keep the tasks that require understanding or solving. When you're tired, choose active rereading, sorting notes or preparing a summary sheet instead.",
          "This logic avoids the heroic-plan trap: you can't put only hard tasks everywhere. Consistency comes from a smart mix.",
        ],
      },
      {
        title: "How Blocus Tracker makes goals motivating",
        body: [
          "Blocus Tracker links your goals to your sessions. When you start the timer, you're not working into the void: you're moving toward a visible target.",
          "Goals carry through into the stats, streaks and badges. The app makes small progress visible, which often helps more than a big promise of motivation.",
        ],
      },
    ],
    featurePanel: {
      title: "Goals in Blocus Tracker",
      items: [
        "Create goals by subject or by deadline.",
        "Link your sessions to the work actually done.",
        "Track your reached goals in your stats.",
        "Keep a motivating progression without complicating your setup.",
      ],
    },
    related: [
      { href: "/pomodoro", label: "Work in Pomodoro blocks", text: "Use the timer to make each goal more concrete." },
      { href: "/stats-etude", label: "Track your progress", text: "Check whether your goals are becoming a habit." },
      { href: "/planning-revision", label: "Plan your revision", text: "Place your goals in a realistic week." },
    ],
    faq: [
      { q: "Which study goal should I pick to start?", a: "Choose a short, checkable goal: a chapter, a set of exercises, a summary sheet or two focus sessions on a specific subject." },
      { q: "Should you aim for a number of hours or a result?", a: "Both can be useful. The result gives meaning, the time gives a frame. For example: 45 minutes to correct a past paper." },
      { q: "How do you stay motivated after missing a goal?", a: "Shrink the next goal and get back to it quickly. Consistency matters more than one perfect day." },
    ],
  },

  "/application-etudiant": {
    eyebrow: "Study app",
    h1: "An app to study with, not just one more app",
    lead:
      "A good study app should help you start, organize, measure and resume. Blocus Tracker brings the timer, the planner, the stats and the motivation together in a space built for students.",
    shortAnswer:
      "The best app to study with is the one that reduces friction: a simple timer, a clear plan, realistic goals and readable stats. It should support your revision without becoming a distraction.",
    ctaLabel: "Try Blocus Tracker",
    secondaryCtaLabel: "Compare the features",
    proofPoints: [
      "Timer you can try without an account",
      "Account useful for saving",
      "Built for exams and intensive study periods",
    ],
    sections: [
      {
        title: "What a study app should really do",
        body: [
          "Many student tools are excellent at one thing: flashcards, notes, calendar, to-do list or focus. The problem shows up when everything is scattered. You plan in one place, time yourself in another, and lose sight of your progress.",
          "Blocus Tracker focuses on the revision system: launch a session, know why you're working, record that time, then understand your progress.",
        ],
        bullets: [
          "A timer that's quick to start.",
          "A plan tied to your exams.",
          "Concrete goals.",
          "Stats that are simple to read.",
          "Durable motivation, without overload.",
        ],
      },
      {
        title: "Why Blocus Tracker fits students well",
        body: [
          "The app was built around real revision periods: intensive study seasons, midterms, exams, packed weeks and the need to stay consistent when motivation drops.",
          "The vocabulary, the public pages and the product experience speak directly to students, without turning the app into a corporate productivity tool.",
        ],
      },
      {
        title: "When creating an account becomes useful",
        body: [
          "You can explore the timer without an account. But as soon as you want to save your sessions, track your stats, keep your plan, find your badges or work with other students, an account becomes the best choice.",
        ],
      },
    ],
    featurePanel: {
      title: "What Blocus Tracker brings together",
      items: [
        "Study timer and Pomodoro.",
        "Revision planner and exams.",
        "Stats, goals, streaks and records.",
        "Friends, groups and student communities.",
      ],
    },
    related: [
      { href: "/pomodoro", label: "Student Pomodoro timer", text: "Discover the built-in focus method." },
      { href: "/planning-revision", label: "Revision planner", text: "Organize the weeks before your exams." },
      { href: "/blocus-belgique", label: "Exam season in Belgium", text: "See how the app adapts to intensive periods." },
    ],
    faq: [
      { q: "Does Blocus Tracker replace Notion or Google Calendar?", a: "Not necessarily. Blocus Tracker is focused on real studying: timer, goals, exam planning and stats. You can pair it with your notes or calendar tools." },
      { q: "Can you use Blocus Tracker for free?", a: "Yes. The timer is free to try without an account. An account is for saving your history, your plan, your stats and your progress." },
      { q: "Is the app suited to mobile?", a: "Yes. Blocus Tracker is a responsive web app, installable as a PWA on mobile or desktop." },
    ],
  },

  "/blocus-belgique": {
    eyebrow: "Exams in Belgium",
    h1: "Nail your exam season in Belgium without scattering yourself",
    lead:
      "Intensive study season takes more than a big dose of willpower. It needs a realistic plan, measurable sessions, breaks you own, and a clear way to see what's moving forward.",
    shortAnswer:
      "To succeed in your exam season, start by listing the exams and each course's workload, build a plan by priorities, alternate subjects, work in timed blocks and keep time to sleep, eat and recover.",
    ctaLabel: "Prepare my exam season",
    secondaryCtaLabel: "Create a plan",
    proofPoints: [
      "Built for the \"blocus\" vocabulary",
      "Planner, timer and stats together",
      "Motivation with friends and communities",
    ],
    sections: [
      {
        title: "What makes a good exam season?",
        body: [
          "A good exam season isn't a string of impossible days. It's a period where you know which subjects are priorities, how long they take, and how to keep enough energy to reach the exams with a usable brain.",
          "Belgium has a very specific vocabulary around the \"blocus\". Blocus Tracker owns it: the app is built for students living those intensive weeks, with the need to time, plan and stay motivated.",
        ],
      },
      {
        title: "The structure of an effective study day",
        body: [
          "A study day should alternate deep work, breaks and lighter tasks. Your strongest hours should go to the hard subjects. Tired moments can be used to reread, sort or prepare the next session.",
        ],
        bullets: [
          "Start with a priority task, not the most comfortable one.",
          "Work in blocks of 25 to 50 minutes depending on the subject.",
          "Plan a real long break in the day.",
          "End with a mini recap: time studied, subject advanced, next priority.",
        ],
      },
      {
        title: "How to avoid the all-or-nothing trap",
        body: [
          "Many students think a day is ruined if it doesn't match the ideal plan. In practice, exam season is often won through adjustments: getting back after a bad morning, moving a subject, cutting a task that's too ambitious.",
          "Blocus Tracker makes those adjustments simpler because you see the real work. You don't depend only on how you feel or your stress in the moment.",
        ],
      },
    ],
    featurePanel: {
      title: "Blocus Tracker during exam season",
      items: [
        "Quickly start a timer for each subject.",
        "Keep a clear plan of exams and goals.",
        "See your hours, streaks and records.",
        "Stay motivated with your friends, groups and student communities.",
      ],
    },
    related: [
      { href: "/planning-revision", label: "Exam-season plan", text: "Build a realistic week before the exams." },
      { href: "/pomodoro", label: "Pomodoro for exam season", text: "Break big days into manageable blocks." },
      { href: "/stats-etude", label: "Revision stats", text: "Track your real effort without relying only on how it feels." },
    ],
    faq: [
      { q: "How many hours a day should you study in exam season?", a: "There's no universal number. Many students aim for several focused blocks a day, with breaks and sleep. Consistency and quality matter more than a heroic total." },
      { q: "Should you alternate subjects during exam season?", a: "Yes, it's often more sustainable. Alternating hard and lighter subjects helps keep your energy and avoids getting stuck for days on a single course." },
      { q: "Is Blocus Tracker only for Belgium?", a: "No. The app works for all students, but the blocus page speaks specifically to the vocabulary and exam periods in Belgium." },
    ],
  },
};
