'use strict';
const util           = require('util');
const EventEmitter   = require('events');
const Characteristic = require('./Characteristic');
const clone          = require('./util/clone');
/**
 * Service represents a set of grouped values necessary to provide a logical function. For instance, a
 * "Door Lock Mechanism" service might contain two values, one for the "desired lock state" and one for the
 * "current lock state". A particular Service is distinguished from others by its "type", which is a UUID.
 * HomeKit provides a set of known Service UUIDs defined in HomeKitTypes.js along with a corresponding
 * concrete subclass that you can instantiate directly to setup the necessary values. These natively-supported
 * Services are expected to contain a particular set of Characteristics.
 *
 * Unlike Characteristics, where you cannot have two Characteristics with the same UUID in the same Service,
 * you can actually have multiple Services with the same UUID in a single Accessory. For instance, imagine
 * a Garage Door Opener with both a "security light" and a "backlight" for the display. Each light could be
 * a "Lightbulb" Service with the same UUID. To account for this situation, we define an extra "subtype"
 * property on Service, that can be a string or other string-convertible object that uniquely identifies the
 * Service among its peers in an Accessory. For instance, you might have `service1.subtype = 'security_light'`
 * for one and `service2.subtype = 'backlight'` for the other.
 *
 * You can also define custom Services by providing your own UUID for the type that you generate yourself.
 * Custom Services can contain an arbitrary set of Characteristics, but Siri will likely not be able to
 * work with these.
 *
 * @event 'characteristic-change' => function({characteristic, oldValue, newValue, context}) { }
 *        Emitted after a change in the value of one of our Characteristics has occurred.
 */

function Service(displayName, UUID, subtype) {
  
  if (!UUID) throw new Error("Services must be created with a valid UUID.");

  this.displayName = displayName;
  this.UUID = UUID;
  this.subtype = subtype;
  this.iid = null; // assigned later by our containing Accessory
  this.characteristics = [];
  this.optionalCharacteristics = [];
  
  // every service has an optional Characteristic.Name property - we'll set it to our displayName
  // if one was given
  // if you don't provide a display name, some HomeKit apps may choose to hide the device.
  if (displayName) {
    // create the characteristic if necessary
    var nameCharacteristic =
      this.getCharacteristic(Characteristic.Name) ||
      this.addCharacteristic(Characteristic.Name);
    
    nameCharacteristic.setValue(displayName);
  }
}

util.inherits(Service, EventEmitter);

Service.prototype.addCharacteristic = function(characteristic) {
  // characteristic might be a constructor like `Characteristic.Brightness` instead of an instance
  // of Characteristic. Coerce if necessary.
  if (typeof characteristic === 'function') {
	  characteristic = new (Function.prototype.bind.apply(characteristic, arguments));
  }
  // check for UUID conflict
  for (var index in this.characteristics) {
    var existing = this.characteristics[index];
    if (existing.UUID === characteristic.UUID)
      throw new Error("Cannot add a Characteristic with the same UUID as another Characteristic in this Service: " + existing.UUID);
  }
  
  // listen for changes in characteristics and bubble them up
  characteristic.on('change', function(change) {
    // make a new object with the relevant characteristic added, and bubble it up
    this.emit('characteristic-change', clone(change, {characteristic:characteristic}));
  }.bind(this));

  this.characteristics.push(characteristic);

  this.emit('service-configurationChange', clone({service:this}));

  return characteristic;
}

Service.prototype.removeCharacteristic = function(characteristic) {
  var targetCharacteristicIndex;

  for (var index in this.characteristics) {
    var existingCharacteristic = this.characteristics[index];
    
    if (existingCharacteristic === characteristic) {
      targetCharacteristicIndex = index;
      break;
    }
  }

  if (targetCharacteristicIndex) {
    this.characteristics.splice(targetCharacteristicIndex, 1);
    characteristic.removeAllListeners();

    this.emit('service-configurationChange', clone({service:this}));
  }
}

Service.prototype.getCharacteristic = function(name) {
	// returns a characteristic object from the service
	// If  Service.prototype.getCharacteristic(Characteristic.Type)  does not find the characteristic, 
	// but the type is in optionalCharacteristics, it adds the characteristic.type to the service and returns it.
	var index, characteristic;
	for (index in this.characteristics) {
		characteristic = this.characteristics[index];
		if (typeof name === 'string' && characteristic.displayName === name) {
			return characteristic;
		}
		else if (typeof name === 'function' && ((characteristic instanceof name) || (name.UUID === characteristic.UUID))) {
			return characteristic;
		}
	}
	if (typeof name === 'function')  {
		for (index in this.optionalCharacteristics) {
			characteristic = this.optionalCharacteristics[index];
			if ((characteristic instanceof name) || (name.UUID === characteristic.UUID)) {
				return this.addCharacteristic(name);
			}
		}
	}
};

Service.prototype.testCharacteristic = function(name) {
	// checks for the existence of a characteristic object in the service
	var index, characteristic;
	for (index in this.characteristics) {
		characteristic = this.characteristics[index];
		if (typeof name === 'string' && characteristic.displayName === name) {
			return true;
		}
		else if (typeof name === 'function' && ((characteristic instanceof name) || (name.UUID === characteristic.UUID))) {
			return true;
		}
	}
	return false;
}

Service.prototype.setCharacteristic = function(name, value) {
  this.getCharacteristic(name).setValue(value);
  return this; // for chaining
}

// A function to only updating the remote value, but not firiring the 'set' event.
Service.prototype.updateCharacteristic = function(name, value){
  this.getCharacteristic(name).updateValue(value);
  return this;
}

