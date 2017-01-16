const HomeKit        = require('../..');
const Accessory      = HomeKit.Accessory;
const Service        = HomeKit.Service;
const Characteristic = HomeKit.Characteristic;
const UUID           = HomeKit.uuid;

var uuid = UUID.generate('homekit:air-quality');
var sensor = new Accessory('AirQuality', uuid);

sensor.on('identify', function(){
  console.log('%s Identify!', sensor.displayName);
});

sensor
.addService(Service.AirQualitySensor)
.getCharacteristic(Characteristic.AirQuality)
.on('get', function(callback) {
  callback(null, 5);
});

module.exports = sensor;