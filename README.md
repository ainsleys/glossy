# glossy
##audio annotation for webvr
Glossy is a prototype for audio annotation in VR in the browser. It is in-progress.
##some notes
- Web audio requires an https address.
- Because i am testing this in vive, which requires a windows PC, i have found it useful to host the project on a remote server.
- The back-end I am using is currently MongoDB.
- To run the program in an HTC vive, it's necessary to use a version of Chromium that supports webvr. There is a chrome plugin for testing but it currently breaks the page.

The main javascript is in index.html, and the server code is in index.js. Dependencies are made visible in "public".
