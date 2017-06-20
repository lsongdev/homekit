const fs = require('fs');
const debug = require('debug')('Storage');
/**
 * [Storage description]
 * @param {[type]} filename [description]
 */
function Storage(filename){
  this.data = {};
  this.filename = filename;

  return this;
}
/**
 * [get description]
 * @param  {[type]}   key      [description]
 * @param  {Function} callback [description]
 * @return {[type]}            [description]
 */
Storage.prototype.get = function(key){
  try{
    const content = fs.readFileSync(this.filename, 'utf8');
  	this.data = JSON.parse(content);
  }catch(e){
    debug('error', e.message, key)
  }
  debug('get', key);
  return this.data[ key ];
};
/**
 * [put description]
 * @param  {[type]}   key      [description]
 * @param  {[type]}   value    [description]
 * @param  {Function} callback [description]
 * @return {[type]}            [description]
 */
Storage.prototype.set = 
Storage.prototype.put = function(key, value){
  debug('set', key);
  this.data[ key ] = value;
  var content = JSON.stringify(this.data);
  fs.writeFileSync(this.filename, content, 'utf8');
};

module.exports = new Storage('homekit.json');