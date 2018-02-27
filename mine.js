const {Block} = require("./blockchain");
const async = require("async");
let data,preBlock,index,preHash,timestamp,difficulty;
process.on('message', function(msg) {
  data = msg.data;
  preBlock = msg.preBlock;
  index = preBlock.index+1;
  preHash = preBlock.hash;
  timestamp = new Date().getTime();
  difficulty = msg.difficulty;
  let nonce = 0;
  console.log(`Finding block with difficulty: ${difficulty}, index: ${index}`);
  async.forever((next)=>{
    let hash = Block.calculateHash(index,preHash,timestamp,data,difficulty,nonce);
    if(Block.hashMatchesDifficulty(hash,difficulty)){
      let newBlock =new Block(index,hash,preHash,timestamp,data,difficulty,nonce);
      process.send(newBlock);
      process.exit();
    }
    nonce+=1;
    next();
  },(err)=>{

  })
});
