import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyAcademicEvent, resolveAcademicEventClassification, ACADEMIC_EVENT_TYPES } from '../lib/academicEventClassification.mjs';

const cases = [
  ['Exam 1','exam','high','critical'],
  ['Final Exam','exam','high','critical'],
  ['Midterm','exam','high','critical'],
  ['MID-TERM 2','exam','high','critical'],
  ['Test 1','exam','medium','normal'],
  ['Test 2','exam','medium','normal'],
  ['Final','exam','medium','normal'],
  ['Quiz 1','quiz','high','normal'],
  ['Practice Quiz','quiz','high','normal'],
  ['Final Exam Quiz','quiz','low','normal'],
  ['Quiz or Exam','quiz','low','normal'],
  ['Group Assignment','assignment','high','major'],
  ['Assignment 2','assignment','high','normal'],
  ['Group Project','project','high','major'],
  ['Group Project - Written Report','project','high','major'],
  ['Group Project - Presentation Submission','presentation','high','major'],
  ['Group Project - RFP/Presentation Assignment (Start Early)','project','medium','major'],
  ['Project or Written Report','other','low','normal'],
  ['Exam Project - Written Report','other','low','normal'],
  ['Project - Written Report Quiz','quiz','low','normal'],
  ['Project Presentation','other','low','normal'],
  ['No Project - Presentation Submission','other','low','normal'],
  ['Presentation','presentation','high','major'],
  ['Essay','assignment','high','normal'],
  ['Final Essay','assignment','high','major'],
  ['Research Paper','assignment','medium','major'],
  ['Final Presentation','presentation','high','major'],
  ['Assessment 1','other','low','normal'],
  ['Assessment: project or exam','other','low','normal'],
  ['Project or Presentation','other','low','normal'],
  ['Final report','assignment','medium','major'],
  ['Final grades','other','low','normal'],
  ['Exam review','other','low','normal'],
  ['Practice Exam','other','low','normal'],
  ['Mock Test 1','other','low','normal'],
  ['Study guide for Final Exam','other','low','normal'],
  ['Exam registration','other','low','normal'],
  ['Exam schedule','other','low','normal'],
  ['Exam information','other','low','normal'],
  ['No exam today','other','low','normal'],
  ['Not an exam','other','low','normal'],
  ['Exam results','other','low','normal'],
  ['Test your knowledge','other','low','normal'],
  ['Chapter 1','other','low','normal'],
  ['Contest 1','other','low','normal'],
  ['Example 1','other','low','normal'],
  ['Finalization','other','low','normal'],
  ['Examen 1','exam','high','critical'],
  ['Examen final','exam','high','critical'],
  ['PARTIEL','exam','high','critical'],
  ['Contrôle 1','exam','medium','normal'],
  ['Évaluation 1','other','low','normal'],
  ['Évaluation finale','other','low','normal'],
  ['QCM 1','quiz','high','normal'],
  ['QCM de préparation au partiel','quiz','low','normal'],
  ['Interrogation écrite','quiz','medium','normal'],
  ['Devoir de groupe','assignment','high','major'],
  ['Devoir 3','assignment','high','normal'],
  ['Projet de groupe','project','high','major'],
  ['Présentation','presentation','high','major'],
  ['Exposé oral','presentation','high','major'],
  ['Dissertation','assignment','high','normal'],
  ['Mémoire','project','high','major'],
  ['Compte rendu','assignment','medium','normal'],
  ['Révision du partiel','other','low','normal'],
  ['Examen blanc','other','low','normal'],
  ['Horaire des examens','other','low','normal'],
  ['Examen annulé','other','low','normal'],
  ['Pas d’examen','other','low','normal'],
  ['', 'other','low','normal'],
];
for (const [title, type, confidence, importance] of cases) {
  test(`${title || '(empty)'} → ${type}/${confidence}/${importance}`, () => {
    const automatic = classifyAcademicEvent({ raw_title: title });
    assert.deepEqual(automatic, { automatic_type: type, automatic_confidence: confidence, automatic_importance: importance });
    assert.deepEqual(resolveAcademicEventClassification(automatic), { event_type: type, confidence, importance, exam_proposal_eligible: type === 'exam' && confidence === 'high' });
  });
}

test('only whole tokens/phrases match; case, accents and hyphens normalize consistently', () => {
  assert.deepEqual(classifyAcademicEvent({ raw_title: 'EXAM1' }), classifyAcademicEvent({ raw_title: 'Exam 1' }));
  assert.deepEqual(classifyAcademicEvent({ raw_title: 'présentation' }), classifyAcademicEvent({ raw_title: 'Présentation' }));
  assert.deepEqual(classifyAcademicEvent({ raw_title: 'mid–term' }), classifyAcademicEvent({ raw_title: 'mid-term' }));
});

test('all overrides win over every automatic type and stale effective payload', () => {
  for (const automaticType of ACADEMIC_EVENT_TYPES) for (const override of ACADEMIC_EVENT_TYPES) {
    const result = resolveAcademicEventClassification({ automatic_type: automaticType, automatic_confidence: 'low', automatic_importance: 'normal', user_override: override, event_type: 'exam', importance: 'critical', confidence: 'low' });
    assert.equal(result.event_type, override);
    assert.equal(result.confidence, 'high');
    assert.equal(result.exam_proposal_eligible, override === 'exam');
    assert.equal(result.importance, override === 'exam' ? 'critical' : ['project','presentation'].includes(override) ? 'major' : 'normal');
  }
});

test('clearing override restores automatic result; invalid values never grant exam eligibility', () => {
  const event = { ...classifyAcademicEvent({ raw_title: 'Test 1' }), user_override: null };
  assert.equal(resolveAcademicEventClassification(event).confidence, 'medium');
  assert.equal(resolveAcademicEventClassification({ ...event, user_override: 'anything' }).exam_proposal_eligible, false);
  assert.equal(resolveAcademicEventClassification({ automatic_type: 'exam', automatic_confidence: 'certain' }).exam_proposal_eligible, false);
  assert.equal(resolveAcademicEventClassification({}).event_type, 'other');
});

test('classification does not require a course and ignores descriptions/URLs/provider IDs', () => {
  const raw = { raw_title: 'Assessment 1' };
  assert.deepEqual(classifyAcademicEvent(raw), classifyAcademicEvent({ ...raw, description_excerpt: 'Final exam', external_url: 'https://example.edu/exams/1', external_uid: 'exam-1', local_course_id: 'fictional', color: 'red' }));
  const exam = classifyAcademicEvent({ raw_title: 'Exam 1' });
  assert.equal(exam.automatic_type, 'exam');
  assert.equal(exam.local_course_id, undefined); assert.equal(exam.color, undefined);
  assert.equal(classifyAcademicEvent({ raw_title: 'Test 1 [Examen de communication]', external_course_label: 'Examen de communication' }).automatic_confidence, 'medium');
});

test('lower-confidence exams are normal importance and ineligible even with a course', () => {
  for (const confidence of ['medium','low']) {
    const result = resolveAcademicEventClassification({ automatic_type: 'exam', automatic_confidence: confidence, automatic_importance: 'critical', local_course_id: 'a-course' });
    assert.equal(result.importance, 'normal'); assert.equal(result.exam_proposal_eligible, false);
  }
});

test('a course suffix containing Quiz cannot bypass the absolute quiz veto', () => {
  const event = classifyAcademicEvent({ raw_title: 'Final Exam [Quiz]', external_course_label: 'Quiz' });
  assert.equal(event.automatic_type, 'quiz');
  assert.equal(resolveAcademicEventClassification(event).exam_proposal_eligible, false);
});
