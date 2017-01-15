const util           = require('util');
const Accessory      = require('./Accessory');
const Service        = require('./Service');
const Characteristic = require('./Characteristic');
const clone          = require('./lib/util/clone');

/**
 * Bridge is a special type of HomeKit Accessory that hosts other Accessories "behind" it. This way you
 * can simply publish() the Bridge (with a single HAPServer on a single port) and all bridged Accessories
 * will be hosted automatically, instead of needed to publish() every single Accessory as a separate server.
 */
function Bridge(displayName, serialNumber) {
  Accessory.call(this, displayName, serialNumber);
  this._isBridge = true; // true if we are a Bridge (creating a new instance of the Bridge subclass sets this to true)
  this.bridgedAccessories = []; // If we are a Bridge, these are the Accessories we are bridging
}

util.inherits(Bridge, Accessory);


Bridge.prototype.addBridgedAccessory = function(accessory, deferUpdate) {
  if (accessory._isBridge)
    throw new Error("Cannot Bridge another Bridge!");

  // check for UUID conflict
  for (var index in this.bridgedAccessories) {
    var existing = this.bridgedAccessories[index];
    if (existing.UUID === accessory.UUID)
      throw new Error("Cannot add a bridged Accessory with the same UUID as another bridged Accessory: " + existing.UUID);
  }

  if(accessory.getService(Service.BridgingState) == undefined) {
    // Setup Bridging State Service
    accessory.addService(Service.BridgingState);
  }

  accessory
    .getService(Service.BridgingState)
    .getCharacteristic(Characteristic.AccessoryIdentifier)
    .setValue(accessory.UUID);

  accessory
    .getService(Service.BridgingState)
    .getCharacteristic(Characteristic.Reachable)
    .setValue(accessory.reachable);

  accessory
    .getService(Service.BridgingState)
    .getCharacteristic(Characteristic.Category)
    .setValue(accessory.category);

  // listen for changes in ANY characteristics of ANY services on this Accessory
  accessory.on('service-characteristic-change', function(change) {
    this._handleCharacteristicChange(clone(change, {accessory:accessory}));
  }.bind(this));

  accessory.on('service-configurationChange', function(change) {
    this._updateConfiguration();
  }.bind(this));

  accessory.bridged = true;

  this.bridgedAccessories.push(accessory);

  if(!deferUpdate) {
    this._updateConfiguration();
  }

  return accessory;
}

Bridge.prototype.addBridgedAccessories = function(accessories) {
  for (var index in accessories) {
    var accessory = accessories[index];
    this.addBridgedAccessory(accessory, true);
  }

  this._updateConfiguration();
}

Bridge.prototype.removeBridgedAccessory = function(accessory, deferUpdate) {
  if (accessory._isBridge)
    throw new Error("Cannot Bridge another Bridge!");

  var foundMatchAccessory = false;
  // check for UUID conflict
  for (var index in this.bridgedAccessories) {
    var existing = this.bridgedAccessories[index];
    if (existing.UUID === accessory.UUID) {
      foundMatchAccessory = true;
      this.bridgedAccessories.splice(index, 1);
      break;
    }
  }

  if (!foundMatchAccessory)
    throw new Error("Cannot find the bridged Accessory to remove.");

  accessory.removeAllListeners();

  if(!deferUpdate) {
    this._updateConfiguration();
  }
}

Bridge.prototype.removeBridgedAccessories = function(accessories) {
  for (var index in accessories) {
    var accessory = accessories[index];
    this.removeBridgedAccessory(accessory, true);
  }

  this._updateConfiguration();
}


module.exports = Bridge;