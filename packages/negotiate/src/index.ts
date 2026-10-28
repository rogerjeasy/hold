// The two advocates' runners (extensions.md section 9). The referee is in @hold/domain; the gateway, the records, the
// brief and the settlement are in @hold/db.
export { ADVOCATE_TOOLS, EVIDENCE_TOOLS, MOVE_TOOLS } from './advocate-model.ts'
export type { AdvocateImage, AdvocateMessage, AdvocateModel, AdvocateReply, AdvocateRequest, ToolCall, ToolResult } from './advocate-model.ts'
export { advocateConversation, MOVE_LIMITS } from './advocate-turn.ts'
export type { MoveDecision, MoveLimits } from './advocate-turn.ts'
export { createBedrockAdvocateModel } from './bedrock-advocate-model.ts'
export { evidenceReader, NO_PHOTOS } from './evidence-tools.ts'
export type { PhotoReader } from './evidence-tools.ts'
export { ADVOCATE_MODEL, ADVOCATE_PROMPT_VERSION, MOVE_OPENING, RENTER_ADVOCATE_PROMPT, SHOP_ADVOCATE_PROMPT } from './prompts.ts'
export { negotiationMessageSchema, RUN_LIMITS, runNegotiation } from './runner.ts'
export type { NegotiationMessage, RunDependencies, RunOutcome } from './runner.ts'
export { createScriptedAdvocate, SIMULATED_MODEL } from './scripted-advocate.ts'
export { endStaleNegotiations } from './sweep.ts'
