/**
 * Minimal ABI for AgenticCommerce + ERC-20 used by the worker scripts.
 * Inlined so the agents/ directory has no build-time dependency on the
 * contracts/contract-metadata JSON (which lives under the Vite project root).
 */

export const HANDSHAKE_ABI = [
  // ── Read ───────────────────────────────────────────────────────────
  {
    type: 'function', name: 'getJob',
    inputs: [{ name: 'jobId', type: 'uint256' }],
    outputs: [{
      type: 'tuple',
      components: [
        { name: 'id',          type: 'uint256' },
        { name: 'client',      type: 'address' },
        { name: 'provider',    type: 'address' },
        { name: 'evaluator',   type: 'address' },
        { name: 'description', type: 'string'  },
        { name: 'budget',      type: 'uint256' },
        { name: 'expiredAt',   type: 'uint256' },
        { name: 'status',      type: 'uint8'   },
        { name: 'hook',        type: 'address' },
        { name: 'deliverable', type: 'bytes32' },
        { name: 'createdAt',   type: 'uint256' },
      ],
    }],
    stateMutability: 'view',
  },
  {
    type: 'function', name: 'jobCount',
    inputs: [], outputs: [{ type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function', name: 'evaluatorFeeBps',
    inputs: [], outputs: [{ type: 'uint256' }],
    stateMutability: 'view',
  },
  // ── Write ──────────────────────────────────────────────────────────
  {
    type: 'function', name: 'submit',
    inputs: [
      { name: 'jobId',       type: 'uint256' },
      { name: 'deliverable', type: 'bytes32' },
      { name: 'optParams',   type: 'bytes'   },
    ],
    outputs: [], stateMutability: 'nonpayable',
  },
  {
    type: 'function', name: 'complete',
    inputs: [
      { name: 'jobId',     type: 'uint256' },
      { name: 'reason',    type: 'bytes32' },
      { name: 'optParams', type: 'bytes'   },
    ],
    outputs: [], stateMutability: 'nonpayable',
  },
  {
    type: 'function', name: 'reject',
    inputs: [
      { name: 'jobId',     type: 'uint256' },
      { name: 'reason',    type: 'bytes32' },
      { name: 'optParams', type: 'bytes'   },
    ],
    outputs: [], stateMutability: 'nonpayable',
  },
  {
    type: 'function', name: 'createAndFund',
    inputs: [
      { name: 'provider',  type: 'address' },
      { name: 'evaluator', type: 'address' },
      { name: 'expiredAt', type: 'uint256' },
      { name: 'description', type: 'string' },
      { name: 'budget',    type: 'uint256' },
    ],
    outputs: [{ name: 'jobId', type: 'uint256' }],
    stateMutability: 'nonpayable',
  },
  // ── Events ─────────────────────────────────────────────────────────
  {
    type: 'event', name: 'JobFunded',
    inputs: [
      { name: 'jobId',   type: 'uint256', indexed: true  },
      { name: 'client',  type: 'address', indexed: true  },
      { name: 'amount',  type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event', name: 'JobSubmitted',
    inputs: [
      { name: 'jobId',       type: 'uint256', indexed: true  },
      { name: 'provider',    type: 'address', indexed: true  },
      { name: 'deliverable', type: 'bytes32', indexed: false },
      { name: 'optParams',   type: 'bytes',   indexed: false },
    ],
  },
] as const

// ── ERC-20 ABI (subset) ────────────────────────────────────────────
export const ERC20_ABI = [
  {
    type: 'function', name: 'approve',
    inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }],
    outputs: [{ type: 'bool' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function', name: 'allowance',
    inputs: [{ name: 'owner', type: 'address' }, { name: 'spender', type: 'address' }],
    outputs: [{ type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function', name: 'balanceOf',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ type: 'uint256' }],
    stateMutability: 'view',
  },
] as const

// ── ERC-8004 IdentityRegistry ABI (subset) ────────────────────────
export const IDENTITY_REGISTRY_ABI = [
  {
    type: 'function', name: 'register',
    inputs: [{ name: 'registrationUri', type: 'string' }],
    outputs: [{ name: 'agentId', type: 'uint256' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function', name: 'getAgentWallet',
    inputs: [{ name: 'agentId', type: 'uint256' }],
    outputs: [{ type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'event', name: 'AgentRegistered',
    inputs: [
      { name: 'agentId', type: 'uint256', indexed: true  },
      { name: 'wallet',  type: 'address', indexed: true  },
      { name: 'registrationUri', type: 'string', indexed: false },
    ],
  },
] as const
