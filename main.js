#!/usr/bin/env node

var path = require('path');
var pkg = require(path.join(__dirname, 'package.json'));
var sqlite3 = require('sqlite3').verbose();
var Bleacon = require('bleacon');
var express = require('express');
var bodyParser = require('body-parser')
var app = express();
var api = express.Router();
var http = require('http').Server(app);
var request = require('request');
var devices = {};

var localTime = function() {
  var date = new Date();
  var offset = (new Date().getTimezoneOffset() / 60) * -1;
  var now = new Date(date.getTime() + offset);
  return now;
};

var log = function(msg) {
  console.log('[' + localTime() + '] ' + msg);
};

var db = new sqlite3.Database('./hydromonitor.db');
db.serialize(function() {
  db.run(`
    CREATE TABLE IF NOT EXISTS device (
      id VARCHAR(255) PRIMARY KEY,
      name VARCHAR(255),
      color VARCHAR(50),
      endpoint TEXT,
      created DATETIME DEFAULT (DATETIME('now','localtime')),
      updated DATETIME DEFAULT (DATETIME('now','localtime'))
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
      created DATETIME DEFAULT (DATETIME('now','localtime'))
    )
  `);
});

db.all('SELECT * FROM device', function(err, rows) {
  if (err !== null) {
    log(err);
  }
  rows.forEach(function(device) {
    devices[device.color] = device;
  });
});

app.use(bodyParser.json());

api.get('/devices', function(req, res) {
  db.all('SELECT * FROM device', function(err, rows) {
    if (err !== null) {
      log('Error getting devices: ' + err);
      res.json({error: err});
      res.status(500);
    } else {
      res.json(rows);
      res.status(200);
    }
    res.end();
  });
});

api.get('/devices/:id', function(req, res) {
  var stmt = db.prepare('SELECT * FROM device WHERE id=?');
  stmt.get(req.params.id, function(err, row) {
    if (err !== null) {
      log('Error getting device: ' + err);
      res.json({error: err});
      res.end();
    } else {
      res.json(row);
      res.status(200);
    }
    res.end();
  });
});

api.post('/devices/:id/endpoint', function(req, res) {
  if (!req.body.endpoint) {
    res.status(407);
    res.json({error: 'Must supply endpoint'});
    res.end();
    return;
  }
  if (devices[req.params.id]) {
    devices[req.params.id].endpoint = req.body.endpoint;
  }
  var stmt = db.prepare('UPDATE device SET endpoint=? WHERE id=?');
  stmt.run(req.body.endpoint, req.params.id);
  stmt.finalize();
  res.status(200);
  res.end();
});

api.get('/devices/:id/metrics', function(req, res) {
  var days = 1;
  if (req.query.days) {
    var days = req.query.days;
  }

  var stmt = db.prepare('SELECT * FROM metric WHERE device_id=? AND created >= DATETIME(\'now\', \'-' + days + ' days\')');
  stmt.all(req.params.id, function(err, rows) {
    if (err !== null) {
      log('Error retrieving metrics: ' + err);
      res.json({error: err});
      res.status(500);
      res.end();
    }
    res.json(rows);
    res.status(200);
    res.end();
  });
});

api.post('/devices/:id/refresh', function(req, res) {
  var color = req.params.id;

  if (!devices[color]) {
    res.status(404);
    res.end();
    return;
  }

  var deviceStmt = db.prepare('INSERT OR IGNORE INTO device (id, color) VALUES(?,?)');
  var metricStmt = db.prepare('INSERT INTO metric (device_id, proximity, rssi, temperature, gravity) VALUES(?,?,?,?,?)');
  var updateDeviceStmt = db.prepare('UPDATE device SET updated=DATETIME(\'now\',\'localtime\') WHERE id=?');
  deviceStmt.run(color, color);
  metricStmt.run(color, devices[color].proximity, devices[color].rssi, devices[color].temperature, devices[color].gravity);
  updateDeviceStmt.run(color);
  deviceStmt.finalize();
  metricStmt.finalize();
  updateDeviceStmt.finalize();
  res.status(200);
  res.end();
});