Service.prototype.addOptionalCharacteristic = function(characteristic) {
  // characteristic might be a constructor like `Characteristic.Brightness` instead of an instance
  // of Characteristic. Coerce if necessary.
  if (typeof characteristic === 'function')
    characteristic = new characteristic();

  this.optionalCharacteristics.push(characteristic);
}

Service.prototype.getCharacteristicByIID = function(iid) {
  for (var index in this.characteristics) {
    var characteristic = this.characteristics[index];
    if (characteristic.iid === iid)
      return characteristic;
  }
}

Service.prototype._assignIDs = function(identifierCache, accessoryName) {
  
  // the Accessory Information service must have a (reserved by IdentifierCache) ID of 1
  if (this.UUID === '0000003E-0000-1000-8000-0026BB765291') {
    this.iid = 1;
  }
  else {
    // assign our own ID based on our UUID
    this.iid = identifierCache.getIID(accessoryName, this.UUID, this.subtype);
  }
  
  // assign IIDs to our Characteristics
  for (var index in this.characteristics) {
    var characteristic = this.characteristics[index];
    characteristic._assignID(identifierCache, accessoryName, this.UUID, this.subtype);
  }
}

/**
 * Returns a JSON representation of this Accessory suitable for delivering to HAP clients.
 */
Service.prototype.toHAP = function(opt) {
  
  var characteristicsHAP = [];
  
  for (var index in this.characteristics) {
    var characteristic = this.characteristics[index];
    characteristicsHAP.push(characteristic.toHAP(opt));
  }
  
  var hap = {
    iid: this.iid,
    type: this.UUID,
    characteristics: characteristicsHAP
  };

  if (this.isPrimaryService !== undefined) {
    hap['primary'] = this.isPrimaryService;
  }

  return hap;
}

Service.prototype._setupCharacteristic = function(characteristic) {
  // listen for changes in characteristics and bubble them up
  characteristic.on('change', function(change) {
    // make a new object with the relevant characteristic added, and bubble it up
    this.emit('characteristic-change', clone(change, {characteristic:characteristic}));
  }.bind(this));
}

Service.prototype._sideloadCharacteristics = function(targetCharacteristics) {
  for (var index in targetCharacteristics) {
    var target = targetCharacteristics[index];
    this._setupCharacteristic(target);
  }
  
  this.characteristics = targetCharacteristics.slice();
}

/**
 * Service "Accessory Information"
 */

Service.AccessoryInformation = function(displayName, subtype) {
  Service.call(this, displayName, '0000003E-0000-1000-8000-0026BB765291', subtype);

  // Required Characteristics
  this.addCharacteristic(Characteristic.Identify);
  this.addCharacteristic(Characteristic.Manufacturer);
  this.addCharacteristic(Characteristic.Model);
  this.addCharacteristic(Characteristic.Name);
  this.addCharacteristic(Characteristic.SerialNumber);

  // Optional Characteristics
  this.addOptionalCharacteristic(Characteristic.FirmwareRevision);
  this.addOptionalCharacteristic(Characteristic.HardwareRevision);
  this.addOptionalCharacteristic(Characteristic.SoftwareRevision);
  this.addOptionalCharacteristic(Characteristic.AccessoryFlags);
  this.addOptionalCharacteristic(Characteristic.AppMatchingIdentifier);
};

util.inherits(Service.AccessoryInformation, Service);

Service.AccessoryInformation.UUID = '0000003E-0000-1000-8000-0026BB765291';

/**
 * Service "Air Purifier"
 */

Service.AirPurifier = function(displayName, subtype) {
  Service.call(this, displayName, '000000BB-0000-1000-8000-0026BB765291', subtype);

  // Required Characteristics
  this.addCharacteristic(Characteristic.Active);
  this.addCharacteristic(Characteristic.CurrentAirPurifierState);
  this.addCharacteristic(Characteristic.TargetAirPurifierState);

  // Optional Characteristics
  this.addOptionalCharacteristic(Characteristic.LockPhysicalControls);
  this.addOptionalCharacteristic(Characteristic.Name);
  this.addOptionalCharacteristic(Characteristic.SwingMode);
  this.addOptionalCharacteristic(Characteristic.RotationSpeed);
};

util.inherits(Service.AirPurifier, Service);

Service.AirPurifier.UUID = '000000BB-0000-1000-8000-0026BB765291';

/**
 * Service "Air Quality Sensor"
 */

Service.AirQualitySensor = function(displayName, subtype) {
  Service.call(this, displayName, '0000008D-0000-1000-8000-0026BB765291', subtype);

  // Required Characteristics
  this.addCharacteristic(Characteristic.AirQuality);

  // Optional Characteristics
  this.addOptionalCharacteristic(Characteristic.StatusActive);
  this.addOptionalCharacteristic(Characteristic.StatusFault);
  this.addOptionalCharacteristic(Characteristic.StatusTampered);
  this.addOptionalCharacteristic(Characteristic.StatusLowBattery);
  this.addOptionalCharacteristic(Characteristic.Name);
  this.addOptionalCharacteristic(Characteristic.OzoneDensity);
  this.addOptionalCharacteristic(Characteristic.NitrogenDioxideDensity);
  this.addOptionalCharacteristic(Characteristic.SulphurDioxideDensity);
  this.addOptionalCharacteristic(Characteristic.PM2_5Density);
  this.addOptionalCharacteristic(Characteristic.PM10Density);
  this.addOptionalCharacteristic(Characteristic.VOCDensity);
  this.addOptionalCharacteristic(Characteristic.CarbonMonoxideLevel);
  this.addOptionalCharacteristic(Characteristic.CarbonDioxideLevel);
};

util.inherits(Service.AirQualitySensor, Service);

Service.AirQualitySensor.UUID = '0000008D-0000-1000-8000-0026BB765291';

