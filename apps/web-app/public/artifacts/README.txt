Place Semaphore proving artifacts here for local testing:

- semaphore.wasm
- semaphore.zkey

Alternatively, set absolute paths via environment variables used by Hardhat tests:

- SNARK_WASM=/absolute/path/to/semaphore.wasm
- SNARK_ZKEY=/absolute/path/to/semaphore.zkey

These are consumed by apps/contracts/test/helpers/snark.ts to avoid network downloads.
