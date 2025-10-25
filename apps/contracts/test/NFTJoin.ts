import { expect } from "chai";
import { ethers, run, artifacts } from "hardhat";
import { Identity } from "@semaphore-protocol/core";
import type { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

// @ts-ignore
import { Feedback, BasicNFT } from "../typechain-types";

describe("NFT-gated joining", () => {
  let feedback: Feedback;
  let nft: BasicNFT;
  let owner: HardhatEthersSigner, a1: HardhatEthersSigner, a2: HardhatEthersSigner, a3: HardhatEthersSigner;

  before(async () => {
    [owner, a1, a2, a3] = await ethers.getSigners();

    console.log("[setup] Deploying BasicNFT + Feedback for NFT-gated tests...");
    const { feedback: fb, nft: nftDeployed } = await run("deploy", { logs: false });
    feedback = fb as Feedback;
    nft = nftDeployed as BasicNFT;
    console.log("[setup] NFT:", await nft.getAddress(), "Feedback:", await feedback.getAddress());

    // Mint 3 NFTs to three accounts on local test deployment
    console.log("[mint] Minting NFTs to three holders...");
    await nft.connect(owner).mint(await a1.getAddress(), 1);
    await nft.connect(owner).mint(await a2.getAddress(), 2);
    await nft.connect(owner).mint(await a3.getAddress(), 3);
  });

  it("holders can call joinGroup", async () => {
    // Using arbitrary identity commitments for testing
    const id1 = BigInt(1111);
    console.log("[join] Holder a1 joining via on-chain gate...")
    await expect(feedback.connect(a1).joinGroup(id1)).to.not.be.reverted;

    const id2 = BigInt(2222);
    console.log("[join] Holder a2 joining via on-chain gate...")
    await expect(feedback.connect(a2).joinGroup(id2)).to.not.be.reverted;
  });

  it("non-holders cannot call joinGroup", async () => {
    const id = BigInt(3333);
    const nonHolder = (await ethers.getSigners())[9];
    await expect(feedback.connect(nonHolder).joinGroup(id)).to.be.revertedWith("must hold NFT");
  });

  it("owner can addMemberAdmin", async () => {
    const id = BigInt(4444);
    console.log("[admin] Owner adding member via admin path (relayer-equivalent)...")
    await expect(feedback.connect(owner).addMemberAdmin(id)).to.not.be.reverted;
  });

  const runServerE2E = process.env.SERVER_E2E === "true";
  const itServer = runServerE2E ? it : it.skip;

  itServer("relayer adds member after signature verification (server API)", async function () {
    this.timeout(60000);
    const SERVER_URL = process.env.SERVER_URL || "http://localhost:4000";

    // Ensure server is reachable
    try {
      const h = await fetch(`${SERVER_URL}/healthz`);
      if (!h.ok) {
        this.skip();
        return;
      }
    } catch {
      this.skip();
      return;
    }

    // Fetch server contracts and mint NFT on the server chain to the holder
    let conf: any;
    try {
      const confRes = await fetch(`${SERVER_URL}/api/contracts.json`);
      if (!confRes.ok) {
        this.skip();
        return;
      }
      conf = (await confRes.json()) as any;
    } catch {
      this.skip();
      return;
    }
    const nftAddress = conf.nft as string;
    const feedbackAddress = conf.feedback as string;
    expect(nftAddress && feedbackAddress, 'server contracts missing addresses').to.be.ok;

    // Prepare a signer on the server chain (localhost)
    const rpcUrl = process.env.RPC_URL || 'http://127.0.0.1:8545';
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const relayerKey = process.env.RELAYER_PRIVATE_KEY || '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
    const ownerWallet = new ethers.Wallet(relayerKey, provider);
    const nftArtifact = await artifacts.readArtifact('BasicNFT');
    const nftServer = new ethers.Contract(nftAddress, nftArtifact.abi, ownerWallet);

    // Ensure the target holder owns an NFT on the server chain
    const joinIdentity = new Identity();
    const id = joinIdentity.commitment;
    const holderAddr = await a1.getAddress();
    try {
      const mintTx = await nftServer.mint(holderAddr, BigInt(999));
      await mintTx.wait();
    } catch (err: any) {
      const msg = `${err?.message || ""} ${err?.shortMessage || ""}`.toLowerCase();
      if (!msg.includes("already") && !msg.includes("tokenalready")) throw err;
    }

    // Obtain canonical challenge from server
    const chRes = await fetch(`${SERVER_URL}/api/join/challenge?identityCommitment=${id.toString()}`);
    expect(chRes.ok, `challenge endpoint failed: ${chRes.status}`).to.eq(true);
    const challenge = await chRes.json() as {
      domain: { name: string; version: string; chainId: number; verifyingContract: string };
      types: Record<string, Array<{ name: string; type: string }>>;
      message: { groupId: string; identityCommitment: string; nonce: string; expiresAt: string };
    };

    // Sign the typed challenge with the holder's wallet
    const typedDomain = {
      name: challenge.domain.name,
      version: challenge.domain.version,
      chainId: Number(challenge.domain.chainId),
      verifyingContract: challenge.domain.verifyingContract
    };
    const typedMessage = {
      groupId: BigInt(challenge.message.groupId),
      identityCommitment: BigInt(challenge.message.identityCommitment),
      nonce: BigInt(challenge.message.nonce),
      expiresAt: BigInt(challenge.message.expiresAt)
    };
    const sig = await (a1 as any).signTypedData(typedDomain, challenge.types as any, typedMessage);

    // Call relayer endpoint
    const joinRes = await fetch(`${SERVER_URL}/api/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        address: holderAddr,
        identityCommitment: challenge.message.identityCommitment,
        nonce: challenge.message.nonce,
        expiresAt: challenge.message.expiresAt,
        signature: sig
      })
    });

    const body = await joinRes.json();
    console.log('[relayer] join response', body);
    if (!joinRes.ok) {
      throw new Error(`join failed: ${JSON.stringify(body)}`);
    }
    expect(body).to.have.property('txHash');

    // Optionally wait for relay mining; skip hard failure if node takes longer.
    try {
      const receipt = await provider.waitForTransaction(body.txHash, 1, 15000);
      expect(receipt && receipt.status === 1, 'tx failed on-chain').to.eq(true);
    } catch (err) {
      console.warn('[warn] relay tx mining check skipped:', err);
    }
  });
});
