'use strict';
const util         = require('util');
const EventEmitter = require('events');
const once         = require('./lib/util/once');

/**
 * Characteristic represents a particular typed variable that can be assigned to a Service. For instance, a
 * "Hue" Characteristic might store a 'float' value of type 'arcdegrees'. You could add the Hue Characteristic
 * to a Service in order to store that value. A particular Characteristic is distinguished from others by its
 * UUID. HomeKit provides a set of known Characteristic UUIDs defined in HomeKitTypes.js along with a
 * corresponding concrete subclass.
 *
 * You can also define custom Characteristics by providing your own UUID. Custom Characteristics can be added
 * to any native or custom Services, but Siri will likely not be able to work with these.
 *
 * Note that you can get the "value" of a Characteristic by accessing the "value" property directly, but this
 * is really a "cached value". If you want to fetch the latest value, which may involve doing some work, then
 * call getValue().
 *
 * @event 'get' => function(callback(err, newValue), context) { }
 *        Emitted when someone calls getValue() on this Characteristic and desires the latest non-cached
 *        value. If there are any listeners to this event, one of them MUST call the callback in order
 *        for the value to ever be delivered. The `context` object is whatever was passed in by the initiator
 *        of this event (for instance whomever called `getValue`).
 *
 * @event 'set' => function(newValue, callback(err), context) { }
 *        Emitted when someone calls setValue() on this Characteristic with a desired new value. If there
 *        are any listeners to this event, one of them MUST call the callback in order for this.value to
 *        actually be set. The `context` object is whatever was passed in by the initiator of this change
 *        (for instance, whomever called `setValue`).
 *
 * @event 'change' => function({ oldValue, newValue, context }) { }
 *        Emitted after a change in our value has occurred. The new value will also be immediately accessible
 *        in this.value. The event object contains the new value as well as the context object originally
 *        passed in by the initiator of this change (if known).
 */

function Characteristic(displayName, UUID, props) {
  this.displayName = displayName;
  this.UUID = UUID;
  this.iid = null; // assigned by our containing Service
  this.value = null;
  this.props = props || {
    format: null,
    unit: null,
    minValue: null,
    maxValue: null,
    minStep: null,
    perms: []
  };
}

util.inherits(Characteristic, EventEmitter);

// Known HomeKit formats
Characteristic.Formats = {
  BOOL: 'bool',
  INT: 'int',
  FLOAT: 'float',
  STRING: 'string',
  ARRAY: 'array', // unconfirmed
  DICTIONARY: 'dictionary', // unconfirmed
  UINT8: 'uint8',
  UINT16: 'uint16',
  UINT32: 'uint32',
  UINT64: 'uint64',
  DATA: 'data', // unconfirmed
  TLV8: 'tlv8'
}

// Known HomeKit unit types
Characteristic.Units = {
  // HomeKit only defines Celsius, for Fahrenheit, it requires iOS app to do the conversion.
  CELSIUS: 'celsius',
  PERCENTAGE: 'percentage',
  ARC_DEGREE: 'arcdegrees',
  LUX: 'lux',
  SECONDS: 'seconds'
}

// Known HomeKit permission types
Characteristic.Perms = {
  READ: 'pr',
  WRITE: 'pw',
  NOTIFY: 'ev',
  HIDDEN: 'hd'
}

/**
 * Copies the given properties to our props member variable,
 * and returns 'this' for chaining.
 *
 * @param 'props' {
 *   format: <one of Characteristic.Formats>,
 *   unit: <one of Characteristic.Units>,
 *   minValue: <minimum value for numeric characteristics>,
 *   maxValue: <maximum value for numeric characteristics>,
 *   minStep: <smallest allowed increment for numeric characteristics>,
 *   perms: array of [Characteristic.Perms] like [Characteristic.Perms.READ, Characteristic.Perms.WRITE]
 * }
 */
Characteristic.prototype.setProps = function(props) {
  for (var key in (props || {}))
    if (Object.prototype.hasOwnProperty.call(props, key))
      this.props[key] = props[key];
  return this;
}

Characteristic.prototype.getValue = function(callback, context, connectionID) {
  
  if (this.listeners('get').length > 0) {
    
    // allow a listener to handle the fetching of this value, and wait for completion
    this.emit('get', once(function(err, newValue) {
      
      if (err) {
        // pass the error along to our callback
        if (callback) callback(err);
      }
      else {
        if (newValue === undefined || newValue === null)
          newValue = this.getDefaultValue();

        // getting the value was a success; we can pass it along and also update our cached value
        var oldValue = this.value;
        this.value = newValue;
        if (callback) callback(null, newValue);
        
        // emit a change event if necessary
        if (oldValue !== newValue)
          this.emit('change', { oldValue:oldValue, newValue:newValue, context:context });
      }
    
    }.bind(this)), context, connectionID);
  }
  else {
    
    // no one is listening to the 'get' event, so just return the cached value
    if (callback)
      callback(null, this.value);
  }
}

Characteristic.prototype.setValue = function(newValue, callback, context, connectionID) {

  if (this.listeners('set').length > 0) {
    
    // allow a listener to handle the setting of this value, and wait for completion
    this.emit('set', newValue, once(function(err) {
      
      if (err) {
        // pass the error along to our callback
        if (callback) callback(err);
      }
      else {
        if (newValue === undefined || newValue === null)
          newValue = this.getDefaultValue();
        // setting the value was a success; so we can cache it now
        var oldValue = this.value;
        this.value = newValue;
        if (callback) callback();

        if (oldValue !== newValue)
          this.emit('change', { oldValue:oldValue, newValue:newValue, context:context });
      }
    
    }.bind(this)), context, connectionID);
    
  }
  else {
    if (newValue === undefined || newValue === null)
      newValue = this.getDefaultValue();
    // no one is listening to the 'set' event, so just assign the value blindly
    var oldValue = this.value;
    this.value = newValue;
    if (callback) callback();

    if (oldValue !== newValue)
      this.emit('change', { oldValue:oldValue, newValue:newValue, context:context });
  }
  
  return this; // for chaining
}

Characteristic.prototype.updateValue = function(newValue, callback, context) {

  if (newValue === undefined || newValue === null)
    newValue = this.getDefaultValue();
    // no one is listening to the 'set' event, so just assign the value blindly
  var oldValue = this.value;
  this.value = newValue;
  if (callback) callback();

  if (oldValue !== newValue)
    this.emit('change', { oldValue:oldValue, newValue:newValue, context:context });
  return this; // for chaining
}

Characteristic.prototype.getDefaultValue = function() {
  switch (this.props.format) {
    case Characteristic.Formats.BOOL: return false;
    case Characteristic.Formats.STRING: return "";
    case Characteristic.Formats.ARRAY: return []; // who knows!
    case Characteristic.Formats.DICTIONARY: return {}; // who knows!
    case Characteristic.Formats.DATA: return ""; // who knows!
    case Characteristic.Formats.TLV8: return ""; // who knows!
    default: return this.props.minValue || 0;
  }
}

Characteristic.prototype._assignID = function(identifierCache, accessoryName, serviceUUID, serviceSubtype) {
  
  // generate our IID based on our UUID
  this.iid = identifierCache.getIID(accessoryName, serviceUUID, serviceSubtype, this.UUID);
}

/**
 * Returns a JSON representation of this Accessory suitable for delivering to HAP clients.
 */
Characteristic.prototype.toHAP = function(opt) {

  // ensure our value fits within our constraints if present
  var value = this.value;
  if (this.props.minValue != null && value < this.props.minValue) value = this.props.minValue;
  if (this.props.maxValue != null && value > this.props.maxValue) value = this.props.maxValue;
  if (this.props.format != null) {
    if (this.props.format === Characteristic.Formats.INT)
      value = parseInt(value);
    else if (this.props.format === Characteristic.Formats.UINT8)
      value = parseInt(value);
    else if (this.props.format === Characteristic.Formats.UINT16)
      value = parseInt(value);
    else if (this.props.format === Characteristic.Formats.UINT32)
      value = parseInt(value);
    else if (this.props.format === Characteristic.Formats.UINT64)
      value = parseInt(value);
    else if (this.props.format === Characteristic.Formats.FLOAT) {
      value = parseFloat(value);
      if (this.props.minStep != null) {
        var pow = Math.pow(10, decimalPlaces(this.props.minStep));
        value = Math.round(value * pow) / pow;
      }
    }
  }
  
  var hap = {
    iid: this.iid,
    type: this.UUID,
    perms: this.props.perms,
    format: this.props.format,
    value: value,
    description: this.displayName
    
    // These properties used to be sent but do not seem to be used:
    //
    // events: false,
    // bonjour: false
  };

  if (this.props.validValues != null && this.props.validValues.length > 0) {
    hap['valid-values'] = this.props.validValues;
  }

  if (this.props.validValueRanges != null && this.props.validValueRanges.length > 0 && !(this.props.validValueRanges.length & 1)) {
    hap['valid-values-range'] = this.props.validValueRanges;
  }

  // extra properties
  if (this.props.unit != null) hap.unit = this.props.unit;
  if (this.props.maxValue != null) hap.maxValue = this.props.maxValue;
  if (this.props.minValue != null) hap.minValue = this.props.minValue;
  if (this.props.minStep != null) hap.minStep = this.props.minStep;

  // add maxLen if string length is > 64 bytes and trim to max 256 bytes
  if (this.props.format === Characteristic.Formats.STRING) {
    var str = new Buffer(value, 'utf8'),
        len = str.byteLength;
    if (len > 256) { // 256 bytes is the max allowed length
      hap.value = str.toString('utf8', 0, 256);
      hap.maxLen = 256;
    } else if (len > 64) { // values below can be ommited
      hap.maxLen = len;
    }
  }

  // if we're not readable, omit the "value" property - otherwise iOS will complain about non-compliance
  if (this.props.perms.indexOf(Characteristic.Perms.READ) == -1)
    delete hap.value;

  // delete the "value" property anyway if we were asked to
  if (opt && opt.omitValues)
    delete hap.value;

  return hap;
}

