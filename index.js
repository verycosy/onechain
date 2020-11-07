"use strict";

const fs = require("fs");
const CryptoJS = require("crypto-js");
const Merkle = require("merkle");
const express = require("express");
const WebSocket = require("ws");
const random = require("random");

const HTTP_PORT = process.env.HTTP_PORT || 3001;
const P2P_PORT = process.env.P2P_PORT || 6001;

const MessaegType = {
  QUERY_LATEST: 0,
  QUERY_ALL: 1,
  RESPONSE_BLOCKCHAIN: 2,
};

function initMessageHandler(ws) {
  ws.on("message", function (data) {
    const message = JSON.parse(data);

    switch (message.type) {
      case MessaegType.QUERY_LATEST:
        write(ws, responseLatestMsg());
        break;
      case MessaegType.QUERY_ALL:
        write(ws, responseChainMsg());
        break;
      case MessaegType.RESPONSE_BLOCKCHAIN:
        handleBlockchainResponse(message);
        break;
    }
  });
}

function queryAllMsg() {
  return {
    type: MessaegType.QUERY_ALL,
    data: null,
  };
}

function queryChainLengthMsg() {
  return {
    type: MessaegType.QUERY_LATEST,
    data: null,
  };
}

function responseChainMsg() {
  return {
    type: MessaegType.RESPONSE_BLOCKCHAIN,
    data: JSON.stringify(getBlockchain()),
  };
}

function responseLatestMsg() {
  return {
    type: MessaegType.RESPONSE_BLOCKCHAIN,
    data: JSON.stringify([getLatestBlock()]),
  };
}

function handleBlockchainResponse(message) {
  const receivedBlocks = JSON.parse(message.data);
  const latestBlockReceived = receivedBlocks[receivedBlocks.length - 1];
  const latestBlockHeld = getLatestBlock();

  if (latestBlockReceived.header.index > latestBlockHeld.header.index) {
    console.log(`Blockchain possibly benind.
    We got : ${latestBlockHeld.header.index},
    Peer got : ${latestBlockReceived.header.index}`);

    if (
      calculateHashForBlock(latestBlockHeld) ===
      latestBlockReceived.header.previousHash
    ) {
      console.log("We can append the received block to our chain");

      if (addBlock(latestBlockReceived)) {
        broadcast(responseLatestMsg());
      }
    } else if (receivedBlocks.length === 1) {
      console.log("We have to query the chain from our peer");
      broadcast(queryAllMsg());
    } else {
      console.log("Received blockchain is longer than current blockchain");
      replaceChain(receivedBlocks);
    }
  } else {
    console.log(
      "Received blockchain is not longer than current blockchain. Do nothing"
    );
  }
}

function initErrorHandler(ws) {
  ws.on("close", function () {
    closeConnection(ws);
  });

  ws.on("error", function () {
    closeConnection(ws);
  });
}

function closeConnection(ws) {
  console.log("Connection failed to peer : " + ws.url);
  sockets.splice(sockets.indexOf(ws), 1);
}

function mineBlock(blockData) {
  const newBlock = generateNextBlock(blockData);

  if (addBlock(newBlock)) {
    broadcast(responseLatestMsg());
    return newBlock;
  } else {
    return null;
  }
}

function replaceChain(newBlocks) {
  if (
    isValidChain(newBlocks) &&
    (newBlocks.length > blockchain.length ||
      (newBlocks.length === blockchain.length && random.boolean()))
  ) {
    console.log(
      "Received blockchain is valid, Replacing current blockchain with received blockchain"
    );
    blockchain = newBlocks;
    broadcast(responseLatestMsg());
  } else {
    console.log("Received blockchain invalid");
  }
}

function initHttpServer() {
  const app = express();
  app.use(express.json());

  app.get("/blocks", function (req, res) {
    res.send(getBlockchain());
  });

  app.post("/mineBlock", function (req, res) {
    const data = req.body.data || [];
    const newBlock = mineBlock(data);

    console.log(newBlock);

    if (newBlock === null) {
      return res.sendStatus(400);
    }

    return res.send(newBlock);
  });

  app.get("/version", function (req, res) {
    res.send(getCurrentVersion());
  });

  app.post("/stop", function (req, res) {
    res.send({ msg: "Stopping Server " });
    process.exit();
  });

  app.get("/peers", function (req, res) {
    res.send(
      getSockets().map(function (s) {
        return s._socket.remoteAddress + ":" + s._socket.remotePort;
      })
    );
  });

  app.post("/addPeers", function (req, res) {
    const peers = req.body.peers || [];
    connectToPeers(peers);
    res.send();
  });

  app.listen(HTTP_PORT, function () {
    console.log("Listening http port on : " + HTTP_PORT);
  });
}

initHttpServer();

const sockets = [];

function getSockets() {
  return sockets;
}

function initConnection(ws) {
  sockets.push(ws);
  initMessageHandler(ws);
  initErrorHandler(ws);
  write(ws, queryChainLengthMsg());
}

function connectToPeers(newPeers) {
  newPeers.forEach(function (peer) {
    const ws = new WebSocket(peer);

    ws.on("open", function () {
      initConnection(ws);
    });

    ws.on("error", function (err) {
      console.log("Connection failed");
    });
  });
}

function write(ws, message) {
  ws.send(JSON.stringify(message));
}

function broadcast(message) {
  sockets.forEach(function (socket) {
    write(socket, message);
  });
}

function initP2PServer() {
  const server = new WebSocket.Server({ port: P2P_PORT });
  server.on("connection", function (ws) {
    initConnection(ws);
  });
  console.log("Listening websocket p2p port on : " + P2P_PORT);
}

initP2PServer();

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
  const version = "1.0.0";
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

let blockchain = [getGenesisBlock()];

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
    typeof block.header.merkleRoot === "string" &&
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
