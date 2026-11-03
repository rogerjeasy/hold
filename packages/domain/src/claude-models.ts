// The Claude models Hold calls on Amazon Bedrock, through their US inference profiles (docs/tech-stack.md section 6).
// Bedrock limits each model's tokens a day on its own. The photograph comparison runs on Opus 4.6, which reads
// photographs best and spends little; every agent runs on Opus 4.5, whose daily limit in this account is listed at
// 6,750,000 tokens against about 940,000 measured for Opus 4.6 (3 November 2026).
export const COMPARISON_MODEL_PROFILE = 'us.anthropic.claude-opus-4-6-v1'
export const AGENT_MODEL_PROFILE = 'us.anthropic.claude-opus-4-5-20251101-v1:0'

// Opus 4.5 on Bedrock takes an effort level only under this beta, and has no adaptive thinking: an agent that thinks
// gets a fixed budget instead, well inside its output ceiling.
export const AGENT_MODEL_BETAS = ['effort-2025-11-24']
export const AGENT_THINKING_TOKENS = 2048
