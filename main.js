#!/usr/bin/env node

var path = require('path');
var pkg = require(path.join(__dirname, 'package.json'));
var Bleacon = require('bleacon');
var sqlite3 = require('sqlite3').verbose();
var program = require('commander');
var express = require('express');
var app = express();
var api = express.Router();
var http = require('http').Server(app);
var io = require('socket.io')(http);

// internal device state
var devices = {}

program
    .version(pkg.version)
    .option('-p, --port <port>', 'Port on which to listen to (defaults to 8080)', 8080)
    .option('-f, --filename <path>', 'Filename for sqlite DB (defaults to in memory)', ':memory:')
    .parse(process.argv);

var db = new sqlite3.Database(program.filename);
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

api.get('/devices', function(req, res) {
  db.all("SELECT id, name, color, endpoint, created, updated FROM device", function(err, row) {
    if (err) {
      console.err(err);
      res.status(500);
      res.end();
      return;
    } else {
      res.json(row);
      res.status(200);
    }
    res.end();
  });
});

api.get('/devices/:id', function(req, res) {
  db.get("SELECT id, name, color, endpoint, created, updated FROM device WHERE id=?", function(err, row) {
    if (err) {
      console.err(err);
      res.status(500);
      res.end();
      return;
    } else {
      res.json(row);
      res.status(200);
    }
    res.end();
  });
});

app.use('/api/v1', api);
app.get('/', function(req, res) {
  res.sendFile(path.join(__dirname, 'index.html'));
});
app.use(express.static('static'))



function addDevice(color, adv) {
  devices[color] = {
    color: color,
    proximity: adv.proximity,
    rssi: adv.rssi,
    gravity: adv.minor / 1000,
    temperature: adv.major,
  }
  io.emit('updated-devices', {devices: devices})
}

Bleacon.on('discover', function(bleacon) {
  switch(bleacon.uuid){
    case 'a495bb10c5b14b44b5121370f02d74de':
    console.log('Red ' + bleacon.major + ',' + bleacon.minor);
    break;

    case 'a495bb20c5b14b44b5121370f02d74de':
    console.log('Green ' + bleacon.major + ',' + bleacon.minor);
    break;

    case 'a495bb30c5b14b44b5121370f02d74de':
    //console.log('Black ' + bleacon.major + ',' + bleacon.minor);
    addDevice('black', bleacon);
    break;

    case 'a495bb40c5b14b44b5121370f02d74de':
    console.log('Purple ' + bleacon.major + ',' + bleacon.minor);
    break;

    case 'a495bb50c5b14b44b5121370f02d74de':
    console.log('Orange ' + bleacon.major + ',' + bleacon.minor);
    break;

    case 'a495bb60c5b14b44b5121370f02d74de':
    console.log('Blue ' + bleacon.major + ',' + bleacon.minor);
    break;

    case 'a495bb70c5b14b44b5121370f02d74de':
    console.log('Yellow ' + bleacon.major + ',' + bleacon.minor);
    break;

    case 'a495bb80c5b14b44b5121370f02d74de':
    console.log('Pink ' + bleacon.major + ',' + bleacon.minor);
    break;
  }
});

console.log('Listening for Tilt advertisements in background');
Bleacon.startScanning();

setInterval(function() {
  console.log("Saving state for " + Object.keys(devices).length + " devices...");
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
}.bind(this), 10000);

http.listen(program.port, function() {
  console.log('Starting web server on port ' + program.port);
});
