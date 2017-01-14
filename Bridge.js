const util      = require('util');
const Accessory = require('./Accessory');

/**
 * Bridge is a special type of HomeKit Accessory that hosts other Accessories "behind" it. This way you
 * can simply publish() the Bridge (with a single HAPServer on a single port) and all bridged Accessories
 * will be hosted automatically, instead of needed to publish() every single Accessory as a separate server.
 */
function Bridge(displayName, serialNumber) {
  Accessory.call(this, displayName, serialNumber);
  this._isBridge = true;
}

util.inherits(Bridge, Accessory);

module.exports = Bridge;