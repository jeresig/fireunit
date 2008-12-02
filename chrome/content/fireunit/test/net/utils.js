/* 
 * Author: Jan Odvarko, www.janodvarko.cz
 */

function expandNetRows(panelNode, className) // className, className, ...
{
    var rows = getElementsByClass.apply(null, arguments);
    for (var i=0; i<rows.length; i++)
    {
        var row = rows[i];
        if (!fireunit.FBL.hasClass(row, "opened"))
            fireunit.click(row);
    }
}

function expandNetTabs(panelNode, tabClass)
{
    var tabs = fireunit.FBL.getElementsByClass(panelNode, tabClass);
    for (var i=0; i<tabs.length; i++)
    {
        var tab = tabs[i];
        if (!fireunit.FBL.hasClass(tab, "collapsed"))
            fireunit.click(tab);
    }
}

function getElementsByClass(node, className) // className, className, ...
{
    var result = [];
    var args = fireunit.FBL.cloneArray(arguments); args.shift();
    getElementsByClassInternal(node, args, result);
    return result;
}

function getElementsByClassInternal(node, classNames, result)
{
    for (var child = node.firstChild; child; child = child.nextSibling)
    {
        var args1 = fireunit.FBL.cloneArray(classNames); args1.unshift(child);
        if (fireunit.FBL.hasClass.apply(null, args1))
            result.push(child);

        getElementsByClassInternal(child, classNames, result);
    }
}

function unEscapeHTML(str)
{
    return str.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
}
