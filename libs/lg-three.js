var VIEWSYNC = VIEWSYNC || {};
var THREELG = { viewsync: undefined, justInitialized: false };

VIEWSYNC.Connection = function(appname, master, url) {
  var viewsync = io.connect(typeof url === 'undefined' ? '/viewsync' : url);

  function sendInitialization() {
    console.log('Sending initialization to slave');
    THREELG.justInitialized = true;
    viewsync.emit('pov', {
        'type': 'initialization',
        'prerenderSlave': THREELG.prerenderSlave ? THREELG.prerenderSlave.toString() : undefined,
        'initialScene': THREELG.initialScene ? THREELG.initialScene.toString() : undefined,
        'render': THREELG.render ? THREELG.render.toString() : undefined
    });
  }

  viewsync.on('connect', function() {
    console.log('viewsync connected');
    if (master) {
        sendInitialization();
    }
    else {
        console.log('Slave connected. Fetching configuration');
        viewsync.emit('pov', { 'type': 'request-initialization' });
    }
  });

  viewsync.on('sync pov', function(pov) {
    var a;
    //console.debug('viewsync recv pov:', pov);
    if (master) {
        switch (pov.type) { 
            case 'request-initialization':
                sendInitialization();
                break;
        }
    }
    else {
        switch (pov.type) {
            case 'initialization':
                THREELG.prerenderSlave = eval("(" + pov.prerenderSlave + ")");
                THREELG.initialScene = eval("(" + pov.initialScene + ")");
                THREELG.render = eval("(" + pov.render + ")");
                if (typeof THREELG.initialScene === 'function') {
                    THREELG.initialSceneStuff = THREELG.initialScene(master);
                }
                break;
            case 'render':
                // pov.prerenderArgs comes from the prerenderMaster function
                if (THREELG.prerenderSlave !== undefined) { a = THREELG.prerenderSlave(pov.prerenderArgs, THREELG.initialSceneStuff); }
                THREELG.render(THREELG.initialSceneStuff, a);
                break;
        }
    }
  });

  this.sendPov = function(pov) {
    viewsync.emit('pov', pov);
  }

  if (master) {
    this.sendPov('master is initialized');
  }
}

THREE.lg_init = function(appname, prerenderMaster, prerenderSlave, initialScene, render, master, url)
{
    master = typeof master !== 'undefined' ? master : true;

    console.log('Initializing Three.js LG support');
    var dummy = function() {};
    THREELG.master = master;
    THREELG.prerenderMaster = prerenderMaster !== 'undefined' ? prerenderMaster : dummy;
    THREELG.prerenderSlave = prerenderSlave !== 'undefined' ? prerenderSlave : dummy;
    THREELG.initialScene = initialScene !== 'undefined' ? initialScene : dummy;
    THREELG.render = render !== 'undefined' ? render : dummy;

    // Make sure to initialize VIEWSYNC after setting the various callbacks and
    // anything else that needs to be sent to the slave, because the VIEWSYNC
    // on_connect event will assume they're already set and try to send them
    THREELG.viewsync = new VIEWSYNC.Connection(appname, master, url);

    if (master) {
        THREE.__old_WebGLRenderer = THREE.WebGLRenderer;
        THREE.WebGLRenderer = function() {
            console.log("Here's my wrapper THREE.WebGLRenderer");
            wglr = new THREE.__old_WebGLRenderer();
        //    wglr.__old_setSize = wglr.setSize;
        //    wglr.setSize = function(width, height) {
        //        var that = this;        // I admit not knowing whether I need this or not
        //        console.log("Here's my THREE.WebGLRenderer.setSize wrapper");
        //        return that.__old_setSize(width, height);
        //    }

            wglr.__old_render = wglr.render;
            wglr.render = function( scene, camera, renderTarget, forceClear ) {
                var that = this;
                var a;

                if (THREELG.master) {
                    if (THREELG.prerenderMaster !== undefined) { a = THREELG.prerenderMaster(); }
                    if (a.skipSlaveRender === undefined) {
                        THREELG.justInitialized = false;
                        THREELG.viewsync.sendPov({ 'type': 'render', 'prerenderArgs': a });
                    }
                }
                return that.__old_render( scene, camera, renderTarget, forceClear );
            }

            // Wrap this in a function so that render()'s "this" variable is set to the wglr renderer object
            // XXX Except I have to pass a scene, camera, etc. to it, so we're doing this elsewhere
            // THREELG.render = function() { wglr.render; }
        
            return wglr;
        }
    }
}