/**
 * Service "Battery Service"
 */

Service.BatteryService = function(displayName, subtype) {
  Service.call(this, displayName, '00000096-0000-1000-8000-0026BB765291', subtype);

  // Required Characteristics
  this.addCharacteristic(Characteristic.BatteryLevel);
  this.addCharacteristic(Characteristic.ChargingState);
  this.addCharacteristic(Characteristic.StatusLowBattery);

  // Optional Characteristics
  this.addOptionalCharacteristic(Characteristic.Name);
};

util.inherits(Service.BatteryService, Service);

Service.BatteryService.UUID = '00000096-0000-1000-8000-0026BB765291';

/**
 * Service "Camera Control"
 */

Service.CameraControl = function(displayName, subtype) {
  Service.call(this, displayName, '00000111-0000-1000-8000-0026BB765291', subtype);

  // Required Characteristics
  this.addCharacteristic(Characteristic.On);

  // Optional Characteristics
  this.addOptionalCharacteristic(Characteristic.CurrentHorizontalTiltAngle);
  this.addOptionalCharacteristic(Characteristic.CurrentVerticalTiltAngle);
  this.addOptionalCharacteristic(Characteristic.TargetHorizontalTiltAngle);
  this.addOptionalCharacteristic(Characteristic.TargetVerticalTiltAngle);
  this.addOptionalCharacteristic(Characteristic.NightVision);
  this.addOptionalCharacteristic(Characteristic.OpticalZoom);
  this.addOptionalCharacteristic(Characteristic.DigitalZoom);
  this.addOptionalCharacteristic(Characteristic.ImageRotation);
  this.addOptionalCharacteristic(Characteristic.ImageMirroring);
  this.addOptionalCharacteristic(Characteristic.Name);
};

util.inherits(Service.CameraControl, Service);

Service.CameraControl.UUID = '00000111-0000-1000-8000-0026BB765291';

/**
 * Service "Camera RTP Stream Management"
 */

Service.CameraRTPStreamManagement = function(displayName, subtype) {
  Service.call(this, displayName, '00000110-0000-1000-8000-0026BB765291', subtype);

  // Required Characteristics
  this.addCharacteristic(Characteristic.SupportedVideoStreamConfiguration);
  this.addCharacteristic(Characteristic.SupportedAudioStreamConfiguration);
  this.addCharacteristic(Characteristic.SupportedRTPConfiguration);
  this.addCharacteristic(Characteristic.SelectedStreamConfiguration);
  this.addCharacteristic(Characteristic.StreamingStatus);
  this.addCharacteristic(Characteristic.SetupEndpoints);

  // Optional Characteristics
  this.addOptionalCharacteristic(Characteristic.Name);
};

util.inherits(Service.CameraRTPStreamManagement, Service);

Service.CameraRTPStreamManagement.UUID = '00000110-0000-1000-8000-0026BB765291';

/**
 * Service "Carbon Dioxide Sensor"
 */

Service.CarbonDioxideSensor = function(displayName, subtype) {
  Service.call(this, displayName, '00000097-0000-1000-8000-0026BB765291', subtype);

  // Required Characteristics
  this.addCharacteristic(Characteristic.CarbonDioxideDetected);

  // Optional Characteristics
  this.addOptionalCharacteristic(Characteristic.StatusActive);
  this.addOptionalCharacteristic(Characteristic.StatusFault);
  this.addOptionalCharacteristic(Characteristic.StatusLowBattery);
  this.addOptionalCharacteristic(Characteristic.StatusTampered);
  this.addOptionalCharacteristic(Characteristic.CarbonDioxideLevel);
  this.addOptionalCharacteristic(Characteristic.CarbonDioxidePeakLevel);
  this.addOptionalCharacteristic(Characteristic.Name);
};

util.inherits(Service.CarbonDioxideSensor, Service);

Service.CarbonDioxideSensor.UUID = '00000097-0000-1000-8000-0026BB765291';

/**
 * Service "Carbon Monoxide Sensor"
 */

Service.CarbonMonoxideSensor = function(displayName, subtype) {
  Service.call(this, displayName, '0000007F-0000-1000-8000-0026BB765291', subtype);

  // Required Characteristics
  this.addCharacteristic(Characteristic.CarbonMonoxideDetected);

  // Optional Characteristics
  this.addOptionalCharacteristic(Characteristic.StatusActive);
  this.addOptionalCharacteristic(Characteristic.StatusFault);
  this.addOptionalCharacteristic(Characteristic.StatusLowBattery);
  this.addOptionalCharacteristic(Characteristic.StatusTampered);
  this.addOptionalCharacteristic(Characteristic.CarbonMonoxideLevel);
  this.addOptionalCharacteristic(Characteristic.CarbonMonoxidePeakLevel);
  this.addOptionalCharacteristic(Characteristic.Name);
};

util.inherits(Service.CarbonMonoxideSensor, Service);

Service.CarbonMonoxideSensor.UUID = '0000007F-0000-1000-8000-0026BB765291';

/**
 * Service "Contact Sensor"
 */

Service.ContactSensor = function(displayName, subtype) {
  Service.call(this, displayName, '00000080-0000-1000-8000-0026BB765291', subtype);

  // Required Characteristics
  this.addCharacteristic(Characteristic.ContactSensorState);

  // Optional Characteristics
  this.addOptionalCharacteristic(Characteristic.StatusActive);
  this.addOptionalCharacteristic(Characteristic.StatusFault);
  this.addOptionalCharacteristic(Characteristic.StatusTampered);
  this.addOptionalCharacteristic(Characteristic.StatusLowBattery);
  this.addOptionalCharacteristic(Characteristic.Name);
};

