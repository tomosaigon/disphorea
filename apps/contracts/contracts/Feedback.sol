//SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import "@semaphore-protocol/contracts/interfaces/ISemaphore.sol";

interface IERC721BalanceOf {
    function balanceOf(address owner) external view returns (uint256);
}

contract Feedback {
    ISemaphore public semaphore;
    IERC721BalanceOf public nft;

    uint256 public groupId;
    address public owner;

    modifier onlyOwner() {
        require(msg.sender == owner, "Ownable: caller is not the owner");
        _;
    }

    constructor(address semaphoreAddress, address nftAddress) {
        semaphore = ISemaphore(semaphoreAddress);
        nft = IERC721BalanceOf(nftAddress);
        owner = msg.sender;

        groupId = semaphore.createGroup(address(this));
    }

    /// @notice Allows an account that holds the NFT to join by providing an identity commitment
    function joinGroup(uint256 identityCommitment) external {
        require(nft.balanceOf(msg.sender) > 0, "must hold NFT");
        semaphore.addMember(groupId, identityCommitment);
    }

    /// @notice Admin can add a member directly (relayer path)
    function addMemberAdmin(uint256 identityCommitment) external onlyOwner {
        semaphore.addMember(groupId, identityCommitment);
    }

    function sendFeedback(
        uint256 merkleTreeDepth,
        uint256 merkleTreeRoot,
        uint256 nullifier,
        uint256 feedback,
        uint256[8] calldata points
    ) external {
        ISemaphore.SemaphoreProof memory proof = ISemaphore.SemaphoreProof(
            merkleTreeDepth,
            merkleTreeRoot,
            nullifier,
            feedback,
            groupId,
            points
        );

        semaphore.validateProof(groupId, proof);
    }
}
