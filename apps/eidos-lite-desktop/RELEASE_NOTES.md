## Bug fixes

- **Startup continuity**: Fixed the blank screen and separate loading message between the logo animation and your Space. The logo now remains until the file tree or recovery screen is ready, and your chosen light or dark appearance is preserved throughout startup.
- **Space recovery**: When the last Space cannot be opened, Lite shows the error with retry and folder-selection actions instead of silently returning to the Space selector.
- **Explorer plugins**: The built-in file tree stays usable while plugins load. A plugin that finishes loading later no longer interrupts browsing; explicitly choosing an explorer still switches to it.
