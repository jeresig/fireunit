/**
 * @author: John Resig
 * @url: http://fireunit.org/
 */

FBL.ns(function() { with (FBL) { 

var panelName = "Test";

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
        
        win.wrappedJSObject.fireunit = {
            ok: function( pass, msg ){
                var panel = context.getPanel(panelName).panelNode;
                panel.innerHTML += "<li><span style='color:" +
                    (pass ? "green" : "red") + ";'>" +
                    (pass ? "PASS" : "FAIL") + "</span> " + msg + "</li>";
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
