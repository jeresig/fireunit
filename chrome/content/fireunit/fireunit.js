/**
 * @author: John Resig
 * @url: http://fireunit.org/
 */

FBL.ns(function() { with (FBL) { 

var panelName = "Test";

var testQueue;
var queueResults = "";

/**
 * Module implementation.
 */
Firebug.FireUnitModule = extend(Firebug.Module, { 
    showPanel: function(browser, panel) { 
      var isHwPanel = panel && panel.name == panelName; 
      var hwButtons = browser.chrome.$("fbFireUnitButtons"); 
      collapse(hwButtons, !isHwPanel); 
    },
    
    watchWindow: function(context, win){
        if (win.wrappedJSObject && win.wrappedJSObject.fireunit)
            return;

        function clean( str ) {
          return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
        }

        var queue = [];

        function addToQueue(fn){}

        function removeFromQueue(){}

        win.wrappedJSObject.fireunit = {
            runTests: function() {
              testQueue = Array.prototype.slice.call( arguments );
              queueResults = "";

              this.testDone();
            },
            testDone: function() {
              if ( testQueue ) {
                if ( testQueue.length ) {
                  win.wrappedJSObject.location = testQueue.shift();
                } else {
                  var panel = context.getPanel(panelName).panelNode;
                  panel.innerHTML += queueResults;
                  queueResults = testQueue = null;
                }
              }
            },
            id: function( id ) {
              if ( typeof id == "string" ) {
                if ( win.location.toString().indexOf("chrome:") == 0 ) {
                  return document.getElementById( id );
                } else {
                  return win.document.getElementById( id );
                }
              }
              return id;
            },
            ok: function( pass, msg ){
              var results = "<li><span style='color:" +
                (pass ? "green" : "red") + ";'>" +
                (pass ? "PASS" : "FAIL") + "</span> " +
                clean( msg ) + "</li>";

              if ( testQueue ) {
                queueResults += results;
              } else {
                var panel = context.getPanel(panelName).panelNode;
                panel.innerHTML += results;
              }
            },
            test: function( name, fn ) {
              addToQueue( fn );
            },
            compare: function( expected, result, msg ) {
              var pass = expected == result;
              var panel = context.getPanel(panelName).panelNode;
              panel.innerHTML += "<li><span style='color:" +
                (pass ? "green" : "red") + ";'>" +
                (pass ? "PASS" : "FAIL") + "</span> " +
                clean( msg ) +
                (pass ? "" : "<br/><pre style='font-family:Courier;'>  Expected: " + clean( expected ) +
                  "\n    Result: " + clean( result ) + "</pre>") + "</li>";
            },
            reCompare: function( expected, result, msg ) {
              if (  RegExp( expected ).test( result ) ) {
                return this.compare( expected, expected, msg );
              } else {
                return this.compare( expected, result, msg );
              }
            },
            click: function( node ){
              node = this.id( node );

              if ( node.click ) {
                return node.click();
              }

              var doc = node.ownerDocument, event = doc.createEvent("MouseEvents");
              event.initMouseEvent("click", true, true, doc.defaultView, 0, 0, 0, 0, 0, false, false, false, false, 0, null);
              return node.dispatchEvent( event );
            },
            focus: function( node ){
              node = this.id( node );

              if ( node.focus ) {
                return node.focus();
              }

              var doc = node.ownerDocument, event = doc.createEvent("UIEvents");
              event.initUIEvent("DOMFocusIn", true, true, doc.defaultView, 1);
              return node.dispatchEvent( event );
            },
            value: function( node, text ){
              node = this.id( node );

              node.value = text;
            },
            key: function( node, letter ){
              node = this.id( node );

              var keyCode = letter, charCode = 0;

              if ( typeof keyCode == "string" ) {
                charCode = keyCode.charCodeAt(0);
                keyCode = 0;
              }

              var doc = node.ownerDocument, event = doc.createEvent("KeyEvents");
              event.initKeyEvent("keypress", true, true, doc.defaultView, false, false, false, false, keyCode, charCode);
              return node.dispatchEvent( event );
            },
            panel: function( name ) {
              if ( win.location.toString().indexOf("chrome:") == 0 )
                return FirebugContext.getPanel( name ).panelNode;
            }
        };
    },
    
    unWatchWindow: function(){
        delete win.wrappedJSObject.fireunit;
    }
}); 

/**
 * Panel implementation
 */
function FireUnitPanel() {} 
FireUnitPanel.prototype = extend(Firebug.Panel, { 
    name: panelName, 
    title: panelName, 

    initialize: function() {
        Firebug.Panel.initialize.apply(this, arguments);
    },
    
    getOptionsMenuItems: function(context){
        return [
            this.optionMenu("Passing Tests", "fireunit.showPass"),
            this.optionMenu("Failing Tests", "fireunit.showFail")
        ];
    },

    optionMenu: function(label, option){
        var value = Firebug.getPref(Firebug.prefDomain, option);
        return { 
            label: label, 
            nol10n: true, 
            type: "checkbox", 
            checked: value, 
            command: bindFixed(Firebug.setPref, this, Firebug.prefDomain, option, !value) 
        };
    }
}); 

/**
 * Registration
 */
Firebug.registerPanel(FireUnitPanel); 
Firebug.registerModule(Firebug.FireUnitModule); 

}});
