import Anthropic from '@anthropic-ai/sdk';
import { getTopic, inferTopics } from '@agora/core';

/**
 * Optional AI features. When no Anthropic credential is configured, or when a request
 * fails for any reason, every function returns a deterministic template answer so the
 * app never depends on the network.
 */
const MODEL = 'claude-opus-5';
// Opus 5 thinks adaptively by default and thinking shares this budget, so leave headroom.
const MAX_TOKENS = 6000;
let client = null;

export function aiAvailable() {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}

function getClient() {
  if (!client) client = new Anthropic({ timeout: 45000, maxRetries: 1 });
  return client;
}

const SYSTEM = `You help teenagers in Dallas-Fort Worth understand their city council. Write at a 9th-grade reading level, in plain, friendly, neutral language. Never take a political side or tell the reader what to think; explain what the item does, who it affects, and how a young resident could weigh in. Do not use the em dash character. Keep answers short.`;

async function ask(userText) {
  const response = await getClient().beta.messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'low' },
    system: SYSTEM,
    messages: [{ role: 'user', content: userText }],
  });
  if (response.stop_reason === 'refusal') throw new Error('The model declined this request.');
  if (response.stop_reason === 'max_tokens') throw new Error('The model ran out of room before finishing.');
  const text = response.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('\n')
    .trim();
  if (!text) throw new Error('The model returned no text.');
  return text;
}

function templateExplanation({ title, summary, city }) {
  const topics = inferTopics(`${title} ${summary || ''}`);
  const topic = getTopic(topics[0]);
  const cityName = city ? city.name : 'your city';
  const text = [
    topic.id === 'other' ? `This item is on the ${cityName} council agenda.` : `This item is about ${topic.short || topic.label.toLowerCase()} in ${cityName}.`,
    summary || `The council will discuss or vote on: ${title}.`,
    topic.id === 'other' ? '' : `Why it might matter to you: ${topic.youthAngle}`,
    city && city.publicComment ? `How to weigh in: ${city.publicComment.summary}` : 'How to weigh in: sign up for public comment before the meeting.',
  ]
    .filter(Boolean)
    .join('\n\n');
  return { topics, text };
}

/** Plain-language explanation of an agenda item. Falls back to a template on any failure. */
export async function explainAgendaItem({ title, summary, city, templateOnly = false }) {
  const fallback = templateExplanation({ title, summary, city });
  if (templateOnly || !aiAvailable()) return { source: 'template', ...fallback };
  const cityName = city ? city.name : 'your city';
  try {
    const text = await ask(
      `Explain this ${cityName} city council agenda item to a high school student in 3 short paragraphs: (1) what it actually does in plain words, (2) who it affects and why a 16-year-old might care, (3) one concrete way to weigh in. Stay neutral.\n\nTitle: ${title}\nSummary: ${summary || '(none provided)'}\nCity public comment rules: ${city && city.publicComment ? city.publicComment.summary : 'unknown'}`,
    );
    return { source: 'claude', model: MODEL, topics: fallback.topics, text };
  } catch (e) {
    return { source: 'template', ...fallback, fallbackReason: String(e.message || e) };
  }
}

/**
 * Rewrite a template comment so it sounds natural spoken aloud. Only the draft text and the
 * student's stated position and topic are sent; no separate profile fields.
 */
export async function draftComment(input, templateDraft) {
  if (!aiAvailable()) return { source: 'template', text: templateDraft };
  try {
    const text = await ask(
      `A student wants to give a short public comment at a ${input.cityName || 'city'} council meeting. Rewrite the draft below so it sounds natural spoken aloud, stays under 220 words, keeps every fact in the draft, and stays respectful and nonpartisan. Their position: ${input.position || 'asking for action'}. Return only the comment text.\n\nDraft:\n${templateDraft}`,
    );
    return { source: 'claude', model: MODEL, text };
  } catch (e) {
    return { source: 'template', text: templateDraft, fallbackReason: String(e.message || e) };
  }
}
