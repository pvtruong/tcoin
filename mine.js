const {Block} = require("./blockchain");

process.on('message', function(msg) {
  let data = msg.data;
  let preBlock = msg.preBlock;

  let index = preBlock.index+1;
  let preHash = preBlock.hash;
  let timestamp = new Date().getTime();
  let difficulty = msg.difficulty;
  let nonce = 0;
  console.log("finding nonce with difficulty",difficulty);
  while(true){

    let hash = Block.calculateHash(index,preHash,timestamp,data,difficulty,nonce);
    if(Block.hashMatchesDifficulty(hash,difficulty)){
      console.log("found nonce",nonce);
      let newBlock =new Block(index,hash,preHash,timestamp,data,difficulty,nonce);

      process.send(newBlock);
      break;
    }
    nonce+=1;
  }
});
