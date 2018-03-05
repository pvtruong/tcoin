const cryptoJs = require("crypto-js");
const {Transaction,UnSpentTxOut} = require("./transaction");
const {Wallet} = require("./wallet");
const _ = require("underscore");
const async =require("async");
const {hexToBinary,round} = require("./utils");
const fork = require('child_process').fork;
const path = require("path");
const color = require("colors");
let blockchain = [];
let unSpentTxOuts = [];
let processMine;
const DIFFICULTY_ADJUSTMENT_INTERVAL = 10;
const BLOCK_GENERATION_INTERVAL = 10;

class Block{
  constructor(index,hash,preHash,timestamp,data,difficulty,nonce){
    this.index = index;
    this.preHash = preHash;
    this.timestamp = timestamp;
    this.data = data;
    this.hash = hash;
    this.difficulty = difficulty
    this.nonce = nonce;
  }
  toString(){
    return JSON.stringify(this);
  }
  static getDifficulty(lastestBlock,aBlockchain){
    if(!aBlockchain) aBlockchain= Block.getBlockChain();
    if(!lastestBlock) lastestBlock = Block.getLastestBlock(aBlockchain);
    if(lastestBlock.index!==0 && lastestBlock.index%DIFFICULTY_ADJUSTMENT_INTERVAL===0){
      return Block.getAdjustedDifficulty(lastestBlock,aBlockchain);
    }else{
      return lastestBlock.difficulty;
    }
  }
  static getAdjustedDifficulty(latestBlock, aBlockchain){
      if(aBlockchain.length<DIFFICULTY_ADJUSTMENT_INTERVAL){
        return latestBlock.difficulty;
      }
      const prevAdjustmentBlock = aBlockchain[aBlockchain.length - DIFFICULTY_ADJUSTMENT_INTERVAL];
      const timeExpected = BLOCK_GENERATION_INTERVAL * DIFFICULTY_ADJUSTMENT_INTERVAL;
      const timeTaken = Math.round(latestBlock.timestamp/1000 - prevAdjustmentBlock.timestamp/1000);
      if (timeTaken < timeExpected / 2) {
          return prevAdjustmentBlock.difficulty + 1;
      } else if (timeTaken > timeExpected * 2) {
          return prevAdjustmentBlock.difficulty - 1;
      } else {
          return prevAdjustmentBlock.difficulty;
      }
  }
  static calculateHash(index,preHash,timestamp,data,difficulty,nonce){

    let hash = cryptoJs.SHA256('VCOIN' + index.toString()+timestamp.toString()+preHash+JSON.stringify(data) + difficulty.toString() + nonce.toString()).toString();
    //console.log("create hash",hash,index,preHash,timestamp,JSON.stringify(data));
    return hash;
  }
  static calculateHashForBlock(b){
    return Block.calculateHash(b.index,b.preHash,b.timestamp,b.data,b.difficulty,b.nonce);
  }
  static fromJson(obj){
    var {index,hash,preHash,timestamp,data,difficulty,nonce} = obj;
    return new Block(index,hash,preHash,timestamp,data,difficulty,nonce);
  }
  static isValidBlockStructure(block){
      return _.isNumber(block.index)
          && _.isString(block.hash)
          && _.isString(block.preHash)
          && _.isNumber(block.timestamp)
          && _.isNumber(block.nonce)
          && _.isNumber(block.difficulty)
          && _.isArray(block.data);
  }
  static isValidNewBlock(block){
    //valid blockIndex
    if(block.index!==blockchain.length){
      console.error(`index of new block is not valid: ${block.index}, hash: ${block.hash}`.red);
      return false;
    }
    //valid pre hash
    let preBlock = blockchain[block.index-1];
    //
    return Block.isValidBlock(block,preBlock);
  }
  static isValidBlock(block,preBlock,aBlockchain){
    if(!aBlockchain) aBlockchain = blockchain;
    if(!preBlock || preBlock.hash!==block.preHash){
      console.error("preHash of block is invalid".red);
      return false;
    }
    //valid block structure
    if(!Block.isValidBlockStructure(block)){
      console.error("Block structure is invalid".red);
      return false;
    }

    //valid timestamp
    let currentTime = new Date().getTime();
    if (!( preBlock.timestamp - 60*1000 < block.timestamp && block.timestamp - 60*1000 < currentTime)){
      console.error("Timestamp is invalid".red);
      return false;
    }
    //valid DIFFICULTY_ADJUSTMENT_INTERVAL
    let diff = Block.getDifficulty(preBlock,aBlockchain);
    if(block.difficulty!==diff){
      console.error(`difficulty of block is not valid. Difficulty of block is  ${block.difficulty}, correct difficulty is ${diff}`);
      return false;
    }
    //valid hash
    let hash = Block.calculateHashForBlock(block);
    if(hash!==block.hash){
      console.error("Hash of block is not valid".red);
      return false;
    }
    //valid basecoin transactions
    for(let trans of block.data){
      if(!Transaction.validCoinBaseTransaction(trans,block.index)){
        return false;
      }
    }
    //valid difficulty
    return Block.hashMatchesDifficulty(block.hash,block.difficulty)
  }
  static getLastestBlock(aBlockchain){
    if(!aBlockchain) aBlockchain = blockchain;
    return aBlockchain[aBlockchain.length-1];
  }
  static getBlockChain(hash){
    if(!hash){
      return blockchain;
    }else {
      return blockchain.find((b)=>b.hash===hash);
    }
  }
  static hashMatchesDifficulty(hash,difficulty){
    let binary = hexToBinary(hash);
    let prefix = "0".repeat(difficulty);
    //console.log("binary",binary,"difficulty",difficulty,"prefix",prefix);
    return binary.startsWith(prefix);
  }
  static createNextRawBlock(data,preBlock,callback){

    if(!callback) callback = function(){}
    if(!preBlock) preBlock = Block.getLastestBlock();

    let difficulty = Block.getDifficulty();
    processMine = fork(__dirname + '/mine.js');
    //console.log("Mining process is running");
    processMine.on('message', (newBlock)=>{
      if(newBlock.error){
        callback(newBlock.error);
      }else{
        callback(null,newBlock);
      }
    });
    processMine.on("error",(error)=>{
      callback("Error when forking the mining process");
    })
    processMine.on("exit",()=>{

    })
    processMine.send({difficulty:difficulty,data:data,preBlock:preBlock});
  }
  static createNextBlock(callback){
    if(!callback) callback = function(){}
    let address= Wallet.getAddress();
    let preBlock = Block.getLastestBlock();
    let coinBaseTransaction = Transaction.createCoinBaseTransaction(address,preBlock.index+1);
    let dataBLock = [coinBaseTransaction];
    Block.createNextRawBlock(dataBLock,preBlock,(error,newBlock)=>{
      callback(error,newBlock);
    })
  }
  static addBlockToChain(block){
    if(Block.isValidNewBlock(block)){
      blockchain.push(block);
      //update unspent
      unSpentTxOuts = Transaction.updateUnSpentTxOuts(block.data,unSpentTxOuts);
      return true;
    }
    console.error("Block is not valid".red,block);
    return false;
  }
  static replaceBlock(block,newBlock){
    blockchain=blockchain.filter((b)=>b.index!==block.index);
    return Block.addBlockToChain(newBlock);
  }
  static isValidBlockChain(newBlockChain){
    var newBlocks = newBlockChain.sort((a,b)=>a.index-b.index);
    if(newBlocks.length==0) return false;
    //check genesis block
    var newGenesis = newBlocks[0];
    var _s_newGenesis = JSON.stringify(newGenesis);
    var _s_genesisBlock = JSON.stringify(genesisBlock);
    if(_s_newGenesis!==_s_genesisBlock){
      console.error("Genesis block is invalid".red);
      console.error("Genesis block",_s_genesisBlock);
      console.error("Received genesis block",_s_newGenesis);
      return false;
    }
    //check each blocks
    var preBlock,currentBlock;
    var _newBlocks=[newGenesis];
    for(let i=1;i<newBlocks.length;i++){
      preBlock = newBlocks[i-1];
      currentBlock = newBlocks[i];
      if(!Block.isValidBlock(currentBlock,preBlock,_newBlocks)){
        return false;
      }
      _newBlocks.push(currentBlock);
    }
    return true;
  }
  static getAccumulatedDifficulty(aBlockchain){
      return aBlockchain
          .map((block) => block.difficulty)
          .map((difficulty) => Math.pow(2, difficulty))
          .reduce((a, b) => a + b);
  }
  static replaceBlockChain(newBlockChain){
    console.log("Checking the received blockchain...".magenta);
    if(Block.isValidBlockChain(newBlockChain)){
      console.error("Checking the Accumulated Difficulty...".magenta);
      if(Block.getAccumulatedDifficulty(newBlockChain)> Block.getAccumulatedDifficulty(blockchain)){
        //replace blockchain
        blockchain = newBlockChain;
        //update unSpentTxOuts
        console.error("Updating unSpentTxOuts...".magenta);
        unSpentTxOuts = newBlockChain.map((block)=>{
          return block.data.map((trans)=>{
            return trans.txOuts.map((txOut,index)=>{
              return new UnSpentTxOut(trans.id,index,txOut.amount,txOut.address);
            });
          }).reduce((a,b)=>a.concat(b),[]);
        }).reduce((a,b)=>a.concat(b),[]);

        let consumedUnSpentTxOuts = newBlockChain.map((block)=>{
          return block.data.map((trans)=>{
            return trans.txIns.filter((txIn)=>txIn.txOutId).map((txIn,index)=>{
              return new UnSpentTxOut(txIn.txOutId,txIn.txOutIndex,0,'');
            });
          }).reduce((a,b)=>a.concat(b),[]);
        }).reduce((a,b)=>a.concat(b),[]);
        if(consumedUnSpentTxOuts.length>0){
          unSpentTxOuts = unSpentTxOuts.filter((unSpent)=>!consumedUnSpentTxOuts.find((consumed)=>consumed.txOutId===unSpent.txOutId && consumed.txOutIndex===unSpent.txOutIndex));
        }
        //result
        return true;
      }else{
        console.error("The Accumulated Difficulty is invalid".red);
      }

    }else{
      console.error("Received Blockchain is invalid".red);
      return false;
    }
  }
}
const genesisBlock={
  "index":0,
  "preHash":"",
  "timestamp":1519439637499,
  "data":[
    {
      "txIns":[{"txOutId":"","txOutIndex":0,"signature":""}],
      "txOuts":[{"address":"0416d0eb8fbfd8941cba1917c0e0311fcb40880e0679bcbb023ce165302a524b2d85bb2f93acf9d1be476c6b61d6908e8e60b7498a3707b284dda9276b639439e8","amount":15}
    ],
  "id":"41cc40a81ee2b4cc19fb9901271e5a297b48e5ee8db7e6a4b4dec9fac5d32e8b"}],
  "hash":"03a245008d2c93aa440076694cdddadb9097ed3c1dfc41405b6f51a999e54029",
  "difficulty":0,
  "nonce":0
}
blockchain.push(genesisBlock);
unSpentTxOuts = Transaction.updateUnSpentTxOuts(genesisBlock.data,unSpentTxOuts);
const addTransactionPool =(trans)=>{
  Transaction.addTransactionPool(trans,unSpentTxOuts);
}
const addTransactionPoolAsync =(trans,callback)=>{
  Transaction.addTransactionPoolAsync(trans,unSpentTxOuts,(e,trans)=>{
    callback(e,trans);
  });
}
const sendTransaction = (data,callback)=>{
  let trans = Transaction.createTransactionAsync(unSpentTxOuts,data.address_receiver,data.amount,(e,trans)=>{
    callback(e,trans);
  });
}
const getBalance = (callback)=>{
  let address = Wallet.getAddress();
  Transaction.getUnSpentTxOutsByAddressAsync(unSpentTxOuts,address,(e,unSpentTxOutsOfAddess)=>{
    let balance = round(unSpentTxOutsOfAddess.map((un)=>un.amount).reduce((a,b)=>a+b,0),5)
    callback(null,balance);
  });
}
const getUnSpentTxOuts=()=>{
  return unSpentTxOuts;
}
//exports
module.exports={
  Block,sendTransaction,getBalance,addTransactionPool,addTransactionPoolAsync,getUnSpentTxOuts
}
