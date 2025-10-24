# Disphorea Monorepo (Semaphore + Express + NFT‑gated Groups)

Disphorea is a monorepo that combines:

- `apps/web-app`: Next.js front‑end (based on the Semaphore boilerplate)
- `apps/contracts`: Hardhat workspace with Semaphore integration and a Basic ERC‑721 used for gating
- `apps/server`: Express backend that relays transactions to a local Hardhat node, verifies signatures for NFT‑gated joins, stores posts in SQLite, and optionally fans out to Discord

This repository started from the Semaphore boilerplate and extends it into a multi‑app setup with an API server, an NFT‑gated membership model, and end‑to‑end tests that exercise the full flow (client proof → server relay → on‑chain verification).


## Prerequisites

- Node.js 20 LTS (recommended).
- Yarn 4 (Corepack): `corepack enable`.


## Layout

```
apps/
  web-app/      # Next.js UI
  contracts/    # Hardhat + Semaphore + BasicNFT + Feedback (epoch scoped)
  server/       # Express API (relayer + Discord + SQLite)
```


## Env and artifacts

- `apps/server/.env` (see `.env.example`):
  - `RPC_URL=http://127.0.0.1:8545`
  - `CHAIN_ID=1337`
  - `RELAYER_PRIVATE_KEY=0x…` (Hardhat deployer key for owner‑only calls)
  - Optional Discord envs

- Proving artifacts:
  - We use `@zk-kit/semaphore-artifacts`. To copy depth‑specific artifacts to the web app: `SNARK_DEPTH=20 yarn artifacts:copy`.


## Run locally

Run each in its own terminal:

1) Hardhat chain + deploy

```
yarn dev:contracts
```

Writes `apps/server/config/contracts.json` and `apps/web-app/public/contracts.json`.

2) Start the server

```
yarn dev:server
```

API routes:
- `GET /healthz`
- `GET /api/contracts.json`
- `GET /api/epoch`
- `POST /api/posts` (relay Semaphore proof, store post)
- `GET /api/join/challenge` and `POST /api/join` (signature‑verified NFT‑gated join)
- `GET /api/discord/status`, `POST /api/discord/test` (optional)

3) Front‑end (optional)

```
yarn dev:web-app
```


## Tests (E2E)

We replaced the default tests with end‑to‑end tests that interact with the running server and local chain. Keep the Hardhat node and the server running.

Run (unit + integration):

```
yarn workspace contracts test
```

Covered flows:
- `apps/contracts/test/Feedback.ts`:
  - Join NFT‑gated group for a test identity (on the server chain).
  - Generate a Semaphore proof with epoch scope and relay via `POST /api/posts`.
  - Validate nullifier reuse reverts; posting next epoch succeeds.
- `apps/contracts/test/NFTJoin.ts`:
  - Validate `joinGroup` (NFT holder) and `addMemberAdmin` (owner only).
  - Server relayer join via `/api/join` with signature + on‑chain NFT ownership check.

To include the server end‑to‑end tests, export `SERVER_E2E=true` (e.g. `SERVER_E2E=true yarn workspace contracts test`). Without this flag, the test suite skips the API relay scenarios and only runs the local contract checks.

Notes:
- Epoch is derived from chain time (block.timestamp). Server and tests both use the external node’s time; tests use `evm_increaseTime` to hop epochs.
- If you see “scope does not match current or previous epoch”, ensure the Hardhat node is running and the server is connected to the same RPC.
- If relayer join reverts “Ownable”, ensure `RELAYER_PRIVATE_KEY` is the deployer (first Hardhat account).
- After upgrading Node, run `yarn install` to rebuild native deps (e.g., better‑sqlite3).


## Contract summary

Feedback (epoch‑scoped external nullifier):
- `sendFeedback(uint256 merkleTreeDepth, uint256 merkleTreeRoot, uint256 nullifier, uint256 feedback, uint256 scope, uint256[8] points)`
  - `scope` = `keccak256(abi.encode(boardSalt, epoch))`; contract accepts current or previous epoch.
- `joinGroup(uint256 identityCommitment)` (NFT holder only)
- `addMemberAdmin(uint256 identityCommitment)` (owner only)


## Credits

Built on top of the Semaphore boilerplate, extended with an Express server, SQLite persistence, Discord bot, and end‑to‑end tests.
