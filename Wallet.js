const {ec} = require("elliptic");
const fs = require("fs");
const {TxIn,TxOut,UnSpentTxOut,Transaction} = require("./transaction");
const {hexToBinary,round,toHexString} = require("./utils");
let EC = new ec('secp256k1');
let PRIVATE_KEY = process.env.ADDRESS|| (__dirname + "/pivate_key");
let currentAddress;
class Wallet{
  static generatePrivateKey(){
    let keyPair = EC.genKeyPair();
    let privateKey = keyPair.getPrivate();
    fs.writeFileSync(PRIVATE_KEY,privateKey.toString(16));
  }
  static getPrivate(){
    if(!fs.existsSync(PRIVATE_KEY)){
      Wallet.generatePrivateKey();
    }
    let privateKey= fs.readFileSync(PRIVATE_KEY,'utf8');
    return privateKey;
  }
  static replaceWallet(data){
    if(data.privateKey){
      try{
        currentAddress = Wallet.getPublic(data.privateKey);
        fs.writeFileSync(PRIVATE_KEY,data.privateKey);
        return currentAddress;
      }catch(e){
        throw new Error(e.message);
      }

    }
    throw new Error("Private key is invalid");
  }
  static getPublic(privateKey){
    if(!privateKey) privateKey = Wallet.getPrivate();
    let key = EC.keyFromPrivate(privateKey,'hex');
    return key.getPublic().encode('hex');
  }
  static getAddress(){
    if(!currentAddress) currentAddress =  Wallet.getPublic();
    return currentAddress;
  }
  static signTxIn(transaction,txInIndex,unSpentTxOuts){
    let dataToSign =transaction.id;
    let txIn = transaction.txIns[txInIndex];
    let unSpent = unSpentTxOuts.find((out)=>out.txOutId==txIn.txOutId && out.txOutIndex==txIn.txOutIndex);
    if(!unSpent) throw new Error("Don't sign this transaction. unSpentTxOut is invalid");
    return Wallet.sign(dataToSign,unSpent.address);
  }
  static sign(dataToSign,address){
    let key = EC.keyFromPrivate(Wallet.getPrivate(),'hex');
    if(address!==key.getPublic().encode('hex')){
      throw new Error("Don't sign. This address is invalid");
    }
    return toHexString(key.sign(dataToSign).toDER());
  }
  static verifySignature(address,data,signature){
    let key = EC.keyFromPublic(address,'hex');
    return key.verify(data,signature);
  }
  static isValidAddress(address){
    if (address.length !== 130) {
        console.log(address);
        console.log('invalid public key length');
        return false;
    } else if (address.match('^[a-fA-F0-9]+$') === null) {
        console.log('public key must contain only hex characters');
        return false;
    } else if (!address.startsWith('04')) {
        console.log('public key must start with 04');
        return false;
    }
    return true;
  }

}
module.exports ={
  Wallet
}
