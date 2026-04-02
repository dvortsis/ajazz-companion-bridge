' Silent launcher for Ajazz Companion Bridge (ajazz-bridge)
' Path: ...\Companion-AJAZZ-Plugin\ajazz-bridge\launch-bridge.vbs

Set WshShell = CreateObject("WScript.Shell")
WshShell.CurrentDirectory = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)
WshShell.Run "cmd /c node index.js", 0, False