util.inherits(Service.ContactSensor, Service);

Service.ContactSensor.UUID = '00000080-0000-1000-8000-0026BB765291';

/**
 * Service "Door"
 */

Service.Door = function(displayName, subtype) {
  Service.call(this, displayName, '00000081-0000-1000-8000-0026BB765291', subtype);

  // Required Characteristics
  this.addCharacteristic(Characteristic.CurrentPosition);
  this.addCharacteristic(Characteristic.PositionState);
  this.addCharacteristic(Characteristic.TargetPosition);

  // Optional Characteristics
  this.addOptionalCharacteristic(Characteristic.HoldPosition);
  this.addOptionalCharacteristic(Characteristic.ObstructionDetected);
  this.addOptionalCharacteristic(Characteristic.Name);
};

util.inherits(Service.Door, Service);

Service.Door.UUID = '00000081-0000-1000-8000-0026BB765291';

/**
 * Service "Doorbell"
 */

Service.Doorbell = function(displayName, subtype) {
  Service.call(this, displayName, '00000121-0000-1000-8000-0026BB765291', subtype);

  // Required Characteristics
  this.addCharacteristic(Characteristic.ProgrammableSwitchEvent);

  // Optional Characteristics
  this.addOptionalCharacteristic(Characteristic.Brightness);
  this.addOptionalCharacteristic(Characteristic.Volume);
  this.addOptionalCharacteristic(Characteristic.Name);
};

util.inherits(Service.Doorbell, Service);

Service.Doorbell.UUID = '00000121-0000-1000-8000-0026BB765291';

/**
 * Service "Fan"
 */
Service.Fan = function(displayName, subtype) {
  Service.call(this, displayName, '00000040-0000-1000-8000-0026BB765291', subtype);

  // Required Characteristics
  this.addCharacteristic(Characteristic.On);

  // Optional Characteristics
  this.addOptionalCharacteristic(Characteristic.RotationDirection);
  this.addOptionalCharacteristic(Characteristic.RotationSpeed);
  this.addOptionalCharacteristic(Characteristic.Name);
};

util.inherits(Service.Fan, Service);

Service.Fan.UUID = '00000040-0000-1000-8000-0026BB765291';

/**
 * Service "Fan v2"
 */

Service.Fanv2 = function(displayName, subtype) {
  Service.call(this, displayName, '000000B7-0000-1000-8000-0026BB765291', subtype);

  // Required Characteristics
  this.addCharacteristic(Characteristic.Active);

  // Optional Characteristics
  this.addOptionalCharacteristic(Characteristic.CurrentFanState);
  this.addOptionalCharacteristic(Characteristic.TargetFanState);
  this.addOptionalCharacteristic(Characteristic.LockPhysicalControls);
  this.addOptionalCharacteristic(Characteristic.Name);
  this.addOptionalCharacteristic(Characteristic.RotationDirection);
  this.addOptionalCharacteristic(Characteristic.RotationSpeed);
  this.addOptionalCharacteristic(Characteristic.SwingMode);
};

util.inherits(Service.Fanv2, Service);

Service.Fanv2.UUID = '000000B7-0000-1000-8000-0026BB765291';

/**
 * Service "Filter Maintenance"
 */

Service.FilterMaintenance = function(displayName, subtype) {
  Service.call(this, displayName, '000000BA-0000-1000-8000-0026BB765291', subtype);

  // Required Characteristics
  this.addCharacteristic(Characteristic.FilterChangeIndication);

  // Optional Characteristics
  this.addOptionalCharacteristic(Characteristic.FilterLifeLevel);
  this.addOptionalCharacteristic(Characteristic.ResetFilterIndication);
  this.addOptionalCharacteristic(Characteristic.Name);
};

util.inherits(Service.FilterMaintenance, Service);

Service.FilterMaintenance.UUID = '000000BA-0000-1000-8000-0026BB765291';

/**
 * Service "Garage Door Opener"
 */

Service.GarageDoorOpener = function(displayName, subtype) {
  Service.call(this, displayName, '00000041-0000-1000-8000-0026BB765291', subtype);

  // Required Characteristics
  this.addCharacteristic(Characteristic.CurrentDoorState);
  this.addCharacteristic(Characteristic.TargetDoorState);
  this.addCharacteristic(Characteristic.ObstructionDetected);

  // Optional Characteristics
  this.addOptionalCharacteristic(Characteristic.LockCurrentState);
  this.addOptionalCharacteristic(Characteristic.LockTargetState);
  this.addOptionalCharacteristic(Characteristic.Name);
};

util.inherits(Service.GarageDoorOpener, Service);

Service.GarageDoorOpener.UUID = '00000041-0000-1000-8000-0026BB765291';

/**
 * Service "Heater Cooler"
 */

Service.HeaterCooler = function(displayName, subtype) {
  Service.call(this, displayName, '000000BC-0000-1000-8000-0026BB765291', subtype);

  // Required Characteristics
  this.addCharacteristic(Characteristic.Active);
  this.addCharacteristic(Characteristic.CurrentHeaterCoolerState);
  this.addCharacteristic(Characteristic.TargetHeaterCoolerState);
  this.addCharacteristic(Characteristic.CurrentTemperature);

  // Optional Characteristics
  this.addOptionalCharacteristic(Characteristic.LockPhysicalControls);
  this.addOptionalCharacteristic(Characteristic.Name);
  this.addOptionalCharacteristic(Characteristic.SwingMode);
  this.addOptionalCharacteristic(Characteristic.CoolingThresholdTemperature);
  this.addOptionalCharacteristic(Characteristic.HeatingThresholdTemperature);
  this.addOptionalCharacteristic(Characteristic.TemperatureDisplayUnits);
  this.addOptionalCharacteristic(Characteristic.RotationSpeed);
};

