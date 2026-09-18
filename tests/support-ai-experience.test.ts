import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const adminSource = readFileSync('src/pages/AdminPanel.tsx', 'utf8');
const detailSource = readFileSync('src/pages/SupportTicketDetail.tsx', 'utf8');
const apiSource = readFileSync('api/support-ai.ts', 'utf8');

assert.doesNotMatch(
  adminSource,
  /<option value="draft">Preparar sugestão para revisão<\/option>/,
  'draft suggestion must not be a selectable support mode',
);
assert.match(
  adminSource,
  /<option value="off">Atendimento pela equipe<\/option>[\s\S]*<option value="auto_reply">Responder automaticamente<\/option>/,
  'support mode selector must only choose between team and automatic replies',
);
assert.match(
  adminSource,
  /A sugestão de resposta via IA fica sempre disponível dentro de cada ticket\./,
  'admin overview explains that suggestions are always available',
);

assert.match(
  detailSource,
  /\{isAdmin && \([\s\S]*Sugestão de resposta/,
  'AI suggestion card is always rendered for admins',
);
assert.doesNotMatch(
  detailSource,
  /isAdmin && aiSettings\?\.enabled && aiSettings\.mode === 'draft'/,
  'suggestion card cannot depend on draft mode',
);
assert.match(
  detailSource,
  /h-\[360px\][\s\S]*sm:h-\[400px\][\s\S]*lg:h-\[440px\]/,
  'conversation history keeps a stable responsive height',
);
assert.doesNotMatch(
  detailSource,
  /flex-1 overflow-y-auto bg-brand-bg\/40 border border-brand-border rounded-3xl/,
  'conversation history must not shrink to absorb the AI suggestion card',
);
assert.match(
  detailSource,
  /if \(!draft && aiInitialDraftRequestedRef\.current !== ticketId\)[\s\S]*regenerateSupportAiDraft\(ticketId\)/,
  'legacy tickets automatically receive an initial suggestion when opened',
);

assert.match(
  apiSource,
  /const persistSupportSuggestion = async/,
  'support AI has a shared suggestion persistence flow',
);
assert.match(
  apiSource,
  /support_ai_drafts'[\s\S]*\.upsert\([\s\S]*if \(autoReply\)/,
  'every AI answer is stored as an internal suggestion before optional automatic sending',
);
assert.match(
  apiSource,
  /eventKey: `ticket:\$\{ticketId\}:initial-suggestion`/,
  'new tickets receive an internal initial suggestion',
);
assert.match(
  apiSource,
  /const autoReplyEnabled = settings\.enabled === true && settings\.mode === 'auto_reply'/,
  'automatic sending remains independent from suggestion generation',
);

console.log('Support AI experience tests passed.');
