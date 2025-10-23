const fs = require('fs');
let fetchFn = global.fetch;
if (!fetchFn) {
  fetchFn = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
}

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
// Default model (change here to switch):
// Other possible options: 'gpt-4o-mini', 'gpt-4o', 'gpt-4.1', etc.
const DEFAULT_MODEL = process.env.OPENAI_MODEL || 'gpt-5';

async function callOpenAIChat(messages, { model = DEFAULT_MODEL } = {}) {
  if (!OPENAI_API_KEY) {
    // Fallback stub for development without an API key.
    return stubResponse(messages);
  }
  try {
    const resp = await fetchFn('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model,
        messages
        //temperature: 0.2
      })
    });
    if (!resp.ok) {
      const txt = await resp.text();
      throw new Error(`OpenAI API error ${resp.status}: ${txt}`);
    }
    const data = await resp.json();
    return data.choices[0].message.content.trim();
  } catch (e) {
    console.error('LLM error, using stub:', e.message);
    return stubResponse(messages);
  }
}

function stubResponse(messages) {
  const last = messages[messages.length - 1].content || '';
  if (last.includes('Task:') && last.includes('Open Topics')) {
    return 'Which of the listed Open Topics is the most blocking, and what is your decision on it? If none are listed, please clarify the most critical missing requirement in one specific area (scope, users, or success criteria).';
  }
  if (last.includes('Consolidate the following human answers')) {
    // Produce a naive merged markdown.
    const match = last.match(/CURRENT DOCUMENT START\n([\s\S]*?)\nCURRENT DOCUMENT END/);
    const doc = match ? match[1] : '';
    const answersMatch = last.match(/HUMAN ANSWERS START\n([\s\S]*?)\nHUMAN ANSWERS END/);
    const answers = answersMatch ? answersMatch[1] : '';
    const bulletCount = (answers.match(/^\-\s/mg) || []).length;
    const openTopics = bulletCount >= 2
      ? `\n\n## Open Topics\n- [UNRESOLVED] Potential inconsistencies among human answers detected in development stub. Please reconcile in next round.`
      : '';
    return `# Specification (Stub Updated)\n\n${doc}\n\n## Incorporated Answers\n${answers}${openTopics}`.trim();
  }
  return 'Stub response.';
}

async function generateQuestion({ appDescription, currentDocument }) {
  const userPrompt = `You are an expert specification facilitator for an app.
APP DESCRIPTION: ${appDescription}

CURRENT DOCUMENT:
${currentDocument || '(empty)'}

Task:
1) Review the document, prioritizing any section titled "Open Topics" or "Unresolved".
2) Identify the single most blocking unresolved issue, contradiction, ambiguity, or missing decision.
3) Output ONE concise, actionable question/request for comment to resolve that specific issue.

Rules:
- Prefer questions that directly resolve items already listed under "Open Topics".
- If no open topics are listed, ask about the most critical missing requirement.
- Output ONLY the question text (no preamble or bullets).`;
  return callOpenAIChat([
    { role: 'system', content: 'You help iteratively build precise technical specifications and drive resolution of open topics.' },
    { role: 'user', content: userPrompt }
  ]);
}

async function updateDocument({ appDescription, currentDocument, humanAnswers }) {
  const answersList = Object.entries(humanAnswers).map(([email, a]) => `- ${email}: ${a.answer}`).join('\n');
  const userPrompt = `Consolidate the following human answers into the current specification. Improve clarity, structure, and completeness while preserving existing validated content. Produce ONLY the full updated specification in markdown (no preamble text).

APP DESCRIPTION: ${appDescription}

CURRENT DOCUMENT START
${currentDocument || ''}
CURRENT DOCUMENT END

HUMAN ANSWERS START
${answersList}
HUMAN ANSWERS END

Integration policy:
- If answers are contradictory, ambiguous, incomplete, or cannot be confidently integrated, DO NOT force-fit them.
- Instead, create or update a visible section titled "## Open Topics" near the end of the document with bullet points:
  - [UNRESOLVED] Short name of the issue — succinct description of what’s missing or conflicting.
  - Optionally summarize conflicting proposals (attribute to roles/emails if clear).
- Only remove an item from "Open Topics" when it is fully resolved by the new content.
- Preserve all validated content and the overall structure.
- Keep headings and terminology consistent throughout.`;
  return callOpenAIChat([
    { role: 'system', content: 'You merge feedback into a single authoritative software specification in Markdown. If input cannot be integrated, you explicitly track it under "Open Topics" for later resolution.' },
    { role: 'user', content: userPrompt }
  ]);
}

module.exports = { generateQuestion, updateDocument };