util.inherits(Service.HeaterCooler, Service);

Service.HeaterCooler.UUID = '000000BC-0000-1000-8000-0026BB765291';

/**
 * Service "Humidifier Dehumidifier"
 */

Service.HumidifierDehumidifier = function(displayName, subtype) {
  Service.call(this, displayName, '000000BD-0000-1000-8000-0026BB765291', subtype);

  // Required Characteristics
  this.addCharacteristic(Characteristic.CurrentRelativeHumidity);
  this.addCharacteristic(Characteristic.CurrentHumidifierDehumidifierState);
  this.addCharacteristic(Characteristic.TargetHumidifierDehumidifierState);
  this.addCharacteristic(Characteristic.Active);

  // Optional Characteristics
  this.addOptionalCharacteristic(Characteristic.LockPhysicalControls);
  this.addOptionalCharacteristic(Characteristic.Name);
  this.addOptionalCharacteristic(Characteristic.SwingMode);
  this.addOptionalCharacteristic(Characteristic.WaterLevel);
  this.addOptionalCharacteristic(Characteristic.RelativeHumidityDehumidifierThreshold);
  this.addOptionalCharacteristic(Characteristic.RelativeHumidityHumidifierThreshold);
  this.addOptionalCharacteristic(Characteristic.RotationSpeed);
};

util.inherits(Service.HumidifierDehumidifier, Service);

Service.HumidifierDehumidifier.UUID = '000000BD-0000-1000-8000-0026BB765291';

/**
 * Service "Humidity Sensor"
 */

Service.HumiditySensor = function(displayName, subtype) {
  Service.call(this, displayName, '00000082-0000-1000-8000-0026BB765291', subtype);

  // Required Characteristics
  this.addCharacteristic(Characteristic.CurrentRelativeHumidity);

  // Optional Characteristics
  this.addOptionalCharacteristic(Characteristic.StatusActive);
  this.addOptionalCharacteristic(Characteristic.StatusFault);
  this.addOptionalCharacteristic(Characteristic.StatusTampered);
  this.addOptionalCharacteristic(Characteristic.StatusLowBattery);
  this.addOptionalCharacteristic(Characteristic.Name);
};

util.inherits(Service.HumiditySensor, Service);

Service.HumiditySensor.UUID = '00000082-0000-1000-8000-0026BB765291';

/**
 * Service "Leak Sensor"
 */

Service.LeakSensor = function(displayName, subtype) {
  Service.call(this, displayName, '00000083-0000-1000-8000-0026BB765291', subtype);

  // Required Characteristics
  this.addCharacteristic(Characteristic.LeakDetected);

  // Optional Characteristics
  this.addOptionalCharacteristic(Characteristic.StatusActive);
  this.addOptionalCharacteristic(Characteristic.StatusFault);
  this.addOptionalCharacteristic(Characteristic.StatusTampered);
  this.addOptionalCharacteristic(Characteristic.StatusLowBattery);
  this.addOptionalCharacteristic(Characteristic.Name);
};

util.inherits(Service.LeakSensor, Service);

Service.LeakSensor.UUID = '00000083-0000-1000-8000-0026BB765291';

/**
 * Service "Light Sensor"
 */

Service.LightSensor = function(displayName, subtype) {
  Service.call(this, displayName, '00000084-0000-1000-8000-0026BB765291', subtype);

  // Required Characteristics
  this.addCharacteristic(Characteristic.CurrentAmbientLightLevel);

  // Optional Characteristics
  this.addOptionalCharacteristic(Characteristic.StatusActive);
  this.addOptionalCharacteristic(Characteristic.StatusFault);
  this.addOptionalCharacteristic(Characteristic.StatusTampered);
  this.addOptionalCharacteristic(Characteristic.StatusLowBattery);
  this.addOptionalCharacteristic(Characteristic.Name);
};

util.inherits(Service.LightSensor, Service);

Service.LightSensor.UUID = '00000084-0000-1000-8000-0026BB765291';

/**
 * Service "Lightbulb"
 */

Service.Lightbulb = function(displayName, subtype) {
  Service.call(this, displayName, '00000043-0000-1000-8000-0026BB765291', subtype);

  // Required Characteristics
  this.addCharacteristic(Characteristic.On);

  // Optional Characteristics
  this.addOptionalCharacteristic(Characteristic.Brightness);
  this.addOptionalCharacteristic(Characteristic.Hue);
  this.addOptionalCharacteristic(Characteristic.Saturation);
  this.addOptionalCharacteristic(Characteristic.Name);
	
  this.addOptionalCharacteristic(Characteristic.ColorTemperature); //Manual fix to add temperature
};

util.inherits(Service.Lightbulb, Service);

Service.Lightbulb.UUID = '00000043-0000-1000-8000-0026BB765291';

/**
 * Service "Lock Management"
 */

Service.LockManagement = function(displayName, subtype) {
  Service.call(this, displayName, '00000044-0000-1000-8000-0026BB765291', subtype);

  // Required Characteristics
  this.addCharacteristic(Characteristic.LockControlPoint);
  this.addCharacteristic(Characteristic.Version);

  // Optional Characteristics
  this.addOptionalCharacteristic(Characteristic.Logs);
  this.addOptionalCharacteristic(Characteristic.AudioFeedback);
  this.addOptionalCharacteristic(Characteristic.LockManagementAutoSecurityTimeout);
  this.addOptionalCharacteristic(Characteristic.AdministratorOnlyAccess);
  this.addOptionalCharacteristic(Characteristic.LockLastKnownAction);
  this.addOptionalCharacteristic(Characteristic.CurrentDoorState);
  this.addOptionalCharacteristic(Characteristic.MotionDetected);
  this.addOptionalCharacteristic(Characteristic.Name);
};

