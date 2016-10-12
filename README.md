# glossy
##audio annotation for webvr
Glossy is an in-progress prototype for audio annotation in VR in the browser. It uses websockets to propagate new annotations to all clients, and saves annotations to a database (I am using MongoDB) as a BLOB and xyz information. Existing database entries are propagated when a client first loads the page.
##some notes
- Web audio requires an https address.
- Because i am testing this in vive, which requires a windows PC, i have found it useful to host the project on a remote server.
- The back-end I am using is currently MongoDB.
- To run the program in an HTC vive, it's necessary to use a version of Chromium that supports webvr. There is a chrome plugin for testing but it currently breaks the page.
##running Glossy
You need a windows machine, an HTC Vive, a recent build of Chromium that supports webVR (You may have to run with webvr flags), and an https server. You will have to install mongoose on the server, and possibly the Opus dependency (npm install xxx). If you want to look at the code in a regular browser, it will open and run in chrome. Hotkeys "K" and "L" will allow you to test out the start and stop audio recording. The main javascript is in index.html, and the server code is in index.js. Dependencies are made visible in "public". Give it a minute to load, it's still a bit slower than it should be.

##ToDo
- add "selecting" functionality
- add "groups" to annotations

