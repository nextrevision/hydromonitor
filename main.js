#!/usr/bin/env node

var path = require('path');
var pkg = require(path.join(__dirname, 'package.json'));
var Bleacon = require('bleacon');
var program = require('commander');
var express = require('express');
var app = express();
var api = express.Router();
var http = require('http').Server(app);
var io = require('socket.io')(http);
var devices = {}
var metrics = {}

program
    .version(pkg.version)
    .option('-p, --port <port>', 'Port on which to listen to (defaults to 8080)', 8080)
    .option('-f, --filename <path>', 'Filename for sqlite DB (defaults to in memory)', ':memory:')
    .parse(process.argv);

//var db = require('./db');
//db.init(program.filename);
//setInterval(function() {
//  db.saveState(devices);
//}.bind(this), 10000);

api.get('/devices', function(req, res) {
  res.json(devices);
  res.status(200);
  res.end();
});

api.get('/devices/:id', function(req, res) {
  if (!devices[req.params.id]) {
    res.status(404);
    res.end();
  }
  res.json(devices[req.params.id]);
  res.status(200);
  res.end();
});

api.get('/devices/:id/metrics', function(req, res) {
  if (!devices[req.params.id]) {
    res.status(404);
    res.end();
  }
  res.json(metrics[req.params.id]);
  res.status(200);
  res.end();
});

app.use('/api/v1', api);
app.get('/', function(req, res) {
  res.sendFile(path.join(__dirname, 'index.html'));
});
app.use(express.static('static'))

io.on("connection", function(socket) {
  socket.emit('updated-devices', {devices: devices});
  socket.emit('updated-metrics', {metrics: metrics});
});

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
  if (!devices[color]) {
    devices[color] = {
      name: '',
      color: color,
      endpoint: '',
    }
    metrics[color] = [{
      rssi: adv.rssi,
      gravity: (adv.minor/1000),
      temperature: adv.major,
      trend: {
        difference: 0.000,
        percentage: 0.00,
        trend: 'neutral'
      },
      created: Date.now()
    }];
    io.emit('updated-metrics', {metrics: metrics});
  }
  devices[color].rssi = adv.rssi;
  devices[color].proximity = adv.proximity;
  devices[color].gravity = (adv.minor / 1000);
  devices[color].temperature = adv.major;
  devices[color].updated = Date.now();
  io.emit('updated-devices', {devices: devices});
});

Bleacon.startScanning();

setInterval(function() {
  Object.values(devices).forEach(function(device) {
    var last = metrics[device.color][metrics[device.color].length-1];
    var trend = function() {
      if (device.gravity > last.gravity) {
        return 'up';
      } else if (device.gravity < last.gravity) {
        return 'down';
      }
      return 'neutral';
    }();
    metrics[device.color].push({
      rssi: device.rssi,
      proximity: device.proximity,
      gravity: device.gravity,
      temperature: device.temperature,
      trend: {
        difference: device.gravity - last.gravity,
        percentage: ((device.gravity-last.gravity)/((device.gravity+last.gravity)/2)*100),
        trend: trend
      },
      updated: device.updated
    });
  });
  io.emit('updated-metrics', {metrics: metrics});
}.bind(this), 10000);
//}.bind(this), 900000);

http.listen(program.port, function() {
  console.log('Starting web server on port ' + program.port);
});
