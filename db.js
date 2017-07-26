var sqlite3 = require('sqlite3').verbose();
var DB = function() {};
var db = null;

DB.prototype.init = function(filename) {
  db = new sqlite3.Database(filename);
  db.serialize(function() {
    db.run(`
      CREATE TABLE IF NOT EXISTS device (
        id VARCHAR(255) PRIMARY KEY,
        name VARCHAR(255),
        color VARCHAR(50),
        endpoint TEXT,
        created DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    db.run(`
      CREATE TABLE IF NOT EXISTS metric (
        id INTEGER PRIMARY KEY,
        device_id VARCHAR(255) NOT NULL,
        proximity VARCHAR(255),
        rssi INTEGER,
        gravity REAL,
        temperature INTEGER,
        created DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
  });
};

DB.prototype.saveState = function(devices) {
  var deviceStmt = db.prepare("INSERT OR IGNORE INTO device (id, color) VALUES(?,?)");
  var metricStmt = db.prepare("INSERT INTO metric (device_id, proximity, rssi, temperature, gravity) VALUES(?,?,?,?,?)");
  var updateDeviceStmt = db.prepare("UPDATE device SET updated=CURRENT_TIMESTAMP WHERE id=?");

  Object.keys(devices).forEach(function(key) {
    deviceStmt.run(devices[key].color, devices[key].color);
    metricStmt.run(devices[key].color, devices[key].proximity, devices[key].rssi, devices[key].temperature, devices[key].gravity);
    updateDeviceStmt.run(devices[key].color);
  });

  deviceStmt.finalize();
  metricStmt.finalize();
  updateDeviceStmt.finalize();
};

DB.prototype.loadState = function() {
  db.all('SELECT * FROM device');
};

module.exports = new DB();
