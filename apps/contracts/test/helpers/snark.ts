import path from 'path';
import fs from 'fs';

/**
 * Resolve Semaphore proving artifacts. Preference order:
 * 1) SNARK_WASM / SNARK_ZKEY env filepaths (absolute)
 * 2) Depth-specific files from @zk-kit/semaphore-artifacts in node_modules (semaphore-<depth>.*)
 * 3) Public artifacts folder (apps/web-app/public/artifacts/semaphore.*)
 */
export function getSnarkArtifacts(depth?: number) {
  const wasmEnv = process.env.SNARK_WASM;
  const zkeyEnv = process.env.SNARK_ZKEY;
  if (wasmEnv && zkeyEnv) {
    return { wasmFilePath: wasmEnv, zkeyFilePath: zkeyEnv } as const;
  }

  const d = Number(process.env.SNARK_DEPTH || depth || 20);

  // Try node_modules package
  // __dirname = apps/contracts/test/helpers -> go up 4 to repo root
  const repoRoot = path.resolve(__dirname, '../../../../');
  const nmDir = path.join(repoRoot, 'node_modules/@zk-kit/semaphore-artifacts');
  const nmWasm = path.join(nmDir, `semaphore-${d}.wasm`);
  const nmZkey = path.join(nmDir, `semaphore-${d}.zkey`);
  if (fs.existsSync(nmWasm) && fs.existsSync(nmZkey)) {
    return { wasmFilePath: nmWasm, zkeyFilePath: nmZkey } as const;
  }

  // Fallback to public artifacts
  const publicDir = path.join(repoRoot, 'apps/web-app/public/artifacts');
  const wasmPath = path.join(publicDir, 'semaphore.wasm');
  const zkeyPath = path.join(publicDir, 'semaphore.zkey');
  if (!fs.existsSync(wasmPath)) {
    throw new Error(
      `Missing wasm. Looked for env SNARK_WASM, node_modules @ depth ${d}, and ${wasmPath}.\n` +
      `Install @zk-kit/semaphore-artifacts or place files under ${publicDir} or set envs.`
    );
  }
  if (!fs.existsSync(zkeyPath)) {
    throw new Error(
      `Missing zkey. Looked for env SNARK_ZKEY, node_modules @ depth ${d}, and ${zkeyPath}.\n` +
      `Install @zk-kit/semaphore-artifacts or place files under ${publicDir} or set envs.`
    );
  }

  return { wasmFilePath: wasmPath, zkeyFilePath: zkeyPath } as const;
}
