import { ACADEMIC_EVENT_RULES } from './academicEventRules.mjs';

export const ACADEMIC_EVENT_TYPES = Object.freeze(['exam', 'quiz', 'assignment', 'project', 'presentation', 'other']);
const CONFIDENCE = ['low', 'medium', 'high'];
const IMPORTANCE = ['normal', 'major', 'critical'];

function tokens(text) {
  return String(text || '').slice(0, 2048).normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase()
    .replace(/(\p{L})(\d)/gu, '$1 $2').match(/[\p{L}\p{N}]+/gu) || [];
}
function positions(haystack, needle) {
  const found = [];
  for (let i = 0; i <= haystack.length - needle.length; i++) {
    if (needle.every((word, j) => word === haystack[i + j])) found.push(i);
  }
  return found;
}
const languages = Object.values(ACADEMIC_EVENT_RULES);
const rules = languages.flatMap(language => language.types.map(rule => ({ ...rule, phrases: rule.phrases.map(tokens) })));
const vocabulary = name => languages.flatMap(language => language[name].map(tokens));
const support = vocabulary('examSupport'), negations = vocabulary('negations');
const alternatives = vocabulary('alternatives'), substantial = vocabulary('substantial');
const includesAny = (words, phrases) => phrases.some(phrase => positions(words, phrase).length > 0);
const unknown = () => ({ automatic_type: 'other', automatic_confidence: 'low', automatic_importance: 'normal' });

// Pure and provider-independent. Deliberately ignore description, URL, UID and
// local mapping: incidental mentions must never upgrade something to an exam.
export function classifyAcademicEvent(event = {}) {
  let title = String(event.raw_title || '');
  const unstrippedWords = tokens(title);
  // Canvas's known course suffix is identity metadata, not event evidence.
  const suffix = event.external_course_label ? `[${event.external_course_label}]` : null;
  if (suffix && title.endsWith(suffix)) title = title.slice(0, -suffix.length);
  const words = tokens(title);
  if (!words.length || includesAny(words, negations)) return unknown();
  const matches = rules.filter(rule => rule.phrases.some(phrase => positions(words, phrase).some(index => {
    if (rule.condition === 'numbered') return /^\d+$/.test(words[index + phrase.length] || '');
    if (rule.condition === 'standalone') return phrase.length === words.length;
    return true;
  })));
  // Quiz is an absolute veto on automatic exam classification, even in a title
  // containing both. Practice Quiz is still a quiz, of normal importance.
  // Keep the quiz veto even when the word was inside a course suffix. Prefer
  // an uncertain quiz over accidentally promoting a quiz-labelled title.
  const quizzes = rules.filter(rule => rule.type === 'quiz'
    && rule.phrases.some(phrase => positions(unstrippedWords, phrase).length));
  if (quizzes.length) {
    const mixed = matches.some(rule => rule.type !== 'quiz');
    const confidence = mixed ? 'low' : quizzes.some(rule => rule.confidence === 'high') ? 'high' : 'medium';
    return { automatic_type: 'quiz', automatic_confidence: confidence, automatic_importance: 'normal' };
  }
  if (matches.some(rule => rule.type === 'exam') && includesAny(words, support)) return unknown();
  const types = [...new Set(matches.map(rule => rule.type))];
  if (types.length !== 1 || includesAny(words, alternatives)) return unknown();
  const type = types[0];
  const confidence = matches.some(rule => rule.confidence === 'high') ? 'high' : 'medium';
  const importance = type === 'exam' && confidence === 'high' ? 'critical'
    : ['project', 'presentation'].includes(type) || (type === 'assignment' && includesAny(words, substantial)) ? 'major' : 'normal';
  return { automatic_type: type, automatic_confidence: confidence, automatic_importance: importance };
}

// The database exposes the same effective fields as generated columns. This
// pure resolver is also useful before persistence/tests; it never trusts stale
// caller-supplied event_type/confidence/importance when an override exists.
export function resolveAcademicEventClassification(event = {}) {
  const override = ACADEMIC_EVENT_TYPES.includes(event.user_override) ? event.user_override : null;
  const automaticType = ACADEMIC_EVENT_TYPES.includes(event.automatic_type) ? event.automatic_type : 'other';
  const type = override || automaticType;
  const confidence = override ? 'high' : CONFIDENCE.includes(event.automatic_confidence) ? event.automatic_confidence : 'low';
  let importance = 'normal';
  if (type === 'exam' && confidence === 'high') importance = 'critical';
  else if (['project', 'presentation'].includes(type)) importance = 'major';
  else if (type === 'assignment' && automaticType === 'assignment' && IMPORTANCE.includes(event.automatic_importance)
    && event.automatic_importance === 'major') importance = 'major';
  return { event_type: type, confidence, importance, exam_proposal_eligible: type === 'exam' && confidence === 'high' };
}
