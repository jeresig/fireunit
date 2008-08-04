/**
 * @author: John Resig
 * @url: http://fireunit.org/
 */

FBL.ns(function() { with (FBL) { 

var panelName = "Test";

/**
 * Model implementation.
 */
Firebug.FireUnitModel = extend(Firebug.Module, { 
    showPanel: function(browser, panel) { 
      var isHwPanel = panel && panel.name == panelName; 
      var hwButtons = browser.chrome.$("fbFireUnitButtons"); 
      collapse(hwButtons, !isHwPanel); 
    },

    onMyButton: function(context) {
      alert("Hello World!");
    }
}); 

/**
 * Panel implementation
 */
function FireUnitPanel() {} 
FireUnitPanel.prototype = extend(Firebug.Panel, { 
    name: panelName, 
    title: "Test", 

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
Firebug.registerModule(Firebug.FireUnitModel); 

}});
