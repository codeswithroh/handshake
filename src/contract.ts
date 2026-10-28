/**
 * AgenticCommerce contract ABI and config.
 * Address and ABI sourced from contracts/contract-metadata/AgenticCommerce.json
 */
import artifact from '../contracts/contract-metadata/AgenticCommerce.json'
import { NETWORK } from './config'

export const CONTRACT_ADDRESS = NETWORK.contractAddress
export const CONTRACT_ABI = artifact.abi

// JobStatus enum values (mirrors Solidity)
export const JobStatus = {
  Open: 0,
  Funded: 1,
  Submitted: 2,
  Completed: 3,
  Rejected: 4,
  Expired: 5,
} as const

export type JobStatusKey = keyof typeof JobStatus
export type JobStatusValue = (typeof JobStatus)[JobStatusKey]

export function jobStatusName(s: number): JobStatusKey {
  const map: Record<number, JobStatusKey> = {
    0: 'Open', 1: 'Funded', 2: 'Submitted',
    3: 'Completed', 4: 'Rejected', 5: 'Expired',
  }
  return map[s] ?? 'Open'
}

export type JobStruct = {
  id: bigint
  client: `0x${string}`
  provider: `0x${string}`
  evaluator: `0x${string}`
  description: string
  budget: bigint
  expiredAt: bigint
  status: number
  hook: `0x${string}`
  deliverable: `0x${string}`
  createdAt: bigint
}

export type StatsStruct = {
  jobsCompleted: bigint
  jobsCancelledByClient: bigint
  jobsRejectedAsProvider: bigint
  usdcEarned: bigint
  usdcEarnedAsEvaluator: bigint
  jobsPosted: bigint
  usdcSpent: bigint
}
