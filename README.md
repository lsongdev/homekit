## HomeKit ![homekit](https://img.shields.io/npm/v/homekit.svg)

> A HomeKit Accessory implementation in Node.js

### Installation

```bash
$ npm i homekit
```

#### Note:

On Linux and other systems using the avahi daemon the avahi dns_sd compat library and its header files are required. On debianesque systems the package name is libavahi-compat-libdnssd-dev. On other platforms Apple's mDNSResponder is recommended. Care should be taken not to install more than one mDNS stack on a system.

On Windows you are going to need Apples "Bonjour SDK for Windows". You can download it either from Apple (registration required) or various unofficial sources. Take your pick. After installing the SDK restart your shell or command prompt and make sure the BONJOUR_SDK_HOME environment variable is set. You'll also need a compiler. Microsoft Visual Studio Express will do. On Windows node >=0.7.9 is required.

```bash
sudo apt-get install avahi-daemon avahi-discover libnss-mdns libavahi-compat-libdnssd-dev
```


### Example

```js
const HomeKit = require('homekit');

const uuid = HomeKit.uuid.generate("homekit:yeelight");
const acce = new HomeKit.Accessory('Simple Light', uuid);

acce.on('identify', function(paired, callback) {
  console.log("Identify!");
  callback(); // success
});

acce
.addService(HomeKit.Service.Lightbulb, 'Yeelight')
.getCharacteristic(HomeKit.Characteristic.On)
.on('set', function(value, callback) {
  light.set_power(value, callback);
})

// Publish the Accessory on the local network.
acce.publish({
  port    : 51826,
  username: "CC:22:3D:E3:CE:F6",
  pincode : "031-45-154"
});
```


### Contributing
- Fork this Repo first
- Clone your Repo
- Install dependencies by `$ npm install`
- Checkout a feature branch
- Feel free to add your features
- Make sure your features are fully tested
- Publish your local branch, Open a pull request
- Enjoy hacking <3

### MIT

Copyright (c) 2016 Lsong &lt;song940@gmail.com&gt;

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.

---
