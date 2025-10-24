import { Group, Identity, generateProof } from "@semaphore-protocol/core"
import { getSnarkArtifacts } from "./helpers/snark"
import { expect } from "chai"
import { encodeBytes32String } from "ethers"
import { ethers, run } from "hardhat"
// @ts-ignore: typechain folder will be generated after contracts compilation
import { Feedback } from "../typechain-types"

describe("Feedback", () => {
    let feedbackContract: Feedback
    let nftAddress: string
    let semaphoreContract: string

    const groupId = 0
    const group = new Group()
    const users: Identity[] = []

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

    describe("# sendFeedback", () => {
        it("Should allow users to send feedback anonymously (via server relay)", async () => {
            const signal = encodeBytes32String("Hello World")

            console.log("[proof] Building Semaphore proof locally using artifacts...")
            const depth = Number(process.env.SNARK_DEPTH || 20)
            const { wasmFilePath, zkeyFilePath } = getSnarkArtifacts(depth)
            console.log("[proof] using depth:", depth, "wasm:", wasmFilePath, "zkey:", zkeyFilePath)
            const fullProof = await generateProof(
                users[1],
                group,
                signal,
                groupId,
                depth,
                { wasm: wasmFilePath, zkey: zkeyFilePath }
            )

            const SERVER_URL = process.env.SERVER_URL || "http://localhost:4000"

            const fetchFn: any = (globalThis as any).fetch
            if (typeof fetchFn !== "function") {
                throw new Error("global fetch is not available. Please run on Node 18+ or set up fetch.")
            }

            console.log("[server] Pinging server at", SERVER_URL)
            const health = await fetchFn(`${SERVER_URL}/healthz`)
            if (!health.ok) {
                throw new Error(`Server not reachable at ${SERVER_URL} (status ${health.status}). Start it with yarn dev:server.`)
            }

            console.log("[relay] POST /api/posts -> on-chain verify via Feedback.sendFeedback")
            const body = {
                proof: { merkleTreeDepth: Number(fullProof.merkleTreeDepth), points: fullProof.points.map(String) },
                merkleRoot: fullProof.merkleTreeRoot.toString(),
                nullifierHash: fullProof.nullifier.toString(),
                feedback: signal.toString(),
                content: "test via server relay",
                boardId: "default"
            }
            const resp = await fetchFn(`${SERVER_URL}/api/posts`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body)
            })
            const json = await resp.json()
            console.log("[relay] Response:", json)
            expect(resp.ok, `server error: ${JSON.stringify(json)}`).to.eq(true)
            expect(json).to.have.property("txHash")
        })
    })
})
