const HomeKit        = require('../..');
const Accessory      = HomeKit.Accessory;
const Service        = HomeKit.Service;
const Characteristic = HomeKit.Characteristic;
const UUID           = HomeKit.uuid;

var LightController = {
  name: "Simple Light", //name of accessory
  manufacturer: "Lsong", //manufacturer (optional)
  model: "v1.0", //model (optional)
  serialNumber: "A12S345KGB", //serial number (optional)

  power: false, //curent power status
  brightness: 100, //current brightness
  hue: 0, //current hue
  saturation: 0, //current saturation
  setPower: function(power) { //set power of accessory
    console.log("Turning the '%s' %s", this.name, power ? "on" : "off");
    this.power = power;
  },

  getPower: function() { //get power of accessory
    console.log("'%s' is %s.", this.name, this.power ? "on" : "off");
    return this.power ? true : false;
  },

  setBrightness: function(brightness) { //set brightness
    console.log("Setting '%s' brightness to %s", this.name, brightness);
    this.brightness = brightness;
  },

  getBrightness: function() { //get brightness
    console.log("'%s' brightness is %s", this.name, this.brightness);
    return this.brightness;
  },

  setSaturation: function(saturation) { //set brightness
    console.log("Setting '%s' saturation to %s", this.name, saturation);
    this.saturation = saturation;
  },

  getSaturation: function() { //get brightness
    console.log("'%s' saturation is %s", this.name, this.saturation);
    return this.saturation;
  },

  setHue: function(hue) { //set brightness
    console.log("Setting '%s' hue to %s", this.name, hue);
    this.hue = hue;
  },

  getHue: function() { //get hue
    console.log("'%s' hue is %s", this.name, this.hue);
    return this.hue;
  },

  identify: function() { //identify the accessory
    console.log("Identify the '%s'", this.name);
  }
}

// Generate a consistent UUID for our light Accessory that will remain the same even when
// restarting our server. We use the `uuid.generate` helper function to create a deterministic
// UUID based on an arbitrary "namespace" and the word "light".
var uuid = UUID.generate('homekit:light');
// This is the Accessory that we'll return to HAP-NodeJS that represents our light.
var accessory = new Accessory('Simple Light', uuid);

// Add properties for publishing (in case we're using Core.js and not BridgedCore.js)

// set some basic properties (these values are arbitrary and setting them is optional)
accessory
.getService(Service.AccessoryInformation)
.setCharacteristic(Characteristic.Manufacturer, LightController.manufacturer)
.setCharacteristic(Characteristic.Model,        LightController.model)
.setCharacteristic(Characteristic.SerialNumber, LightController.serialNumber);

// listen for the "identify" event for this Accessory
accessory.on('identify', function(paired, callback) {
  LightController.identify(callback);
});

// Add the actual Lightbulb Service and listen for change events from iOS.
// We can see the complete list of Services and Characteristics in `lib/gen/HomeKitTypes.js`
accessory
.addService(Service.Lightbulb, LightController.name) // services exposed to the user should have "names" like "Light" for this case
.getCharacteristic(Characteristic.On)
.on('set', function(value, callback) {
  LightController.setPower(value);
  // Our light is synchronous - this value has been successfully set
  // Invoke the callback when you finished processing the request
  // If it's going to take more than 1s to finish the request, try to invoke the callback
  // after getting the request instead of after finishing it. This avoids blocking other
  // requests from HomeKit.
  callback();
})
// We want to intercept requests for our current power state so we can query the hardware itself instead of
// allowing HAP-NodeJS to return the cached Characteristic.value.
.on('get', function(callback) {
  callback(null, LightController.power);
});

// To inform HomeKit about changes occurred outside of HomeKit (like user physically turn on the light)
// Please use Characteristic.updateValue
// 
// accessory
//   .getService(Service.Lightbulb)
//   .getCharacteristic(Characteristic.On)
//   .updateValue(true);

// also add an "optional" Characteristic for Brightness
accessory
.getService(Service.Lightbulb)
.addCharacteristic(Characteristic.Brightness)
.on('set', function(value, callback) {
  LightController.setBrightness(value);
  callback();
})
.on('get', function(callback) {
  callback(null, LightController.getBrightness());
});

// also add an "optional" Characteristic for Saturation
accessory
.getService(Service.Lightbulb)
.addCharacteristic(Characteristic.Saturation)
.on('set', function(value, callback) {
  LightController.setSaturation(value);
  callback();
})
.on('get', function(callback) {
  callback(null, LightController.getSaturation());
});

// also add an "optional" Characteristic for Hue
accessory
.getService(Service.Lightbulb)
.addCharacteristic(Characteristic.Hue)
.on('set', function(value, callback) {
  LightController.setHue(value);
  callback();
})
.on('get', function(callback) {
  callback(null, LightController.getHue());
});


module.exports = accessory;