util.inherits(Service.LockManagement, Service);

Service.LockManagement.UUID = '00000044-0000-1000-8000-0026BB765291';

/**
 * Service "Lock Mechanism"
 */

Service.LockMechanism = function(displayName, subtype) {
  Service.call(this, displayName, '00000045-0000-1000-8000-0026BB765291', subtype);

  // Required Characteristics
  this.addCharacteristic(Characteristic.LockCurrentState);
  this.addCharacteristic(Characteristic.LockTargetState);

  // Optional Characteristics
  this.addOptionalCharacteristic(Characteristic.Name);
};

util.inherits(Service.LockMechanism, Service);

Service.LockMechanism.UUID = '00000045-0000-1000-8000-0026BB765291';

/**
 * Service "Microphone"
 */

Service.Microphone = function(displayName, subtype) {
  Service.call(this, displayName, '00000112-0000-1000-8000-0026BB765291', subtype);

  // Required Characteristics
  this.addCharacteristic(Characteristic.Mute);

  // Optional Characteristics
  this.addOptionalCharacteristic(Characteristic.Volume);
  this.addOptionalCharacteristic(Characteristic.Name);
};

util.inherits(Service.Microphone, Service);

Service.Microphone.UUID = '00000112-0000-1000-8000-0026BB765291';

/**
 * Service "Motion Sensor"
 */

Service.MotionSensor = function(displayName, subtype) {
  Service.call(this, displayName, '00000085-0000-1000-8000-0026BB765291', subtype);

  // Required Characteristics
  this.addCharacteristic(Characteristic.MotionDetected);

  // Optional Characteristics
  this.addOptionalCharacteristic(Characteristic.StatusActive);
  this.addOptionalCharacteristic(Characteristic.StatusFault);
  this.addOptionalCharacteristic(Characteristic.StatusTampered);
  this.addOptionalCharacteristic(Characteristic.StatusLowBattery);
  this.addOptionalCharacteristic(Characteristic.Name);
};

util.inherits(Service.MotionSensor, Service);

Service.MotionSensor.UUID = '00000085-0000-1000-8000-0026BB765291';

/**
 * Service "Occupancy Sensor"
 */

Service.OccupancySensor = function(displayName, subtype) {
  Service.call(this, displayName, '00000086-0000-1000-8000-0026BB765291', subtype);

  // Required Characteristics
  this.addCharacteristic(Characteristic.OccupancyDetected);

  // Optional Characteristics
  this.addOptionalCharacteristic(Characteristic.StatusActive);
  this.addOptionalCharacteristic(Characteristic.StatusFault);
  this.addOptionalCharacteristic(Characteristic.StatusTampered);
  this.addOptionalCharacteristic(Characteristic.StatusLowBattery);
  this.addOptionalCharacteristic(Characteristic.Name);
};

util.inherits(Service.OccupancySensor, Service);

Service.OccupancySensor.UUID = '00000086-0000-1000-8000-0026BB765291';

/**
 * Service "Outlet"
 */

Service.Outlet = function(displayName, subtype) {
  Service.call(this, displayName, '00000047-0000-1000-8000-0026BB765291', subtype);

  // Required Characteristics
  this.addCharacteristic(Characteristic.On);
  this.addCharacteristic(Characteristic.OutletInUse);

  // Optional Characteristics
  this.addOptionalCharacteristic(Characteristic.Name);
};

util.inherits(Service.Outlet, Service);

Service.Outlet.UUID = '00000047-0000-1000-8000-0026BB765291';

/**
 * Service "Security System"
 */

Service.SecuritySystem = function(displayName, subtype) {
  Service.call(this, displayName, '0000007E-0000-1000-8000-0026BB765291', subtype);

  // Required Characteristics
  this.addCharacteristic(Characteristic.SecuritySystemCurrentState);
  this.addCharacteristic(Characteristic.SecuritySystemTargetState);

  // Optional Characteristics
  this.addOptionalCharacteristic(Characteristic.StatusFault);
  this.addOptionalCharacteristic(Characteristic.StatusTampered);
  this.addOptionalCharacteristic(Characteristic.SecuritySystemAlarmType);
  this.addOptionalCharacteristic(Characteristic.Name);
};

util.inherits(Service.SecuritySystem, Service);

Service.SecuritySystem.UUID = '0000007E-0000-1000-8000-0026BB765291';

/**
 * Service "Slat"
 */

Service.Slat = function(displayName, subtype) {
  Service.call(this, displayName, '000000B9-0000-1000-8000-0026BB765291', subtype);

  // Required Characteristics
  this.addCharacteristic(Characteristic.SlatType);
  this.addCharacteristic(Characteristic.CurrentSlatState);

  // Optional Characteristics
  this.addOptionalCharacteristic(Characteristic.Name);
  this.addOptionalCharacteristic(Characteristic.CurrentTiltAngle);
  this.addOptionalCharacteristic(Characteristic.TargetTiltAngle);
  this.addOptionalCharacteristic(Characteristic.SwingMode);
};

util.inherits(Service.Slat, Service);

Service.Slat.UUID = '000000B9-0000-1000-8000-0026BB765291';

/**
 * Service "Smoke Sensor"
 */

Service.SmokeSensor = function(displayName, subtype) {
  Service.call(this, displayName, '00000087-0000-1000-8000-0026BB765291', subtype);

  // Required Characteristics
  this.addCharacteristic(Characteristic.SmokeDetected);

  // Optional Characteristics
  this.addOptionalCharacteristic(Characteristic.StatusActive);
  this.addOptionalCharacteristic(Characteristic.StatusFault);
  this.addOptionalCharacteristic(Characteristic.StatusTampered);
  this.addOptionalCharacteristic(Characteristic.StatusLowBattery);
  this.addOptionalCharacteristic(Characteristic.Name);
};

