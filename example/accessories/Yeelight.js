const Yeelight       = require('yeelight2');
const HomeKit        = require('../../');
const Accessory      = HomeKit.Accessory;
const Service        = HomeKit.Service;
const Characteristic = HomeKit.Characteristic;
const UUID           = HomeKit.uuid;

module.exports = function(register){

  Yeelight.discover(function(light, meta){

    var uuid = UUID.generate(light.id);
    var accessory = new Accessory(light.name, uuid);
    accessory
    .getService(Service.AccessoryInformation)
    .setCharacteristic(Characteristic.Manufacturer, 'Yeelink')
    .setCharacteristic(Characteristic.Model,        light.model)
    .setCharacteristic(Characteristic.SerialNumber, light.id);
    
    accessory.on('identify', function(paired, callback) {
      light.toggle();
      light.toggle();
    });

    accessory
    .addService(Service.Lightbulb, light.name)
    .getCharacteristic(Characteristic.On)
    .on('set', function(value, callback) {
      $(light.set_power(value), callback);
    })
    .on('get', function(callback) {
      light.sync().then(function(){
        callback(null, light.power === 'on' ? 1 : 0);
      }, callback);
    });

    accessory
    .getService(Service.Lightbulb)
    .addCharacteristic(Characteristic.Brightness)
    .on('set', function(value, callback) {
      $(light.set_bright(value), callback);
    })
    .on('get', function(callback) {
      callback(null, +light.bright);
    });
    accessory
    .getService(Service.Lightbulb)
    .addCharacteristic(Characteristic.Saturation)
    .on('set', function(value, callback) {
      light.sat = value;
      $(light.set_hsv(light.hue, value), callback);
    })
    .on('get', function(callback) {
      callback(null, +light.sat);
    });
    accessory
    .getService(Service.Lightbulb)
    .addCharacteristic(Characteristic.Hue)
    .on('set', function(value, callback){
      light.hue = value;
      $(light.set_hsv(value, light.sat), callback);
    })
    .on('get', function(callback) {
      callback(null, +light.hue);
    });

    register(accessory);

  });

  function $(promise, callback){
    return promise.then(function(res){
      callback(null, res);
    }, callback);
  }

};