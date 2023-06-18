# Notion/Airtable-Like Database running in Browser

This project is a local-first, web application for creating and managing databases in the browser. It uses sqlite-wasm to run the database engine locally on the user's machine, meaning all data is stored in the browser and there's no need for a server.

## Features

- 100% Local-first, support offline, you own your data!
- No server required
- PWA support

## Roadmap

see [Eidos Project](https://github.com/users/mayneyao/projects/5)

## Field

- [x] text
- [ ] number
- [x] checkbox
- [ ] select
- [ ] multi-select
- [x] rating
- [ ] url
- [ ] file
- [ ] date

| field            | onPaste | onDelete | getCell | setCell | property |
| ---------------- | ------- | -------- | ------- | ------- | -------- |
| text             | ✅      | ✅       | ✅      | ✅      |          |
| number           | ✅      | ✅       | ✅      | ✅      |          |
| checkbox         | ✅      | ✅       | ✅      | ✅      |          |
| select           |         |          |         |         |          |
| multi-select     |         |          |         |         |          |
| rating           | ✅      |          | ✅      | ✅      |          |
| url              | ✅      | ✅       | ✅      | ✅      |          |
| file             |         | ✅       | ✅      |         |          |
| date             |         |          |         |         |          |
| formula          |         |          |         |         |          |
| created time     |         |          |         |         |          |
| last edited time |         |          |         |         |          |
| link             |         |          |         |         |          |
| rollup           |         |          |         |         |          |

## How to Use

1. Clone the repository
2. Run `pnpm install`
3. Run `pnpm dev`
4. You can now access the app in your browser at `http://localhost:3000`

## Contributions

Contributions are welcome! Please submit a pull request on GitHub if you'd like to suggest any changes or additions to the project.

before you commit, run `pnpm test` to make sure all tests pass.

```
pnpm test
```

## License

This project is licensed under the terms of the MIT license.
