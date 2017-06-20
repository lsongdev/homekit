const fs = require('fs');
/**
 * [Storage description]
 * @param {[type]} filename [description]
 */
function Storage(filename){
  this.data = {};
  this.queue = [];
  this.filename = filename;
  return this;
}
/**
 * [get description]
 * @param  {[type]}   key      [description]
 * @param  {Function} callback [description]
 * @return {[type]}            [description]
 */
Storage.prototype.get = function(key, callback){
  return this.sync([ 'get', key, callback ]);
};
/**
 * [put description]
 * @param  {[type]}   key      [description]
 * @param  {[type]}   value    [description]
 * @param  {Function} callback [description]
 * @return {[type]}            [description]
 */
Storage.prototype.set = 
Storage.prototype.put = function(key, value, callback){
  return this.sync([ 'set', key, value, callback ]);
};
/**
 * [sync description]
 * @param  {Function} callback [description]
 * @return {[type]}            [description]
 */
Storage.prototype.sync = function(task){
  var self = this;
  if(task) this.queue.push(task);
  if(this.lock) return;
  var current = this.queue.shift();
  var action   = current[0];
  var key      = current[1];
  var value    = current[2];
  var callback = current[3];
  
  if(action === 'get') {
    // console.log('read');
    callback = value;
    fs.readFile(this.filename, 'utf8', function(err, content){
      try{
        self.data = JSON.parse(content);
      }catch(e){
        err = e;
      }
      callback && callback(err, self.data[ key ]);
    });
  }
  if(action === 'set'){
    // console.log('write');
    this.lock = true;
    this.data[ key ] = value;
    var content = JSON.stringify(this.data);
    fs.writeFile(this.filename, content, 'utf8', function(err){
      self.lock = !true;
      callback && callback(err, self.data);
      if(self.queue.length) return self.sync();
    });
  }
  return this;
};
module.exports = new Storage('homekit.json');