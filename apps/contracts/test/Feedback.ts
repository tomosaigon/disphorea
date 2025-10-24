import { Group, Identity, generateProof } from "@semaphore-protocol/core"
import { getSnarkArtifacts } from "./helpers/snark"
import { expect } from "chai"
import { encodeBytes32String, keccak256, AbiCoder } from "ethers"
import { ethers, run } from "hardhat"
import type { EventLog } from "ethers"
// @ts-ignore: typechain folder will be generated after contracts compilation
import { Feedback } from "../typechain-types"

describe("Feedback", () => {
    let feedbackContract: Feedback
    let nftAddress: string
    let semaphoreContract: string

    const groupId = 0
    const treeDepth = Number(process.env.SNARK_DEPTH || 20)
    const group = new Group()
    let lastScope: string | null = null
    let cachedServerConfig: any | null = null
    const users: Identity[] = []
    const serverIdentity = new Identity()

    before(async () => {
        const { semaphore } = await run("deploy:semaphore", {
            logs: false
        })

        console.log("[setup] Deploying BasicNFT + Feedback (linked to Semaphore)...")
        const { feedback, nft } = await run("deploy", { logs: false, semaphore: await semaphore.getAddress() })
        feedbackContract = feedback as Feedback
        semaphoreContract = semaphore
        nftAddress = await nft.getAddress()
        console.log("[setup] NFT:", nftAddress, "Feedback:", await feedbackContract.getAddress())

        users.push(new Identity())
        users.push(new Identity())
    })

    describe("# joinGroup", () => {
        it("Should allow users to join the group", async () => {
            // Mint NFT to default signer so joinGroup passes the NFT gate.
            const [signer] = await ethers.getSigners()
            const nft = await ethers.getContractAt("BasicNFT", nftAddress)
            await nft.mint(await signer.getAddress(), 100)

            for await (const [i, user] of users.entries()) {
                const transaction = feedbackContract.joinGroup(user.commitment)

                group.addMember(user.commitment)

                await expect(transaction)
                    .to.emit(semaphoreContract, "MemberAdded")
                    .withArgs(groupId, i, user.commitment, group.root)
            }
        })
    })

    const runServerE2E = process.env.SERVER_E2E === "true"
    const itServer = runServerE2E ? it : it.skip

    describe("# sendFeedback", () => {
        const SERVER_URL = process.env.SERVER_URL || "http://localhost:4000"
        const RPC_URL = process.env.RPC_URL || "http://127.0.0.1:8545"
        const OWNER_KEY = process.env.RELAYER_PRIVATE_KEY || '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'
        const HOLDER_KEY = process.env.MINT_PRIVATE_KEY || '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d'

        async function fetchContracts() {
            if (cachedServerConfig) {
                return cachedServerConfig
            }
            const res = await fetch(`${SERVER_URL}/api/contracts.json`)
            if (!res.ok) throw new Error(`contracts.json fetch failed: ${res.status}`)
            cachedServerConfig = await res.json()
            return cachedServerConfig
        }

        async function fetchEpoch() {
            const res = await fetch(`${SERVER_URL}/api/epoch`)
            if (!res.ok) throw new Error(`epoch fetch failed: ${res.status}`)
            return (await res.json()) as { epoch: number }
        }

        async function buildServerGroup() {
            const config = await fetchContracts()
            const provider = new ethers.JsonRpcProvider(RPC_URL)
            const semaphoreAddress: string = config.semaphore
            const groupId = BigInt(config.groupId || 0)
            const semaphore = new ethers.Contract(
                semaphoreAddress,
                [
                    "event MemberAdded(uint256 indexed groupId, uint256 index, uint256 identityCommitment, uint256 merkleTreeRoot)"
                ],
                provider
            )
            const filter = semaphore.filters.MemberAdded(groupId)
            const events = (await semaphore.queryFilter(filter)) as EventLog[]
            const g = new Group()
            for (const evt of events) {
                const args = evt.args
                const commitment = args && (args.identityCommitment as bigint | undefined)
                if (commitment !== undefined) {
                    g.addMember(BigInt(commitment.toString()))
                }
            }
            return g
        }

        itServer("Should allow users to send feedback anonymously (via server relay)", async function () {
            this.timeout(15000)
            const signal = encodeBytes32String("Hello World")
            const depth = Number(process.env.SNARK_DEPTH || 20)
            const { wasmFilePath, zkeyFilePath } = getSnarkArtifacts(depth)
            const config = await fetchContracts()
            const { boardSalt, epochLength, nft: nftAddress, feedback: feedbackAddress } = config

            const provider = new ethers.JsonRpcProvider(RPC_URL)
            const owner = new ethers.Wallet(OWNER_KEY, provider)
            const holder = new ethers.Wallet(HOLDER_KEY, provider)
            const nftServer = await ethers.getContractAt("BasicNFT", nftAddress, owner)
            try {
                const mintTx = await nftServer.mint(await holder.getAddress(), BigInt(777))
                await mintTx.wait()
            } catch (err: any) {
                const msg = `${err?.message || ""} ${err?.shortMessage || ""}`.toLowerCase()
                if (!msg.includes("already") && !msg.includes("tokenalready")) throw err
            }

            const holderAddr = await holder.getAddress()
            const challengeRes = await fetch(`${SERVER_URL}/api/join/challenge?identityCommitment=${serverIdentity.commitment.toString()}`)
            if (!challengeRes.ok) throw new Error(`challenge fetch failed: ${challengeRes.status}`)
            const { message } = await challengeRes.json() as { message: string }
            const signature = await holder.signMessage(message)
            const joinRes = await fetch(`${SERVER_URL}/api/join`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    address: holderAddr,
                    identityCommitment: serverIdentity.commitment.toString(),
                    message,
                    signature
                })
            })
            const joinJson = await joinRes.json()
            if (!joinRes.ok) {
                throw new Error(`join failed: ${JSON.stringify(joinJson)}`)
            }
            await provider.waitForTransaction(joinJson.txHash)

            const { epoch } = await fetchEpoch()
            const scopeHex = keccak256(AbiCoder.defaultAbiCoder().encode(["bytes32", "uint64"], [boardSalt, BigInt(epoch)]))
            const g = await buildServerGroup()
            const fullProof = await generateProof(serverIdentity, g, signal, scopeHex, depth, {
                wasm: wasmFilePath,
                zkey: zkeyFilePath
            })

            const semaphore = new ethers.Contract(
                config.semaphore,
                ["function getMerkleTreeRoot(uint256) view returns (uint256)"] ,
                provider
            )
            const onchainRoot = await semaphore.getMerkleTreeRoot(config.groupId)
            console.log("[debug] proof root", fullProof.merkleTreeRoot.toString(), "onchain root", onchainRoot.toString())

            const body = {
                proof: { merkleTreeDepth: Number(fullProof.merkleTreeDepth), points: fullProof.points.map(String) },
                merkleRoot: fullProof.merkleTreeRoot.toString(),
                nullifierHash: fullProof.nullifier.toString(),
                feedback: signal.toString(),
                scope: BigInt(scopeHex).toString(),
                content: "test via server relay",
                boardId: "default"
            }
            const resp = await fetch(`${SERVER_URL}/api/posts`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body)
            })
            const json = await resp.json()
            console.log("[relay] Response:", json)
            expect(resp.ok, `server error: ${JSON.stringify(json)}`).to.eq(true)
            expect(json).to.have.property("txHash")
            lastScope = scopeHex
        })

        itServer("Should reject a second post in the same epoch (nullifier reuse)", async function () {
            this.timeout(10000)
            await fetchContracts()
            if (!lastScope) {
                return this.skip()
            }
            const scopeHex = lastScope
            const depth = Number(process.env.SNARK_DEPTH || 20)
            const { wasmFilePath, zkeyFilePath } = getSnarkArtifacts(depth)
            const signal = encodeBytes32String("Hello again")
            const g = await buildServerGroup()
            const fullProof = await generateProof(serverIdentity, g, signal, scopeHex, depth, {
                wasm: wasmFilePath,
                zkey: zkeyFilePath
            })

            const body = {
                proof: { merkleTreeDepth: Number(fullProof.merkleTreeDepth), points: fullProof.points.map(String) },
                merkleRoot: fullProof.merkleTreeRoot.toString(),
                nullifierHash: fullProof.nullifier.toString(),
                feedback: signal.toString(),
                scope: BigInt(scopeHex).toString(),
                content: "duplicate in same epoch",
                boardId: "default"
            }

            const resp = await fetch(`${SERVER_URL}/api/posts`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body)
            })
            const json = await resp.json()
            console.log("[relay] second-in-epoch response:", json)
            expect(resp.ok).to.eq(false)
        })

        itServer("Should allow posting again in the next epoch", async function () {
            this.timeout(20000)
            const config = await fetchContracts()
            const { boardSalt, epochLength } = config
            const provider = new ethers.JsonRpcProvider(RPC_URL)
            await provider.send('evm_increaseTime', [Number(epochLength) + 2])
            await provider.send('evm_mine', [])

            const { epoch } = await fetchEpoch()
            const scopeHex = keccak256(AbiCoder.defaultAbiCoder().encode(["bytes32", "uint64"], [boardSalt, BigInt(epoch)]))
            const depth = Number(process.env.SNARK_DEPTH || 20)
            const { wasmFilePath, zkeyFilePath } = getSnarkArtifacts(depth)
            const signal = encodeBytes32String("Hello next epoch")
            const g = await buildServerGroup()
            const fullProof = await generateProof(serverIdentity, g, signal, scopeHex, depth, {
                wasm: wasmFilePath,
                zkey: zkeyFilePath
            })

            const body = {
                proof: { merkleTreeDepth: Number(fullProof.merkleTreeDepth), points: fullProof.points.map(String) },
                merkleRoot: fullProof.merkleTreeRoot.toString(),
                nullifierHash: fullProof.nullifier.toString(),
                feedback: signal.toString(),
                scope: BigInt(scopeHex).toString(),
                content: "posting in next epoch",
                boardId: "default"
            }

            const resp = await fetch(`${SERVER_URL}/api/posts`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body)
            })
            const json = await resp.json()
            console.log("[relay] next-epoch response:", json)
            expect(resp.ok, `server error: ${JSON.stringify(json)}`).to.eq(true)
            expect(json).to.have.property("txHash")
            lastScope = scopeHex
        })
    })
})
