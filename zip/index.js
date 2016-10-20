var express = require('express');
var app = express();
var mongo = require('mongodb').MongoClient;


var http = require('http').Server(app);
var io = require('socket.io')(http);
var fs = require('fs');


//Lets load the mongoose module in our program
var mongoose = require('mongoose');

//Lets connect to our database using the DB server URL.
mongoose.connect('mongodb://localhost/my_database_name');

var schema = new mongoose.Schema({id: String, position_x: Number, position_y: Number, position_z: Number, audioObject: Object});

var audiomessage = mongoose.model('audiomessage', schema);





var path = require('path');
var wav = require('wav');
var ogg = require('ogg');
var stringify = require('node-stringify');
var three = require('three');
var webvrboilerplate = require('webvr-boilerplate');



var counter = 0;
var streamcounter = 0;
var streamOutfile = 'streamdemo.wav';

var opus = require('node-opus');
var oggtrack = '/public/recordings/track.ogg';
var fileName = new Date().toISOString() + ".ogg";




app.use(express.static(__dirname + '/public'));

app.get('/', function(req, res){
  res.sendFile(__dirname + '/index.html');
});

app.get('/public/testpractice.ogg', function (req, res) {
  res.sendFile(__dirname + '/public/testpractice.ogg');
});


// Connection URL. This is where your mongodb server is running.
var url = 'mongodb://localhost:27017/my_database_name';

//app.post('/audio/upload', upload.array('audio', )
var practice = './public/testpractice.ogg'; //this should be the 

//maybe there should be no io.on? Just socket on?
io.on('connection', function(socket){


  	console.log('a user connected');
  	
  	



  	socket.on('audioObjectReceiver', function(){
		//finds EVERY audio object
			audiomessage.find({ }, function (err, userObj) {
		  	if (err) {
		    	console.log(err);
		  	} else if (userObj) {
		  		var res = userObj;
          console.log(res);
		    	//console.log('Found:', res);
          console.log("There are lots of user objects?");
		    	io.emit('audioObjectReceiver', res)
		    	}


        console.log("socket for audio obj receiver has been called")
			});



  	});

  	socket.on('positionTest', function(dataBlob){
  		var audioMessage1 = new audiomessage(dataBlob);

      console.log("position test is called")

			audioMessage1.save(function (err, userObj) {
			  			if (err) {
			    			console.log(err);
			  			} else {
                console.log("Trying tos ave audiomessage1");
			    			console.log('dataBlob iD is: ', dataBlob['id']);
                io.emit('positionTest', userObj);
			  			}
					});

  	});



  	//server receives message from client
  	socket.on('chat message', function(msg){
    	console.log('message: ' + msg);
    //emits message back to ALL clients including sender
    	io.emit('chat message', msg);

  	});
  

	socket.on('disconnect', function(){
    console.log('user disconnected');
  });

});


http.listen(3000, function(){
  console.log('listening on *:3000');
});