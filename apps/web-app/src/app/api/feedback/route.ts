import { Contract, InfuraProvider, JsonRpcProvider, Wallet, decodeBytes32String } from "ethers"
import { NextRequest } from "next/server"
import Feedback from "../../../../contract-artifacts/Feedback.json"

const offchainFeedback: string[] = []
const zeroAddress = "0x0000000000000000000000000000000000000000"
const isOffchain = (() => {
    const semaphoreAddress = (process.env.NEXT_PUBLIC_SEMAPHORE_CONTRACT_ADDRESS ?? "").toLowerCase()
    const feedbackAddress = (process.env.NEXT_PUBLIC_FEEDBACK_CONTRACT_ADDRESS ?? "").toLowerCase()
    return (
        (!semaphoreAddress || semaphoreAddress === zeroAddress) &&
        (!feedbackAddress || feedbackAddress === zeroAddress)
    )
})()

export async function GET() {
    return Response.json({ feedback: offchainFeedback })
}

export async function POST(req: NextRequest) {
    const { feedback, merkleTreeDepth, merkleTreeRoot, nullifier, points } = (await req.json()) as {
        feedback?: string
        merkleTreeDepth?: number
        merkleTreeRoot?: string
        nullifier?: string
        points?: unknown
    }

    if (!feedback) {
        return new Response("Missing feedback payload", { status: 400 })
    }

    if (isOffchain) {
        try {
            offchainFeedback.push(decodeBytes32String(feedback))

            return new Response("Off-chain feedback recorded", { status: 200 })
        } catch (error: any) {
            console.error(error)

            return new Response(`Server error: ${error}`, {
                status: 500
            })
        }
    }

    if (typeof process.env.ETHEREUM_PRIVATE_KEY !== "string" || process.env.ETHEREUM_PRIVATE_KEY.length === 0) {
        throw new Error("Please, define ETHEREUM_PRIVATE_KEY in your .env file")
    }

    const ethereumPrivateKey = process.env.ETHEREUM_PRIVATE_KEY
    const ethereumNetwork = process.env.NEXT_PUBLIC_DEFAULT_NETWORK as string
    const infuraApiKey = process.env.NEXT_PUBLIC_INFURA_API_KEY as string
    const contractAddress = process.env.NEXT_PUBLIC_FEEDBACK_CONTRACT_ADDRESS as string

    const provider =
        ethereumNetwork === "localhost"
            ? new JsonRpcProvider("http://127.0.0.1:8545")
            : new InfuraProvider(ethereumNetwork, infuraApiKey)

    const signer = new Wallet(ethereumPrivateKey, provider)
    const contract = new Contract(contractAddress, Feedback.abi, signer)

    try {
        const transaction = await contract.sendFeedback(merkleTreeDepth, merkleTreeRoot, nullifier, feedback, points)

        await transaction.wait()

        return new Response("Success", { status: 200 })
    } catch (error: any) {
        console.error(error)

        return new Response(`Server error: ${error}`, {
            status: 500
        })
    }
}
