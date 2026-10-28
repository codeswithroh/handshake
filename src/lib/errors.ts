/** Parse raw onchain/wallet errors into friendly messages */
export function parseOnchainError(error: unknown): string {
  const msg = (error as { message?: string })?.message?.toLowerCase() ?? ''
  const raw = (error as { message?: string })?.message ?? ''

  if (msg.includes('user rejected') || msg.includes('user denied') || (error as { code?: number })?.code === 4001) {
    return 'Signature cancelled.'
  }
  if (msg.includes('insufficient') && msg.includes('balance')) {
    return 'Insufficient USDC balance. Get test USDC from the faucet.'
  }
  if (msg.includes('insufficient allowance') || msg.includes('allowance')) {
    return 'USDC allowance too low — approve first.'
  }
  if (msg.includes('expiry') || msg.includes('expiryinpast')) {
    return 'Expiry time is in the past. Try again.'
  }
  if (msg.includes('expirytooFar') || msg.includes('expiry too far')) {
    return 'Expiry too far in the future (max 30 days).'
  }
  if (msg.includes('budgetzero') || msg.includes('budget is zero')) {
    return 'Budget must be greater than zero.'
  }
  if (msg.includes('wrongstatus')) {
    return 'Job is not in the right state for this action.'
  }
  if (msg.includes('notclient')) return 'Only the job client can do this.'
  if (msg.includes('notprovider')) return 'Only the job provider can do this.'
  if (msg.includes('notevaluator')) return 'Only the evaluator can do this.'
  if (msg.includes('expired')) return 'This job has expired.'
  if (msg.includes('notexpired')) return 'Job has not expired yet.'
  if (msg.includes('nothingowed')) return 'No USDC owed to your address.'
  if (msg.includes('hashmismatch')) return 'Deliverable hash does not match content.'
  if (msg.includes('reverted')) {
    const reason = raw.match(/reason[:\s]+"?([^"]+)"?/i)?.[1]
    return reason ? `Transaction failed: ${reason}` : 'Transaction reverted. Check job state.'
  }
  if (msg.includes('network') || msg.includes('timeout') || msg.includes('fetch')) {
    return 'Network error — check your connection and retry.'
  }
  return 'Something went wrong. Please try again.'
}