util.inherits(Service.SmokeSensor, Service);

Service.SmokeSensor.UUID = '00000087-0000-1000-8000-0026BB765291';

/**
 * Service "Speaker"
 */

Service.Speaker = function(displayName, subtype) {
  Service.call(this, displayName, '00000113-0000-1000-8000-0026BB765291', subtype);

  // Required Characteristics
  this.addCharacteristic(Characteristic.Mute);

  // Optional Characteristics
  this.addOptionalCharacteristic(Characteristic.Volume);
  this.addOptionalCharacteristic(Characteristic.Name);
};

util.inherits(Service.Speaker, Service);

Service.Speaker.UUID = '00000113-0000-1000-8000-0026BB765291';

/**
 * Service "Stateful Programmable Switch"
 */

Service.StatefulProgrammableSwitch = function(displayName, subtype) {
  Service.call(this, displayName, '00000088-0000-1000-8000-0026BB765291', subtype);

  // Required Characteristics
  this.addCharacteristic(Characteristic.ProgrammableSwitchEvent);
  this.addCharacteristic(Characteristic.ProgrammableSwitchOutputState);

  // Optional Characteristics
  this.addOptionalCharacteristic(Characteristic.Name);
};

util.inherits(Service.StatefulProgrammableSwitch, Service);

Service.StatefulProgrammableSwitch.UUID = '00000088-0000-1000-8000-0026BB765291';

/**
 * Service "Stateless Programmable Switch"
 */

Service.StatelessProgrammableSwitch = function(displayName, subtype) {
  Service.call(this, displayName, '00000089-0000-1000-8000-0026BB765291', subtype);

  // Required Characteristics
  this.addCharacteristic(Characteristic.ProgrammableSwitchEvent);

  // Optional Characteristics
  this.addOptionalCharacteristic(Characteristic.Name);
};

util.inherits(Service.StatelessProgrammableSwitch, Service);

Service.StatelessProgrammableSwitch.UUID = '00000089-0000-1000-8000-0026BB765291';

/**
 * Service "Switch"
 */

Service.Switch = function(displayName, subtype) {
  Service.call(this, displayName, '00000049-0000-1000-8000-0026BB765291', subtype);

  // Required Characteristics
  this.addCharacteristic(Characteristic.On);

  // Optional Characteristics
  this.addOptionalCharacteristic(Characteristic.Name);
};

util.inherits(Service.Switch, Service);

Service.Switch.UUID = '00000049-0000-1000-8000-0026BB765291';

/**
 * Service "Temperature Sensor"
 */

Service.TemperatureSensor = function(displayName, subtype) {
  Service.call(this, displayName, '0000008A-0000-1000-8000-0026BB765291', subtype);

  // Required Characteristics
  this.addCharacteristic(Characteristic.CurrentTemperature);

  // Optional Characteristics
  this.addOptionalCharacteristic(Characteristic.StatusActive);
  this.addOptionalCharacteristic(Characteristic.StatusFault);
  this.addOptionalCharacteristic(Characteristic.StatusLowBattery);
  this.addOptionalCharacteristic(Characteristic.StatusTampered);
  this.addOptionalCharacteristic(Characteristic.Name);
};

util.inherits(Service.TemperatureSensor, Service);

Service.TemperatureSensor.UUID = '0000008A-0000-1000-8000-0026BB765291';

/**
 * Service "Thermostat"
 */

Service.Thermostat = function(displayName, subtype) {
  Service.call(this, displayName, '0000004A-0000-1000-8000-0026BB765291', subtype);

  // Required Characteristics
  this.addCharacteristic(Characteristic.CurrentHeatingCoolingState);
  this.addCharacteristic(Characteristic.TargetHeatingCoolingState);
  this.addCharacteristic(Characteristic.CurrentTemperature);
  this.addCharacteristic(Characteristic.TargetTemperature);
  this.addCharacteristic(Characteristic.TemperatureDisplayUnits);

  // Optional Characteristics
  this.addOptionalCharacteristic(Characteristic.CurrentRelativeHumidity);
  this.addOptionalCharacteristic(Characteristic.TargetRelativeHumidity);
  this.addOptionalCharacteristic(Characteristic.CoolingThresholdTemperature);
  this.addOptionalCharacteristic(Characteristic.HeatingThresholdTemperature);
  this.addOptionalCharacteristic(Characteristic.Name);
};

util.inherits(Service.Thermostat, Service);

Service.Thermostat.UUID = '0000004A-0000-1000-8000-0026BB765291';

/**
 * Service "Window"
 */

Service.Window = function(displayName, subtype) {
  Service.call(this, displayName, '0000008B-0000-1000-8000-0026BB765291', subtype);

  // Required Characteristics
  this.addCharacteristic(Characteristic.CurrentPosition);
  this.addCharacteristic(Characteristic.TargetPosition);
  this.addCharacteristic(Characteristic.PositionState);

  // Optional Characteristics
  this.addOptionalCharacteristic(Characteristic.HoldPosition);
  this.addOptionalCharacteristic(Characteristic.ObstructionDetected);
  this.addOptionalCharacteristic(Characteristic.Name);
};

util.inherits(Service.Window, Service);

Service.Window.UUID = '0000008B-0000-1000-8000-0026BB765291';

/**
 * Service "Window Covering"
 */

