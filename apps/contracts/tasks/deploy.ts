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

        // Epoch configuration for tests (10s) and a deterministic board salt
        const boardSalt = ethers.id("TEST-BOARD") // bytes32
        const epochLen = 10 // seconds

        const feedbackContract = await FeedbackFactory.deploy(
            semaphoreAddress,
            await nft.getAddress(),
            boardSalt,
            epochLen
        )

        await feedbackContract.waitForDeployment()

        const groupId = await feedbackContract.groupId()
        const net = await ethers.provider.getNetwork()
        const addresses = {
            chainId: Number(net.chainId),
            semaphore: semaphoreAddress,
            nft: await nft.getAddress(),
            feedback: await feedbackContract.getAddress(),
            groupId: Number(groupId),
            boardSalt,
            epochLength: epochLen
        }

        if (logs) {
            console.info(`NFT deployed: ${addresses.nft}`)
            console.info(`Feedback deployed: ${addresses.feedback} (groupId: ${groupId})`)
            try {
                // __dirname = apps/contracts/tasks
                const webDir = path.resolve(__dirname, "../../web-app/public")
                const serverDirApps = path.resolve(__dirname, "../../server/config")

                fs.mkdirSync(webDir, { recursive: true })
                fs.mkdirSync(serverDirApps, { recursive: true })

                const json = JSON.stringify(addresses, null, 2)
                fs.writeFileSync(path.join(webDir, "contracts.json"), json)
                fs.writeFileSync(path.join(serverDirApps, "contracts.json"), json)
                console.info(`Wrote contracts.json to web + apps/server`)        
            } catch (e) {
                console.warn("Could not write contracts.json:", (e as Error).message)
            }
        }

        return { feedback: feedbackContract, nft }
    })
