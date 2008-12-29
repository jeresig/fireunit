/**
 * @author: John Resig
 * @url: http://fireunit.org/
 */

FBL.ns(function() { with (FBL) { 

// Constants
//-----------------------------------------------------------------------------

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cr = Components.results;

var panelName = "test";     // uniques ID of the Test panel
var testQueue;              // tests to be executed
var queueResults = [];      // test results collected
var server;                 // HTTP local server
var uuid = 1;
var serverPort = 7080;
var winID;

// Services
var cache = Cc["@mozilla.org/network/cache-service;1"].getService(Ci.nsICacheService);

// Module implementation.
//-----------------------------------------------------------------------------

/**
 * This objects represents a module of Fireunit extension. This object is 
 * responsible for injecting the "fireunit" object into a web page.
 */
Firebug.FireUnitModule = extend(Firebug.Module, 
{
    initialize: function()
    {
        if (FBTrace.DBG_FIREUNIT)
           FBTrace.sysout("fireunit.FireUnitModule.initialize");

        // Add listener for log customization
        Firebug.TraceModule.addListener(this);
    },

    shutdown: function() 
    {
        Firebug.TraceModule.removeListener(this);
    },

    reattachContext: function(browser, context)
    {
        if (browser.detached)
        {
            // If Firebug is opened in a new window, the stylesheet must be 
            // appended again.
            this.addStyleSheets(context.getPanel(panelName));
        }
    },

    showPanel: function(browser, panel) 
    {
        // xxxHonza: no buttons for now.
    },

    watchWindow: function(context, win)
    {
        if (win.wrappedJSObject && win.wrappedJSObject.fireunit)
            return;

        // Inject "fireunit" object into the test page. This object 
        // provides all necessary APIs to write a unit test.
        win.wrappedJSObject.fireunit = new this.Fireunit(context, win);

        if (FBTrace.DBG_FIREUNIT)
            FBTrace.sysout("fireunit.FireUnitModule.watchWindow: fireunit initialized for: " +
                win.wrappedJSObject.location.href);
    },

    unWatchWindow: function()
    {
        delete win.wrappedJSObject.fireunit;
    },

    addStyleSheets: function(panel)
    {
        this.addStyleSheet(panel.document, "chrome://fireunit/skin/tabView.css", "tabViewCss");
        this.addStyleSheet(panel.document, "chrome://fireunit/skin/fireunit.css", "fireUnitCss");
    },

    // xxxHonza: There should be APIs in lib.js to easily append a new stylesheet.
    addStyleSheet: function(doc, uri, id)
    {
        // Make sure the stylesheet isn't appended twice. 
        if ($(id, doc))
            return;

        var styleSheet = createStyleSheet(doc, uri);
        styleSheet.setAttribute("id", id);
        addStyleSheet(doc, styleSheet);
    },

    /**
     * Trace console support
     */
    onLoadConsole: function(win, rootNode) // Called when console window is loaded.
    {
        this.addStyleSheet(rootNode.ownerDocument, 
            "chrome://fireunit/skin/fireunit.css", 
            "fireUnitCss");
    },

    // Called when a new message is logged in to the trace-console window.
    onDump: function(message)
    {
        var index = message.text.indexOf("fireunit.");
        if (index == 0) {
            message.text = message.text.substr("fireunit.".length);
            message.type = "DBG_FIREUNIT";
        }
    }
}); 

// Fireunit object implementation.
//-----------------------------------------------------------------------------

/**
 * This object is injected into the test page as "fireunit" in order to 
 * provider necessary APIs for test implementation.
 */
Firebug.FireUnitModule.Fireunit = function(context, win) {
    win = win.wrappedJSObject;

    // Define fireunit APIs.
    var fireunit = {
        forceHttp: function() {
          cache.evictEntries(Ci.nsICache.STORE_ON_DISK);
          cache.evictEntries(Ci.nsICache.STORE_IN_MEMORY);

          // The server is started if it's allowed and only if the 
          // protocol is *not* already http.  
          if ( canServer(win) && win.location.protocol !== "http:") {
            var file = chromeToPath( win.location + "" );
            var dir = file.parent;

            winID = uuid++;
            var path = "/test" + winID + "/";
            getServer().registerDirectory(path, dir);

            if (FBTrace.DBG_FIREUNIT)
              FBTrace.sysout("fireunit.forceHttp server directory registered : " 
                + dir.path + " => " + path);

            win.location = getTestURL(winID, file.leafName); 
            return false;
          }

          return true;
        },
        runTests: function() {
          testQueue = Array.prototype.slice.call( arguments );
          queueResults = [];

          if (FBTrace.DBG_FIREUNIT)
            FBTrace.sysout("fireunit.runTests " + win.location, testQueue);

          this.testDone();
        },
        testDone: function() {
          if (FBTrace.DBG_FIREUNIT)
            FBTrace.sysout("fireunit.testDone: " + win.location);

          var panel = context.getPanel(panelName);
          if ( testQueue ) {
            if ( testQueue.length ) {
              win.location = getTestURL(winID, testQueue.shift());
            } else {
              panel.appendResults(queueResults);
              panel.appendSummary();
              queueResults = testQueue = null;
            }
          }
          else {
              panel.appendSummary();
          }
        },
        id: function( id ) {
          if ( typeof id == "string" ) {
            return win.document.getElementById( id );
          }
          return id;
        },
        chromeID: function( id ) {
          if ( typeof id == "string" && canChrome(win) )
            return document.getElementById( id );
        },
        ok: function( pass, msg ) {
          var result = new Firebug.FireUnitModule.TestResult(win, pass, msg);
          if ( testQueue ) {
            queueResults.push(result);
          } else {
            var panel = context.getPanel(panelName);
            panel.appendResults([result]);
          }
        },
        compare: function( expected, actuall, msg ) {
          var pass = expected == actuall;
          var result = new Firebug.FireUnitModule.TestResult(win, pass, msg, 
              expected, actuall);
          if ( testQueue ) {
            queueResults.push(result);
          } else {
            var panel = context.getPanel(panelName);
            panel.appendResults([result]);
          }
        },
        reCompare: function( expected, result, msg ) {
          if (  RegExp( expected ).test( result ) ) {
            return this.compare( result, result, msg );
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
        mouseDown: function( node ){
          node = this.id( node );

          if ( node.click ) {
            return node.click();
          }

          var doc = node.ownerDocument, event = doc.createEvent("MouseEvents");
          event.initMouseEvent("mousedown", true, true, doc.defaultView, 0, 0, 0, 0, 0, false, false, false, false, 0, null);
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
          event.initKeyEvent("keypress", true, true, doc.defaultView, false, false, false, 
              false, keyCode, charCode);
          return node.dispatchEvent( event );
        },
        panel: function( name ) {
          // xxxHonza: in case of net panel tests the URL doesn't have to come from chrome,
          // but also from local host.
          if ( canChrome(win) )
              return context.getPanel( name ).panelNode;
        },
        // HTTP Server
        registerPathHandler: function(path, handler) {
            if (!canServer(win))
                return;

            return getServer().registerPathHandler(path, function(metadata, response) {
                try {
                    handler.apply(null, [metadata, response]);
                }
                catch (err) {
                    FBTrace.sysout("fireunit.registerPathHandler EXCEPTION", err);
                }
            });
        }
    };

    fireunit.__defineGetter__("browser", function() {
      return canChrome(win) ? window : null;
    });

    this.__proto__ = fireunit;
};

function getServer() {
    if ( !server ) {
        server = new nsHttpServer();
        server.start( serverPort );

        if (FBTrace.DBG_FIREUNIT)
            FBTrace.sysout("fireunit.getServer HTTP server started");
    }
    return server;
}

function chromeToPath(aPath) {
   if (!aPath || !(/^chrome:/.test(aPath)))
      return urlToPath( aPath );

   var ios = Cc['@mozilla.org/network/io-service;1'].getService(Ci["nsIIOService"]);
   var uri = ios.newURI(aPath, "UTF-8", null);
   var cr = Cc['@mozilla.org/chrome/chrome-registry;1'].getService(Ci["nsIChromeRegistry"]);
   var rv = cr.convertChromeURL(uri).spec;

   if (/^file:/.test(rv))
      rv = urlToPath(rv);
   else
      rv = urlToPath("file://"+rv);

   return rv;
}

function urlToPath(aPath) {
    if (!aPath || !/^file:/.test(aPath)) 
        return;

    return Cc["@mozilla.org/network/protocol;1?name=file"]
        .createInstance(Ci.nsIFileProtocolHandler)
        .getFileFromURLSpec(aPath);
}

function canChrome(win) {
    var location = win.location,
        protocol = location.protocol;

    return protocol === "chrome:" ||
        location.toString().indexOf("http://localhost:" + serverPort) === 0;
}

function canServer(win) {
    return canChrome(win) || 
        win.location.protocol === "file:";
}

function getTestURL(winID, test) {
    return "http://localhost:" + serverPort + "/test" + winID + "/" + test;
}

// Localization
//-----------------------------------------------------------------------------

// xxxHonza: There should be APIs in lib.js to easily get localized strings 
// from custom bundle.
function $FU_STR(name)
{
    try
    {
        return document.getElementById("strings_fireUnit").getString(name.replace(' ', '_', "g"));
    }
    catch (err)
    {
        if (FBTrace.DBG_FIREUNIT)
        {
            FBTrace.sysout("fireunit.Missing translation for: " + name + "\n");
            FBTrace.sysout("fireunit.getString FAILS ", err);
        }
    }

    // Use only the label after last dot.
    var index = name.lastIndexOf(".");
    if (index > 0)
        name = name.substr(index + 1);

    return name;
}

// Panel implementation
//-----------------------------------------------------------------------------

/**
 * This object representes a new Firebug panel that displyas list of logs 
 * (test results) coming from executed tests. The panel also implements two
 * options "Passing Tests" and "Failing Tests" that can be used to filter
 * the content.
 */
function FireUnitPanel() {} 
FireUnitPanel.prototype = extend(Firebug.Panel, 
{
    name: panelName,
    title: $FU_STR("fireunit.panel.Test"),

    initialize: function() 
    {
        Firebug.Panel.initialize.apply(this, arguments);

        // Append custom stylesheet.
        Firebug.FireUnitModule.addStyleSheets(this);

        // Create basic content for the panel.
        var rep = Firebug.FireUnitModule.TestResultRep;
        this.table = rep.tableTag.replace({}, this.panelNode, rep);
    },
    
    show: function(state)
    {
        this.updatePanelFilter();
    },

    // Called automatically by Firebug framework when a preference (from Firebug.prefDomain)
    // is changed.
    updateOption: function(name, value)
    {
        if (FBTrace.DBG_FIREUNIT)
            FBTrace.sysout("fireunit.FireUnitPanel.updateOption: " + name + ": " + value);

        if (name == "fireunit.showPass" || name == "fireunit.showFail")
            this.updatePanelFilter();
    },

    updatePanelFilter: function()
    {
        var showPass = Firebug.getPref(Firebug.prefDomain, "fireunit.showPass");
        var showFail = Firebug.getPref(Firebug.prefDomain, "fireunit.showFail");

        // Update styles on the root table (contains the list of results).
        // These styles ensure proper visibility of pass and fail tests according 
        // to the preferences.
        var panelNode = this.context.getPanel(panelName).panelNode;
        var table = getElementByClass(panelNode, "testTable");
        showPass ? setClass(table, "showPass") : removeClass(table, "showPass");
        showFail ? setClass(table, "showFail") : removeClass(table, "showFail");
    },

    getOptionsMenuItems: function(context)
    {
        return [
            this.optionMenu($FU_STR("fireunit.option.Passing_Tests"), "fireunit.showPass"),
            this.optionMenu($FU_STR("fireunit.option.Failing_Tests"), "fireunit.showFail")
        ];
    },

    optionMenu: function(label, option)
    {
        var value = Firebug.getPref(Firebug.prefDomain, option);
        return {
            label: label,
            nol10n: true,
            type: "checkbox",
            checked: value,
            command: bindFixed(Firebug.setPref, this, Firebug.prefDomain, option, !value)
        };
    },

    appendResults: function(queueResults)
    {
        // Append new test results.
        var tbody = this.table.firstChild;
        var row = Firebug.FireUnitModule.TestResultRep.resultTag.insertRows(
            {results: queueResults}, tbody.lastChild ? tbody.lastChild : tbody)[0];

        for (var i = 0; i < queueResults.length; ++i)
        {
            var result = queueResults[i];
            row.repObject = result;
            result.row = row;
            row = row.nextSibling;
        }

        scrollToBottom(this.panelNode);
    },

    appendSummary: function()
    {
        var tbody = this.table.firstChild;

        // Count number of passing and failing tests.
        var summary = { passing: 0, failing: 0 };
        for (var row = tbody.firstChild; row; row = row.nextSibling) {
            if (hasClass(row, "testResultRow"))
                hasClass(row, "testError") ? summary.failing++ : summary.passing++;
        }

        // Append summary row.
        var summaryRow = Firebug.FireUnitModule.TestResultRep.summaryTag.insertRows(
            {summary: summary}, tbody.lastChild ? tbody.lastChild : tbody)[0];

        // Activate our panel since this is what the user wants to see now.
        this.context.chrome.selectPanel(panelName);
        scrollToBottom(this.panelNode);
    }
}); 

// Domplate Repository
//-----------------------------------------------------------------------------

/**
 * This template represents a "test-result" that is beening displayed within
 * Fireunit's panel. Expandable and collapsible logic associated with each
 * result is also implemented by this object.
 */
Firebug.FireUnitModule.TestResultRep = domplate(Firebug.Rep,
{
    tableTag:
        TABLE({"class": "testTable", cellpadding: 0, cellspacing: 0, onclick: "$onClick"},
            TBODY()
        ),

    resultTag:
        FOR("result", "$results",
            TR({"class": "testResultRow", _repObject: "$result",
                $testError: "$result|isError",
                $testOK: "$result|isOK"},
                TD({"class": "testResultCol", width: "100%"},
                    DIV({"class": "testResultMessage testResultLabel"},
                        "$result|getMessage"
                    ),
                    DIV({"class": "testResultFullMessage testResultMessage testResultLabel"},
                        "$result.msg"
                    )
                ),
                TD({"class": "testResultCol"},
                    DIV({"class": "testResultFileName testResultLabel"},
                        "$result.fileName"
                    )
                )
            )
        ),

    resultInfoTag:
        TR({"class": "testResultInfoRow", _repObject: "$result", 
            $testError: "$result|isError"},
            TD({"class": "testResultInfoCol", colspan: 2})
        ),

    summaryTag:
        TR({"class": "testResultSummaryRow testResultRow"},
            TD({"class": "testResultCol", colspan: 2},
                SPAN({"class": "testResultSummaryLabel",
                    $summaryPass: "$summary|summaryPassed"},
                    $FU_STR("fireunit.option.Passing_Tests"),
                    ": $summary.passing"
                ),
                SPAN({"class": "testResultSummaryLabel",
                    $collapsed: "$summary|summaryPassed",
                    $testError: "$summary.failing"},
                    $FU_STR("fireunit.option.Failing_Tests"),
                    ": $summary.failing"
                )
            )
        ),

    getMessage: function(result)
    {
        return cropString(result.msg, 100);
    },

    isError: function(result)
    {
        return !result.pass;
    },

    isOK: function(result)
    {
        return result.pass;
    },

    summaryPassed: function(summary)
    {
        return !summary.failing;
    },

    onClick: function(event)
    {
        if (isLeftClick(event))
        {
            var row = getAncestorByClass(event.target, "testResultRow");
            if (row)
            {
                this.toggleResultRow(row);
                cancelEvent(event);
            }
        }
    },

    toggleResultRow: function(row)
    {
        var result = row.repObject;

        toggleClass(row, "opened");
        if (hasClass(row, "opened"))
        {
            var infoBodyRow = this.resultInfoTag.insertRows({result: result}, row)[0];
            infoBodyRow.repObject = result;
            this.initInfoBody(infoBodyRow);
        }
        else
        {
            var infoBodyRow = row.nextSibling;
            var netInfoBox = getElementByClass(infoBodyRow, "testResultInfoBody");
            row.parentNode.removeChild(infoBodyRow);
        }
    },

    initInfoBody: function(infoBodyRow)
    {
        var result = infoBodyRow.repObject;
        var TabView = Firebug.FireUnitModule.TestResultTabView;
        var tabViewNode = TabView.viewTag.replace({result: result}, infoBodyRow.firstChild, TabView);

        // Select default tab.
        TabView.selectTabByName(tabViewNode, "Stack");
    },

    // Firebug rep support
    supportsObject: function(testResult)
    {
        return testResult instanceof Firebug.FireUnitModule.TestResult;
    },

    browseObject: function(testResult, context)
    {
        return false;
    },

    getRealObject: function(testResult, context)
    {
        return testResult;
    },

    getContextMenuItems: function(testResult, target, context)
    {
        // xxxHonza: The "copy" command shouldn't be there for now.
        var popup = $("fbContextMenu");
        FBL.eraseNode(popup);

        var items = [];

        if (testResult.stack)
        {
            items.push({ 
              label: $FU_STR("fireunit.item.Copy"), 
              nol10n: true, 
              command: bindFixed(this.onCopy, this, testResult) 
            });

            items.push({ 
              label: $FU_STR("fireunit.item.Copy_All"), 
              nol10n: true, 
              command: bindFixed(this.onCopyAll, this, testResult) 
            });

            items.push("-");

            items.push({ 
              label: $FU_STR("fireunit.item.View_Source"), 
              nol10n: true, 
              command: bindFixed(this.onViewSource, this, testResult) 
            });
        }

        return items;
    },

    // Context menu commands
    onViewSource: function(testResult)
    {
        var stackFrame = testResult.stack[0];
        FirebugContext.chrome.select(new SourceLink(stackFrame.fileName, 
            stackFrame.lineNumber, "js"));
    },

    onCopy: function(testResult)
    {
        copyToClipboard(testResult.msg);
    },

    onCopyAll: function(testResult)
    {
        var row = testResult.row;
        var tbody = getAncestorByClass(testResult.row, "testTable").firstChild;
        var passLabel = $FU_STR("fireunit.label.Pass");
        var failLabel = $FU_STR("fireunit.label.Fail");

        var text = "";
        for (var row = tbody.firstChild; row; row = row.nextSibling) {
            if (hasClass(row, "testResultRow") && row.repObject) {
                text += (hasClass(row, "testError") ? failLabel : passLabel); 
                text += ": " + row.repObject.msg;
                text += ", " + row.repObject.fileName + "\n";
            }
        }

        var summary = getElementByClass(tbody, "testResultSummaryRow");
        if (summary) {
            summary = summary.firstChild;
            text += summary.childNodes[0].textContent + ", " +
                summary.childNodes[1].textContent;
        }

        copyToClipboard(text);
    },
});

//-----------------------------------------------------------------------------

/**
 * This template represents an "info-body" for expanded test-result. This
 * object also implements logic related to a tab view.
 *
 * xxxHonza: since the tab view is used already several times, it would
 * be very useful to have a TabView widget defined in Firebug's Domplate
 * repository.
 */ 
Firebug.FireUnitModule.TestResultTabView = domplate(Firebug.Rep,
{
    listeners: [],

    viewTag:
        TABLE({"class": "tabView", cellpadding: 0, cellspacing: 0},
            TBODY(
                TR({"class": "tabViewRow"},
                    TD({"class": "tabViewCol", valign: "top"},
                        TAG("$tabList", {result: "$result"})
                    )
                )
            )
        ),

    tabList:
        DIV({"class": "tabViewBody"},
            TAG("$tabBar", {result: "$result"}),
            TAG("$tabBodies")
        ),

    // List of tabs
    tabBar: 
        DIV({"class": "tabBar"},
            A({"class": "StackTab tab", onclick: "$onClickTab", 
                view: "Stack", $collapsed: "$result|hideStackTab"},
                    $FU_STR("fireunit.tab.Stack")
            ),
            A({"class": "CompareTab tab", onclick: "$onClickTab", 
                view: "Compare", $collapsed: "$result|hideCompareTab"},
                    $FU_STR("fireunit.tab.Compare")
            )
        ),

    // List of tab bodies
    tabBodies: 
        DIV({"class": "tabBodies"},
            DIV({"class": "tabStackBody tabBody"}),
            DIV({"class": "tabCompareBody tabBody"})
        ),

    // Stack tab displayed within resultInfoRow
    stackTag:
        TABLE({"class": "testResultStackInfoBody", cellpadding: 0, cellspacing: 0},
            TBODY(
                FOR("stack", "$result.stack",
                    TR(
                        TD(
                            A({"class": "stackFrameLink", onclick: "$onClickStackFrame",
                                lineNumber: "$stack.lineNumber"},
                                "$stack.fileName"),
                            SPAN("&nbsp;"),
                            SPAN("(", $FU_STR("fireunit.test.Line"), " $stack.lineNumber", ")")
                        )
                    )
                )
            )
        ),

    // Compare tab displayed within resultInfoRow
    compareTag:
        TABLE({"class": "testResultCompareInfoBody", cellpadding: 0, cellspacing: 0},
            TBODY(
                TR({"class": "testResultCompareTitle expected"},
                    TD(
                        $FU_STR("fireunit.title.Expected")
                    ),
                    TD({"class": "testResultCompareSwitch expected", 
                        onclick: "$onSwitchView"},
                        $FU_STR("fireunit.switch.view_source")
                    )
                ),
                TR(
                    TD({"class": "testResultExpected", colspan: 2})
                ),
                TR({"class": "testResultCompareTitle result"},
                    TD(
                        $FU_STR("fireunit.title.Result")
                    ),
                    TD({"class": "testResultCompareSwitch result", 
                        onclick: "$onSwitchView"},
                        $FU_STR("fireunit.switch.view_source")
                    )
                ),
                TR(
                    TD({"class": "testResultResult", colspan: 2})
                ),
                TR({"class": "testResultCompareTitle diff", 
                    $collapsed: "$result|hideDiffGroup"},
                    TD({colspan: 2},
                        $FU_STR("fireunit.title.Difference")
                    )
                ),
                TR(
                    TD({"class": "testResultDiff", colspan: 2})
                )
            )
        ),

    hideStackTab: function(result)
    {
        return false;
    },

    hideCompareTab: function(result)
    {
        // The Compare tab is visible if any of these two members is set.
        // This is useful since sometimes the expected result is null and 
        // the user wants to see it also in the UI.
        return !result.expected && !result.result;
    },

    hideDiffGroup: function(result)
    {
        return (result.expected == result.result);
    },

    onClickTab: function(event)
    {
        this.selectTab(event.target);
    },

    selectTabByName: function(tabView, tabName)
    {
        var tab = getElementByClass(tabView, tabName + "Tab");
        if (tab)
            this.selectTab(tab);
    },

    selectTab: function(tab)
    {
        var view = tab.getAttribute("view");
        var viewBody = getAncestorByClass(tab, "tabViewBody");

        // Deactivate current tab.
        if (viewBody.selectedTab)
        {
            viewBody.selectedTab.removeAttribute("selected");
            viewBody.selectedBody.removeAttribute("selected");
        }

        // Store info about new active tab. Each tab has to have a body, 
        // which is identified by class.
        var tabBody = getElementByClass(viewBody, "tab" + view + "Body");
        viewBody.selectedTab = tab;
        viewBody.selectedBody = tabBody;

        // Activate new tab.
        viewBody.selectedTab.setAttribute("selected", "true");
        viewBody.selectedBody.setAttribute("selected", "true");

        this.updateTabBody(viewBody, view);
    },

    updateTabBody: function(viewBody, tabName)
    {
        if (FBTrace.DBG_FIREUNIT)
            FBTrace.sysout("fireunit.TestResultRep.onUpdateTabBody: " + tabName);

        var tab = viewBody.selectedTab;
        var infoRow = getAncestorByClass(viewBody, "testResultInfoRow");
        var result = infoRow.repObject;

        // Update Stack tab content
        var tabStackBody = getElementByClass(viewBody, "tabStackBody");
        if (tabName == "Stack" && !tabStackBody.updated)
        {
            tabStackBody.updated = true;
            this.stackTag.replace({result: result}, tabStackBody, this);
        }

        // Update Compare tab content
        var tabCompareBody = getElementByClass(viewBody, "tabCompareBody");
        if (tabName == "Compare" && !tabCompareBody.updated)
        {
            tabCompareBody.updated = true;
            this.compareTag.replace({result: result}, tabCompareBody, this);

            this.insertXml(result.expected, getElementByClass(viewBody, "testResultExpected"));
            this.insertXml(result.result, getElementByClass(viewBody, "testResultResult"));

            // The diff is generated only if there are any differences.
            if (result.expected != result.result) {
                var diffNode = getElementByClass(viewBody, "testResultDiff");
                var diffText = diffString(clean(result.expected), clean(result.result));
		diffNode.innerHTML = diffText;
            }
        }
    },

    onSwitchView: function(event)
    {
        var target = event.target;
        var expected = hasClass(target, "expected");
        var infoRow = getAncestorByClass(target, "testResultInfoRow");
        var result = infoRow.repObject;
        var sourceBody = getElementByClass(infoRow, expected ? "testResultExpected" : "testResultResult");

        clearNode(sourceBody);

        if (target.sourceView)
            this.insertXml(result.expected, sourceBody);
        else
            insertWrappedText(expected ? result.expected : result.result, sourceBody);

        target.innerHTML = $FU_STR("fireunit.switch." + (target.sourceView ? "view_source" : "pretty_print"));
        target.sourceView = !target.sourceView;
    },

    onClickStackFrame: function(event)
    {
        FirebugContext.chrome.select(new SourceLink(event.target.innerHTML, 
            event.target.getAttribute("lineNumber"), "js" ))
    },

    insertXml: function(xml, parentNode)
    {
        var parser = CCIN("@mozilla.org/xmlextras/domparser;1", "nsIDOMParser");

        // Create helper root element (for the case where there is no signle root).
        var tempXml = "<wrapper>" + xml + "</wrapper>";
        var doc = parser.parseFromString(tempXml, "text/xml");
        var docElem = doc.documentElement;

        // Error handling
        var nsURI = "http://www.mozilla.org/newlayout/xml/parsererror.xml";
        if (docElem.namespaceURI == nsURI && docElem.nodeName == "parsererror") 
        {
            var errorNode = Firebug.FireUnitModule.ParseErrorRep.tag.replace({error: {
                message: docElem.firstChild.nodeValue,
                source: docElem.lastChild.textContent
            }}, parentNode);

            var xmlSource = getElementByClass(errorNode, "xmlInfoSource");
            insertWrappedText(xml, xmlSource);
            return;
        }

        // Generate UI. Get appropriate domplate tag for every element that is found 
        // within the helper <wrapper> and append it into the parent container.
        for (var i=0; i<docElem.childNodes.length; i++)
            Firebug.HTMLPanel.CompleteElement.getNodeTag(docElem.childNodes[i]).
                append({object: docElem.childNodes[i]}, parentNode);
    }
});

//-----------------------------------------------------------------------------

/**
 * This template displays a parse-erros that can occurs when parsing
 * expected and acuall results (see fireunit.compare method).
 */
Firebug.FireUnitModule.ParseErrorRep = domplate(Firebug.Rep, 
{
    tag:
        DIV({"class": "xmlInfoError"},
            DIV({"class": "xmlInfoErrorMsg"}, "$error.message"),
            PRE({"class": "xmlInfoErrorSource"}, "$error|getSource"),
            BR(),
            PRE({"class": "xmlInfoSource"})
        ),
    
    getSource: function(error) 
    {
        var parts = error.source.split("\n");
        if (parts.length != 2)
            return error.source;

        var limit = 50;
        var column = parts[1].length;
        if (column >= limit) {
            parts[0] = "..." + parts[0].substr(column - limit);
            parts[1] = "..." + parts[1].substr(column - limit);
        }

        if (parts[0].length > 80)
            parts[0] = parts[0].substr(0, 80) + "...";

        return parts.join("\n");
    }
});

// Helper Objects
//-----------------------------------------------------------------------------

/**
 * This object represents a test-result.
 */
Firebug.FireUnitModule.TestResult = function(win, pass, msg, expected, result)
{
    var location = win.location.href;
    this.fileName = location.substr(location.lastIndexOf("/") + 1);

    this.pass = pass ? true : false;
    this.msg = clean(msg);
    this.expected = expected;
    this.result = result;

    // xxxHonza: there should be perhaps simple API in lib.js to get the stack trace.
    this.stack = [];
    for (var frame = Components.stack, i=0; frame; frame = frame.caller, i++)
    {
        var fileName = unescape(frame.filename ? frame.filename : "");
        if (fileName == "chrome://fireunit/content/fireunit.js")
            continue;

        var lineNumber = frame.lineNumber ? frame.lineNumber : "";
        this.stack.push({fileName:fileName, lineNumber:lineNumber});
    }
}

// Utils
//-----------------------------------------------------------------------------

function clean( str ) 
{
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Registration
//-----------------------------------------------------------------------------

Firebug.registerPanel(FireUnitPanel); 
Firebug.registerModule(Firebug.FireUnitModule); 
Firebug.registerRep(Firebug.FireUnitModule.TestResultRep);

//-----------------------------------------------------------------------------

}});
