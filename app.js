#!/usr/bin/env node

/**
 * Module dependencies.
 */
var program = require('commander');
var app = require("./main");
const fs = require("fs");
const path = require("path");
let packageInfo = JSON.parse(fs.readFileSync(__dirname + "/package.json",'utf8'));
let cmdValue,envValue;
program
  .version(packageInfo.version,'-v, --version')
  .arguments('<command> [editor]')
  .option("-t, --http_port [type]")
  .option("-p, --p2p_port [type]")
  .action(function (command, editor) {
     cmdValue = command;
     envValue = editor;
  });
program.on('--help', function(){
    console.log('');
    console.log('');
    console.log('  Commands:');
    console.log('');
    console.log('    config [editor]         open config file');
    console.log('');
    console.log("    Editors: 'sublime', 'atom', 'code', 'webstorm', 'phpstorm', 'idea14ce', 'vim', 'emacs', 'visualstudio'");
    console.log('');
  });

program.parse(process.argv);
if(cmdValue==="config"){
  var isWin = process.platform === "win32";
  var openInEditor = require('open-in-editor');
  var cmd = isWin?'notepad':null;
  var config = {
    editor:envValue, //values: 'sublime', 'atom', 'code', 'webstorm', 'phpstorm', 'idea14ce', 'vim', 'emacs', 'visualstudio'
  }
  if(isWin){
    config.cmd = 'notepad.exe';
    config.pattern =  '{filename}';
  }
  var editor = openInEditor.configure(config, function(err) {
    console.error('Something went wrong: ' + err);
  });
  if(editor){
    editor.open(__dirname + path.sep +"config.json")
    .then(function() {
      console.log('open file:', __dirname + path.sep+ "config.json");
    }, function(err) {
      console.error('Something went wrong: ' + err);
    });
  }
}else{
  app.run(program.http_port,program.p2p_port);
}
