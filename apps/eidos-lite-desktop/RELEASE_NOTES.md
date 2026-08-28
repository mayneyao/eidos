## What's new

### Work across multiple terminal tabs

Open independent shell sessions in one Terminal panel, switch between them,
and close only the session you are finished with. Hiding the panel keeps its
tabs running, while closing a tab ends that shell. Tab numbering reuses open
slots instead of increasing forever.

### Choose the shell for new terminals

Settings now lists shells that are actually installed on the current machine.
Choose the system default or a specific shell for new tabs; Windows detects
Command Prompt, Windows PowerShell, PowerShell 7, and Git Bash when available.
Existing tabs keep their current shell, and a removed selection falls back to
the system default.

### Drop Space paths into the terminal

Drag a file or folder from the Space Explorer into the active terminal to
insert its absolute path. Eidos Lite applies quoting for the session's actual
shell, including PowerShell, Command Prompt, Git Bash, and POSIX shells, so
paths with spaces and shell-sensitive characters remain intact.

No migration is required.
