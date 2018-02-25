const cryptoJs = require('crypto-js');
const _ = require("underscore");
const {Wallet}= require("./wallet");
const {hexToBinary,round} = require("./utils");
const color = require("colors");
const COINBASE_AMOUNT = 15;
let transactionPool =[];
class UnSpentTxOut{
  constructor(txOutId,txOutIndex,amount,address){
    this.txOutId = txOutId;
    this.txOutIndex = txOutIndex;
    this.amount = amount;
    this.address = address;
  }
  toString(){
    return JSON.stringify(this);
  }
  static fromJson(obj){
    return new UnSpentTxOut(obj.txOutId,obj.txOutIndex,obj.amount,obj.address);
  }
}
class TxOut{
  constructor(address,amount){
    this.address = address;
    this.amount=amount;
  }
  toString(){
    return JSON.stringify(this);
  }
  static fromJson(obj){
    return new TxOut(obj.address,obj.amount);
  }
}

class TxIn{
  constructor(txOutId,txOutIndex,signature){
    this.txOutId =txOutId;
    this.txOutIndex = txOutIndex;
    this.signature = signature;
  }
  toString(){
    return JSON.stringify(this);
  }
  static fromJson(obj){
    return new TxIn(obj.txOutId,obj.txOutIndex,obj.signature);
  }
}
class Transaction{
  constructor(txIns,txOuts){
    this.txIns = txIns;
    this.txOuts = txOuts;
    this.id = this.getTransactionId();
  }
  toString(){
    return JSON.stringify(this);
  }
  getTransactionId(){
    return Transaction.createTransactionId(this);
  }
  static createTransactionId(tx){
    if(tx.txIns && tx.txOuts){
      let txInsContent = tx.txIns.map((txIn)=>{return txIn.txOutId+txIn.txOutIndex.toString()}).reduce((a,b)=>a+b,"");
      let txOutsContent = tx.txOuts.map(txOut=>txOut.address+txOut.amount.toString()).reduce((a,b)=>a+b,"");
      return cryptoJs.SHA256(txInsContent + txOutsContent).toString();
    }else{
      return null;
    }
  }
  static createCoinBaseTransaction(address,blockIndex){
    let tx = new Transaction();
    let txOut = new TxOut(address,COINBASE_AMOUNT);
    let txIn = new TxIn("",blockIndex,"");
    tx.txOuts = [txOut];
    tx.txIns =[txIn];
    tx.id = tx.getTransactionId();
    return tx;
  }
  static validCoinBaseTransaction(trans,blockIndex){
    if(!trans) return false;
    if(trans.id!==Transaction.createTransactionId(trans)){
      console.log("Id of transaction is invalid".red);
      return false;
    }

    if(!trans.txIns && trans.txIns.length!==1){
      console.log("Invalid number of txIns of coinbase transaction".red);
      return false;
    }
    if(trans.txIns[0].txOutIndex!==blockIndex){
      console.log("Invalid txOutIndex in coinbase transaction".red)
      return false;
    }

    if(trans.txOuts && trans.txOuts.length!==1){
      console.log("Invalid number of txOuts in coin base transaction".red)
      return false;
    }
    if(trans.txOuts[0].amount!==COINBASE_AMOUNT){
      console.log("Amount of coinbase in coinBaseTransaction must be".red,COINBASE_AMOUNT)
      return false;
    }
    return true;
  }
  static validTxIn(txIn,transaction,unSpentTxOuts){
    if(!txIn) return false;
    let referenceTxOut = Transaction.getUnSpentTxOutById(unSpentTxOuts,txIn.txOutId,txIn.txOutIndex);

    if(!referenceTxOut){
      console.log("Reference TxOut not found".red,txIn.txOutId,txIn.txOutIndex);
      return false;
    }

    if(!Wallet.verifySignature(referenceTxOut.address,transaction.id,txIn.signature)){
      console.log("Invalid TxIn signature".red);
      return false;
    }
    return true;
  }
  static isValidTransactionStructure(trans){
      return _.isArray(trans.txIns)
          && _.isArray(trans.txOuts)
          && _.isString(trans.id)
  }
  static validTransaction(trans,unSpentTxOuts){
    if(!trans) return false;
    if(!Transaction.isValidTransactionStructure(trans)){
      console.log("Transaction structure is invalid".red);
      return false;
    }
    //valid id
    if(trans.id!==Transaction.createTransactionId(trans)){
      console.log("Id of transaction is invalid".red);
      return false;
    }

    //valid txIns
    if(!trans.txIns.map((txIn)=>Transaction.validTxIn(txIn,trans,unSpentTxOuts)).reduce((a,b)=>a && b,true)){
      console.log("Some of TxIns are invalid in transaction".red);
      return false;
    }

   //check total amount of txIns and txOuts
    let totalAmountOfTxIns = round(trans.txIns.map((txIn)=>Transaction.getUnSpentTxOutById(unSpentTxOuts,txIn.txOutId,txIn.txOutIndex).amount).reduce((a,b)=>a+b,0),5);
    let totalAmountOfTxOuts = round(trans.txOuts.map((t)=>t.amount).reduce((a,b)=>a+b,0),5);
    if(totalAmountOfTxIns!==totalAmountOfTxOuts){
      console.log("Total amount of txIns <> total amount of txOuts".red,totalAmountOfTxIns,totalAmountOfTxOuts);
      return false;
    }
    return true;
  }
  static fromJson(obj){
    return new Transaction(obj.txIns,obj.txOuts)
  }
  static updateUnSpentTxOuts(transactions,_unSpentTxOuts){

    let newUnSpentTxOuts =transactions.map((trans)=>{
      return trans.txOuts.map((txOut,index)=>{
        return new UnSpentTxOut(trans.id,index,txOut.amount,txOut.address);
      })
    }).reduce((a,b)=>{
      return a.concat(b);
    },[]).filter((nu)=>!_unSpentTxOuts.find((u)=>u.txOutId===nu.txOutId && u.txOutIndex===nu.txOutIndex));

    let cunsumedUnSpenTxOuts = transactions.map(trans=>trans.txIns)
      .reduce((a,b)=>a.concat(b),[])
      .map((t)=>new UnSpentTxOut(t.txOutId,t.txOutIndex,0,''));

    return _unSpentTxOuts.concat(newUnSpentTxOuts).filter((unSpent)=>{
      return ! cunsumedUnSpenTxOuts.find((consumed)=>consumed.txOutId===unSpent.txOutId && consumed.txOutIndex===unSpent.txOutIndex);
    });
  }
  static updateTransactionPool(unSpentTxOuts){
    transactionPool = transactionPool.filter((trans)=>{
      return Transaction.validTransaction(trans,unSpentTxOuts);
    })
  }
  static addTransactionPool(trans,unSpentTxOuts){
    //check exists of transaction
    if(transactionPool.find((tr)=>tr.id===trans.id)){
      throw new Error("");
    }
    //check id transaction
    if(!Transaction.validTransaction(trans,unSpentTxOuts)){
      throw new Error("Transaction is invalid");
    }
    //
    transactionPool.push(trans);
    return trans;
  }
  static getTransactionPool(id){
    if(!id){
      return transactionPool;
    }else {
      return transactionPool.find((t)=>t.id===id);
    }

  }
  static getAllUnSpentTxOuts(unSpentTxOuts){
    let allUnSpentTxOuts = transactionPool.map((trans)=>{
      return trans.txOuts.map((txOut,index)=>{
        return new UnSpentTxOut(trans.id,index,txOut.amount,txOut.address);
      })
    }).reduce((a,b)=>a.concat(b),[]).concat(unSpentTxOuts);
    return allUnSpentTxOuts;
  }
  static getUnSpentTxOutsByAddress(unSpentTxOuts,address){
    let allUnSpentTxOuts = Transaction.getAllUnSpentTxOuts(unSpentTxOuts);

    let txInsInPool = transactionPool.map((trans)=>trans.txIns).reduce((a,b)=>a.concat(b),[]);
    let unSpentTxOutsOfSender = allUnSpentTxOuts.filter((un)=>un.address===address)
        .filter((un)=>!txInsInPool.find((tx)=>un.txOutId==tx.txOutId && un.txOutIndex==tx.txOutIndex));
    return unSpentTxOutsOfSender;
  }
  static getUnSpentTxOutById(unSpentTxOuts,id,index){
    return Transaction.getAllUnSpentTxOuts(unSpentTxOuts).find((un)=>un.txOutId==id && un.txOutIndex==index);
  }
  static createTransaction(unSpentTxOuts,address_receiver,amount){
    if(!Wallet.isValidAddress(address_receiver)){
      throw new Error("Receiver address is invalid");
    }
    let address_sender = Wallet.getAddress();
    let unSpentTxOutsOfSender = Transaction.getUnSpentTxOutsByAddress(unSpentTxOuts,address_sender);
    if(unSpentTxOutsOfSender.length===0) throw new Error("Don't have any unSpent");
    //get UnSpentTxOuts will be used
    let unSpents = [];
    let _amount=0,leftOverAmount=0;
    for(let unSpent of unSpentTxOutsOfSender){
      _amount = round(_amount +unSpent.amount,5);
      unSpents.push(unSpent);
      if(_amount>=amount){
        leftOverAmount = round(_amount-amount,5);
        break;
      }
    }
    if(_amount<amount) throw new Error("Not enough unspent TxOut");

    //create txIns and txOuts
    let txIns =[],txOuts = [];
    for(let un of unSpents){
      let txIn = new TxIn(un.txOutId,un.txOutIndex);
      txIns.push(txIn);
    }
    let txOut = new TxOut(address_receiver,amount);
    txOuts.push(txOut);

    if(leftOverAmount){
      let txOut = new TxOut(address_sender,leftOverAmount);
      txOuts.push(txOut);
    }
    //create transaction
    let trans = new Transaction(txIns,txOuts);
    //sign txins
    trans.txIns = txIns.map((txIn,index)=>{
      txIn.signature = Wallet.sign(trans,index,unSpentTxOutsOfSender);
      return txIn;
    })
    //
    return trans;
  }
}
module.exports={
  TxIn,
  TxOut,
  UnSpentTxOut,
  Transaction
}
