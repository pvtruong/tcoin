const express = require("express");
const bodyParser = require("body-parser");
const {Block,sendTransaction,getBalance,addTransactionPool,getUnSpentTxOuts} = require("./blockchain");
const {Wallet} = require("./wallet");
const {Transaction} = require("./transaction");
const async = require("async");
const WebSocket = require("ws");
const PORT = process.env.HTTP_PORT || 3000;
const P2P_PORT = process.env.P2P_PORT || 3001;
const MSG_TYPES ={
  QUERY_LASTEST:0,
  QUERY_ALL:1,
  RESPONSE_BLOCKCHAIN:2,
  QUERY_ALL_TRANSACTION_POOL:3,
  RESPONSE_TRANSACTION:4
}
let sockets =[];
let isMine;
const initHttp = function(){
  let app = express();
  app.use(bodyParser.json());
  app.use('/', express.static(__dirname + '/public'));
  //get blocks
  app.get("/blocks",(req,res)=>{
    return res.send(Block.getBlockChain());
  })
  //count blocks
  app.get("/countBlocks",(req,res)=>{
    return res.send({number_blocks:Block.getBlockChain().length});
  })
  //
  app.get("/blocks/:hash",(req,res)=>{
    return res.send(Block.getBlockChain(req.params.hash));
  })
  //mine block
  app.get("/mineBlock",(req,res)=>{
    if(sockets.filter((s)=>s.url).length>0){
      isMine = true;
      mineBlock();
      res.send({is_mining:isMine})
    }else{
      console.log("Add at least one Peer before mining")
      res.status(400).send("Add at least one Peer before mining");
    }
  })
  app.get("/stopMineBlock",(req,res)=>{
    isMine = false;
    res.send({is_mining:isMine})
  })
  app.get("/mineStatus",(req,res)=>{
    res.send({is_mining:isMine})
  })
  let mineBlock = ()=>{
    if(!isMine) return;
    Block.createNextBlock((newBlock)=>{
      if(sockets.filter((s)=>s.url).length>0 &&  Block.isValidNewBlock(newBlock)){
        console.log("New Block is sent");
        broadcart({type:MSG_TYPES.RESPONSE_BLOCKCHAIN,data:[newBlock]});
        mineBlock();
      }else{
        console.log("New Block is not valid");
        mineBlock();
      }
    })
  }
  //add peer
  app.post("/addPeer",(req,res)=>{
    if(req.body.peer){
      if(!sockets.find((s)=>s.url===req.body.peer)){
        connect2Peers([req.body.peer]);
        res.send("Peer '" + req.body.peer + "' is added");
      }else{
        res.status(400).send("This peer already exists")
      }
      return;
    }
    //console.log("peer data",req.body);
    res.status(400).send("Nothing peer is added");
  })
  //spend
  app.post("/spend",(req,res)=>{
    process.nextTick(()=>{
      if(sockets.filter((s)=>s.url).length===0){
        return res.status(400).send("Add at least one Peer before sending a transaction");
      }
      try{
        let trans = sendTransaction(req.body);
        console.log("sent a transaction",trans.id);
        broadcart({type:MSG_TYPES.RESPONSE_TRANSACTION,data:[trans]});
        res.send(trans);
      }catch(e){
        res.status(400).send(e.message);
      }
    })
  })
  //get balance
  app.get("/myAddress",(req,res)=>{
    res.send(Wallet.getAddress());
  })
  //get balance
  app.get("/balance",(req,res)=>{
    res.send({balance:getBalance(req.query.address)});
  })
  //get unSpentTxOuts
  app.get("/unSpentTxOuts",(req,res)=>{
    if(req.query.count){
      res.send({unSpentTxOuts:getUnSpentTxOuts().length});
    }else{
      res.send({unSpentTxOuts:getUnSpentTxOuts()});
    }
  })
  //get transaction pool
  app.get("/transactionPool",(req,res)=>{
    res.send(Transaction.getTransactionPool());
  })
  app.get("/sentTransactions",(req,res)=>{
    let pool = Transaction.getTransactionPool();
    let sender = Wallet.getAddress();
    pool = pool.filter((tr)=>tr.txIns.find((txIn)=>Transaction.getUnSpentTxOutById(getUnSpentTxOuts(),txIn.txOutId,txIn.txOutIndex).address===sender));

    res.send(pool);
  })
  app.get("/receivedTransactions",(req,res)=>{
    let pool = Transaction.getTransactionPool();
    let receiver = Wallet.getAddress();
    pool = pool.filter((tr)=>tr.txOuts.find((txOut)=>txOut.address===receiver));
    res.send(pool);
  })
  //
  app.get("/transactionPool/:id",(req,res)=>{
    res.send(Transaction.getTransactionPool(req.params.id));
  })
  //get transaction pool
  app.post("/addTransactionPool",(req,res)=>{
    try{
      let trans = addTransactionPool(req.body);
      broadcart({type:MSG_TYPES.RESPONSE_TRANSACTION,data:[trans]});
      res.send("A transaction was added to pool");
    }catch(e){
      res.status(400).send(e.message);
    }
  })
  //get peers
  app.get("/peers",(req,res)=>{
    res.send(sockets.map((s)=>s.url).filter((s)=>s));
  })
  //listen
  app.listen(PORT,()=>{
    console.log("server is running at port ",PORT);
  })
}

