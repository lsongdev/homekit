'use strict';

function HomeKit(){

};

HomeKit.UUID           = require('./lib/util/uuid');
HomeKit.Bridge         = require('./lib/Bridge');
HomeKit.Accessory      = require('./lib/Accessory');
HomeKit.Service        = require('./lib/Service');
HomeKit.Characteristic = require('./lib/Characteristic');

module.exports = HomeKit;
