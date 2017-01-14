#!/usr/bin/env bash

const fs      = require('fs');
const path    = require('path');
const storage = require('node-persist');
const HomeKit = require('..');

var targetPort = 51826;
console.log("HomeKit Server starting...");

// Initialize our storage system
storage.initSync();

// Start by creating our Bridge which will host all loaded Accessories
const bridge = new HomeKit.Bridge('Node Bridge', HomeKit.uuid.generate("Node Bridge"));

// Listen for bridge identification event
bridge.on('identify', function(paired, callback) {
  console.log("Node Bridge identify");
  callback(); // success
});

// Load up all accessories in the /accessories folder
var dir = path.join(process.cwd(), "accessories");
fs.readdirSync(dir).forEach(function(file) {
  var accessory = require(path.join(dir, file));
  accessory.publish({
    port: targetPort++,
    username: accessory.username,
    pincode: accessory.pincode
  });
  // bridge.addBridgedAccessory(accessory);
});

// Publish the Bridge on the local network.
// bridge.publish({
//   username: "CC:22:3D:E3:CE:F6",
//   port: targetPort,
//   pincode: "031-45-154",
//   category: HomeKit.Accessory.Categories.BRIDGE
// });
