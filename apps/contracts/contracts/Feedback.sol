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

    // Epoch-based external nullifier config
    bytes32 public immutable boardSalt;
    uint64 public immutable epochLength; // seconds

    event Post(uint256 indexed groupId, uint256 indexed pseudoId, uint256 indexed scope, bytes32 contentHash);

    modifier onlyOwner() {
        require(msg.sender == owner, "Ownable: caller is not the owner");
        _;
    }

    constructor(address semaphoreAddress, address nftAddress, bytes32 _boardSalt, uint64 _epochLengthSeconds) {
        semaphore = ISemaphore(semaphoreAddress);
        nft = IERC721BalanceOf(nftAddress);
        owner = msg.sender;
        boardSalt = _boardSalt;
        epochLength = _epochLengthSeconds;

        groupId = semaphore.createGroup(address(this));
    }

    function _epoch() internal view returns (uint64) {
        return uint64(block.timestamp) / epochLength;
    }

    function _scopeFor(uint64 ep) internal view returns (uint256) {
        return uint256(keccak256(abi.encode(boardSalt, ep)));
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

    /// @notice Relay a feedback proof limited to one per epoch per identity (via scope)
    function sendFeedback(
        uint256 merkleTreeDepth,
        uint256 merkleTreeRoot,
        uint256 nullifier,
        uint256 feedback,
        uint256 scope,
        uint256[8] calldata points
    ) external {
        uint64 ep = _epoch();
        uint256 scopeNow = _scopeFor(ep);
        uint256 scopePrev = _scopeFor(ep - 1);
        require(scope == scopeNow || scope == scopePrev, "Wrong epoch scope");

        ISemaphore.SemaphoreProof memory proof = ISemaphore.SemaphoreProof(
            merkleTreeDepth,
            merkleTreeRoot,
            nullifier,
            feedback,
            scope,
            points
        );

        semaphore.validateProof(groupId, proof);
        emit Post(groupId, nullifier, scope, bytes32(feedback));
    }
}
