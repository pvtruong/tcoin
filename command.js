#!/usr/bin/env node

/**
 * Module dependencies.
 */

var program = require('commander');
var app = require("./app")

program
  .version('1.0.4')
program
  .command('run')
  .description('run tcoin')
  .action(function(env, options){
    app.run();
  });
program.parse(process.argv);
