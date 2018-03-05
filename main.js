const express = require("express");
const bodyParser = require("body-parser");
const {Block,sendTransaction,getBalance,addTransactionPool,addTransactionPoolAsync,getUnSpentTxOuts} = require("./blockchain");
const {Wallet} = require("./wallet");
const {Transaction} = require("./transaction");
const async = require("async");
const WebSocket = require("ws");
const color = require("colors");
const fs = require("fs");
const MSG_TYPES ={
  QUERY_LASTEST:0,
  QUERY_ALL:1,
  RESPONSE_BLOCKCHAIN:2,
  QUERY_ALL_TRANSACTION_POOL:3,
  RESPONSE_TRANSACTION:4
}
let config = JSON.parse(fs.readFileSync(__dirname + "/config.json",'utf8'));

let sockets =[];
let isMine;
let mineBlock = ()=>{
  if(!isMine) return;
  if(sockets.filter((s)=>s.url).length===0){
    console.log("Waiting for reconnecting to peers".blue)
    setTimeout(()=>{
        mineBlock();
    },(config.time_reconnect_peer||3000)*2);
    return;
  }
  try{
    Block.createNextBlock((error,newBlock)=>{
      if(newBlock){
        if(sockets.filter((s)=>s.url).length>0 &&  Block.isValidNewBlock(newBlock)){
          console.log(`New Block is sent, index: ${newBlock.index}, hash: ${newBlock.hash}`.cyan);
          broadcart({type:MSG_TYPES.RESPONSE_BLOCKCHAIN,data:[newBlock]});
          setTimeout(()=>{
              mineBlock();
          },500);
        }else{
          console.error("New Block is not valid".red);
          mineBlock();
        }
      }else{
        console.log(error.red);
        mineBlock();
      }
    })
  }catch(e){
    console.error(e.message.red);
    console.log("Stopped mining".cyan);
    isMine = false;
  }

}
const initHttp = function(PORT){
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
      console.log("Begin mining".yellow);
      mineBlock();
      res.send({is_mining:isMine})
    }else{
      console.log("Add at least one Peer before mining".red)
      res.status(400).send("Add at least one Peer before mining");
    }
  })
  app.get("/stopMineBlock",(req,res)=>{
    isMine = false;
    console.log("Stopped mining".cyan);
    res.send({is_mining:isMine})
  })
  app.get("/mineStatus",(req,res)=>{
    res.send({is_mining:isMine})
  })
  //add peer
  app.post("/addPeer",(req,res)=>{
    if(req.body.peer){
      if(!config.peers.find((peer)=>peer===req.body.peer)){
        connect2Peer(req.body.peer,(e,ws)=>{
          if(e) return res.status(400).send(e);
          //Save peer
          config.peers.push(req.body.peer);
          fs.writeFileSync(__dirname + "/config.json",JSON.stringify(config));
          //query transation pool
          setTimeout(()=>{
            console.log("Query transaction pool".grey)
            broadcart({type:MSG_TYPES.QUERY_ALL_TRANSACTION_POOL});
          },10000);
          //
          res.send("Peer '" + req.body.peer + "' is added");
        });
      }else{
        res.status(400).send("This peer already exists");
      }

    }else{
      res.status(400).send("Nothing is added");
    }

  })
  app.post("/removePeer",(req,res)=>{
    if(req.body.peer){
      if(config.peers.length<2) return res.status(400).send("Can't remove all peers");
      config.peers = config.peers.filter((p)=>p!==req.body.peer);
      fs.writeFileSync(__dirname + "/config.json",JSON.stringify(config));
      let ws = sockets.find((s)=>s.url===req.body.peer);
      if(ws) ws.terminate();
      res.send("Peer was removed");
    }else{
      res.status(400).send("Nothing is removed");
    }

  })
  //spend
  app.post("/spend",(req,res)=>{
    process.nextTick(()=>{
      if(sockets.filter((s)=>s.url).length===0){
        return res.status(400).send("Add at least one Peer before sending a transaction");
      }
      sendTransaction(req.body,(e,trans)=>{
        if(e) return res.status(400).send(e);
        console.log(`Sent a transaction, id: ${trans.id} `.cyan);
        broadcart({type:MSG_TYPES.RESPONSE_TRANSACTION,data:[trans]});
        res.send(trans);
      });
    })
  })
  //get address
  app.get("/myAddress",(req,res)=>{
    res.send(Wallet.getAddress());
  })
  //get privateKey
  app.get("/privateKey",(req,res)=>{
    res.send(Wallet.getPrivate());
  })
  //change wallet
  app.post("/replaceWallet",(req,res)=>{
    try{
      let data = req.body;
      res.send(Wallet.replaceWallet(data));
    }catch(e){
      res.status(400).send(e.message);
    }
  })
  //get balance
  app.get("/balance",(req,res)=>{
    process.nextTick(()=>{
      getBalance((e,balance)=>{
        res.send({balance:balance});
      })
    })
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

    let sent = pool.map((tr)=>{
      let from = Transaction.getUnSpentTxOutById(getUnSpentTxOuts(),tr.txIns[0].txOutId,tr.txIns[0].txOutIndex).address;
      let to = tr.txOuts.find((txOut)=>txOut.address!==from).address;
      return {
        id:tr.id,
        from:from,
        to:to,
        amount:tr.txOuts.filter((txOut)=>txOut.address!==from).map((txOut)=>txOut.amount).reduce((a,b)=>a+b,0),
        date:tr.timestamp?new Date(tr.timestamp):null,
        message:tr.message
      }
    }).filter((tr)=>tr.from===sender);

    res.send(sent);
  })
  app.get("/receivedTransactions",(req,res)=>{
    let pool = Transaction.getTransactionPool();
    let receiver = Wallet.getAddress();

    async.filter(pool,(tr,callback)=>{
      callback(null,tr.txOuts.find((txOut)=>txOut.address===receiver));
    },(e,trs)=>{
      let received = trs.map((tr)=>{
        return {
          id:tr.id,
          from:Transaction.getUnSpentTxOutById(getUnSpentTxOuts(),tr.txIns[0].txOutId,tr.txIns[0].txOutIndex).address,
          to:receiver,
          amount:tr.txOuts.filter((txOut)=>txOut.address===receiver).map((txOut)=>txOut.amount).reduce((a,b)=>a+b,0),
          date:tr.timestamp?new Date(tr.timestamp):null,
          message:tr.message
        }
      }).filter((tr)=>tr.from!==receiver)
      res.send(received);
    })
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
    console.log(`Http server is running at port ${PORT}`.blue);
  })
}
const initConnection = function(ws){
  ws.on("message",(data)=>{
    let message = JSON.parse(data);
    //console.log("received message:",message);
    switch (message.type) {
      case MSG_TYPES.QUERY_LASTEST:
        process.nextTick(()=>{
          broadcart({type:MSG_TYPES.RESPONSE_BLOCKCHAIN,data:[Block.getLastestBlock()]});
        })
        break;
      case MSG_TYPES.QUERY_ALL:
        process.nextTick(()=>{
          let msg = Block.getBlockChain();
          broadcart({type:MSG_TYPES.RESPONSE_BLOCKCHAIN,data:msg});
        })
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
                console.log(`Added a block to chain, index: ${receivedLastestBlock.index}, hash: ${receivedLastestBlock.hash}`.green);
                broadcart({type:MSG_TYPES.RESPONSE_BLOCKCHAIN,data:[Block.getLastestBlock()]});
              }
            }else if(data.length===Block.getBlockChain().length){
              //query all blocks of chain
              broadcart({type:MSG_TYPES.QUERY_ALL});
            }else{
              if(data.length>1){
                //replace chain
                console.log(`Received blockchain from ${ws.url}`.grey);
                if(Block.replaceBlockChain(data)){
                  console.log(`Replace blockchain from ${ws.url}`.blue);
                  broadcart({type:MSG_TYPES.RESPONSE_BLOCKCHAIN,data:[Block.getLastestBlock()]});
                  //console.log("query transaction pool from",ws.url)
                  broadcart({type:MSG_TYPES.QUERY_ALL_TRANSACTION_POOL});
                }
              }else{
                broadcart({type:MSG_TYPES.QUERY_ALL});
              }
            }
          }else{
            //console.log("Received blockchain is no longer.");
          }
        }
        break;
      case MSG_TYPES.QUERY_ALL_TRANSACTION_POOL:
        //console.log("query transaction pool by",ws.url)
        process.nextTick(()=>{
          let trans = Transaction.getTransactionPool();
          /*async.map(trans,(tr,cb)=>{
            broadcart({type:MSG_TYPES.RESPONSE_TRANSACTION,data:[tr]});
          },(e,rs)=>{
          })*/
          broadcart({type:MSG_TYPES.RESPONSE_TRANSACTION,data:trans});
        })
        break;
      case MSG_TYPES.RESPONSE_TRANSACTION:
        if(message.data){
          if(message.data.length===1){
            console.log(`Received a transaction. Checking...`.blue);
          }else{
            console.log(`Processing transaction pool...`.blue);
          }
          async.map(message.data,(trans,callback)=>{
            addTransactionPoolAsync(trans,(e,rs)=>{
              if(e){
                console.log(e.red);
                return callback();
              }
              if(rs){
                if(message.data.length===1){
                  console.log(`Added a transaction to pool (${trans.txIns.length} txIns), id: ${trans.id}`.green);
                }
                broadcart({type:MSG_TYPES.RESPONSE_TRANSACTION,data:[trans]});
              }
              callback();
            });
          },(err,rs)=>{
            if(message.data.length>1){
              console.log(`Finished to process the transaction pool`.grey);
            }
          })
        }
        break;
      default:
    }
  })
}
const initP2P = function(P2P_PORT){
  let wsServer = new WebSocket.Server({port:P2P_PORT});
  console.log(`P2P server is running at port ${P2P_PORT}`.blue);
  wsServer.on("connection",(ws)=>{
    sockets.push(ws);
    initConnection(ws);
    ws.on("error",(error)=>{
      console.error(`Connection failed: ${error.message}`.red);
    })
  });
  if(config.peers){
    connect2Peers(config.peers);
  }
}
const connect2Peers = function(peers){
  peers.map((peer)=>{
    connect2Peer(peer,(e,ws)=>{
      //do nothing
    })
  })
}
const connect2Peer = function(peer,callback){
    if(!sockets.find((s)=>s.url===peer)){
      console.log(`connecting to the peer: ${peer}`.grey);
      let ws = new WebSocket(peer);
      ws.on("open",()=>{
        sockets.push(ws);
        initConnection(ws);
        console.log(`Added the peer: ${peer}`);
        //query lastest block
        send(ws,{type:MSG_TYPES.QUERY_LASTEST});
        if(callback){
          callback(null,ws);
          callback = null;
        }
      });
      ws.on("error",(err)=>{
        console.error(`Can not connect to peer. Error: ${err.message.red}, peer: ${peer}`.red);
        if(sockets.indexOf(ws)>=0){
          sockets.splice(sockets.indexOf(ws), 1);
        }
        if(config.peers.find((p)=>p===peer)){
          console.error(`Try connect after ${(config.time_reconnect_peer||30000)/1000} seconds`.red);
          setTimeout(function(){
            connect2Peer(peer,(e,ws)=>{
              if(e) return console.log(e.red);
              setTimeout(()=>{
                console.log("Query transaction pool after the program reconnected to the peer".grey);
                broadcart({type:MSG_TYPES.QUERY_ALL_TRANSACTION_POOL});
              },500);
            });
          },config.time_reconnect_peer||30000);
        }
        if(callback){
          callback(err.message||"Can't connect to peer: " + peer);
          callback = null;
        }
      });
      ws.on("close",()=>{
        if(sockets.indexOf(ws)>=0){
          sockets.splice(sockets.indexOf(ws), 1);
        }
        console.error(`The peer ${peer} was closed`.grey);
      });
    }else{
      if(callback){
        callback("This peer exists");
        callback = null;
      }
    }
}
const send = function(ws,message){
  if(ws.readyState === WebSocket.OPEN){
    ws.send(JSON.stringify(message));
  }
}
const broadcart = function(message){
  async.map(sockets,(ws,callback)=>{
    send(ws,message);
    callback();
  },(e,rs)=>{

  })

}
const run =(http_port,p2p_port)=>{
  if(!http_port || http_port===true) http_port = config.http_port;
  if(!http_port || p2p_port===true) p2p_port = config.p2p_port;
  if(http_port===p2p_port){
    return console.error("http port must be different from  p2p port".red);
  }

  initP2P(p2p_port||3001);
  initHttp(http_port||3000);
}
module.exports ={
  run
}
