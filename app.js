#!/usr/bin/env node

/**
 * Module dependencies.
 */

var program = require('commander');
var app = require("./main");
const color = require("colors");
program
  .version('1.0.9')
  .option("-t, --http_port [type]","Wich port http to used. default 3000")
  .option("-p, --p2p_port [type]","Wich port p2p to used. default 3001")
program.parse(process.argv);

if(!program.http_port || program.http_port===true) program.http_port = 3000
if(!program.p2p_port || program.p2p_port===true) program.p2p_port = 3001

if(program.http_port===program.p2p_port){
  return console.error("http port must be different from  p2p port".red);
}

app.run(program.http_port,program.p2p_port);
