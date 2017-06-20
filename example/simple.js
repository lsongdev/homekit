const homekit 		 = require('..');
const Service 	     = homekit.Service;
const Characteristic = homekit.Characteristic;

const uuid = homekit.uuid.generate("homekit:yeelight");
const acce = new homekit.Accessory('Simple Light', uuid);

acce.on('identify', function(paired, callback) {
  console.log("Identify!");
  callback(); // success
});

acce
.addService(Service.Lightbulb, 'Yeelight')
.getCharacteristic(Characteristic.On)
.on('set', function(value, callback) {
  light.set_power(value, callback);
})

// Publish the Accessory on the local network.
acce.publish({
  port    : 51826,
  username: "CC:22:3D:E3:CE:F6",
  pincode : "031-45-154"
});