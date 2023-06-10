# Notion/Airtable-Like Database running in Browser

This project is a local-first, serverless application for creating and managing databases in the browser. It uses sqlite-wasm to run the database engine locally on the user's machine, meaning all data is stored in the browser and there's no need for a server. It offers PWA support, enabling users to install the app to their desktop.

## Features

- Local-first storage
- One-click deployment to Vercel
- PWA support, install to desktop

## Roadmap/Todo

### Base

➡ is in progress

- [x] Run sqlite-wasm in browser
- [x] Create a wrapper for sqlite-wasm
- [x] Render tables
- [x] Create a table from a template
- [x] Remove a table
- [x] Edit a text cell
- [x] Add a row
- [x] Add a field
- [x] Remove a row
- [x] ai chat bot can generate sql queries & execute
- [ ] Define field types and map to sqlite type
  - [ ] Edit a field
  - [ ] Remove a field
  - [ ] Custom cell renderer for field types
- [x] switch/create new database
- [ ] Import a database
  - [x] CSV
  - [ ] SQLite3
- [ ] ➡ undo/redo
- [ ] Export a database
  - [ ] export a table as CSV
  - [ ] export a table as Excel
- [ ] Backup/sync with Cloudflare Worker (d1 database)
- [ ] PWA

### More

Self-hosted server; this requires running a server locally.

- [ ] API server to operate the database via API
- [ ] Webhooks
- [ ] Automation (just like Zapier/IFTTT)

## How to Use

1. Clone the repository
2. Run `pnpm install`
3. Run `pnpm dev`
4. You can now access the app in your browser at `http://localhost:3000`

## Contributions

Contributions are welcome! Please submit a pull request on GitHub if you'd like to suggest any changes or additions to the project.

## License

This project is licensed under the terms of the MIT license.
