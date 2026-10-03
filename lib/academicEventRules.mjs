// Phrase dictionaries, not provider/course-name heuristics. Add a language here
// using the same rule shapes; the classifier engine has no language branches.
export const ACADEMIC_EVENT_RULES = {
  en: {
    types: [
      { type: 'quiz', confidence: 'high', phrases: ['quiz', 'quizzes'] },
      { type: 'exam', confidence: 'high', phrases: ['exam', 'exams', 'examination', 'midterm', 'mid term'] },
      { type: 'exam', confidence: 'medium', condition: 'numbered', phrases: ['test'] },
      { type: 'exam', confidence: 'medium', condition: 'standalone', phrases: ['final', 'finals'] },
      { type: 'assignment', confidence: 'high', phrases: ['assignment', 'homework', 'essay'] },
      { type: 'assignment', confidence: 'medium', phrases: ['report', 'paper'] },
      { type: 'project', confidence: 'high', phrases: ['project', 'capstone'] },
      { type: 'presentation', confidence: 'high', phrases: ['presentation'] },
    ],
    // Explicit deliverables of a project are not contradictory type evidence.
    // Exact type sets keep unrelated mixed titles on the conservative path.
    compounds: [
      { types: ['project', 'assignment'], phrases: ['written report'], type: 'project', confidence: 'high' },
      { types: ['project', 'presentation'], phrases: ['presentation submission'], type: 'presentation', confidence: 'high' },
      { types: ['project', 'presentation', 'assignment'], phrases: ['presentation assignment'], type: 'project', confidence: 'medium' },
    ],
    examSupport: ['practice', 'mock', 'review', 'revision', 'preparation', 'prep', 'study guide', 'results', 'feedback', 'sample', 'registration', 'sign up', 'schedule', 'timetable', 'information', 'announcement', 'notice'],
    negations: ['no', 'not', 'cancelled', 'canceled'],
    alternatives: ['or', 'versus'],
    substantial: ['group', 'team', 'final', 'term paper', 'research paper', 'research report', 'major assignment'],
  },
  fr: {
    types: [
      { type: 'quiz', confidence: 'high', phrases: ['quizz', 'qcm'] },
      { type: 'quiz', confidence: 'medium', phrases: ['interrogation', 'interro'] },
      { type: 'exam', confidence: 'high', phrases: ['examen', 'examens', 'partiel', 'partiels'] },
      { type: 'exam', confidence: 'medium', condition: 'numbered', phrases: ['controle'] },
      { type: 'assignment', confidence: 'high', phrases: ['devoir', 'devoirs', 'dissertation'] },
      { type: 'assignment', confidence: 'medium', phrases: ['rapport', 'compte rendu', 'essai', 'travail a rendre'] },
      { type: 'project', confidence: 'high', phrases: ['projet', 'memoire', 'travail de fin d etudes'] },
      { type: 'presentation', confidence: 'high', phrases: ['expose', 'soutenance'] },
    ],
    examSupport: ['blanc', 'blanche', 'entrainement', 'revision', 'revisions', 'preparation', 'preparer', 'corrige', 'correction', 'resultats', 'annales', 'inscription', 'horaire', 'calendrier', 'information', 'annonce'],
    negations: ['pas', 'sans', 'annule', 'annulee'],
    alternatives: ['ou'],
    substantial: ['groupe', 'equipe', 'final', 'finale', 'recherche', 'travail de session'],
  },
};
