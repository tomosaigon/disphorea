import { expect } from "chai";
import { ethers, run } from "hardhat";
import { Signer } from "ethers";

// @ts-ignore
import { Feedback, BasicNFT } from "../typechain-types";

describe("NFT-gated joining", () => {
  let feedback: Feedback;
  let nft: BasicNFT;
  let owner: Signer, a1: Signer, a2: Signer, a3: Signer;

  before(async () => {
    [owner, a1, a2, a3] = await ethers.getSigners();

    console.log("[setup] Deploying BasicNFT + Feedback for NFT-gated tests...")
    const { feedback: fb, nft: nftDeployed } = await run("deploy", { logs: false });
    feedback = fb as Feedback;
    nft = nftDeployed as BasicNFT;
    console.log("[setup] NFT:", await nft.getAddress(), "Feedback:", await feedback.getAddress())

    // Mint 3 NFTs to three accounts
    console.log("[mint] Minting NFTs to three holders...")
    await nft.connect(owner).mint(await a1.getAddress(), 1);
    await nft.connect(owner).mint(await a2.getAddress(), 2);
    await nft.connect(owner).mint(await a3.getAddress(), 3);
  });

  it("holders can call joinGroup", async () => {
    // Using arbitrary identity commitments for testing
    const id1 = 1111n;
    console.log("[join] Holder a1 joining via on-chain gate...")
    await expect(feedback.connect(a1).joinGroup(id1)).to.not.be.reverted;

    const id2 = 2222n;
    console.log("[join] Holder a2 joining via on-chain gate...")
    await expect(feedback.connect(a2).joinGroup(id2)).to.not.be.reverted;
  });

  it("non-holders cannot call joinGroup", async () => {
    const id = 3333n;
    const nonHolder = (await ethers.getSigners())[9];
    await expect(feedback.connect(nonHolder).joinGroup(id)).to.be.revertedWith("must hold NFT");
  });

  it("owner can addMemberAdmin", async () => {
    const id = 4444n;
    console.log("[admin] Owner adding member via admin path (relayer-equivalent)...")
    await expect(feedback.connect(owner).addMemberAdmin(id)).to.not.be.reverted;
  });
});
