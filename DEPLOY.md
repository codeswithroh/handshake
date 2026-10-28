# Deploying AgenticCommerce

Two paths: **Foundry keystore** (recommended for your own terminal) or **Circle developer-controlled wallet** (Arc Studio managed deploy). Both produce the same contract from the same source.

---

## Path A — Foundry keystore (your terminal, no raw private keys)

### 1. Prerequisites

- Foundry installed: https://getfoundry.sh
- An encrypted keystore account (create once, reuse forever):

```bash
cast wallet import <account-name> --interactive
# Prompts for private key + password. Key is AES-encrypted in ~/.foundry/keystores/.
```

### 2. Set constructor args as env vars

```bash
export USDC_ADDRESS=0x3600000000000000000000000000000000000000
export EVALUATOR_FEE_BPS=1000
```

### 3. Deploy to Arc Mainnet

```bash
forge script contracts/script/Deploy.s.sol:Deploy \
  --rpc-url https://rpc.mainnet.arc.io \
  --account <account-name> \
  --with-gas-price 25gwei \
  --broadcast \
  -vvvv
```

Arc's mempool floor is 20 gwei; `--with-gas-price 25gwei` gives 25% headroom.

### 4. Deploy to Arc Testnet (for testing first)

```bash
forge script contracts/script/Deploy.s.sol:Deploy \
  --rpc-url https://rpc.testnet.arc.io \
  --account <account-name> \
  --with-gas-price 25gwei \
  --broadcast \
  -vvvv
```

Testnet USDC: `0x3600000000000000000000000000000000000000` (same address).

### 5. Record the deployed address

Copy the `Deployed to:` address from the Foundry output and set it in your app:

```
# .env
VITE_CONTRACT_ADDRESS_MAINNET=0x<your-deployed-address>
```

Also update `AGENTS.md` with the address and tx hash.

---

## Path B — Circle developer-controlled wallet (Arc Studio)

Handled interactively inside Arc Studio. Requires:

1. A Circle Standard Developer API key (`LIVE_API_KEY:…:…`) in `.env` as `CIRCLE_API_KEY`.
2. Developer Controlled Wallets enabled on your Circle account (https://console.circle.com).
3. A registered entity secret (Arc Studio registers this for you with your consent).
4. The deployer wallet funded with ≥ 0.01 mainnet USDC for gas.

Arc Studio walks through each step in chat. The deployed address is recorded in `AGENTS.md`.

---

## Source verification (Sourcify)

After deploy, verify on Sourcify so the explorer shows the source code:

```bash
forge verify-contract <deployed-address> \
  contracts/AgenticCommerce.sol:AgenticCommerce \
  --verifier sourcify \
  --verifier-url https://sourcify.dev/server \
  --chain-id 5042
```

For testnet (chain ID 5042002):

```bash
forge verify-contract <deployed-address> \
  contracts/AgenticCommerce.sol:AgenticCommerce \
  --verifier sourcify \
  --verifier-url https://sourcify.dev/server \
  --chain-id 5042002
```

---

## Constructor arguments (for reference)

| Parameter | Value |
|---|---|
| `usdc` | `0x3600000000000000000000000000000000000000` |
| `evaluatorFeeBps` | `1000` (10%) |

The evaluator fee cap in the contract is 2000 bps (20%); 1000 is the chosen operational value and can only be changed by the contract owner via `setEvaluatorFeeBps`.

---

## Gas cost estimate

The `AgenticCommerce` constructor stores two state variables and emits no events. On Arc Mainnet at 25 gwei:

- Constructor gas: ~150,000 gas units
- Cost: ~150,000 × 25 × 10⁻⁹ USDC ≈ 0.00375 USDC

Sending 0.01 USDC to the deployer wallet gives comfortable headroom.