const initConnection = function(ws){
  ws.on("message",(data)=>{
    let message = JSON.parse(data);
    //console.log("received message:",message);
    switch (message.type) {
      case MSG_TYPES.QUERY_LASTEST:
        console.log("query lastest by",ws.url);
        broadcart({type:MSG_TYPES.RESPONSE_BLOCKCHAIN,data:[Block.getLastestBlock()]});
        break;
      case MSG_TYPES.QUERY_ALL:
        let msg = Block.getBlockChain();
        console.log("query all blocks by",ws.url);
        broadcart({type:MSG_TYPES.RESPONSE_BLOCKCHAIN,data:msg});
        break;
      case MSG_TYPES.RESPONSE_BLOCKCHAIN:
        if(message.data){
          let data = message.data.sort((a,b)=>a.index-b.index);
          let receivedLastestBlock = data[data.length-1];
          let currentLastestBlock = Block.getLastestBlock();
          if(receivedLastestBlock.index>currentLastestBlock.index){
            if(receivedLastestBlock.preHash===currentLastestBlock.hash){
              if(Block.addBlockToChain(receivedLastestBlock)){
                //new block
                console.log("added a block to chain from",ws.url);
                broadcart({type:MSG_TYPES.RESPONSE_BLOCKCHAIN,data:[Block.getLastestBlock()]});
              }
            }else if(data.length==Block.getBlockChain().length){
              //query all blocks of chain
              broadcart({type:MSG_TYPES.QUERY_ALL});
            }else{
              //replace chain
              console.log("Received blockchain from",ws.url);
              if(Block.replaceBlockChain(data)){
                console.log("Replace blockchain from", ws.url)
                broadcart({type:MSG_TYPES.RESPONSE_BLOCKCHAIN,data:[Block.getLastestBlock()]});
                console.log("query transaction pool from",ws.url)
                send(ws,{type:MSG_TYPES.QUERY_ALL_TRANSACTION_POOL});
              }
            }
          }else{
            console.log("Received blockchain is no longer.");
          }
        }
        break;
      case MSG_TYPES.QUERY_ALL_TRANSACTION_POOL:
        console.log("query transaction pool by",ws.url)
        broadcart({type:MSG_TYPES.RESPONSE_TRANSACTION,data:Transaction.getTransactionPool()});
        break;
      case MSG_TYPES.RESPONSE_TRANSACTION:
        if(message.data){
          process.nextTick(()=>{
            console.log("Response transaction from",ws.url)
            async.map(message.data,(trans,callback)=>{
              try{
                addTransactionPool(trans);
                console.log("added transaction to pool",trans.id);
                broadcart({type:MSG_TYPES.RESPONSE_TRANSACTION,data:[trans]});
              }catch(e){
                if(e.message) console.log(e.message);
              }
              callback();
            },(err,rs)=>{
            })
          })
        }
        break;
      default:
    }
  })
}
const initP2P = function(){
  let wsServer = new WebSocket.Server({port:P2P_PORT});
  wsServer.on("connection",(ws)=>{
    sockets.push(ws);
    initConnection(ws);
    ws.on("error",(error)=>{
      console.log("Connection failed");
    })
  });
  //default connect to this peer
  connect2Peers(["http://27.74.255.132:3001"]);
  //connect2Peers(["http://localhost:4001"]);
  //connect2Peers(["http://120.72.99.75:5001"]);
}
const connect2Peers = function(peers){
  peers.forEach((peer)=>{
    if(peer){
      if(!sockets.find((s)=>s.url===peer)){
        console.log("connecting to peer",peer,"...");
        let ws = new WebSocket(peer);
        ws.on("open",()=>{
          sockets.push(ws);
          initConnection(ws);
          console.log("Added peer",peer);
          //query lastest block
          send(ws,{type:MSG_TYPES.QUERY_LASTEST});
          //broadcart transaction pool
          setTimeout(()=>{
            console.log("query transaction pool")
            broadcart({type:MSG_TYPES.QUERY_ALL_TRANSACTION_POOL});
          },3000)

        })
        ws.on("error",()=>{
          console.log("Can't connect to peer. Try connect after 10s",peer);
          if(sockets.indexOf(ws)>=0){
            sockets.splice(sockets.indexOf(ws), 1);
          }
          setTimeout(function(){
            connect2Peers([peer]);
          },10*1000);
        })
        ws.on("close",()=>{
          console.log('Peer',ws.url, "was closed. Reconnect after 10m");
          if(sockets.indexOf(ws)>=0){
            sockets.splice(sockets.indexOf(ws), 1);
          }
          setTimeout(function(){
            connect2Peers([peer]);
          },10*60*1000);
        })
      }
    }

  })
}
const send = function(ws,message){
  if(ws.readyState === WebSocket.OPEN){
    ws.send(JSON.stringify(message));
  }
}
const broadcart = function(message){
  sockets.forEach((ws)=>send(ws,message));
}

initP2P();
initHttp();
