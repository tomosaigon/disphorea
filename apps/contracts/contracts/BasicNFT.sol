// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

/// @title Minimal ERC-721 for local testing
/// Note: This is a very small subset sufficient for tests. Not production-ready.
interface IERC721Minimal {
    function balanceOf(address owner) external view returns (uint256);
    function ownerOf(uint256 tokenId) external view returns (address);
    event Transfer(address indexed from, address indexed to, uint256 indexed tokenId);
}

contract BasicNFT is IERC721Minimal {
    string public name;
    string public symbol;

    address public owner;

    mapping(uint256 => address) private _owners;
    mapping(address => uint256) private _balances;

    modifier onlyOwner() {
        require(msg.sender == owner, "Ownable: caller is not the owner");
        _;
    }

    constructor(string memory _name, string memory _symbol) {
        name = _name;
        symbol = _symbol;
        owner = msg.sender;
    }

    function balanceOf(address _owner) external view override returns (uint256) {
        require(_owner != address(0), "zero address");
        return _balances[_owner];
    }

    function ownerOf(uint256 tokenId) public view override returns (address) {
        address _owner = _owners[tokenId];
        require(_owner != address(0), "nonexistent token");
        return _owner;
    }

    function _mint(address to, uint256 tokenId) internal {
        require(to != address(0), "mint to zero");
        require(_owners[tokenId] == address(0), "already minted");
        _owners[tokenId] = to;
        _balances[to] += 1;
        emit Transfer(address(0), to, tokenId);
    }

    /// @notice Owner-only mint for tests
    function mint(address to, uint256 tokenId) external onlyOwner {
        _mint(to, tokenId);
    }
}

