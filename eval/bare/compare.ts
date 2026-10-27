import { mkdir, writeFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { AnthropicBedrock } from '@anthropic-ai/bedrock-sdk'
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod'
import { comparisonSchema } from './comparison-schema.ts'
import type { Comparison } from './comparison-schema.ts'
import { preparePhoto } from './prepare-photo.ts'
import type { PreparedPhoto } from './prepare-photo.ts'
import { PROMPT_VERSION, SYSTEM_PROMPT } from './prompt.ts'

// Runs the bare comparison on one handover photograph and one return photograph through Claude on Amazon Bedrock.
//   pnpm --filter @hold/eval compare:bare <handover photo> <return photo>
// AWS credentials come from the usual AWS chain, or AWS_BEARER_TOKEN_BEDROCK. The region comes from AWS_REGION.

// Opus 4.6 through its US inference profile until AWS lifts the account's zero quota for Opus 5.5 (tech-stack.md section 16).
const MODEL = 'us.anthropic.claude-opus-4-6-v1'
const EFFORT = 'high'
const MAX_TOKENS = 16_000
const POSITION_LIMIT = 1000

function imageBlock(photo: PreparedPhoto) {
  return { type: 'image' as const, source: { type: 'base64' as const, media_type: 'image/jpeg' as const, data: photo.base64 } }
}

// Structured output fixes the shape. Plain code checks what a schema cannot, before anything is printed as a finding.
function problemsWith(comparison: Comparison): string[] {
  return comparison.findings.flatMap((finding, index) => {
    const { left, top, right, bottom } = finding.box
    const inside = [left, top, right, bottom].every((value) => value >= 0 && value <= POSITION_LIMIT)
    return inside && left < right && top < bottom ? [] : [`finding ${String(index + 1)} has a box outside the photograph`]
  })
}

const [handoverPath, returnPath] = process.argv.slice(2)
if (handoverPath === undefined || returnPath === undefined) {
  throw new Error('Give two photographs: the handover one, then the return one.')
}

const [handover, returned] = await Promise.all([preparePhoto(handoverPath), preparePhoto(returnPath)])
const client = new AnthropicBedrock()
const startedAt = Date.now()

const response = await client.beta.messages.parse(
  {
    model: MODEL,
    max_tokens: MAX_TOKENS,
    thinking: { type: 'adaptive' },
    output_config: { effort: EFFORT, format: betaZodOutputFormat(comparisonSchema) },
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Handover photograph:' },
          imageBlock(handover),
          { type: 'text', text: 'Return photograph:' },
          imageBlock(returned),
        ],
      },
    ],
  },
)

const comparison = response.stop_reason === 'end_turn' ? response.parsed_output : null
const record = {
  promptVersion: PROMPT_VERSION,
  requestedModel: MODEL,
  servedBy: response.model,
  effort: EFFORT,
  stopReason: response.stop_reason,
  refusal: response.stop_reason === 'refusal' ? response.stop_details : null,
  seconds: (Date.now() - startedAt) / 1000,
  usage: response.usage,
  photos: [handover, returned].map(({ path, sha256, width, height }) => ({ file: basename(path), sha256, width, height })),
  comparison,
  problems: comparison === null ? [] : problemsWith(comparison),
}

const folder = join(import.meta.dirname, '..', 'results')
await mkdir(folder, { recursive: true })
const file = join(folder, `bare-${new Date().toISOString().replaceAll(':', '-')}.json`)
await writeFile(file, JSON.stringify(record, null, 2))

console.log(`\n${PROMPT_VERSION} on ${response.model}, effort ${EFFORT}, ${record.seconds.toFixed(1)} s, stop: ${String(response.stop_reason)}`)
if (comparison === null) {
  // A refusal or a cut-off answer is an outcome to record, not something to retry until it passes.
  console.log('No comparison came back. See the record for why.')
} else {
  console.log(`Same item: ${String(comparison.sameItem)}. Same view: ${String(comparison.sameView)}.`)
  for (const finding of comparison.findings) {
    console.log(`  ${finding.kind} (${finding.confidence}) ${finding.where}: ${finding.description}`)
  }
  if (comparison.findings.length === 0) console.log('  No changes found.')
  if (comparison.setAside.length > 0) console.log(`  Set aside: ${comparison.setAside.join('; ')}`)
  for (const problem of record.problems) console.log(`  Problem: ${problem}`)
}
console.log(`Recorded in ${file}`)
