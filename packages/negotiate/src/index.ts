// The two advocates' runners (extensions.md section 9). The referee is in @hold/domain; the gateway, the records and the
// settlement are in @hold/db.
export { ADVOCATE_TOOLS } from './advocate-model.ts'
export type { AdvocateModel, AdvocateReply, AdvocateRequest } from './advocate-model.ts'
export { createBedrockAdvocateModel } from './bedrock-advocate-model.ts'
export { briefFor, renderBrief } from './brief.ts'
export type { AdvocateBrief } from './brief.ts'
export { ADVOCATE_MODEL, ADVOCATE_PROMPT_VERSION, RENTER_ADVOCATE_PROMPT, SHOP_ADVOCATE_PROMPT } from './prompts.ts'
export { negotiationMessageSchema, RUN_LIMITS, runNegotiation } from './runner.ts'
export type { NegotiationMessage, RunDependencies } from './runner.ts'
export { createScriptedAdvocate, SIMULATED_MODEL } from './scripted-advocate.ts'
