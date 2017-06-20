#!/usr/bin/env node

const fs      = require('fs');
const path    = require('path');
const HomeKit = require('..');

// Start by creating our Bridge which will host all loaded Accessories
const uuid = HomeKit.uuid.generate("homekit:bridge:demo");
const bridge = new HomeKit.Bridge('My Bridge', uuid);

// Listen for bridge identification event
bridge.on('identify', function(paired, callback) {
  console.log("%s Identify!", bridge.displayName);
  callback(); // success
});

// Load up all accessories in the /accessories folder
var dir = path.join(__dirname, 'accessories');
fs.readdirSync(dir).forEach(function(file) {
  var accessory = require(path.join(dir, file));
  if(typeof accessory === 'function'){
    accessory(function(accessory){
      bridge.addBridgedAccessory(accessory);
    });
  }else{
    bridge.addBridgedAccessory(accessory);
  }
});

bridge.on('listening', function(){
  console.log("HomeKit Server starting...");
});

// Publish the Bridge on the local network.
bridge.publish({
  port: 51826,
  username: "CC:22:3D:E3:CE:F7",
  pincode: "123-45-678",
  category: HomeKit.Accessory.Categories.BRIDGE
});
