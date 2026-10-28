import { NETWORK } from '../config'

export function txUrl(hash: string): string {
  return `${NETWORK.explorerBase}/tx/${hash}`
}

export function addrUrl(address: string): string {
  return `${NETWORK.explorerBase}/address/${address}`
}
