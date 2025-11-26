# Contributing to Eidos

Thank you for your interest in contributing to Eidos! This guide will help you get started.

## Getting Started

### Reporting Bugs

If you find a bug, please [open an issue](https://github.com/mayneyao/eidos/issues/new) on GitHub with:

- A clear description of the problem
- Steps to reproduce the issue
- Expected vs actual behavior
- Your environment (OS, Eidos version, etc.)

### Proposing New Features

Have an idea for a new feature? We'd love to hear it!

1. **Start a [discussion](https://github.com/mayneyao/eidos/discussions)** to share your idea
2. Get feedback from the community and maintainers
3. Discuss the implementation approach

> **Important**: Eidos typically does not accept unsolicited feature PRs. Please discuss your idea first in GitHub Discussions before investing time in implementation. This helps ensure the feature aligns with the project's vision and avoids duplicate work.

## Contributing Code

### Before You Start

- For **bug fixes**: You can directly submit a PR after reproducing and understanding the issue
- For **new features**: Must be discussed and approved in GitHub Discussions first
- Follow the relevant development guide for the area you're working on

### Submitting Pull Requests

1. Fork the repository and create a new branch from `dev`
2. Make your changes following the relevant development guide
3. Test your changes thoroughly
4. Write clear commit messages
5. Submit a pull request with:
   - A clear description of what the PR does
   - Reference to related issues or discussions
   - Screenshots/videos if applicable

## Contributing to Specific Areas

### Desktop App Development

For desktop application development, see the [Desktop Development Guide](https://github.com/mayneyao/eidos/blob/dev/apps/desktop/readme.md) which covers:

- Architecture overview and service mode
- Code organization and when to override web-app components
- Native package building requirements
- Development vs production setup

### Documentation

To contribute to the documentation website ([docs.eidos.space](https://docs.eidos.space)):

- The documentation project is located in `apps/docs/`
- Built with Astro and Starlight
- See the [documentation README](https://github.com/mayneyao/eidos/blob/dev/apps/docs/README.md) for setup instructions

### Translations

To contribute translations:

- See the [Translation Contributing Guide](https://github.com/mayneyao/eidos/blob/dev/packages/locales/CONTRIBUTING.md)
- Eidos uses i18next for internationalization
- Follow the guide to add a new language or improve existing translations

### Core Packages

Each package may have its own contributing guidelines. Check the respective package directory for more information.

## Code of Conduct

Please be respectful and constructive in all interactions. We're building this together as a community.
