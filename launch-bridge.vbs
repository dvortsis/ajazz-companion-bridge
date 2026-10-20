' Silent launcher for Ajazz Companion Bridge: runs the supervisor (restarts the bridge if it crashes).
Set WshShell = CreateObject("WScript.Shell")
WshShell.CurrentDirectory = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)
WshShell.Run "cmd /c node src\supervisor.js", 0, False