Service.WindowCovering = function(displayName, subtype) {
  Service.call(this, displayName, '0000008C-0000-1000-8000-0026BB765291', subtype);

  // Required Characteristics
  this.addCharacteristic(Characteristic.CurrentPosition);
  this.addCharacteristic(Characteristic.TargetPosition);
  this.addCharacteristic(Characteristic.PositionState);

  // Optional Characteristics
  this.addOptionalCharacteristic(Characteristic.HoldPosition);
  this.addOptionalCharacteristic(Characteristic.TargetHorizontalTiltAngle);
  this.addOptionalCharacteristic(Characteristic.TargetVerticalTiltAngle);
  this.addOptionalCharacteristic(Characteristic.CurrentHorizontalTiltAngle);
  this.addOptionalCharacteristic(Characteristic.CurrentVerticalTiltAngle);
  this.addOptionalCharacteristic(Characteristic.ObstructionDetected);
  this.addOptionalCharacteristic(Characteristic.Name);
};

util.inherits(Service.WindowCovering, Service);

Service.WindowCovering.UUID = '0000008C-0000-1000-8000-0026BB765291';



/**
 * Service "Bridge Configuration"
 */

Service.BridgeConfiguration = function(displayName, subtype) {
  Service.call(this, displayName, '000000A1-0000-1000-8000-0026BB765291', subtype);

  // Required Characteristics
  this.addCharacteristic(Characteristic.ConfigureBridgedAccessoryStatus);
  this.addCharacteristic(Characteristic.DiscoverBridgedAccessories);
  this.addCharacteristic(Characteristic.DiscoveredBridgedAccessories);
  this.addCharacteristic(Characteristic.ConfigureBridgedAccessory);

  // Optional Characteristics
  this.addOptionalCharacteristic(Characteristic.Name);
};

util.inherits(Service.BridgeConfiguration, Service);

Service.BridgeConfiguration.UUID = '000000A1-0000-1000-8000-0026BB765291';

/**
 * Service "Bridging State"
 */

Service.BridgingState = function(displayName, subtype) {
  Service.call(this, displayName, '00000062-0000-1000-8000-0026BB765291', subtype);

  // Required Characteristics
  this.addCharacteristic(Characteristic.Reachable);
  this.addCharacteristic(Characteristic.LinkQuality);
  this.addCharacteristic(Characteristic.AccessoryIdentifier);
  this.addCharacteristic(Characteristic.Category);

  // Optional Characteristics
  this.addOptionalCharacteristic(Characteristic.Name);
};

util.inherits(Service.BridgingState, Service);

Service.BridgingState.UUID = '00000062-0000-1000-8000-0026BB765291';

/**
 * Service "Pairing"
 */

Service.Pairing = function(displayName, subtype) {
  Service.call(this, displayName, '00000055-0000-1000-8000-0026BB765291', subtype);

  // Required Characteristics
  this.addCharacteristic(Characteristic.PairSetup);
  this.addCharacteristic(Characteristic.PairVerify);
  this.addCharacteristic(Characteristic.PairingFeatures);
  this.addCharacteristic(Characteristic.PairingPairings);

  // Optional Characteristics
};

util.inherits(Service.Pairing, Service);

Service.Pairing.UUID = '00000055-0000-1000-8000-0026BB765291';

/**
 * Service "Protocol Information"
 */

Service.ProtocolInformation = function(displayName, subtype) {
  Service.call(this, displayName, '000000A2-0000-1000-8000-0026BB765291', subtype);

  // Required Characteristics
  this.addCharacteristic(Characteristic.Version);

  // Optional Characteristics
};

util.inherits(Service.ProtocolInformation, Service);

Service.ProtocolInformation.UUID = '000000A2-0000-1000-8000-0026BB765291';

/**
 * Service "Relay"
 */

Service.Relay = function(displayName, subtype) {
  Service.call(this, displayName, '0000005A-0000-1000-8000-0026BB765291', subtype);

  // Required Characteristics
  this.addCharacteristic(Characteristic.RelayEnabled);
  this.addCharacteristic(Characteristic.RelayState);
  this.addCharacteristic(Characteristic.RelayControlPoint);

  // Optional Characteristics
};

util.inherits(Service.Relay, Service);

Service.Relay.UUID = '0000005A-0000-1000-8000-0026BB765291';

/**
 * Service "Time Information"
 */

Service.TimeInformation = function(displayName, subtype) {
  Service.call(this, displayName, '00000099-0000-1000-8000-0026BB765291', subtype);

  // Required Characteristics
  this.addCharacteristic(Characteristic.CurrentTime);
  this.addCharacteristic(Characteristic.DayoftheWeek);
  this.addCharacteristic(Characteristic.TimeUpdate);

  // Optional Characteristics
  this.addOptionalCharacteristic(Characteristic.Name);
};

util.inherits(Service.TimeInformation, Service);

Service.TimeInformation.UUID = '00000099-0000-1000-8000-0026BB765291';

/**
 * Service "Tunneled BTLE Accessory Service"
 */

Service.TunneledBTLEAccessoryService = function(displayName, subtype) {
  Service.call(this, displayName, '00000056-0000-1000-8000-0026BB765291', subtype);

  // Required Characteristics
  this.addCharacteristic(Characteristic.Name);
  this.addCharacteristic(Characteristic.AccessoryIdentifier);
  this.addCharacteristic(Characteristic.TunneledAccessoryStateNumber);
  this.addCharacteristic(Characteristic.TunneledAccessoryConnected);
  this.addCharacteristic(Characteristic.TunneledAccessoryAdvertising);
  this.addCharacteristic(Characteristic.TunnelConnectionTimeout);

  // Optional Characteristics
};

util.inherits(Service.TunneledBTLEAccessoryService, Service);

Service.TunneledBTLEAccessoryService.UUID = '00000056-0000-1000-8000-0026BB765291';


module.exports = Service;
