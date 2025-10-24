import { Contract, InfuraProvider, JsonRpcProvider, Wallet } from "ethers"
import { NextRequest } from "next/server"
import Feedback from "../../../../contract-artifacts/Feedback.json"

const offchainMembers = new Set<string>()
const isOffchain = process.env.NEXT_PUBLIC_DEFAULT_NETWORK === "offchain"

export async function GET() {
    return Response.json({ members: Array.from(offchainMembers) })
}

export async function POST(req: NextRequest) {
    const { identityCommitment } = (await req.json()) as { identityCommitment?: string }

    if (!identityCommitment) {
        return new Response("Missing identity commitment", { status: 400 })
    }

    if (isOffchain) {
        offchainMembers.add(identityCommitment)

        return new Response("Off-chain membership recorded", { status: 200 })
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
        const transaction = await contract.joinGroup(identityCommitment)

        await transaction.wait()

        return new Response("Success", { status: 200 })
    } catch (error: any) {
        console.error(error)

        return new Response(`Server error: ${error}`, {
            status: 500
        })
    }
}
