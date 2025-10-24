import { task, types } from "hardhat/config"
import fs from "fs"
import path from "path"

task("deploy", "Deploy BasicNFT and Feedback contract")
    .addOptionalParam("semaphore", "Semaphore contract address", undefined, types.string)
    .addOptionalParam("logs", "Print the logs", true, types.boolean)
    .setAction(async ({ logs, semaphore: semaphoreAddress }, { ethers, run }) => {
        if (!semaphoreAddress) {
            const { semaphore } = await run("deploy:semaphore", {
                logs
            })

            semaphoreAddress = await semaphore.getAddress()
        }

        const NFTFactory = await ethers.getContractFactory("BasicNFT")
        const nft = await NFTFactory.deploy("Disphorea Test NFT", "DPHNFT")
        await nft.waitForDeployment()

        const FeedbackFactory = await ethers.getContractFactory("Feedback")

        const feedbackContract = await FeedbackFactory.deploy(semaphoreAddress, await nft.getAddress())

        await feedbackContract.waitForDeployment()

        const groupId = await feedbackContract.groupId()
        const net = await ethers.provider.getNetwork()
        const addresses = {
            chainId: Number(net.chainId),
            semaphore: semaphoreAddress,
            nft: await nft.getAddress(),
            feedback: await feedbackContract.getAddress(),
            groupId: Number(groupId),
            boardSalt: "0x000000000000000000000000000000000000000000000000000000000000BEEF"
        }

        if (logs) {
            console.info(`NFT deployed: ${addresses.nft}`)
            console.info(`Feedback deployed: ${addresses.feedback} (groupId: ${groupId})`)
            try {
                const webDir = path.resolve(__dirname, "../../../web-app/public")
                const serverDir = path.resolve(__dirname, "../../../server/config")
                fs.mkdirSync(path.join(webDir), { recursive: true })
                fs.mkdirSync(path.join(serverDir), { recursive: true })
                fs.writeFileSync(path.join(webDir, "contracts.json"), JSON.stringify(addresses, null, 2))
                fs.writeFileSync(path.join(serverDir, "contracts.json"), JSON.stringify(addresses, null, 2))
                console.info(`Wrote contracts.json to web + server`)
            } catch (e) {
                console.warn("Could not write contracts.json:", (e as Error).message)
            }
        }

        return { feedback: feedbackContract, nft }
    })
