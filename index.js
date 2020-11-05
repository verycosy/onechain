"use strict";

const fs = require("fs");
const CryptoJS = require("crypto-js");
const Merkle = require("merkle");

function calculateHash(version, index, previousHash, timestamp, merkleRoot) {
  return CryptoJS.SHA256(
    version + index + previousHash + timestamp + merkleRoot
  )
    .toString()
    .toUpperCase();
}

function calculateHashForBlock(block) {
  return calculateHash(
    block.header.version,
    block.header.index,
    block.header.previousHash,
    block.header.timestamp,
    block.header.merkleRoot
  );
}

function getGenesisBlock() {
  const version = "1.0.o";
  const index = 0;
  const previousHash = "0".repeat(64);
  const timestamp = 1231006505;
  const data = ["컴퓨터과학으로 배우는 블록체인 원리와 구현 실습"];

  const merkleTree = Merkle("sha256").sync(data);
  const merkleRoot = merkleTree.root() || "0".repeat(64);

  const header = new BlockHeader(
    version,
    index,
    previousHash,
    timestamp,
    merkleRoot
  );

  return new Block(header, data);
}

class BlockHeader {
  constructor(version, index, previousHash, timestamp, merkleRoot) {
    this.version = version;
    this.index = index;
    this.previousHash = previousHash;
    this.timestamp = timestamp;
    this.merkleRoot = merkleRoot;
  }
}

class Block {
  constructor(header, data) {
    this.header = header;
    this.data = data;
  }
}

const blockchain = [getGenesisBlock()];

function getBlockchain() {
  return blockchain;
}

function getLatestBlock() {
  return blockchain[blockchain.length - 1];
}

function getCurrentVersion() {
  const packageJson = fs.readFileSync("./package.json");
  const currentVersion = JSON.parse(packageJson).version;
  return currentVersion;
}

function getCurrentTimestamp() {
  return Math.round(new Date().getTime() / 1000);
}

function generateNextBlock(blockData) {
  const previousBlock = getLatestBlock();
  const currentVersion = getCurrentVersion();
  const nextIndex = previousBlock.header.index + 1;
  const previousHash = calculateHashForBlock(previousBlock);
  const nextTimestamp = getCurrentTimestamp();

  const merkleTree = Merkle("sha256").sync(blockData);
  const merkleRoot = merkleTree.root() || "0".repeat(64);
  const newBlockHeader = new BlockHeader(
    currentVersion,
    nextIndex,
    previousHash,
    nextTimestamp,
    merkleRoot
  );

  return new Block(newBlockHeader, blockData);
}

function isValidBlockStructure(block) {
  return (
    typeof block.header.version === "string" &&
    typeof block.header.index === "number" &&
    typeof block.header.previousHash === "string" &&
    typeof block.header.timestamp === "number" &&
    typeof block.header.merkleRoot === "String" &&
    typeof block.data === "object"
  );
}

function isValidNewBlock(newBlock, previousBlock) {
  if (!isValidBlockStructure(newBlock)) {
    console.log("Invalid block structure ; %s", JSON.stringify(newBlock));
    return false;
  } else if (previousBlock.header.index + 1 !== newBlock.header.index) {
    console.log("Invalid index");
    return false;
  } else if (
    calculateHashForBlock(previousBlock) !== newBlock.header.previousHash
  ) {
    console.log("Invalid previousHash");
    return false;
  } else if (
    (newBlock.data.length !== 0 &&
      Merkle("sha256").sync(newBlock.data).root() !==
        newBlock.header.merkleRoot) ||
    (newBlock.data.length === 0 &&
      "0".repeat(64) !== newBlock.header.merkleRoot)
  ) {
    console.log("Invalid MerkleRoot");
    return false;
  }

  return true;
}

function isValidChain(blockchainToValidate) {
  if (
    JSON.stringify(blockchainToValidate[0]) !==
    JSON.stringify(getGenesisBlock())
  ) {
    return false;
  }

  const tempBlocks = [blockchainToValidate[0]];

  for (let i = 1; i < blockchainToValidate.length; i++) {
    if (isValidNewBlock(blockchainToValidate[i], tempBlocks[i - 1])) {
      tempBlocks.push(blockchainToValidate[i]);
    } else {
      return false;
    }
  }

  return true;
}

function addBlock(newBlock) {
  if (isValidNewBlock(newBlock, getLatestBlock())) {
    blockchain.push(newBlock);
    return true;
  }

  return false;
}
