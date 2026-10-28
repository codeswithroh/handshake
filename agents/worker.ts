#!/usr/bin/env npx tsx
/**
 * Handshake agent worker — runs all five agents (Scribe, Polyglot, Bard,
 * Lazy, Sentinel) in a single Node 20 process.
 *
 * Usage:
 *   npx tsx agents/worker.ts
 *   npx tsx agents/worker.ts --seed 5   # also post 5 random test jobs
 *
 * Environment: agents/.env  (copy agents/.env.example and fill in)
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import Anthropic from '@anthropic-ai/sdk'
import type { Message, MessageCreateParamsNonStreaming } from '@anthropic-ai/sdk/resources/messages/messages.js'
import { type Address, type Hex, hexToBytes, keccak256 } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import {
  publicClient, walletClient, sendTxWithRetry, nextNonce,
  keccak256OfText, textToBytes,
  JOB_FUNDED_ABI, JOB_SUBMITTED_ABI,
  fetchLogsRange,
  sleep, formatUsdc, fmtAddr, fmtTx,
  getContractAddress, getUsdcAddress, getDeployBlock,
} from './chain.js'
import { HANDSHAKE_ABI, ERC20_ABI } from './abi.js'

// ── Load agents/.env ───────────────────────────────────────────────

const __dir = dirname(fileURLToPath(import.meta.url))
const envPath = resolve(__dir, '.env')
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq < 0) continue
    const key = trimmed.slice(0, eq).trim()
    const val = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '')
    if (!(key in process.env)) process.env[key] = val
  }
}

// ── Config ─────────────────────────────────────────────────────────

function optEnv(key: string): string | undefined {
  return process.env[key] || undefined
}

const CONTRACT = getContractAddress()
const USDC     = getUsdcAddress()

interface AgentConfig {
  name: string
  key: Hex
  address: Address
}

function loadAgent(name: string, envKey: string): AgentConfig | null {
  const key = optEnv(envKey)
  if (!key) return null
  const hex = (key.startsWith('0x') ? key : `0x${key}`) as Hex
  const address = privateKeyToAccount(hex).address
  return { name, key: hex, address }
}

const SCRIBE   = loadAgent('Scribe',   'SCRIBE_KEY')
const POLYGLOT = loadAgent('Polyglot', 'POLYGLOT_KEY')
const BARD     = loadAgent('Bard',     'BARD_KEY')
const LAZY     = loadAgent('Lazy',     'LAZY_KEY')
const SENTINEL = loadAgent('Sentinel', 'SENTINEL_KEY')

const PROVIDERS = [SCRIBE, POLYGLOT, BARD, LAZY].filter(Boolean) as AgentConfig[]

// ── Anthropic ──────────────────────────────────────────────────────

const anthropic = new Anthropic({ apiKey: optEnv('ANTHROPIC_API_KEY') })

// Model names — override via PROVIDER_MODEL / EVALUATOR_MODEL in agents/.env
const PROVIDER_MODEL  = process.env.PROVIDER_MODEL  ?? 'claude-haiku-5-5'
const EVALUATOR_MODEL = process.env.EVALUATOR_MODEL ?? 'claude-sonnet-5-5'

// ── Cursor + processed set ─────────────────────────────────────────

const CURSOR_PATH    = resolve(__dir, '.cursor.json')
const PROCESSED_PATH = resolve(__dir, '.processed.json')

interface Cursor    { block: number }
interface Processed { provider: string[]; evaluator: string[] }

function loadCursor(): bigint {
  try {
    const c: Cursor = JSON.parse(readFileSync(CURSOR_PATH, 'utf8'))
    return BigInt(c.block)
  } catch {
    return getDeployBlock()
  }
}

function saveCursor(block: bigint) {
  writeFileSync(CURSOR_PATH, JSON.stringify({ block: Number(block) }))
}

function loadProcessed(): Processed {
  try {
    return JSON.parse(readFileSync(PROCESSED_PATH, 'utf8'))
  } catch {
    return { provider: [], evaluator: [] }
  }
}

function saveProcessed(p: Processed) {
  writeFileSync(PROCESSED_PATH, JSON.stringify(p))
}

// ── Log helpers ────────────────────────────────────────────────────

function log(tag: string, msg: string) {
  const ts = new Date().toISOString().slice(11, 23)
  console.log(`\x1b[90m${ts}\x1b[0m [\x1b[36m${tag}\x1b[0m] ${msg}`)
}

function ok(tag: string, msg: string) {
  const ts = new Date().toISOString().slice(11, 23)
  console.log(`\x1b[90m${ts}\x1b[0m [\x1b[32m${tag}\x1b[0m] ${msg}`)
}

function warn(tag: string, msg: string) {
  const ts = new Date().toISOString().slice(11, 23)
  console.warn(`\x1b[90m${ts}\x1b[0m [\x1b[33m${tag}\x1b[0m] ${msg}`)
}

// ── Job struct ─────────────────────────────────────────────────────

interface Job {
  id: bigint
  client: Address
  provider: Address
  evaluator: Address
  description: string
  budget: bigint
  expiredAt: bigint
  status: number
  hook: Address
  deliverable: Hex
  createdAt: bigint
}

const JOB_STATUS = { Open: 0, Funded: 1, Submitted: 2, Completed: 3, Rejected: 4, Expired: 5 }

async function getJob(jobId: bigint): Promise<Job | null> {
  try {
    return await publicClient().readContract({
      address: CONTRACT, abi: HANDSHAKE_ABI, functionName: 'getJob', args: [jobId],
    }) as Job
  } catch { return null }
}

// ── LLM helpers ────────────────────────────────────────────────────

// Claude 5.5 models reject `temperature` ("deprecated for this model"), so it is never sent.
async function callLlm(params: MessageCreateParamsNonStreaming): Promise<string> {
  const msg = await anthropic.messages.create(params) as Message
  const block = msg.content.find((b: { type: string }) => b.type === 'text') as
    | { type: 'text'; text: string } | undefined
  return (block?.text ?? '').trim()
}

async function callHaiku(system: string, user: string): Promise<string> {
  return (await callLlm({
    model: PROVIDER_MODEL,
    max_tokens: 400,
    system,
    messages: [{ role: 'user', content: user }],
  })).slice(0, 1500)
}

async function callSonnet(system: string, user: string): Promise<string> {
  return callLlm({
    model: EVALUATOR_MODEL,
    max_tokens: 400,
    system,
    messages: [{ role: 'user', content: user }],
  })
}

// ── Provider logic per agent ───────────────────────────────────────

async function generateDeliverable(agent: AgentConfig, description: string): Promise<string> {
  switch (agent.name) {
    case 'Lazy':
      return 'lol no'

    case 'Scribe':
      return callHaiku(
        'You are Scribe, a precise summarization agent. Distill the user\'s text into exactly three bullet points. Each bullet is one sentence, ≤ 100 characters, starting with "•". Output ONLY the three bullets.',
        description,
      )

    case 'Polyglot': {
      const lower = description.toLowerCase()
      const m = lower.match(/translat\w*\s+(?:to|into)\s+([a-z]+)/) ?? lower.match(/in\s+([a-z]+)\s*$/)
      const lang = m ? m[1].charAt(0).toUpperCase() + m[1].slice(1) : 'Spanish'
      return callHaiku(
        `You are Polyglot, a translation agent. Translate the user's text into ${lang}. Preserve tone. Output ONLY the translated text.`,
        description,
      )
    }

    case 'Bard':
      return callHaiku(
        'You are Bard, a haiku poet. Write one haiku (5-7-5 syllables) about the topic. Output ONLY the three-line haiku, no title or explanation.',
        description,
      )

    default:
      return `[${agent.name}] ${description.slice(0, 200)}`
  }
}

// ── Provider handler ───────────────────────────────────────────────

async function handleFundedJob(agent: AgentConfig, jobId: bigint, processed: Processed) {
  const key = `${agent.name.toLowerCase()}-${jobId}`
  if (processed.provider.includes(key)) return

  const job = await getJob(jobId)
  if (!job) return
  if (job.status !== JOB_STATUS.Funded) return
  if (job.provider.toLowerCase() !== agent.address.toLowerCase()) return

  const now = BigInt(Math.floor(Date.now() / 1000))
  if (job.expiredAt - now < 20n) { warn(agent.name, `job #${jobId} expiring soon — skip`); return }

  log(agent.name, `job #${jobId} — "${job.description.slice(0, 60)}"`)

  let text: string
  try {
    text = await generateDeliverable(agent, job.description)
  } catch (e) {
    warn(agent.name, `LLM error: ${(e as Error).message?.slice(0, 80)}`); return
  }

  const nowAfter = BigInt(Math.floor(Date.now() / 1000))
  if (job.expiredAt - nowAfter < 5n) { warn(agent.name, `job #${jobId} expired during LLM — skip`); return }

  try {
    const receipt = await sendTxWithRetry({
      wc: walletClient(agent.key),
      address: CONTRACT,
      abi: HANDSHAKE_ABI,
      functionName: 'submit',
      args: [jobId, keccak256OfText(text), textToBytes(text)],
      label: agent.name,
      account: agent.address,
    })
    ok(agent.name, `job #${jobId} delivered (tx ${fmtTx(receipt.transactionHash)}) "${text.slice(0, 60)}…"`)
    processed.provider.push(key)
    saveProcessed(processed)
  } catch (e) {
    warn(agent.name, `submit failed: ${(e as Error).message?.slice(0, 120)}`)
  }
}

// ── Sentinel evaluator ─────────────────────────────────────────────

async function handleSubmittedJob(jobId: bigint, optParams: Hex | undefined, processed: Processed) {
  if (!SENTINEL) return
  const key = `sentinel-${jobId}`
  if (processed.evaluator.includes(key)) return

  const job = await getJob(jobId)
  if (!job) return
  if (job.status !== JOB_STATUS.Submitted) return
  if (job.evaluator.toLowerCase() !== SENTINEL.address.toLowerCase()) return

  const now = BigInt(Math.floor(Date.now() / 1000))
  if (job.expiredAt - now < 20n) { warn('Sentinel', `job #${jobId} expiring soon — skip`); return }

  // The deliverable text is the JobSubmitted event's optParams, which the poll loop already
  // fetched. Re-scanning history per job flooded the RPC and failed under its rate limits.
  let deliverableText = ''
  if (optParams && keccak256(optParams) === job.deliverable) {
    deliverableText = new TextDecoder().decode(hexToBytes(optParams))
  }

  if (!deliverableText) {
    warn('Sentinel', `job #${jobId} — can't decode deliverable, skip`); return
  }

  log('Sentinel', `job #${jobId} — evaluating "${deliverableText.slice(0, 80)}"`)

  let verdict: { approve: boolean; score: number; reason: string }
  try {
    const raw = await callSonnet(
      'You are Sentinel, a strict quality evaluator. Grade the deliverable against the task on 0–10. Approve if score ≥ 6. Respond ONLY with valid JSON: {"approve":boolean,"score":0-10,"reason":"≤200 chars"}',
      `TASK: ${job.description}\n\nDELIVERABLE: ${deliverableText}`,
    )
    const m = raw.match(/\{[\s\S]*\}/)
    if (!m) throw new Error('no JSON')
    verdict = JSON.parse(m[0]) as { approve: boolean; score: number; reason: string }
    if (typeof verdict.score !== 'number') throw new Error('bad score')
    if (verdict.score < 6) verdict.approve = false
    verdict.reason = String(verdict.reason ?? '').slice(0, 200)
  } catch (e) {
    warn('Sentinel', `grade error: ${(e as Error).message?.slice(0, 80)}`); return
  }

  const reasonBytes = textToBytes(verdict.reason)
  const reasonHash  = keccak256OfText(verdict.reason)

  try {
    const fn  = verdict.approve ? 'complete' : 'reject'
    const receipt = await sendTxWithRetry({
      wc: walletClient(SENTINEL.key),
      address: CONTRACT,
      abi: HANDSHAKE_ABI,
      functionName: fn,
      args: [jobId, reasonHash, reasonBytes],
      label: 'Sentinel',
      account: SENTINEL.address,
    })
    if (verdict.approve) {
      const feeBps = await publicClient().readContract({
        address: CONTRACT, abi: HANDSHAKE_ABI, functionName: 'evaluatorFeeBps',
      }) as bigint
      const payout = job.budget - (job.budget * feeBps / 10000n)
      ok('Sentinel', `job #${jobId} APPROVED ${verdict.score}/10 → paid $${formatUsdc(payout)} to ${fmtAddr(job.provider)} (tx ${fmtTx(receipt.transactionHash)})`)
    } else {
      ok('Sentinel', `job #${jobId} REJECTED ${verdict.score}/10 → refunded $${formatUsdc(job.budget)} to ${fmtAddr(job.client)} (tx ${fmtTx(receipt.transactionHash)})`)
    }
    ok('Sentinel', `  reason: "${verdict.reason}"`)
    processed.evaluator.push(key)
    saveProcessed(processed)
  } catch (e) {
    warn('Sentinel', `verdict tx failed: ${(e as Error).message?.slice(0, 120)}`)
  }
}

// ── Seeder ────────────────────────────────────────────────────────

async function seed(n: number) {
  const rawKey = optEnv('SEEDER_KEY') ?? optEnv('SCRIBE_KEY')
  if (!rawKey) throw new Error('Set SEEDER_KEY (or SCRIBE_KEY) to seed jobs')
  const hex = (rawKey.startsWith('0x') ? rawKey : `0x${rawKey}`) as Hex
  const account = privateKeyToAccount(hex)
  const wc = walletClient(hex)
  const pub = publicClient()

  // Sentinel address from env; fall back to the loaded SENTINEL agent wallet
  const sentinelAddr: Address = SENTINEL?.address
    ?? (optEnv('SENTINEL_ADDRESS') as Address | undefined)
    ?? (() => { throw new Error('Set SENTINEL_KEY or SENTINEL_ADDRESS for seeder') })()

  // Approve USDC once (10 USDC ceiling)
  const allowance = await pub.readContract({
    address: USDC, abi: ERC20_ABI, functionName: 'allowance',
    args: [account.address, CONTRACT],
  }) as bigint

  const cap = 10_000_000n   // 10 USDC
  if (allowance < cap) {
    log('Seeder', `approving $10 USDC…`)
    const nonce = await nextNonce(account.address)
    const approveTx = await wc.writeContract({
      address: USDC, abi: ERC20_ABI, functionName: 'approve',
      args: [CONTRACT, cap],
      maxFeePerGas: 25_000_000_000n,
      maxPriorityFeePerGas: 1_000_000_000n,
      nonce: Number(nonce),
      account,
      chain: undefined,
    })
    await pub.waitForTransactionReceipt({ hash: approveTx })
    ok('Seeder', `approved (tx ${fmtTx(approveTx)})`)
  }

  const templates: Array<{ p: AgentConfig | null; desc: string; budget: bigint }> = [
    { p: SCRIBE,   desc: 'Summarise: "The quick brown fox jumps over the lazy dog."', budget: 50_000n },
    { p: POLYGLOT, desc: 'Translate to French: "Hello, this is a Handshake escrow test."', budget: 50_000n },
    { p: BARD,     desc: 'Write a haiku about blockchain and trust.',                  budget: 20_000n },
    { p: LAZY,     desc: 'Write a sonnet about the ocean.',                             budget: 10_000n },
    { p: SCRIBE,   desc: 'Summarise: "Arc uses USDC as its native gas token."',         budget: 50_000n },
    { p: POLYGLOT, desc: 'Translate into German: "Smart contracts run on blockchains."',budget: 50_000n },
    { p: BARD,     desc: 'Write a haiku about summer rain.',                            budget: 20_000n },
    { p: LAZY,     desc: 'Explain quantum computing in one paragraph.',                 budget: 10_000n },
  ]

  for (let i = 0; i < Math.min(n, templates.length); i++) {
    const { p, desc, budget } = templates[i]
    if (!p) { warn('Seeder', `skipping slot ${i} — agent key not set`); continue }

    const expiredAt = BigInt(Math.floor(Date.now() / 1000) + 15 * 60)

    try {
      const receipt = await sendTxWithRetry({
        wc, address: CONTRACT, abi: HANDSHAKE_ABI,
        functionName: 'createAndFund',
        args: [p.address, sentinelAddr, expiredAt, desc, budget],
        label: 'Seeder',
        account: account.address,
      })
      const createdLog = receipt.logs.find(l => l.address.toLowerCase() === CONTRACT.toLowerCase())
      const jobId = createdLog?.topics[1] ? BigInt(createdLog.topics[1]).toString() : '?'
      ok('Seeder', `job #${jobId} → ${p.name} $${formatUsdc(budget)} (tx ${fmtTx(receipt.transactionHash)})`)
    } catch (e) {
      warn('Seeder', `createAndFund failed: ${(e as Error).message?.slice(0, 120)}`)
    }

    if (i < Math.min(n, templates.length) - 1) {
      const delay = 20_000 + Math.floor(Math.random() * 40_000)
      log('Seeder', `waiting ${Math.round(delay / 1000)}s…`)
      await sleep(delay)
    }
  }
}

// ── Main poll loop ─────────────────────────────────────────────────

async function pollOnce(processed: Processed): Promise<bigint> {
  const pub = publicClient()
  const head = await pub.getBlockNumber()
  const cursor = loadCursor()
  if (cursor > head) return head

  const to = cursor + 9000n < head ? cursor + 9000n : head

  type FundedLog    = { args?: { jobId?: bigint } }
  type SubmittedLog = { args?: { jobId?: bigint; optParams?: Hex } }

  const funded    = await fetchLogsRange<FundedLog>(JOB_FUNDED_ABI, cursor, to, CONTRACT)
  const submitted = await fetchLogsRange<SubmittedLog>(JOB_SUBMITTED_ABI, cursor, to, CONTRACT)

  for (const l of funded) {
    const jobId = l.args?.jobId
    if (jobId == null) continue
    for (const agent of PROVIDERS) await handleFundedJob(agent, jobId, processed)
  }

  for (const l of submitted) {
    const jobId = l.args?.jobId
    if (jobId == null) continue
    await handleSubmittedJob(jobId, l.args?.optParams, processed)
  }

  saveCursor(to)
  return to
}

// ── Entry point ────────────────────────────────────────────────────

async function main() {
  const args    = process.argv.slice(2)
  const seedIdx = args.indexOf('--seed')
  const seedN   = seedIdx >= 0 ? parseInt(args[seedIdx + 1] ?? '5', 10) : 0

  const network = process.env.NETWORK ?? 'testnet'
  console.log(`\n\x1b[1mHandshake Worker\x1b[0m  network=${network}  contract=${fmtAddr(CONTRACT)}`)
  console.log(`Providers: ${PROVIDERS.length ? PROVIDERS.map(a => `${a.name}(${fmtAddr(a.address)})`).join(', ') : 'none — set agent keys'}`)
  if (SENTINEL) console.log(`Evaluator: Sentinel(${fmtAddr(SENTINEL.address)})`)
  else          warn('Sentinel', 'SENTINEL_KEY not set — evaluation disabled')

  const processed = loadProcessed()

  if (seedN > 0) {
    console.log(`\nSeeding ${seedN} jobs…`)
    await seed(seedN)
    console.log('')
  }

  const startCursor = loadCursor()
  log('Worker', `polling from block ${startCursor} every 4s`)

  while (true) {
    try {
      await pollOnce(processed)
    } catch (e) {
      warn('Worker', `poll error: ${(e as Error).message?.slice(0, 120)}`)
    }
    await sleep(4000)
  }
}

main().catch(e => { console.error(e); process.exit(1) })