api.post('/devices/:id/reset', function(req, res) {
  db.run('DELETE FROM metric');
  db.run('DELETE FROM device');
  res.status(200);
  res.end();
});

app.use('/api/v1', api);
app.get('/', function(req, res) {
  res.sendFile(path.join(__dirname, 'index.html'));
});
app.use(express.static('static'))

function getColor(uuid) {
  switch(uuid) {
    case 'a495bb10c5b14b44b5121370f02d74de':
      return 'red';
    case 'a495bb20c5b14b44b5121370f02d74de':
      return 'green';
    case 'a495bb30c5b14b44b5121370f02d74de':
      return 'black';
    case 'a495bb40c5b14b44b5121370f02d74de':
      return 'purple';
    case 'a495bb50c5b14b44b5121370f02d74de':
      return 'orange';
    case 'a495bb60c5b14b44b5121370f02d74de':
      return 'blue';
    case 'a495bb70c5b14b44b5121370f02d74de':
      return 'yellow';
    case 'a495bb80c5b14b44b5121370f02d74de':
      return 'pink';
    default:
      return 'unknown';
  }
};

Bleacon.on('discover', function(adv) {
  var color = getColor(adv.uuid);
  var newDevice = false;
  if (!devices[color]) {
    devices[color] = {
      name: '',
      color: color,
      endpoint: '',
    }
    newDevice = true;
  }
  devices[color].rssi = adv.rssi;
  devices[color].proximity = adv.proximity;
  devices[color].gravity = (adv.minor / 1000);
  devices[color].temperature = adv.major;
  devices[color].updated = localTime();

  if (newDevice) {
    var deviceStmt = db.prepare('INSERT OR IGNORE INTO device (id, color) VALUES(?,?)');
    var metricStmt = db.prepare('INSERT INTO metric (device_id, proximity, rssi, temperature, gravity) VALUES(?,?,?,?,?)');
    var updateDeviceStmt = db.prepare('UPDATE device SET updated=DATETIME(\'now\',\'localtime\') WHERE id=?');
    deviceStmt.run(color, color);
    metricStmt.run(color, devices[color].proximity, devices[color].rssi, devices[color].temperature, devices[color].gravity);
    updateDeviceStmt.run(color);
    deviceStmt.finalize();
    metricStmt.finalize();
    updateDeviceStmt.finalize();
    log('Added new device: ' + color);
  }
}.bind(this));

Bleacon.startScanning();

setInterval(function() {
  var deviceStmt = db.prepare('INSERT OR IGNORE INTO device (id, color) VALUES(?,?)');
  var metricStmt = db.prepare('INSERT INTO metric (device_id, proximity, rssi, temperature, gravity) VALUES(?,?,?,?,?)');
  var updateDeviceStmt = db.prepare('UPDATE device SET updated=DATETIME(\'now\',\'localtime\') WHERE id=?');

  Object.keys(devices).forEach(function(key) {
    deviceStmt.run(devices[key].color, devices[key].color);
    metricStmt.run(devices[key].color, devices[key].proximity, devices[key].rssi, devices[key].temperature, devices[key].gravity);
    updateDeviceStmt.run(devices[key].color);
    if (devices[key].endpoint !== null || devices[key].endpoint !== '') {
      var timestamp = localTime();
      // TODO: should not account for 240 offset...
      var timeZoneDays = (timestamp.getTimezoneOffset() + 240) / 60 / 24;
      var timepoint = Date.now() / 1000 / 60 / 60 / 24 + 25569 - timeZoneDays;
      var options = {
        url: devices[key].endpoint,
        method: 'POST',
        headers: {'Content-Type': 'application/x-www-form-urlencoded'},
        form: {'SG': devices[key].gravity, 'Temp': devices[key].temperature, 'Color': key, 'Timepoint': timepoint}
      }
      log('Posting data to endpoint: ' + devices[key].endpoint);
      request(options, function (error, response, body) {
        if (!error && response.statusCode == 200) {
          log(body)
        }
      });
    }
  });

  deviceStmt.finalize();
  metricStmt.finalize();
  updateDeviceStmt.finalize();

  log('Saved device state');
}.bind(this), 900000);

http.listen(8080, function() {
  log('Starting web server on port ' + 8080);
});