// Mike Samuel
// http://stackoverflow.com/questions/10454518/javascript-how-to-retrieve-the-number-of-decimals-of-a-string-number
function decimalPlaces(num) {
  var match = (''+num).match(/(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/);
  if (!match) { return 0; }
  return Math.max(
       0,
       // Number of digits right of decimal point.
       (match[1] ? match[1].length : 0)
       // Adjust for scientific notation.
       - (match[2] ? +match[2] : 0));
}



/**
 * Characteristic "Accessory Flags"
 */

Characteristic.AccessoryFlags = function() {
  Characteristic.call(this, 'Accessory Flags', '000000A6-0000-1000-8000-0026BB765291');
  this.setProps({
    format: Characteristic.Formats.UINT32,
    perms: [Characteristic.Perms.READ, Characteristic.Perms.NOTIFY]
  });
  this.value = this.getDefaultValue();
};

util.inherits(Characteristic.AccessoryFlags, Characteristic);

Characteristic.AccessoryFlags.UUID = '000000A6-0000-1000-8000-0026BB765291';

/**
 * Characteristic "Active"
 */

Characteristic.Active = function() {
  Characteristic.call(this, 'Active', '000000B0-0000-1000-8000-0026BB765291');
  this.setProps({
    format: Characteristic.Formats.UINT8,
    perms: [Characteristic.Perms.READ, Characteristic.Perms.WRITE, Characteristic.Perms.NOTIFY]
  });
  this.value = this.getDefaultValue();
};

util.inherits(Characteristic.Active, Characteristic);

Characteristic.Active.UUID = '000000B0-0000-1000-8000-0026BB765291';

// The value property of Active must be one of the following:
Characteristic.Active.INACTIVE = 0;
Characteristic.Active.ACTIVE = 1;

/**
 * Characteristic "Administrator Only Access"
 */

Characteristic.AdministratorOnlyAccess = function() {
  Characteristic.call(this, 'Administrator Only Access', '00000001-0000-1000-8000-0026BB765291');
  this.setProps({
    format: Characteristic.Formats.BOOL,
    perms: [Characteristic.Perms.READ, Characteristic.Perms.WRITE, Characteristic.Perms.NOTIFY]
  });
  this.value = this.getDefaultValue();
};

util.inherits(Characteristic.AdministratorOnlyAccess, Characteristic);

Characteristic.AdministratorOnlyAccess.UUID = '00000001-0000-1000-8000-0026BB765291';

/**
 * Characteristic "Air Particulate Density"
 */

Characteristic.AirParticulateDensity = function() {
  Characteristic.call(this, 'Air Particulate Density', '00000064-0000-1000-8000-0026BB765291');
  this.setProps({
    format: Characteristic.Formats.FLOAT,
    maxValue: 1000,
    minValue: 0,
    minStep: 1,
    perms: [Characteristic.Perms.READ, Characteristic.Perms.NOTIFY]
  });
  this.value = this.getDefaultValue();
};

util.inherits(Characteristic.AirParticulateDensity, Characteristic);

Characteristic.AirParticulateDensity.UUID = '00000064-0000-1000-8000-0026BB765291';

/**
 * Characteristic "Air Particulate Size"
 */

Characteristic.AirParticulateSize = function() {
  Characteristic.call(this, 'Air Particulate Size', '00000065-0000-1000-8000-0026BB765291');
  this.setProps({
    format: Characteristic.Formats.UINT8,
    perms: [Characteristic.Perms.READ, Characteristic.Perms.NOTIFY]
  });
  this.value = this.getDefaultValue();
};

util.inherits(Characteristic.AirParticulateSize, Characteristic);

Characteristic.AirParticulateSize.UUID = '00000065-0000-1000-8000-0026BB765291';

// The value property of AirParticulateSize must be one of the following:
Characteristic.AirParticulateSize._2_5_M = 0;
Characteristic.AirParticulateSize._10_M = 1;

/**
 * Characteristic "Air Quality"
 */

Characteristic.AirQuality = function() {
  Characteristic.call(this, 'Air Quality', '00000095-0000-1000-8000-0026BB765291');
  this.setProps({
    format: Characteristic.Formats.UINT8,
    perms: [Characteristic.Perms.READ, Characteristic.Perms.NOTIFY]
  });
  this.value = this.getDefaultValue();
};

util.inherits(Characteristic.AirQuality, Characteristic);

Characteristic.AirQuality.UUID = '00000095-0000-1000-8000-0026BB765291';

// The value property of AirQuality must be one of the following:
Characteristic.AirQuality.UNKNOWN = 0;
Characteristic.AirQuality.EXCELLENT = 1;
Characteristic.AirQuality.GOOD = 2;
Characteristic.AirQuality.FAIR = 3;
Characteristic.AirQuality.INFERIOR = 4;
Characteristic.AirQuality.POOR = 5;

/**
 * Characteristic "App Matching Identifier"
 */

Characteristic.AppMatchingIdentifier = function() {
  Characteristic.call(this, 'App Matching Identifier', '000000A4-0000-1000-8000-0026BB765291');
  this.setProps({
    format: Characteristic.Formats.TLV8,
    perms: [Characteristic.Perms.READ]
  });
  this.value = this.getDefaultValue();
};

util.inherits(Characteristic.AppMatchingIdentifier, Characteristic);

Characteristic.AppMatchingIdentifier.UUID = '000000A4-0000-1000-8000-0026BB765291';

/**
 * Characteristic "Audio Feedback"
 */

Characteristic.AudioFeedback = function() {
  Characteristic.call(this, 'Audio Feedback', '00000005-0000-1000-8000-0026BB765291');
  this.setProps({
    format: Characteristic.Formats.BOOL,
    perms: [Characteristic.Perms.READ, Characteristic.Perms.WRITE, Characteristic.Perms.NOTIFY]
  });
  this.value = this.getDefaultValue();
};

util.inherits(Characteristic.AudioFeedback, Characteristic);

Characteristic.AudioFeedback.UUID = '00000005-0000-1000-8000-0026BB765291';

/**
 * Characteristic "Battery Level"
 */

Characteristic.BatteryLevel = function() {
  Characteristic.call(this, 'Battery Level', '00000068-0000-1000-8000-0026BB765291');
  this.setProps({
    format: Characteristic.Formats.UINT8,
    unit: Characteristic.Units.PERCENTAGE,
    maxValue: 100,
    minValue: 0,
    minStep: 1,
    perms: [Characteristic.Perms.READ, Characteristic.Perms.NOTIFY]
  });
  this.value = this.getDefaultValue();
};

util.inherits(Characteristic.BatteryLevel, Characteristic);

Characteristic.BatteryLevel.UUID = '00000068-0000-1000-8000-0026BB765291';

/**
 * Characteristic "Brightness"
 */

Characteristic.Brightness = function() {
  Characteristic.call(this, 'Brightness', '00000008-0000-1000-8000-0026BB765291');
  this.setProps({
    format: Characteristic.Formats.INT,
    unit: Characteristic.Units.PERCENTAGE,
    maxValue: 100,
    minValue: 0,
    minStep: 1,
    perms: [Characteristic.Perms.READ, Characteristic.Perms.WRITE, Characteristic.Perms.NOTIFY]
  });
  this.value = this.getDefaultValue();
};

util.inherits(Characteristic.Brightness, Characteristic);

Characteristic.Brightness.UUID = '00000008-0000-1000-8000-0026BB765291';

/**
 * Characteristic "Carbon Dioxide Detected"
 */

Characteristic.CarbonDioxideDetected = function() {
  Characteristic.call(this, 'Carbon Dioxide Detected', '00000092-0000-1000-8000-0026BB765291');
  this.setProps({
    format: Characteristic.Formats.UINT8,
    perms: [Characteristic.Perms.READ, Characteristic.Perms.NOTIFY]
  });
  this.value = this.getDefaultValue();
};

util.inherits(Characteristic.CarbonDioxideDetected, Characteristic);

Characteristic.CarbonDioxideDetected.UUID = '00000092-0000-1000-8000-0026BB765291';

// The value property of CarbonDioxideDetected must be one of the following:
Characteristic.CarbonDioxideDetected.CO2_LEVELS_NORMAL = 0;
Characteristic.CarbonDioxideDetected.CO2_LEVELS_ABNORMAL = 1;

/**
 * Characteristic "Carbon Dioxide Level"
 */

Characteristic.CarbonDioxideLevel = function() {
  Characteristic.call(this, 'Carbon Dioxide Level', '00000093-0000-1000-8000-0026BB765291');
  this.setProps({
    format: Characteristic.Formats.FLOAT,
    maxValue: 100000,
    minValue: 0,
    minStep: 100,
    perms: [Characteristic.Perms.READ, Characteristic.Perms.NOTIFY]
  });
  this.value = this.getDefaultValue();
};

util.inherits(Characteristic.CarbonDioxideLevel, Characteristic);

Characteristic.CarbonDioxideLevel.UUID = '00000093-0000-1000-8000-0026BB765291';

/**
 * Characteristic "Carbon Dioxide Peak Level"
 */

Characteristic.CarbonDioxidePeakLevel = function() {
  Characteristic.call(this, 'Carbon Dioxide Peak Level', '00000094-0000-1000-8000-0026BB765291');
  this.setProps({
    format: Characteristic.Formats.FLOAT,
    maxValue: 100000,
    minValue: 0,
    minStep: 100,
    perms: [Characteristic.Perms.READ, Characteristic.Perms.NOTIFY]
  });
  this.value = this.getDefaultValue();
};

util.inherits(Characteristic.CarbonDioxidePeakLevel, Characteristic);

Characteristic.CarbonDioxidePeakLevel.UUID = '00000094-0000-1000-8000-0026BB765291';

/**
 * Characteristic "Carbon Monoxide Detected"
 */

Characteristic.CarbonMonoxideDetected = function() {
  Characteristic.call(this, 'Carbon Monoxide Detected', '00000069-0000-1000-8000-0026BB765291');
  this.setProps({
    format: Characteristic.Formats.UINT8,
    perms: [Characteristic.Perms.READ, Characteristic.Perms.NOTIFY]
  });
  this.value = this.getDefaultValue();
};

util.inherits(Characteristic.CarbonMonoxideDetected, Characteristic);

Characteristic.CarbonMonoxideDetected.UUID = '00000069-0000-1000-8000-0026BB765291';

// The value property of CarbonMonoxideDetected must be one of the following:
Characteristic.CarbonMonoxideDetected.CO_LEVELS_NORMAL = 0;
Characteristic.CarbonMonoxideDetected.CO_LEVELS_ABNORMAL = 1;

/**
 * Characteristic "Carbon Monoxide Level"
 */

Characteristic.CarbonMonoxideLevel = function() {
  Characteristic.call(this, 'Carbon Monoxide Level', '00000090-0000-1000-8000-0026BB765291');
  this.setProps({
    format: Characteristic.Formats.FLOAT,
    maxValue: 100,
    minValue: 0,
    minStep: 0.1,
    perms: [Characteristic.Perms.READ, Characteristic.Perms.NOTIFY]
  });
  this.value = this.getDefaultValue();
};

util.inherits(Characteristic.CarbonMonoxideLevel, Characteristic);

Characteristic.CarbonMonoxideLevel.UUID = '00000090-0000-1000-8000-0026BB765291';

/**
 * Characteristic "Carbon Monoxide Peak Level"
 */

Characteristic.CarbonMonoxidePeakLevel = function() {
  Characteristic.call(this, 'Carbon Monoxide Peak Level', '00000091-0000-1000-8000-0026BB765291');
  this.setProps({
    format: Characteristic.Formats.FLOAT,
    maxValue: 100,
    minValue: 0,
    minStep: 0.1,
    perms: [Characteristic.Perms.READ, Characteristic.Perms.NOTIFY]
  });
  this.value = this.getDefaultValue();
};

util.inherits(Characteristic.CarbonMonoxidePeakLevel, Characteristic);

Characteristic.CarbonMonoxidePeakLevel.UUID = '00000091-0000-1000-8000-0026BB765291';

/**
 * Characteristic "Charging State"
 */

Characteristic.ChargingState = function() {
  Characteristic.call(this, 'Charging State', '0000008F-0000-1000-8000-0026BB765291');
  this.setProps({
    format: Characteristic.Formats.UINT8,
    maxValue: 2,
    perms: [Characteristic.Perms.READ, Characteristic.Perms.NOTIFY]
  });
  this.value = this.getDefaultValue();
};

util.inherits(Characteristic.ChargingState, Characteristic);

Characteristic.ChargingState.UUID = '0000008F-0000-1000-8000-0026BB765291';

// The value property of ChargingState must be one of the following:
Characteristic.ChargingState.NOT_CHARGING = 0;
Characteristic.ChargingState.CHARGING = 1;
Characteristic.ChargingState.NOT_CHARGEABLE = 2;

/**
 * Characteristic "Contact Sensor State"
 */

Characteristic.ContactSensorState = function() {
  Characteristic.call(this, 'Contact Sensor State', '0000006A-0000-1000-8000-0026BB765291');
  this.setProps({
    format: Characteristic.Formats.UINT8,
    perms: [Characteristic.Perms.READ, Characteristic.Perms.NOTIFY]
  });
  this.value = this.getDefaultValue();
};

util.inherits(Characteristic.ContactSensorState, Characteristic);

Characteristic.ContactSensorState.UUID = '0000006A-0000-1000-8000-0026BB765291';

// The value property of ContactSensorState must be one of the following:
Characteristic.ContactSensorState.CONTACT_DETECTED = 0;
Characteristic.ContactSensorState.CONTACT_NOT_DETECTED = 1;

/**
 * Characteristic "Cooling Threshold Temperature"
 */

Characteristic.CoolingThresholdTemperature = function() {
  Characteristic.call(this, 'Cooling Threshold Temperature', '0000000D-0000-1000-8000-0026BB765291');
  this.setProps({
    format: Characteristic.Formats.FLOAT,
    unit: Characteristic.Units.CELSIUS,
    maxValue: 35,
    minValue: 10,
    minStep: 0.1,
    perms: [Characteristic.Perms.READ, Characteristic.Perms.WRITE, Characteristic.Perms.NOTIFY]
  });
  this.value = this.getDefaultValue();
};

util.inherits(Characteristic.CoolingThresholdTemperature, Characteristic);

Characteristic.CoolingThresholdTemperature.UUID = '0000000D-0000-1000-8000-0026BB765291';

/**
 * Characteristic "Current Air Purifier State"
 */

Characteristic.CurrentAirPurifierState = function() {
  Characteristic.call(this, 'Current Air Purifier State', '000000A9-0000-1000-8000-0026BB765291');
  this.setProps({
    format: Characteristic.Formats.UINT8,
    perms: [Characteristic.Perms.READ, Characteristic.Perms.NOTIFY]
  });
  this.value = this.getDefaultValue();
};

util.inherits(Characteristic.CurrentAirPurifierState, Characteristic);

Characteristic.CurrentAirPurifierState.UUID = '000000A9-0000-1000-8000-0026BB765291';

// The value property of CurrentAirPurifierState must be one of the following:
Characteristic.CurrentAirPurifierState.INACTIVE = 0;
Characteristic.CurrentAirPurifierState.IDLE = 1;
Characteristic.CurrentAirPurifierState.PURIFYING_AIR = 2;

/**
 * Characteristic "Current Ambient Light Level"
 */

Characteristic.CurrentAmbientLightLevel = function() {
  Characteristic.call(this, 'Current Ambient Light Level', '0000006B-0000-1000-8000-0026BB765291');
  this.setProps({
    format: Characteristic.Formats.FLOAT,
    unit: Characteristic.Units.LUX,
    maxValue: 100000,
    minValue: 0.0001,
    minStep: 0.0001,
    perms: [Characteristic.Perms.READ, Characteristic.Perms.NOTIFY]
  });
  this.value = this.getDefaultValue();
};

util.inherits(Characteristic.CurrentAmbientLightLevel, Characteristic);

Characteristic.CurrentAmbientLightLevel.UUID = '0000006B-0000-1000-8000-0026BB765291';

/**
 * Characteristic "Current Door State"
 */

Characteristic.CurrentDoorState = function() {
  Characteristic.call(this, 'Current Door State', '0000000E-0000-1000-8000-0026BB765291');
  this.setProps({
    format: Characteristic.Formats.UINT8,
    perms: [Characteristic.Perms.READ, Characteristic.Perms.NOTIFY]
  });
  this.value = this.getDefaultValue();
};

util.inherits(Characteristic.CurrentDoorState, Characteristic);

Characteristic.CurrentDoorState.UUID = '0000000E-0000-1000-8000-0026BB765291';

// The value property of CurrentDoorState must be one of the following:
Characteristic.CurrentDoorState.OPEN = 0;
Characteristic.CurrentDoorState.CLOSED = 1;
Characteristic.CurrentDoorState.OPENING = 2;
Characteristic.CurrentDoorState.CLOSING = 3;
Characteristic.CurrentDoorState.STOPPED = 4;

/**
 * Characteristic "Current Fan State"
 */

Characteristic.CurrentFanState = function() {
  Characteristic.call(this, 'Current Fan State', '000000AF-0000-1000-8000-0026BB765291');
  this.setProps({
    format: Characteristic.Formats.UINT8,
    perms: [Characteristic.Perms.READ, Characteristic.Perms.NOTIFY]
  });
  this.value = this.getDefaultValue();
};

util.inherits(Characteristic.CurrentFanState, Characteristic);

Characteristic.CurrentFanState.UUID = '000000AF-0000-1000-8000-0026BB765291';

// The value property of CurrentFanState must be one of the following:
Characteristic.CurrentFanState.INACTIVE = 0;
Characteristic.CurrentFanState.IDLE = 1;
Characteristic.CurrentFanState.BLOWING_AIR = 2;

/**
 * Characteristic "Current Heater Cooler State"
 */

Characteristic.CurrentHeaterCoolerState = function() {
  Characteristic.call(this, 'Current Heater Cooler State', '000000B1-0000-1000-8000-0026BB765291');
  this.setProps({
    format: Characteristic.Formats.UINT8,
    perms: [Characteristic.Perms.READ, Characteristic.Perms.NOTIFY]
  });
  this.value = this.getDefaultValue();
};

util.inherits(Characteristic.CurrentHeaterCoolerState, Characteristic);

Characteristic.CurrentHeaterCoolerState.UUID = '000000B1-0000-1000-8000-0026BB765291';

// The value property of CurrentHeaterCoolerState must be one of the following:
Characteristic.CurrentHeaterCoolerState.INACTIVE = 0;
Characteristic.CurrentHeaterCoolerState.IDLE = 1;
Characteristic.CurrentHeaterCoolerState.HEATING = 2;
Characteristic.CurrentHeaterCoolerState.COOLING = 3;

/**
 * Characteristic "Current Heating Cooling State"
 */

Characteristic.CurrentHeatingCoolingState = function() {
  Characteristic.call(this, 'Current Heating Cooling State', '0000000F-0000-1000-8000-0026BB765291');
  this.setProps({
    format: Characteristic.Formats.UINT8,
    perms: [Characteristic.Perms.READ, Characteristic.Perms.NOTIFY]
  });
  this.value = this.getDefaultValue();
};

util.inherits(Characteristic.CurrentHeatingCoolingState, Characteristic);

Characteristic.CurrentHeatingCoolingState.UUID = '0000000F-0000-1000-8000-0026BB765291';

// The value property of CurrentHeatingCoolingState must be one of the following:
Characteristic.CurrentHeatingCoolingState.OFF = 0;
Characteristic.CurrentHeatingCoolingState.HEAT = 1;
Characteristic.CurrentHeatingCoolingState.COOL = 2;

/**
 * Characteristic "Current Horizontal Tilt Angle"
 */

Characteristic.CurrentHorizontalTiltAngle = function() {
  Characteristic.call(this, 'Current Horizontal Tilt Angle', '0000006C-0000-1000-8000-0026BB765291');
  this.setProps({
    format: Characteristic.Formats.INT,
    unit: Characteristic.Units.ARC_DEGREE,
    maxValue: 90,
    minValue: -90,
    minStep: 1,
    perms: [Characteristic.Perms.READ, Characteristic.Perms.NOTIFY]
  });
  this.value = this.getDefaultValue();
};

util.inherits(Characteristic.CurrentHorizontalTiltAngle, Characteristic);

Characteristic.CurrentHorizontalTiltAngle.UUID = '0000006C-0000-1000-8000-0026BB765291';

/**
 * Characteristic "Current Humidifier Dehumidifier State"
 */

Characteristic.CurrentHumidifierDehumidifierState = function() {
  Characteristic.call(this, 'Current Humidifier Dehumidifier State', '000000B3-0000-1000-8000-0026BB765291');
  this.setProps({
    format: Characteristic.Formats.UINT8,
    perms: [Characteristic.Perms.READ, Characteristic.Perms.NOTIFY]
  });
  this.value = this.getDefaultValue();
};

util.inherits(Characteristic.CurrentHumidifierDehumidifierState, Characteristic);

Characteristic.CurrentHumidifierDehumidifierState.UUID = '000000B3-0000-1000-8000-0026BB765291';

// The value property of CurrentHumidifierDehumidifierState must be one of the following:
Characteristic.CurrentHumidifierDehumidifierState.INACTIVE = 0;
Characteristic.CurrentHumidifierDehumidifierState.IDLE = 1;
Characteristic.CurrentHumidifierDehumidifierState.HUMIDIFYING = 2;
Characteristic.CurrentHumidifierDehumidifierState.DEHUMIDIFYING = 3;

/**
 * Characteristic "Current Position"
 */

Characteristic.CurrentPosition = function() {
  Characteristic.call(this, 'Current Position', '0000006D-0000-1000-8000-0026BB765291');
  this.setProps({
    format: Characteristic.Formats.UINT8,
    unit: Characteristic.Units.PERCENTAGE,
    maxValue: 100,
    minValue: 0,
    minStep: 1,
    perms: [Characteristic.Perms.READ, Characteristic.Perms.NOTIFY]
  });
  this.value = this.getDefaultValue();
};

util.inherits(Characteristic.CurrentPosition, Characteristic);

Characteristic.CurrentPosition.UUID = '0000006D-0000-1000-8000-0026BB765291';

/**
 * Characteristic "Current Relative Humidity"
 */

Characteristic.CurrentRelativeHumidity = function() {
  Characteristic.call(this, 'Current Relative Humidity', '00000010-0000-1000-8000-0026BB765291');
  this.setProps({
    format: Characteristic.Formats.FLOAT,
    unit: Characteristic.Units.PERCENTAGE,
    maxValue: 100,
    minValue: 0,
    minStep: 1,
    perms: [Characteristic.Perms.READ, Characteristic.Perms.NOTIFY]
  });
  this.value = this.getDefaultValue();
};

util.inherits(Characteristic.CurrentRelativeHumidity, Characteristic);

Characteristic.CurrentRelativeHumidity.UUID = '00000010-0000-1000-8000-0026BB765291';

/**
 * Characteristic "Current Slat State"
 */

Characteristic.CurrentSlatState = function() {
  Characteristic.call(this, 'Current Slat State', '000000AA-0000-1000-8000-0026BB765291');
  this.setProps({
    format: Characteristic.Formats.UINT8,
    perms: [Characteristic.Perms.READ, Characteristic.Perms.NOTIFY]
  });
  this.value = this.getDefaultValue();
};

util.inherits(Characteristic.CurrentSlatState, Characteristic);

Characteristic.CurrentSlatState.UUID = '000000AA-0000-1000-8000-0026BB765291';

// The value property of CurrentSlatState must be one of the following:
Characteristic.CurrentSlatState.FIXED = 0;
Characteristic.CurrentSlatState.JAMMED = 1;
Characteristic.CurrentSlatState.SWINGING = 2;

/**
 * Characteristic "Current Temperature"
 */

Characteristic.CurrentTemperature = function() {
  Characteristic.call(this, 'Current Temperature', '00000011-0000-1000-8000-0026BB765291');
  this.setProps({
    format: Characteristic.Formats.FLOAT,
    unit: Characteristic.Units.CELSIUS,
    maxValue: 100,
    minValue: 0,
    minStep: 0.1,
    perms: [Characteristic.Perms.READ, Characteristic.Perms.NOTIFY]
  });
  this.value = this.getDefaultValue();
};

util.inherits(Characteristic.CurrentTemperature, Characteristic);

Characteristic.CurrentTemperature.UUID = '00000011-0000-1000-8000-0026BB765291';

/**
 * Characteristic "Current Tilt Angle"
 */

Characteristic.CurrentTiltAngle = function() {
  Characteristic.call(this, 'Current Tilt Angle', '000000C1-0000-1000-8000-0026BB765291');
  this.setProps({
    format: Characteristic.Formats.INT,
    unit: Characteristic.Units.ARC_DEGREE,
    maxValue: 90,
    minValue: -90,
    minStep: 1,
    perms: [Characteristic.Perms.READ, Characteristic.Perms.NOTIFY]
  });
  this.value = this.getDefaultValue();
};

util.inherits(Characteristic.CurrentTiltAngle, Characteristic);

Characteristic.CurrentTiltAngle.UUID = '000000C1-0000-1000-8000-0026BB765291';

/**
 * Characteristic "Current Vertical Tilt Angle"
 */

Characteristic.CurrentVerticalTiltAngle = function() {
  Characteristic.call(this, 'Current Vertical Tilt Angle', '0000006E-0000-1000-8000-0026BB765291');
  this.setProps({
    format: Characteristic.Formats.INT,
    unit: Characteristic.Units.ARC_DEGREE,
    maxValue: 90,
    minValue: -90,
    minStep: 1,
    perms: [Characteristic.Perms.READ, Characteristic.Perms.NOTIFY]
  });
  this.value = this.getDefaultValue();
};

util.inherits(Characteristic.CurrentVerticalTiltAngle, Characteristic);

Characteristic.CurrentVerticalTiltAngle.UUID = '0000006E-0000-1000-8000-0026BB765291';

/**
 * Characteristic "Digital Zoom"
 */

Characteristic.DigitalZoom = function() {
  Characteristic.call(this, 'Digital Zoom', '0000011D-0000-1000-8000-0026BB765291');
  this.setProps({
    format: Characteristic.Formats.FLOAT,
    perms: [Characteristic.Perms.READ, Characteristic.Perms.WRITE, Characteristic.Perms.NOTIFY]
  });
  this.value = this.getDefaultValue();
};

util.inherits(Characteristic.DigitalZoom, Characteristic);

Characteristic.DigitalZoom.UUID = '0000011D-0000-1000-8000-0026BB765291';

/**
 * Characteristic "Filter Change Indication"
 */

Characteristic.FilterChangeIndication = function() {
  Characteristic.call(this, 'Filter Change Indication', '000000AC-0000-1000-8000-0026BB765291');
  this.setProps({
    format: Characteristic.Formats.UINT8,
    perms: [Characteristic.Perms.READ, Characteristic.Perms.NOTIFY]
  });
  this.value = this.getDefaultValue();
};

util.inherits(Characteristic.FilterChangeIndication, Characteristic);

Characteristic.FilterChangeIndication.UUID = '000000AC-0000-1000-8000-0026BB765291';

// The value property of FilterChangeIndication must be one of the following:
Characteristic.FilterChangeIndication.FILTER_OK = 0;
Characteristic.FilterChangeIndication.CHANGE_FILTER = 1;

/**
 * Characteristic "Filter Life Level"
 */

Characteristic.FilterLifeLevel = function() {
  Characteristic.call(this, 'Filter Life Level', '000000AB-0000-1000-8000-0026BB765291');
  this.setProps({
    format: Characteristic.Formats.FLOAT,
    maxValue: 100,
    minValue: 0,
    perms: [Characteristic.Perms.READ, Characteristic.Perms.NOTIFY]
  });
  this.value = this.getDefaultValue();
};

util.inherits(Characteristic.FilterLifeLevel, Characteristic);

Characteristic.FilterLifeLevel.UUID = '000000AB-0000-1000-8000-0026BB765291';

/**
 * Characteristic "Firmware Revision"
 */

Characteristic.FirmwareRevision = function() {
  Characteristic.call(this, 'Firmware Revision', '00000052-0000-1000-8000-0026BB765291');
  this.setProps({
    format: Characteristic.Formats.STRING,
    perms: [Characteristic.Perms.READ]
  });
  this.value = this.getDefaultValue();
};

util.inherits(Characteristic.FirmwareRevision, Characteristic);

Characteristic.FirmwareRevision.UUID = '00000052-0000-1000-8000-0026BB765291';

/**
 * Characteristic "Hardware Revision"
 */

Characteristic.HardwareRevision = function() {
  Characteristic.call(this, 'Hardware Revision', '00000053-0000-1000-8000-0026BB765291');
  this.setProps({
    format: Characteristic.Formats.STRING,
    perms: [Characteristic.Perms.READ]
  });
  this.value = this.getDefaultValue();
};

util.inherits(Characteristic.HardwareRevision, Characteristic);

Characteristic.HardwareRevision.UUID = '00000053-0000-1000-8000-0026BB765291';

/**
 * Characteristic "Heating Threshold Temperature"
 */

Characteristic.HeatingThresholdTemperature = function() {
  Characteristic.call(this, 'Heating Threshold Temperature', '00000012-0000-1000-8000-0026BB765291');
  this.setProps({
    format: Characteristic.Formats.FLOAT,
    unit: Characteristic.Units.CELSIUS,
    maxValue: 25,
    minValue: 0,
    minStep: 0.1,
    perms: [Characteristic.Perms.READ, Characteristic.Perms.WRITE, Characteristic.Perms.NOTIFY]
  });
  this.value = this.getDefaultValue();
};

util.inherits(Characteristic.HeatingThresholdTemperature, Characteristic);

Characteristic.HeatingThresholdTemperature.UUID = '00000012-0000-1000-8000-0026BB765291';

/**
 * Characteristic "Hold Position"
 */

Characteristic.HoldPosition = function() {
  Characteristic.call(this, 'Hold Position', '0000006F-0000-1000-8000-0026BB765291');
  this.setProps({
    format: Characteristic.Formats.BOOL,
    perms: [Characteristic.Perms.WRITE]
  });
  this.value = this.getDefaultValue();
};

util.inherits(Characteristic.HoldPosition, Characteristic);

Characteristic.HoldPosition.UUID = '0000006F-0000-1000-8000-0026BB765291';

/**
 * Characteristic "Hue"
 */

Characteristic.Hue = function() {
  Characteristic.call(this, 'Hue', '00000013-0000-1000-8000-0026BB765291');
  this.setProps({
    format: Characteristic.Formats.FLOAT,
    unit: Characteristic.Units.ARC_DEGREE,
    maxValue: 360,
    minValue: 0,
    minStep: 1,
    perms: [Characteristic.Perms.READ, Characteristic.Perms.WRITE, Characteristic.Perms.NOTIFY]
  });
  this.value = this.getDefaultValue();
};

util.inherits(Characteristic.Hue, Characteristic);

Characteristic.Hue.UUID = '00000013-0000-1000-8000-0026BB765291';

/**
 * Characteristic "Identify"
 */

Characteristic.Identify = function() {
  Characteristic.call(this, 'Identify', '00000014-0000-1000-8000-0026BB765291');
  this.setProps({
    format: Characteristic.Formats.BOOL,
    perms: [Characteristic.Perms.WRITE]
  });
  this.value = this.getDefaultValue();
};

util.inherits(Characteristic.Identify, Characteristic);

Characteristic.Identify.UUID = '00000014-0000-1000-8000-0026BB765291';

/**
 * Characteristic "Image Mirroring"
 */

Characteristic.ImageMirroring = function() {
  Characteristic.call(this, 'Image Mirroring', '0000011F-0000-1000-8000-0026BB765291');
  this.setProps({
    format: Characteristic.Formats.BOOL,
    perms: [Characteristic.Perms.READ, Characteristic.Perms.WRITE, Characteristic.Perms.NOTIFY]
  });
  this.value = this.getDefaultValue();
};

util.inherits(Characteristic.ImageMirroring, Characteristic);

Characteristic.ImageMirroring.UUID = '0000011F-0000-1000-8000-0026BB765291';

/**
 * Characteristic "Image Rotation"
 */

Characteristic.ImageRotation = function() {
  Characteristic.call(this, 'Image Rotation', '0000011E-0000-1000-8000-0026BB765291');
  this.setProps({
    format: Characteristic.Formats.FLOAT,
    unit: Characteristic.Units.ARC_DEGREE,
    maxValue: 270,
    minValue: 0,
    minStep: 90,
    perms: [Characteristic.Perms.READ, Characteristic.Perms.WRITE, Characteristic.Perms.NOTIFY]
  });
  this.value = this.getDefaultValue();
};

util.inherits(Characteristic.ImageRotation, Characteristic);

Characteristic.ImageRotation.UUID = '0000011E-0000-1000-8000-0026BB765291';

/**
 * Characteristic "Leak Detected"
 */

Characteristic.LeakDetected = function() {
  Characteristic.call(this, 'Leak Detected', '00000070-0000-1000-8000-0026BB765291');
  this.setProps({
    format: Characteristic.Formats.UINT8,
    perms: [Characteristic.Perms.READ, Characteristic.Perms.NOTIFY]
  });
  this.value = this.getDefaultValue();
};

util.inherits(Characteristic.LeakDetected, Characteristic);

Characteristic.LeakDetected.UUID = '00000070-0000-1000-8000-0026BB765291';

// The value property of LeakDetected must be one of the following:
Characteristic.LeakDetected.LEAK_NOT_DETECTED = 0;
Characteristic.LeakDetected.LEAK_DETECTED = 1;

/**
 * Characteristic "Lock Control Point"
 */

Characteristic.LockControlPoint = function() {
  Characteristic.call(this, 'Lock Control Point', '00000019-0000-1000-8000-0026BB765291');
  this.setProps({
    format: Characteristic.Formats.TLV8,
    perms: [Characteristic.Perms.WRITE]
  });
  this.value = this.getDefaultValue();
};

util.inherits(Characteristic.LockControlPoint, Characteristic);

Characteristic.LockControlPoint.UUID = '00000019-0000-1000-8000-0026BB765291';

/**
 * Characteristic "Lock Current State"
 */

Characteristic.LockCurrentState = function() {
  Characteristic.call(this, 'Lock Current State', '0000001D-0000-1000-8000-0026BB765291');
  this.setProps({
    format: Characteristic.Formats.UINT8,
    perms: [Characteristic.Perms.READ, Characteristic.Perms.NOTIFY]
  });
  this.value = this.getDefaultValue();
};

util.inherits(Characteristic.LockCurrentState, Characteristic);

Characteristic.LockCurrentState.UUID = '0000001D-0000-1000-8000-0026BB765291';

// The value property of LockCurrentState must be one of the following:
Characteristic.LockCurrentState.UNSECURED = 0;
Characteristic.LockCurrentState.SECURED = 1;
Characteristic.LockCurrentState.JAMMED = 2;
Characteristic.LockCurrentState.UNKNOWN = 3;

/**
 * Characteristic "Lock Last Known Action"
 */

Characteristic.LockLastKnownAction = function() {
  Characteristic.call(this, 'Lock Last Known Action', '0000001C-0000-1000-8000-0026BB765291');
  this.setProps({
    format: Characteristic.Formats.UINT8,
    perms: [Characteristic.Perms.READ, Characteristic.Perms.NOTIFY]
  });
  this.value = this.getDefaultValue();
};

util.inherits(Characteristic.LockLastKnownAction, Characteristic);

Characteristic.LockLastKnownAction.UUID = '0000001C-0000-1000-8000-0026BB765291';

// The value property of LockLastKnownAction must be one of the following:
Characteristic.LockLastKnownAction.SECURED_PHYSICALLY_INTERIOR = 0;
Characteristic.LockLastKnownAction.UNSECURED_PHYSICALLY_INTERIOR = 1;
Characteristic.LockLastKnownAction.SECURED_PHYSICALLY_EXTERIOR = 2;
Characteristic.LockLastKnownAction.UNSECURED_PHYSICALLY_EXTERIOR = 3;
Characteristic.LockLastKnownAction.SECURED_BY_KEYPAD = 4;
Characteristic.LockLastKnownAction.UNSECURED_BY_KEYPAD = 5;
Characteristic.LockLastKnownAction.SECURED_REMOTELY = 6;
Characteristic.LockLastKnownAction.UNSECURED_REMOTELY = 7;
Characteristic.LockLastKnownAction.SECURED_BY_AUTO_SECURE_TIMEOUT = 8;

/**
 * Characteristic "Lock Management Auto Security Timeout"
 */

Characteristic.LockManagementAutoSecurityTimeout = function() {
  Characteristic.call(this, 'Lock Management Auto Security Timeout', '0000001A-0000-1000-8000-0026BB765291');
  this.setProps({
    format: Characteristic.Formats.UINT32,
    unit: Characteristic.Units.SECONDS,
    maxValue: 86400,
    minValue: 0,
    minStep: 1,
    perms: [Characteristic.Perms.READ, Characteristic.Perms.WRITE, Characteristic.Perms.NOTIFY]
  });
  this.value = this.getDefaultValue();
};

util.inherits(Characteristic.LockManagementAutoSecurityTimeout, Characteristic);

Characteristic.LockManagementAutoSecurityTimeout.UUID = '0000001A-0000-1000-8000-0026BB765291';

/**
 * Characteristic "Lock Physical Controls"
 */

Characteristic.LockPhysicalControls = function() {
  Characteristic.call(this, 'Lock Physical Controls', '000000A7-0000-1000-8000-0026BB765291');
  this.setProps({
    format: Characteristic.Formats.UINT8,
    perms: [Characteristic.Perms.READ, Characteristic.Perms.WRITE, Characteristic.Perms.NOTIFY]
  });
  this.value = this.getDefaultValue();
};

util.inherits(Characteristic.LockPhysicalControls, Characteristic);

Characteristic.LockPhysicalControls.UUID = '000000A7-0000-1000-8000-0026BB765291';

// The value property of LockPhysicalControls must be one of the following:
Characteristic.LockPhysicalControls.CONTROL_LOCK_DISABLED = 0;
Characteristic.LockPhysicalControls.CONTROL_LOCK_ENABLED = 1;

/**
 * Characteristic "Lock Target State"
 */

Characteristic.LockTargetState = function() {
  Characteristic.call(this, 'Lock Target State', '0000001E-0000-1000-8000-0026BB765291');
  this.setProps({
    format: Characteristic.Formats.UINT8,
    perms: [Characteristic.Perms.READ, Characteristic.Perms.WRITE, Characteristic.Perms.NOTIFY]
  });
  this.value = this.getDefaultValue();
};

util.inherits(Characteristic.LockTargetState, Characteristic);

Characteristic.LockTargetState.UUID = '0000001E-0000-1000-8000-0026BB765291';

// The value property of LockTargetState must be one of the following:
Characteristic.LockTargetState.UNSECURED = 0;
Characteristic.LockTargetState.SECURED = 1;

/**
 * Characteristic "Logs"
 */

Characteristic.Logs = function() {
  Characteristic.call(this, 'Logs', '0000001F-0000-1000-8000-0026BB765291');
  this.setProps({
    format: Characteristic.Formats.TLV8,
    perms: [Characteristic.Perms.READ, Characteristic.Perms.NOTIFY]
  });
  this.value = this.getDefaultValue();
};

util.inherits(Characteristic.Logs, Characteristic);

Characteristic.Logs.UUID = '0000001F-0000-1000-8000-0026BB765291';

/**
 * Characteristic "Manufacturer"
 */

Characteristic.Manufacturer = function() {
  Characteristic.call(this, 'Manufacturer', '00000020-0000-1000-8000-0026BB765291');
  this.setProps({
    format: Characteristic.Formats.STRING,
    perms: [Characteristic.Perms.READ]
  });
  this.value = this.getDefaultValue();
};

util.inherits(Characteristic.Manufacturer, Characteristic);

Characteristic.Manufacturer.UUID = '00000020-0000-1000-8000-0026BB765291';

/**
 * Characteristic "Model"
 */

Characteristic.Model = function() {
  Characteristic.call(this, 'Model', '00000021-0000-1000-8000-0026BB765291');
  this.setProps({
    format: Characteristic.Formats.STRING,
    perms: [Characteristic.Perms.READ]
  });
  this.value = this.getDefaultValue();
};

util.inherits(Characteristic.Model, Characteristic);

Characteristic.Model.UUID = '00000021-0000-1000-8000-0026BB765291';

/**
 * Characteristic "Mute"
 */

Characteristic.Mute = function() {
  Characteristic.call(this, 'Mute', '0000011A-0000-1000-8000-0026BB765291');
  this.setProps({
    format: Characteristic.Formats.BOOL,
    perms: [Characteristic.Perms.READ, Characteristic.Perms.WRITE, Characteristic.Perms.NOTIFY]
  });
  this.value = this.getDefaultValue();
};

util.inherits(Characteristic.Mute, Characteristic);

Characteristic.Mute.UUID = '0000011A-0000-1000-8000-0026BB765291';

/**
 * Characteristic "Motion Detected"
 */

Characteristic.MotionDetected = function() {
  Characteristic.call(this, 'Motion Detected', '00000022-0000-1000-8000-0026BB765291');
  this.setProps({
    format: Characteristic.Formats.BOOL,
    perms: [Characteristic.Perms.READ, Characteristic.Perms.NOTIFY]
  });
  this.value = this.getDefaultValue();
};

util.inherits(Characteristic.MotionDetected, Characteristic);

Characteristic.MotionDetected.UUID = '00000022-0000-1000-8000-0026BB765291';

/**
 * Characteristic "Name"
 */

Characteristic.Name = function() {
  Characteristic.call(this, 'Name', '00000023-0000-1000-8000-0026BB765291');
  this.setProps({
    format: Characteristic.Formats.STRING,
    perms: [Characteristic.Perms.READ]
  });
  this.value = this.getDefaultValue();
};

util.inherits(Characteristic.Name, Characteristic);

Characteristic.Name.UUID = '00000023-0000-1000-8000-0026BB765291';

/**
 * Characteristic "Night Vision"
 */

Characteristic.NightVision = function() {
  Characteristic.call(this, 'Night Vision', '0000011B-0000-1000-8000-0026BB765291');
  this.setProps({
    format: Characteristic.Formats.BOOL,
    perms: [Characteristic.Perms.READ, Characteristic.Perms.WRITE, Characteristic.Perms.NOTIFY]
  });
  this.value = this.getDefaultValue();
};

util.inherits(Characteristic.NightVision, Characteristic);

Characteristic.NightVision.UUID = '0000011B-0000-1000-8000-0026BB765291';

/**
 * Characteristic "Nitrogen Dioxide Density"
 */

Characteristic.NitrogenDioxideDensity = function() {
  Characteristic.call(this, 'Nitrogen Dioxide Density', '000000C4-0000-1000-8000-0026BB765291');
  this.setProps({
    format: Characteristic.Formats.FLOAT,
    maxValue: 1000,
    minValue: 0,
    minStep: 1,
    perms: [Characteristic.Perms.READ, Characteristic.Perms.NOTIFY]
  });
  this.value = this.getDefaultValue();
};

util.inherits(Characteristic.NitrogenDioxideDensity, Characteristic);

Characteristic.NitrogenDioxideDensity.UUID = '000000C4-0000-1000-8000-0026BB765291';

/**
 * Characteristic "Obstruction Detected"
 */

Characteristic.ObstructionDetected = function() {
  Characteristic.call(this, 'Obstruction Detected', '00000024-0000-1000-8000-0026BB765291');
  this.setProps({
    format: Characteristic.Formats.BOOL,
    perms: [Characteristic.Perms.READ, Characteristic.Perms.NOTIFY]
  });
  this.value = this.getDefaultValue();
};

util.inherits(Characteristic.ObstructionDetected, Characteristic);

Characteristic.ObstructionDetected.UUID = '00000024-0000-1000-8000-0026BB765291';

/**
 * Characteristic "Occupancy Detected"
 */

Characteristic.OccupancyDetected = function() {
  Characteristic.call(this, 'Occupancy Detected', '00000071-0000-1000-8000-0026BB765291');
  this.setProps({
    format: Characteristic.Formats.UINT8,
    perms: [Characteristic.Perms.READ, Characteristic.Perms.NOTIFY]
  });
  this.value = this.getDefaultValue();
};

util.inherits(Characteristic.OccupancyDetected, Characteristic);

Characteristic.OccupancyDetected.UUID = '00000071-0000-1000-8000-0026BB765291';

// The value property of OccupancyDetected must be one of the following:
Characteristic.OccupancyDetected.OCCUPANCY_NOT_DETECTED = 0;
Characteristic.OccupancyDetected.OCCUPANCY_DETECTED = 1;

/**
 * Characteristic "On"
 */

Characteristic.On = function() {
  Characteristic.call(this, 'On', '00000025-0000-1000-8000-0026BB765291');
  this.setProps({
    format: Characteristic.Formats.BOOL,
    perms: [Characteristic.Perms.READ, Characteristic.Perms.WRITE, Characteristic.Perms.NOTIFY]
  });
  this.value = this.getDefaultValue();
};

util.inherits(Characteristic.On, Characteristic);

Characteristic.On.UUID = '00000025-0000-1000-8000-0026BB765291';

/**
 * Characteristic "Optical Zoom"
 */

Characteristic.OpticalZoom = function() {
  Characteristic.call(this, 'Optical Zoom', '0000011C-0000-1000-8000-0026BB765291');
  this.setProps({
    format: Characteristic.Formats.FLOAT,
    perms: [Characteristic.Perms.READ, Characteristic.Perms.WRITE, Characteristic.Perms.NOTIFY]
  });
  this.value = this.getDefaultValue();
};

util.inherits(Characteristic.OpticalZoom, Characteristic);

Characteristic.OpticalZoom.UUID = '0000011C-0000-1000-8000-0026BB765291';

/**
 * Characteristic "Outlet In Use"
 */

Characteristic.OutletInUse = function() {
  Characteristic.call(this, 'Outlet In Use', '00000026-0000-1000-8000-0026BB765291');
  this.setProps({
    format: Characteristic.Formats.BOOL,
    perms: [Characteristic.Perms.READ, Characteristic.Perms.NOTIFY]
  });
  this.value = this.getDefaultValue();
};

util.inherits(Characteristic.OutletInUse, Characteristic);

Characteristic.OutletInUse.UUID = '00000026-0000-1000-8000-0026BB765291';

/**
 * Characteristic "Ozone Density"
 */

Characteristic.OzoneDensity = function() {
  Characteristic.call(this, 'Ozone Density', '000000C3-0000-1000-8000-0026BB765291');
  this.setProps({
    format: Characteristic.Formats.FLOAT,
    maxValue: 1000,
    minValue: 0,
    minStep: 1,
    perms: [Characteristic.Perms.READ, Characteristic.Perms.NOTIFY]
  });
  this.value = this.getDefaultValue();
};

util.inherits(Characteristic.OzoneDensity, Characteristic);

Characteristic.OzoneDensity.UUID = '000000C3-0000-1000-8000-0026BB765291';

/**
 * Characteristic "Pair Setup"
 */

Characteristic.PairSetup = function() {
  Characteristic.call(this, 'Pair Setup', '0000004C-0000-1000-8000-0026BB765291');
  this.setProps({
    format: Characteristic.Formats.TLV8,
    perms: [Characteristic.Perms.READ, Characteristic.Perms.WRITE]
  });
  this.value = this.getDefaultValue();
};

util.inherits(Characteristic.PairSetup, Characteristic);

Characteristic.PairSetup.UUID = '0000004C-0000-1000-8000-0026BB765291';

/**
 * Characteristic "Pair Verify"
 */

Characteristic.PairVerify = function() {
  Characteristic.call(this, 'Pair Verify', '0000004E-0000-1000-8000-0026BB765291');
  this.setProps({
    format: Characteristic.Formats.TLV8,
    perms: [Characteristic.Perms.READ, Characteristic.Perms.WRITE]
  });
  this.value = this.getDefaultValue();
};

util.inherits(Characteristic.PairVerify, Characteristic);

Characteristic.PairVerify.UUID = '0000004E-0000-1000-8000-0026BB765291';

/**
 * Characteristic "Pairing Features"
 */

Characteristic.PairingFeatures = function() {
  Characteristic.call(this, 'Pairing Features', '0000004F-0000-1000-8000-0026BB765291');
  this.setProps({
    format: Characteristic.Formats.UINT8,
    perms: [Characteristic.Perms.READ]
  });
  this.value = this.getDefaultValue();
};

util.inherits(Characteristic.PairingFeatures, Characteristic);

Characteristic.PairingFeatures.UUID = '0000004F-0000-1000-8000-0026BB765291';

/**
 * Characteristic "Pairing Pairings"
 */

Characteristic.PairingPairings = function() {
  Characteristic.call(this, 'Pairing Pairings', '00000050-0000-1000-8000-0026BB765291');
  this.setProps({
    format: Characteristic.Formats.TLV8,
    perms: [Characteristic.Perms.READ, Characteristic.Perms.WRITE]
  });
  this.value = this.getDefaultValue();
};

util.inherits(Characteristic.PairingPairings, Characteristic);

Characteristic.PairingPairings.UUID = '00000050-0000-1000-8000-0026BB765291';

/**
 * Characteristic "PM10 Density"
 */

Characteristic.PM10Density = function() {
  Characteristic.call(this, 'PM10 Density', '000000C7-0000-1000-8000-0026BB765291');
  this.setProps({
    format: Characteristic.Formats.FLOAT,
    maxValue: 1000,
    minValue: 0,
    minStep: 1,
    perms: [Characteristic.Perms.READ, Characteristic.Perms.NOTIFY]
  });
  this.value = this.getDefaultValue();
};

util.inherits(Characteristic.PM10Density, Characteristic);

Characteristic.PM10Density.UUID = '000000C7-0000-1000-8000-0026BB765291';

/**
 * Characteristic "PM2.5 Density"
 */

Characteristic.PM2_5Density = function() {
  Characteristic.call(this, 'PM2.5 Density', '000000C6-0000-1000-8000-0026BB765291');
  this.setProps({
    format: Characteristic.Formats.FLOAT,
    maxValue: 1000,
    minValue: 0,
    minStep: 1,
    perms: [Characteristic.Perms.READ, Characteristic.Perms.NOTIFY]
  });
  this.value = this.getDefaultValue();
};

util.inherits(Characteristic.PM2_5Density, Characteristic);

Characteristic.PM2_5Density.UUID = '000000C6-0000-1000-8000-0026BB765291';

/**
 * Characteristic "Position State"
 */

Characteristic.PositionState = function() {
  Characteristic.call(this, 'Position State', '00000072-0000-1000-8000-0026BB765291');
  this.setProps({
    format: Characteristic.Formats.UINT8,
    perms: [Characteristic.Perms.READ, Characteristic.Perms.NOTIFY]
  });
  this.value = this.getDefaultValue();
};

util.inherits(Characteristic.PositionState, Characteristic);

Characteristic.PositionState.UUID = '00000072-0000-1000-8000-0026BB765291';

// The value property of PositionState must be one of the following:
Characteristic.PositionState.DECREASING = 0;
Characteristic.PositionState.INCREASING = 1;
Characteristic.PositionState.STOPPED = 2;

/**
 * Characteristic "Programmable Switch Event"
 */

Characteristic.ProgrammableSwitchEvent = function() {
  Characteristic.call(this, 'Programmable Switch Event', '00000073-0000-1000-8000-0026BB765291');
  this.setProps({
    format: Characteristic.Formats.UINT8,
    maxValue: 1,
    minValue: 0,
    minStep: 1,
    perms: [Characteristic.Perms.READ, Characteristic.Perms.NOTIFY]
  });
  this.value = this.getDefaultValue();
};

util.inherits(Characteristic.ProgrammableSwitchEvent, Characteristic);

Characteristic.ProgrammableSwitchEvent.UUID = '00000073-0000-1000-8000-0026BB765291';

/**
 * Characteristic "Programmable Switch Output State"
 */

Characteristic.ProgrammableSwitchOutputState = function() {
  Characteristic.call(this, 'Programmable Switch Output State', '00000074-0000-1000-8000-0026BB765291');
  this.setProps({
    format: Characteristic.Formats.UINT8,
    maxValue: 1,
    minValue: 0,
    minStep: 1,
    perms: [Characteristic.Perms.READ, Characteristic.Perms.WRITE, Characteristic.Perms.NOTIFY]
  });
  this.value = this.getDefaultValue();
};

util.inherits(Characteristic.ProgrammableSwitchOutputState, Characteristic);

Characteristic.ProgrammableSwitchOutputState.UUID = '00000074-0000-1000-8000-0026BB765291';

/**
 * Characteristic "Relative Humidity Dehumidifier Threshold"
 */

Characteristic.RelativeHumidityDehumidifierThreshold = function() {
  Characteristic.call(this, 'Relative Humidity Dehumidifier Threshold', '000000C9-0000-1000-8000-0026BB765291');
  this.setProps({
    format: Characteristic.Formats.FLOAT,
    maxValue: 100,
    minValue: 0,
    minStep: 1,
    perms: [Characteristic.Perms.READ, Characteristic.Perms.WRITE, Characteristic.Perms.NOTIFY]
  });
  this.value = this.getDefaultValue();
};

util.inherits(Characteristic.RelativeHumidityDehumidifierThreshold, Characteristic);

Characteristic.RelativeHumidityDehumidifierThreshold.UUID = '000000C9-0000-1000-8000-0026BB765291';

/**
 * Characteristic "Relative Humidity Humidifier Threshold"
 */

Characteristic.RelativeHumidityHumidifierThreshold = function() {
  Characteristic.call(this, 'Relative Humidity Humidifier Threshold', '000000CA-0000-1000-8000-0026BB765291');
  this.setProps({
    format: Characteristic.Formats.FLOAT,
    maxValue: 100,
    minValue: 0,
    minStep: 1,
    perms: [Characteristic.Perms.READ, Characteristic.Perms.WRITE, Characteristic.Perms.NOTIFY]
  });
  this.value = this.getDefaultValue();
};

util.inherits(Characteristic.RelativeHumidityHumidifierThreshold, Characteristic);

Characteristic.RelativeHumidityHumidifierThreshold.UUID = '000000CA-0000-1000-8000-0026BB765291';

/**
 * Characteristic "Reset Filter Indication"
 */

Characteristic.ResetFilterIndication = function() {
  Characteristic.call(this, 'Reset Filter Indication', '000000AD-0000-1000-8000-0026BB765291');
  this.setProps({
    format: Characteristic.Formats.UINT8,
    maxValue: 1,
    minValue: 1,
    minStep: 1,
    perms: [Characteristic.Perms.WRITE]
  });
  this.value = this.getDefaultValue();
};

util.inherits(Characteristic.ResetFilterIndication, Characteristic);

Characteristic.ResetFilterIndication.UUID = '000000AD-0000-1000-8000-0026BB765291';

/**
 * Characteristic "Rotation Direction"
 */

Characteristic.RotationDirection = function() {
  Characteristic.call(this, 'Rotation Direction', '00000028-0000-1000-8000-0026BB765291');
  this.setProps({
    format: Characteristic.Formats.INT,
    perms: [Characteristic.Perms.READ, Characteristic.Perms.WRITE, Characteristic.Perms.NOTIFY]
  });
  this.value = this.getDefaultValue();
};

util.inherits(Characteristic.RotationDirection, Characteristic);

Characteristic.RotationDirection.UUID = '00000028-0000-1000-8000-0026BB765291';

// The value property of RotationDirection must be one of the following:
Characteristic.RotationDirection.CLOCKWISE = 0;
Characteristic.RotationDirection.COUNTER_CLOCKWISE = 1;

/**
 * Characteristic "Rotation Speed"
 */

Characteristic.RotationSpeed = function() {
  Characteristic.call(this, 'Rotation Speed', '00000029-0000-1000-8000-0026BB765291');
  this.setProps({
    format: Characteristic.Formats.FLOAT,
    unit: Characteristic.Units.PERCENTAGE,
    maxValue: 100,
    minValue: 0,
    minStep: 1,
    perms: [Characteristic.Perms.READ, Characteristic.Perms.WRITE, Characteristic.Perms.NOTIFY]
  });
  this.value = this.getDefaultValue();
};

util.inherits(Characteristic.RotationSpeed, Characteristic);

Characteristic.RotationSpeed.UUID = '00000029-0000-1000-8000-0026BB765291';

/**
 * Characteristic "Saturation"
 */

Characteristic.Saturation = function() {
  Characteristic.call(this, 'Saturation', '0000002F-0000-1000-8000-0026BB765291');
  this.setProps({
    format: Characteristic.Formats.FLOAT,
    unit: Characteristic.Units.PERCENTAGE,
    maxValue: 100,
    minValue: 0,
    minStep: 1,
    perms: [Characteristic.Perms.READ, Characteristic.Perms.WRITE, Characteristic.Perms.NOTIFY]
  });
  this.value = this.getDefaultValue();
};

util.inherits(Characteristic.Saturation, Characteristic);

Characteristic.Saturation.UUID = '0000002F-0000-1000-8000-0026BB765291';

/**
 * Characteristic "Security System Alarm Type"
 */

Characteristic.SecuritySystemAlarmType = function() {
  Characteristic.call(this, 'Security System Alarm Type', '0000008E-0000-1000-8000-0026BB765291');
  this.setProps({
    format: Characteristic.Formats.UINT8,
    maxValue: 1,
    minValue: 0,
    minStep: 1,
    perms: [Characteristic.Perms.READ, Characteristic.Perms.NOTIFY]
  });
  this.value = this.getDefaultValue();
};

util.inherits(Characteristic.SecuritySystemAlarmType, Characteristic);

Characteristic.SecuritySystemAlarmType.UUID = '0000008E-0000-1000-8000-0026BB765291';

/**
 * Characteristic "Security System Current State"
 */

Characteristic.SecuritySystemCurrentState = function() {
  Characteristic.call(this, 'Security System Current State', '00000066-0000-1000-8000-0026BB765291');
  this.setProps({
    format: Characteristic.Formats.UINT8,
    perms: [Characteristic.Perms.READ, Characteristic.Perms.NOTIFY]
  });
  this.value = this.getDefaultValue();
};

util.inherits(Characteristic.SecuritySystemCurrentState, Characteristic);

Characteristic.SecuritySystemCurrentState.UUID = '00000066-0000-1000-8000-0026BB765291';

// The value property of SecuritySystemCurrentState must be one of the following:
Characteristic.SecuritySystemCurrentState.STAY_ARM = 0;
Characteristic.SecuritySystemCurrentState.AWAY_ARM = 1;
Characteristic.SecuritySystemCurrentState.NIGHT_ARM = 2;
Characteristic.SecuritySystemCurrentState.DISARMED = 3;
Characteristic.SecuritySystemCurrentState.ALARM_TRIGGERED = 4;

/**
 * Characteristic "Security System Target State"
 */

Characteristic.SecuritySystemTargetState = function() {
  Characteristic.call(this, 'Security System Target State', '00000067-0000-1000-8000-0026BB765291');
  this.setProps({
    format: Characteristic.Formats.UINT8,
    perms: [Characteristic.Perms.READ, Characteristic.Perms.WRITE, Characteristic.Perms.NOTIFY]
  });
  this.value = this.getDefaultValue();
};

util.inherits(Characteristic.SecuritySystemTargetState, Characteristic);

Characteristic.SecuritySystemTargetState.UUID = '00000067-0000-1000-8000-0026BB765291';

// The value property of SecuritySystemTargetState must be one of the following:
Characteristic.SecuritySystemTargetState.STAY_ARM = 0;
Characteristic.SecuritySystemTargetState.AWAY_ARM = 1;
Characteristic.SecuritySystemTargetState.NIGHT_ARM = 2;
Characteristic.SecuritySystemTargetState.DISARM = 3;

/**
 * Characteristic "Selected Stream Configuration"
 */

Characteristic.SelectedStreamConfiguration = function() {
  Characteristic.call(this, 'Selected Stream Configuration', '00000117-0000-1000-8000-0026BB765291');
  this.setProps({
    format: Characteristic.Formats.TLV8,
    perms: [Characteristic.Perms.READ, Characteristic.Perms.WRITE]
  });
  this.value = this.getDefaultValue();
};

util.inherits(Characteristic.SelectedStreamConfiguration, Characteristic);

Characteristic.SelectedStreamConfiguration.UUID = '00000117-0000-1000-8000-0026BB765291';

/**
 * Characteristic "Serial Number"
 */

Characteristic.SerialNumber = function() {
  Characteristic.call(this, 'Serial Number', '00000030-0000-1000-8000-0026BB765291');
  this.setProps({
    format: Characteristic.Formats.STRING,
    perms: [Characteristic.Perms.READ]
  });
  this.value = this.getDefaultValue();
};

util.inherits(Characteristic.SerialNumber, Characteristic);

Characteristic.SerialNumber.UUID = '00000030-0000-1000-8000-0026BB765291';

/**
 * Characteristic "Setup Endpoints"
 */

Characteristic.SetupEndpoints = function() {
  Characteristic.call(this, 'Setup Endpoints', '00000118-0000-1000-8000-0026BB765291');
  this.setProps({
    format: Characteristic.Formats.TLV8,
    perms: [Characteristic.Perms.READ, Characteristic.Perms.WRITE, Characteristic.Perms.NOTIFY]
  });
  this.value = this.getDefaultValue();
};

util.inherits(Characteristic.SetupEndpoints, Characteristic);

Characteristic.SetupEndpoints.UUID = '00000118-0000-1000-8000-0026BB765291';

/**
 * Characteristic "Slat Type"
 */

Characteristic.SlatType = function() {
  Characteristic.call(this, 'Slat Type', '000000C0-0000-1000-8000-0026BB765291');
  this.setProps({
    format: Characteristic.Formats.UINT8,
    perms: [Characteristic.Perms.READ, Characteristic.Perms.NOTIFY]
  });
  this.value = this.getDefaultValue();
};

util.inherits(Characteristic.SlatType, Characteristic);

Characteristic.SlatType.UUID = '000000C0-0000-1000-8000-0026BB765291';

// The value property of SlatType must be one of the following:
Characteristic.SlatType.HORIZONTAL = 0;
Characteristic.SlatType.VERTICAL = 1;

/**
 * Characteristic "Smoke Detected"
 */

Characteristic.SmokeDetected = function() {
  Characteristic.call(this, 'Smoke Detected', '00000076-0000-1000-8000-0026BB765291');
  this.setProps({
    format: Characteristic.Formats.UINT8,
    perms: [Characteristic.Perms.READ, Characteristic.Perms.NOTIFY]
  });
  this.value = this.getDefaultValue();
};

util.inherits(Characteristic.SmokeDetected, Characteristic);

Characteristic.SmokeDetected.UUID = '00000076-0000-1000-8000-0026BB765291';

// The value property of SmokeDetected must be one of the following:
Characteristic.SmokeDetected.SMOKE_NOT_DETECTED = 0;
Characteristic.SmokeDetected.SMOKE_DETECTED = 1;

/**
 * Characteristic "Software Revision"
 */

Characteristic.SoftwareRevision = function() {
  Characteristic.call(this, 'Software Revision', '00000054-0000-1000-8000-0026BB765291');
  this.setProps({
    format: Characteristic.Formats.STRING,
    perms: [Characteristic.Perms.READ]
  });
  this.value = this.getDefaultValue();
};

util.inherits(Characteristic.SoftwareRevision, Characteristic);

Characteristic.SoftwareRevision.UUID = '00000054-0000-1000-8000-0026BB765291';

/**
 * Characteristic "Status Active"
 */

Characteristic.StatusActive = function() {
  Characteristic.call(this, 'Status Active', '00000075-0000-1000-8000-0026BB765291');
  this.setProps({
    format: Characteristic.Formats.BOOL,
    perms: [Characteristic.Perms.READ, Characteristic.Perms.NOTIFY]
  });
  this.value = this.getDefaultValue();
};

util.inherits(Characteristic.StatusActive, Characteristic);

Characteristic.StatusActive.UUID = '00000075-0000-1000-8000-0026BB765291';

/**
 * Characteristic "Status Fault"
 */

Characteristic.StatusFault = function() {
  Characteristic.call(this, 'Status Fault', '00000077-0000-1000-8000-0026BB765291');
  this.setProps({
    format: Characteristic.Formats.UINT8,
    perms: [Characteristic.Perms.READ, Characteristic.Perms.NOTIFY]
  });
  this.value = this.getDefaultValue();
};

util.inherits(Characteristic.StatusFault, Characteristic);

Characteristic.StatusFault.UUID = '00000077-0000-1000-8000-0026BB765291';

// The value property of StatusFault must be one of the following:
Characteristic.StatusFault.NO_FAULT = 0;
Characteristic.StatusFault.GENERAL_FAULT = 1;

/**
 * Characteristic "Status Jammed"
 */

Characteristic.StatusJammed = function() {
  Characteristic.call(this, 'Status Jammed', '00000078-0000-1000-8000-0026BB765291');
  this.setProps({
    format: Characteristic.Formats.UINT8,
    perms: [Characteristic.Perms.READ, Characteristic.Perms.NOTIFY]
  });
  this.value = this.getDefaultValue();
};

util.inherits(Characteristic.StatusJammed, Characteristic);

Characteristic.StatusJammed.UUID = '00000078-0000-1000-8000-0026BB765291';

// The value property of StatusJammed must be one of the following:
Characteristic.StatusJammed.NOT_JAMMED = 0;
Characteristic.StatusJammed.JAMMED = 1;

/**
 * Characteristic "Status Low Battery"
 */

Characteristic.StatusLowBattery = function() {
  Characteristic.call(this, 'Status Low Battery', '00000079-0000-1000-8000-0026BB765291');
  this.setProps({
    format: Characteristic.Formats.UINT8,
    perms: [Characteristic.Perms.READ, Characteristic.Perms.NOTIFY]
  });
  this.value = this.getDefaultValue();
};

util.inherits(Characteristic.StatusLowBattery, Characteristic);

Characteristic.StatusLowBattery.UUID = '00000079-0000-1000-8000-0026BB765291';

// The value property of StatusLowBattery must be one of the following:
Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL = 0;
Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW = 1;

/**
 * Characteristic "Status Tampered"
 */

Characteristic.StatusTampered = function() {
  Characteristic.call(this, 'Status Tampered', '0000007A-0000-1000-8000-0026BB765291');
  this.setProps({
    format: Characteristic.Formats.UINT8,
    perms: [Characteristic.Perms.READ, Characteristic.Perms.NOTIFY]
  });
  this.value = this.getDefaultValue();
};

util.inherits(Characteristic.StatusTampered, Characteristic);

Characteristic.StatusTampered.UUID = '0000007A-0000-1000-8000-0026BB765291';

// The value property of StatusTampered must be one of the following:
Characteristic.StatusTampered.NOT_TAMPERED = 0;
Characteristic.StatusTampered.TAMPERED = 1;

/**
 * Characteristic "Streaming Status"
 */

Characteristic.StreamingStatus = function() {
  Characteristic.call(this, 'Streaming Status', '00000120-0000-1000-8000-0026BB765291');
  this.setProps({
    format: Characteristic.Formats.TLV8,
    perms: [Characteristic.Perms.READ, Characteristic.Perms.NOTIFY]
  });
  this.value = this.getDefaultValue();
};

util.inherits(Characteristic.StreamingStatus, Characteristic);

Characteristic.StreamingStatus.UUID = '00000120-0000-1000-8000-0026BB765291';

/**
 * Characteristic "Sulphur Dioxide Density"
 */

Characteristic.SulphurDioxideDensity = function() {
  Characteristic.call(this, 'Sulphur Dioxide Density', '000000C5-0000-1000-8000-0026BB765291');
  this.setProps({
    format: Characteristic.Formats.FLOAT,
    maxValue: 1000,
    minValue: 0,
    minStep: 1,
    perms: [Characteristic.Perms.READ, Characteristic.Perms.NOTIFY]
  });
  this.value = this.getDefaultValue();
};

util.inherits(Characteristic.SulphurDioxideDensity, Characteristic);

Characteristic.SulphurDioxideDensity.UUID = '000000C5-0000-1000-8000-0026BB765291';

/**
 * Characteristic "Supported Audio Stream Configuration"
 */

Characteristic.SupportedAudioStreamConfiguration = function() {
  Characteristic.call(this, 'Supported Audio Stream Configuration', '00000115-0000-1000-8000-0026BB765291');
  this.setProps({
    format: Characteristic.Formats.TLV8,
    perms: [Characteristic.Perms.READ]
  });
  this.value = this.getDefaultValue();
};

util.inherits(Characteristic.SupportedAudioStreamConfiguration, Characteristic);

Characteristic.SupportedAudioStreamConfiguration.UUID = '00000115-0000-1000-8000-0026BB765291';

/**
 * Characteristic "Supported RTP Configuration"
 */

Characteristic.SupportedRTPConfiguration = function() {
  Characteristic.call(this, 'Supported RTP Configuration', '00000116-0000-1000-8000-0026BB765291');
  this.setProps({
    format: Characteristic.Formats.TLV8,
    perms: [Characteristic.Perms.READ]
  });
  this.value = this.getDefaultValue();
};

util.inherits(Characteristic.SupportedRTPConfiguration, Characteristic);

Characteristic.SupportedRTPConfiguration.UUID = '00000116-0000-1000-8000-0026BB765291';

/**
 * Characteristic "Supported Video Stream Configuration"
 */

Characteristic.SupportedVideoStreamConfiguration = function() {
  Characteristic.call(this, 'Supported Video Stream Configuration', '00000114-0000-1000-8000-0026BB765291');
  this.setProps({
    format: Characteristic.Formats.TLV8,
    perms: [Characteristic.Perms.READ]
  });
  this.value = this.getDefaultValue();
};

util.inherits(Characteristic.SupportedVideoStreamConfiguration, Characteristic);

Characteristic.SupportedVideoStreamConfiguration.UUID = '00000114-0000-1000-8000-0026BB765291';

/**
 * Characteristic "Swing Mode"
 */

Characteristic.SwingMode = function() {
  Characteristic.call(this, 'Swing Mode', '000000B6-0000-1000-8000-0026BB765291');
  this.setProps({
    format: Characteristic.Formats.UINT8,
    perms: [Characteristic.Perms.READ, Characteristic.Perms.WRITE, Characteristic.Perms.NOTIFY]
  });
  this.value = this.getDefaultValue();
};

util.inherits(Characteristic.SwingMode, Characteristic);

Characteristic.SwingMode.UUID = '000000B6-0000-1000-8000-0026BB765291';

// The value property of SwingMode must be one of the following:
Characteristic.SwingMode.SWING_DISABLED = 0;
Characteristic.SwingMode.SWING_ENABLED = 1;

/**
 * Characteristic "Target Air Purifier State"
 */

Characteristic.TargetAirPurifierState = function() {
  Characteristic.call(this, 'Target Air Purifier State', '000000A8-0000-1000-8000-0026BB765291');
  this.setProps({
    format: Characteristic.Formats.UINT8,
    perms: [Characteristic.Perms.READ, Characteristic.Perms.WRITE, Characteristic.Perms.NOTIFY]
  });
  this.value = this.getDefaultValue();
};

util.inherits(Characteristic.TargetAirPurifierState, Characteristic);

Characteristic.TargetAirPurifierState.UUID = '000000A8-0000-1000-8000-0026BB765291';

// The value property of TargetAirPurifierState must be one of the following:
Characteristic.TargetAirPurifierState.MANUAL = 0;
Characteristic.TargetAirPurifierState.AUTO = 1;

/**
 * Characteristic "Target Air Quality"
 */

Characteristic.TargetAirQuality = function() {
  Characteristic.call(this, 'Target Air Quality', '000000AE-0000-1000-8000-0026BB765291');
  this.setProps({
    format: Characteristic.Formats.UINT8,
    perms: [Characteristic.Perms.READ, Characteristic.Perms.WRITE, Characteristic.Perms.NOTIFY]
  });
  this.value = this.getDefaultValue();
};

util.inherits(Characteristic.TargetAirQuality, Characteristic);

Characteristic.TargetAirQuality.UUID = '000000AE-0000-1000-8000-0026BB765291';

// The value property of TargetAirQuality must be one of the following:
Characteristic.TargetAirQuality.EXCELLENT = 0;
Characteristic.TargetAirQuality.GOOD = 1;
Characteristic.TargetAirQuality.FAIR = 2;

/**
 * Characteristic "Target Door State"
 */

Characteristic.TargetDoorState = function() {
  Characteristic.call(this, 'Target Door State', '00000032-0000-1000-8000-0026BB765291');
  this.setProps({
    format: Characteristic.Formats.UINT8,
    perms: [Characteristic.Perms.READ, Characteristic.Perms.WRITE, Characteristic.Perms.NOTIFY]
  });
  this.value = this.getDefaultValue();
};

util.inherits(Characteristic.TargetDoorState, Characteristic);

Characteristic.TargetDoorState.UUID = '00000032-0000-1000-8000-0026BB765291';

// The value property of TargetDoorState must be one of the following:
Characteristic.TargetDoorState.OPEN = 0;
Characteristic.TargetDoorState.CLOSED = 1;

/**
 * Characteristic "Target Fan State"
 */

Characteristic.TargetFanState = function() {
  Characteristic.call(this, 'Target Fan State', '000000BF-0000-1000-8000-0026BB765291');
  this.setProps({
    format: Characteristic.Formats.UINT8,
    perms: [Characteristic.Perms.READ, Characteristic.Perms.WRITE, Characteristic.Perms.NOTIFY]
  });
  this.value = this.getDefaultValue();
};

util.inherits(Characteristic.TargetFanState, Characteristic);

Characteristic.TargetFanState.UUID = '000000BF-0000-1000-8000-0026BB765291';

// The value property of TargetFanState must be one of the following:
Characteristic.TargetFanState.MANUAL = 0;
Characteristic.TargetFanState.AUTO = 1;

/**
 * Characteristic "Target Heater Cooler State"
 */

Characteristic.TargetHeaterCoolerState = function() {
  Characteristic.call(this, 'Target Heater Cooler State', '000000B2-0000-1000-8000-0026BB765291');
  this.setProps({
    format: Characteristic.Formats.UINT8,
    perms: [Characteristic.Perms.READ, Characteristic.Perms.WRITE, Characteristic.Perms.NOTIFY]
  });
  this.value = this.getDefaultValue();
};

util.inherits(Characteristic.TargetHeaterCoolerState, Characteristic);

Characteristic.TargetHeaterCoolerState.UUID = '000000B2-0000-1000-8000-0026BB765291';

// The value property of TargetHeaterCoolerState must be one of the following:
Characteristic.TargetHeaterCoolerState.AUTO = 0;
Characteristic.TargetHeaterCoolerState.HEAT = 1;
Characteristic.TargetHeaterCoolerState.COOL = 2;

/**
 * Characteristic "Target Heating Cooling State"
 */

Characteristic.TargetHeatingCoolingState = function() {
  Characteristic.call(this, 'Target Heating Cooling State', '00000033-0000-1000-8000-0026BB765291');
  this.setProps({
    format: Characteristic.Formats.UINT8,
    perms: [Characteristic.Perms.READ, Characteristic.Perms.WRITE, Characteristic.Perms.NOTIFY]
  });
  this.value = this.getDefaultValue();
};

util.inherits(Characteristic.TargetHeatingCoolingState, Characteristic);

Characteristic.TargetHeatingCoolingState.UUID = '00000033-0000-1000-8000-0026BB765291';

// The value property of TargetHeatingCoolingState must be one of the following:
Characteristic.TargetHeatingCoolingState.OFF = 0;
Characteristic.TargetHeatingCoolingState.HEAT = 1;
Characteristic.TargetHeatingCoolingState.COOL = 2;
Characteristic.TargetHeatingCoolingState.AUTO = 3;

/**
 * Characteristic "Target Horizontal Tilt Angle"
 */

Characteristic.TargetHorizontalTiltAngle = function() {
  Characteristic.call(this, 'Target Horizontal Tilt Angle', '0000007B-0000-1000-8000-0026BB765291');
  this.setProps({
    format: Characteristic.Formats.INT,
    unit: Characteristic.Units.ARC_DEGREE,
    maxValue: 90,
    minValue: -90,
    minStep: 1,
    perms: [Characteristic.Perms.READ, Characteristic.Perms.WRITE, Characteristic.Perms.NOTIFY]
  });
  this.value = this.getDefaultValue();
};

util.inherits(Characteristic.TargetHorizontalTiltAngle, Characteristic);

Characteristic.TargetHorizontalTiltAngle.UUID = '0000007B-0000-1000-8000-0026BB765291';

/**
 * Characteristic "Target Humidifier Dehumidifier State"
 */

Characteristic.TargetHumidifierDehumidifierState = function() {
  Characteristic.call(this, 'Target Humidifier Dehumidifier State', '000000B4-0000-1000-8000-0026BB765291');
  this.setProps({
    format: Characteristic.Formats.UINT8,
    perms: [Characteristic.Perms.READ, Characteristic.Perms.WRITE, Characteristic.Perms.NOTIFY]
  });
  this.value = this.getDefaultValue();
};

util.inherits(Characteristic.TargetHumidifierDehumidifierState, Characteristic);

Characteristic.TargetHumidifierDehumidifierState.UUID = '000000B4-0000-1000-8000-0026BB765291';

// The value property of TargetHumidifierDehumidifierState must be one of the following:
Characteristic.TargetHumidifierDehumidifierState.AUTO = 0;
Characteristic.TargetHumidifierDehumidifierState.HUMIDIFIER = 1;
Characteristic.TargetHumidifierDehumidifierState.DEHUMIDIFIER = 2;

/**
 * Characteristic "Target Position"
 */

Characteristic.TargetPosition = function() {
  Characteristic.call(this, 'Target Position', '0000007C-0000-1000-8000-0026BB765291');
  this.setProps({
    format: Characteristic.Formats.UINT8,
    unit: Characteristic.Units.PERCENTAGE,
    maxValue: 100,
    minValue: 0,
    minStep: 1,
    perms: [Characteristic.Perms.READ, Characteristic.Perms.WRITE, Characteristic.Perms.NOTIFY]
  });
  this.value = this.getDefaultValue();
};

util.inherits(Characteristic.TargetPosition, Characteristic);

Characteristic.TargetPosition.UUID = '0000007C-0000-1000-8000-0026BB765291';

/**
 * Characteristic "Target Relative Humidity"
 */

Characteristic.TargetRelativeHumidity = function() {
  Characteristic.call(this, 'Target Relative Humidity', '00000034-0000-1000-8000-0026BB765291');
  this.setProps({
    format: Characteristic.Formats.FLOAT,
    unit: Characteristic.Units.PERCENTAGE,
    maxValue: 100,
    minValue: 0,
    minStep: 1,
    perms: [Characteristic.Perms.READ, Characteristic.Perms.WRITE, Characteristic.Perms.NOTIFY]
  });
  this.value = this.getDefaultValue();
};

util.inherits(Characteristic.TargetRelativeHumidity, Characteristic);

Characteristic.TargetRelativeHumidity.UUID = '00000034-0000-1000-8000-0026BB765291';

/**
 * Characteristic "Target Slat State"
 */

Characteristic.TargetSlatState = function() {
  Characteristic.call(this, 'Target Slat State', '000000BE-0000-1000-8000-0026BB765291');
  this.setProps({
    format: Characteristic.Formats.UINT8,
    perms: [Characteristic.Perms.READ, Characteristic.Perms.WRITE, Characteristic.Perms.NOTIFY]
  });
  this.value = this.getDefaultValue();
};

util.inherits(Characteristic.TargetSlatState, Characteristic);

Characteristic.TargetSlatState.UUID = '000000BE-0000-1000-8000-0026BB765291';

// The value property of TargetSlatState must be one of the following:
Characteristic.TargetSlatState.MANUAL = 0;
Characteristic.TargetSlatState.AUTO = 1;

/**
 * Characteristic "Target Temperature"
 */

Characteristic.TargetTemperature = function() {
  Characteristic.call(this, 'Target Temperature', '00000035-0000-1000-8000-0026BB765291');
  this.setProps({
    format: Characteristic.Formats.FLOAT,
    unit: Characteristic.Units.CELSIUS,
    maxValue: 38,
    minValue: 10,
    minStep: 0.1,
    perms: [Characteristic.Perms.READ, Characteristic.Perms.WRITE, Characteristic.Perms.NOTIFY]
  });
  this.value = this.getDefaultValue();
};

util.inherits(Characteristic.TargetTemperature, Characteristic);

Characteristic.TargetTemperature.UUID = '00000035-0000-1000-8000-0026BB765291';

/**
 * Characteristic "Target Tilt Angle"
 */

Characteristic.TargetTiltAngle = function() {
  Characteristic.call(this, 'Target Tilt Angle', '000000C2-0000-1000-8000-0026BB765291');
  this.setProps({
    format: Characteristic.Formats.INT,
    unit: Characteristic.Units.ARC_DEGREE,
    maxValue: 90,
    minValue: -90,
    minStep: 1,
    perms: [Characteristic.Perms.READ, Characteristic.Perms.WRITE, Characteristic.Perms.NOTIFY]
  });
  this.value = this.getDefaultValue();
};

util.inherits(Characteristic.TargetTiltAngle, Characteristic);

Characteristic.TargetTiltAngle.UUID = '000000C2-0000-1000-8000-0026BB765291';

/**
 * Characteristic "Target Vertical Tilt Angle"
 */

Characteristic.TargetVerticalTiltAngle = function() {
  Characteristic.call(this, 'Target Vertical Tilt Angle', '0000007D-0000-1000-8000-0026BB765291');
  this.setProps({
    format: Characteristic.Formats.INT,
    unit: Characteristic.Units.ARC_DEGREE,
    maxValue: 90,
    minValue: -90,
    minStep: 1,
    perms: [Characteristic.Perms.READ, Characteristic.Perms.WRITE, Characteristic.Perms.NOTIFY]
  });
  this.value = this.getDefaultValue();
};

util.inherits(Characteristic.TargetVerticalTiltAngle, Characteristic);

Characteristic.TargetVerticalTiltAngle.UUID = '0000007D-0000-1000-8000-0026BB765291';

/**
 * Characteristic "Temperature Display Units"
 */

Characteristic.TemperatureDisplayUnits = function() {
  Characteristic.call(this, 'Temperature Display Units', '00000036-0000-1000-8000-0026BB765291');
  this.setProps({
    format: Characteristic.Formats.UINT8,
    perms: [Characteristic.Perms.READ, Characteristic.Perms.WRITE, Characteristic.Perms.NOTIFY]
  });
  this.value = this.getDefaultValue();
};

util.inherits(Characteristic.TemperatureDisplayUnits, Characteristic);

Characteristic.TemperatureDisplayUnits.UUID = '00000036-0000-1000-8000-0026BB765291';

// The value property of TemperatureDisplayUnits must be one of the following:
Characteristic.TemperatureDisplayUnits.CELSIUS = 0;
Characteristic.TemperatureDisplayUnits.FAHRENHEIT = 1;

/**
 * Characteristic "Version"
 */

Characteristic.Version = function() {
  Characteristic.call(this, 'Version', '00000037-0000-1000-8000-0026BB765291');
  this.setProps({
    format: Characteristic.Formats.STRING,
    perms: [Characteristic.Perms.READ, Characteristic.Perms.NOTIFY]
  });
  this.value = this.getDefaultValue();
};

util.inherits(Characteristic.Version, Characteristic);

Characteristic.Version.UUID = '00000037-0000-1000-8000-0026BB765291';

/**
 * Characteristic "VOC Density"
 */

Characteristic.VOCDensity = function() {
  Characteristic.call(this, 'VOC Density', '000000C8-0000-1000-8000-0026BB765291');
  this.setProps({
    format: Characteristic.Formats.FLOAT,
    maxValue: 1000,
    minValue: 0,
    minStep: 1,
    perms: [Characteristic.Perms.READ, Characteristic.Perms.NOTIFY]
  });
  this.value = this.getDefaultValue();
};

util.inherits(Characteristic.VOCDensity, Characteristic);

Characteristic.VOCDensity.UUID = '000000C8-0000-1000-8000-0026BB765291';

/**
 * Characteristic "Volume"
 */

Characteristic.Volume = function() {
  Characteristic.call(this, 'Volume', '00000119-0000-1000-8000-0026BB765291');
  this.setProps({
    format: Characteristic.Formats.FLOAT,
    unit: Characteristic.Units.PERCENTAGE,
    maxValue: 100,
    minValue: 0,
    minStep: 1,
    perms: [Characteristic.Perms.READ, Characteristic.Perms.WRITE, Characteristic.Perms.NOTIFY]
  });
  this.value = this.getDefaultValue();
};

util.inherits(Characteristic.Volume, Characteristic);

Characteristic.Volume.UUID = '00000119-0000-1000-8000-0026BB765291';

/**
 * Characteristic "Water Level"
 */

Characteristic.WaterLevel = function() {
  Characteristic.call(this, 'Water Level', '000000B5-0000-1000-8000-0026BB765291');
  this.setProps({
    format: Characteristic.Formats.FLOAT,
    maxValue: 100,
    minValue: 0,
    perms: [Characteristic.Perms.READ, Characteristic.Perms.NOTIFY]
  });
  this.value = this.getDefaultValue();
};

util.inherits(Characteristic.WaterLevel, Characteristic);

Characteristic.WaterLevel.UUID = '000000B5-0000-1000-8000-0026BB765291';



/**
 * Characteristic "Accessory Identifier"
 */

Characteristic.AccessoryIdentifier = function() {
  Characteristic.call(this, 'Accessory Identifier', '00000057-0000-1000-8000-0026BB765291');
  this.setProps({
    format: Characteristic.Formats.STRING,
    perms: [Characteristic.Perms.READ]
  });
  this.value = this.getDefaultValue();
};

util.inherits(Characteristic.AccessoryIdentifier, Characteristic);

Characteristic.AccessoryIdentifier.UUID = '00000057-0000-1000-8000-0026BB765291';

/**
 * Characteristic "Category"
 */

Characteristic.Category = function() {
  Characteristic.call(this, 'Category', '000000A3-0000-1000-8000-0026BB765291');
  this.setProps({
    format: Characteristic.Formats.UINT16,
    maxValue: 16,
    minValue: 1,
    minStep: 1,
    perms: [Characteristic.Perms.READ, Characteristic.Perms.NOTIFY]
  });
  this.value = this.getDefaultValue();
};

util.inherits(Characteristic.Category, Characteristic);

Characteristic.Category.UUID = '000000A3-0000-1000-8000-0026BB765291';

/**
 * Characteristic "Configure Bridged Accessory"
 */

Characteristic.ConfigureBridgedAccessory = function() {
  Characteristic.call(this, 'Configure Bridged Accessory', '000000A0-0000-1000-8000-0026BB765291');
  this.setProps({
    format: Characteristic.Formats.TLV8,
    perms: [Characteristic.Perms.WRITE]
  });
  this.value = this.getDefaultValue();
};

util.inherits(Characteristic.ConfigureBridgedAccessory, Characteristic);

Characteristic.ConfigureBridgedAccessory.UUID = '000000A0-0000-1000-8000-0026BB765291';

/**
 * Characteristic "Configure Bridged Accessory Status"
 */

Characteristic.ConfigureBridgedAccessoryStatus = function() {
  Characteristic.call(this, 'Configure Bridged Accessory Status', '0000009D-0000-1000-8000-0026BB765291');
  this.setProps({
    format: Characteristic.Formats.TLV8,
    perms: [Characteristic.Perms.READ, Characteristic.Perms.NOTIFY]
  });
  this.value = this.getDefaultValue();
};

util.inherits(Characteristic.ConfigureBridgedAccessoryStatus, Characteristic);

Characteristic.ConfigureBridgedAccessoryStatus.UUID = '0000009D-0000-1000-8000-0026BB765291';

/**
 * Characteristic "Current Time"
 */

Characteristic.CurrentTime = function() {
  Characteristic.call(this, 'Current Time', '0000009B-0000-1000-8000-0026BB765291');
  this.setProps({
    format: Characteristic.Formats.STRING,
    perms: [Characteristic.Perms.READ, Characteristic.Perms.WRITE]
  });
  this.value = this.getDefaultValue();
};

util.inherits(Characteristic.CurrentTime, Characteristic);

Characteristic.CurrentTime.UUID = '0000009B-0000-1000-8000-0026BB765291';

/**
 * Characteristic "Day of the Week"
 */

Characteristic.DayoftheWeek = function() {
  Characteristic.call(this, 'Day of the Week', '00000098-0000-1000-8000-0026BB765291');
  this.setProps({
    format: Characteristic.Formats.UINT8,
    maxValue: 7,
    minValue: 1,
    minStep: 1,
    perms: [Characteristic.Perms.READ, Characteristic.Perms.WRITE]
  });
  this.value = this.getDefaultValue();
};

util.inherits(Characteristic.DayoftheWeek, Characteristic);

Characteristic.DayoftheWeek.UUID = '00000098-0000-1000-8000-0026BB765291';

/**
 * Characteristic "Discover Bridged Accessories"
 */

Characteristic.DiscoverBridgedAccessories = function() {
  Characteristic.call(this, 'Discover Bridged Accessories', '0000009E-0000-1000-8000-0026BB765291');
  this.setProps({
    format: Characteristic.Formats.UINT8,
    perms: [Characteristic.Perms.READ, Characteristic.Perms.WRITE, Characteristic.Perms.NOTIFY]
  });
  this.value = this.getDefaultValue();
};

util.inherits(Characteristic.DiscoverBridgedAccessories, Characteristic);

Characteristic.DiscoverBridgedAccessories.UUID = '0000009E-0000-1000-8000-0026BB765291';

// The value property of DiscoverBridgedAccessories must be one of the following:
Characteristic.DiscoverBridgedAccessories.START_DISCOVERY = 0;
Characteristic.DiscoverBridgedAccessories.STOP_DISCOVERY = 1;

/**
 * Characteristic "Discovered Bridged Accessories"
 */

Characteristic.DiscoveredBridgedAccessories = function() {
  Characteristic.call(this, 'Discovered Bridged Accessories', '0000009F-0000-1000-8000-0026BB765291');
  this.setProps({
    format: Characteristic.Formats.UINT16,
    perms: [Characteristic.Perms.READ, Characteristic.Perms.NOTIFY]
  });
  this.value = this.getDefaultValue();
};

util.inherits(Characteristic.DiscoveredBridgedAccessories, Characteristic);

Characteristic.DiscoveredBridgedAccessories.UUID = '0000009F-0000-1000-8000-0026BB765291';

/**
 * Characteristic "Link Quality"
 */

Characteristic.LinkQuality = function() {
  Characteristic.call(this, 'Link Quality', '0000009C-0000-1000-8000-0026BB765291');
  this.setProps({
    format: Characteristic.Formats.UINT8,
    maxValue: 4,
    minValue: 1,
    minStep: 1,
    perms: [Characteristic.Perms.READ, Characteristic.Perms.NOTIFY]
  });
  this.value = this.getDefaultValue();
};

util.inherits(Characteristic.LinkQuality, Characteristic);

Characteristic.LinkQuality.UUID = '0000009C-0000-1000-8000-0026BB765291';

/**
 * Characteristic "Reachable"
 */

Characteristic.Reachable = function() {
  Characteristic.call(this, 'Reachable', '00000063-0000-1000-8000-0026BB765291');
  this.setProps({
    format: Characteristic.Formats.BOOL,
    perms: [Characteristic.Perms.READ, Characteristic.Perms.NOTIFY]
  });
  this.value = this.getDefaultValue();
};

util.inherits(Characteristic.Reachable, Characteristic);

Characteristic.Reachable.UUID = '00000063-0000-1000-8000-0026BB765291';

/**
 * Characteristic "Relay Control Point"
 */

Characteristic.RelayControlPoint = function() {
  Characteristic.call(this, 'Relay Control Point', '0000005E-0000-1000-8000-0026BB765291');
  this.setProps({
    format: Characteristic.Formats.TLV8,
    perms: [Characteristic.Perms.READ, Characteristic.Perms.WRITE, Characteristic.Perms.NOTIFY]
  });
  this.value = this.getDefaultValue();
};

util.inherits(Characteristic.RelayControlPoint, Characteristic);

Characteristic.RelayControlPoint.UUID = '0000005E-0000-1000-8000-0026BB765291';

/**
 * Characteristic "Relay Enabled"
 */

Characteristic.RelayEnabled = function() {
  Characteristic.call(this, 'Relay Enabled', '0000005B-0000-1000-8000-0026BB765291');
  this.setProps({
    format: Characteristic.Formats.BOOL,
    perms: [Characteristic.Perms.READ, Characteristic.Perms.WRITE, Characteristic.Perms.NOTIFY]
  });
  this.value = this.getDefaultValue();
};

util.inherits(Characteristic.RelayEnabled, Characteristic);

Characteristic.RelayEnabled.UUID = '0000005B-0000-1000-8000-0026BB765291';

/**
 * Characteristic "Relay State"
 */

Characteristic.RelayState = function() {
  Characteristic.call(this, 'Relay State', '0000005C-0000-1000-8000-0026BB765291');
  this.setProps({
    format: Characteristic.Formats.UINT8,
    perms: [Characteristic.Perms.READ, Characteristic.Perms.NOTIFY]
  });
  this.value = this.getDefaultValue();
};

util.inherits(Characteristic.RelayState, Characteristic);

Characteristic.RelayState.UUID = '0000005C-0000-1000-8000-0026BB765291';


/**
 * Characteristic "Time Update"
 */

Characteristic.TimeUpdate = function() {
  Characteristic.call(this, 'Time Update', '0000009A-0000-1000-8000-0026BB765291');
  this.setProps({
    format: Characteristic.Formats.BOOL,
    perms: [Characteristic.Perms.READ, Characteristic.Perms.NOTIFY]
  });
  this.value = this.getDefaultValue();
};

util.inherits(Characteristic.TimeUpdate, Characteristic);

Characteristic.TimeUpdate.UUID = '0000009A-0000-1000-8000-0026BB765291';

/**
 * Characteristic "Tunnel Connection Timeout "
 */

Characteristic.TunnelConnectionTimeout = function() {
  Characteristic.call(this, 'Tunnel Connection Timeout ', '00000061-0000-1000-8000-0026BB765291');
  this.setProps({
    format: Characteristic.Formats.UINT32,
    perms: [Characteristic.Perms.WRITE, Characteristic.Perms.READ, Characteristic.Perms.NOTIFY]
  });
  this.value = this.getDefaultValue();
};

util.inherits(Characteristic.TunnelConnectionTimeout, Characteristic);

Characteristic.TunnelConnectionTimeout.UUID = '00000061-0000-1000-8000-0026BB765291';

/**
 * Characteristic "Tunneled Accessory Advertising"
 */

Characteristic.TunneledAccessoryAdvertising = function() {
  Characteristic.call(this, 'Tunneled Accessory Advertising', '00000060-0000-1000-8000-0026BB765291');
  this.setProps({
    format: Characteristic.Formats.BOOL,
    perms: [Characteristic.Perms.WRITE, Characteristic.Perms.READ, Characteristic.Perms.NOTIFY]
  });
  this.value = this.getDefaultValue();
};

util.inherits(Characteristic.TunneledAccessoryAdvertising, Characteristic);

Characteristic.TunneledAccessoryAdvertising.UUID = '00000060-0000-1000-8000-0026BB765291';

/**
 * Characteristic "Tunneled Accessory Connected"
 */

Characteristic.TunneledAccessoryConnected = function() {
  Characteristic.call(this, 'Tunneled Accessory Connected', '00000059-0000-1000-8000-0026BB765291');
  this.setProps({
    format: Characteristic.Formats.BOOL,
    perms: [Characteristic.Perms.WRITE, Characteristic.Perms.READ, Characteristic.Perms.NOTIFY]
  });
  this.value = this.getDefaultValue();
};

util.inherits(Characteristic.TunneledAccessoryConnected, Characteristic);

Characteristic.TunneledAccessoryConnected.UUID = '00000059-0000-1000-8000-0026BB765291';

/**
 * Characteristic "Tunneled Accessory State Number"
 */

Characteristic.TunneledAccessoryStateNumber = function() {
  Characteristic.call(this, 'Tunneled Accessory State Number', '00000058-0000-1000-8000-0026BB765291');
  this.setProps({
    format: Characteristic.Formats.FLOAT,
    perms: [Characteristic.Perms.READ, Characteristic.Perms.NOTIFY]
  });
  this.value = this.getDefaultValue();
};

util.inherits(Characteristic.TunneledAccessoryStateNumber, Characteristic);

Characteristic.TunneledAccessoryStateNumber.UUID = '00000058-0000-1000-8000-0026BB765291';

/**
 * Characteristic "Version"
 */

Characteristic.Version = function() {
  Characteristic.call(this, 'Version', '00000037-0000-1000-8000-0026BB765291');
  this.setProps({
    format: Characteristic.Formats.STRING,
    perms: [Characteristic.Perms.READ, Characteristic.Perms.NOTIFY]
  });
  this.value = this.getDefaultValue();
};

util.inherits(Characteristic.Version, Characteristic);

Characteristic.Version.UUID = '00000037-0000-1000-8000-0026BB765291';



module.exports = Characteristic;