# Developer Setup Guide

This guide explains how to set up your local development environment for contributing to the Námsbókasafn translation pipeline.

## Prerequisites

- **Node.js 18+** - Required for the pipeline tools and server
- **Git** - For version control
- **GitHub account** - For authentication and contributing

## Quick Start

```bash
# Clone the repository
git clone https://github.com/SigurdurVilhelmsson/namsbokasafn-efni.git
cd namsbokasafn-efni

# Install root dependencies
npm install

# Install server dependencies
cd server && npm install && cd ..

# Run tests to verify setup
npm test
```

## Development Scripts

### Root package scripts

| Command | Description |
|---------|-------------|
| `npm test` | Run all tests |
| `npm run test:watch` | Run tests in watch mode |
| `npm run test:coverage` | Run tests with coverage report |
| `npm run lint` | Check for linting errors |
| `npm run lint:fix` | Fix linting errors automatically |
| `npm run format` | Format code with Prettier |
| `npm run format:check` | Check code formatting |
| `npm run validate` | Validate status.json files |
| `npm run docs:generate` | Regenerate documentation |

### Server scripts

```bash
cd server
npm start          # Start the server
npm run dev        # Start with watch mode (auto-restart)
```

## Project Structure

```
namsbokasafn-efni/
├── books/           # Translation content by book
│   └── efnafraedi/  # Chemistry translations
├── docs/            # Documentation
├── lib/             # Shared JavaScript library
├── scripts/         # Utility scripts
├── server/          # Express API server
└── tools/           # Pipeline CLI tools
```

## Running the Server

### Development Mode

```bash
cd server
npm run dev
```

The server runs at `http://localhost:3000` with:
- API at `/api`
- Web interface at `/workflow`

### Environment Variables

For local development, create a `.env` file in the `server/` directory:

```env
# Optional for local development
NODE_ENV=development
PORT=3000

# Required for GitHub OAuth (get from GitHub Developer Settings)
# GITHUB_CLIENT_ID=your_client_id
# GITHUB_CLIENT_SECRET=your_client_secret
# JWT_SECRET=your_secret_at_least_32_chars_long
```

**Note:** GitHub OAuth is optional for local development. Many features work without authentication.

## Code Style

This project uses:
- **ESLint** for JavaScript linting
- **Prettier** for code formatting

Pre-commit hooks automatically run linting and formatting on staged files.

### Manual formatting

```bash
# Check all files
npm run lint
npm run format:check

# Fix issues
npm run lint:fix
npm run format
```

## Testing

```bash
# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Watch mode (re-run on changes)
npm run test:watch
```

Test files are located next to source files in `__tests__/` directories.

## Common Tasks

### Adding a new CLI tool

1. Create the tool in `tools/`
2. Import shared utilities from `lib/`:
   ```javascript
   import { parseArgs, ensureDirectory } from '../lib/index.js';
   ```
3. Add tests in `tools/__tests__/`
4. Update `docs/technical/cli-reference.md`

### Modifying the server

1. Make changes in `server/`
2. Test with `npm run dev` (auto-restarts)
3. Add tests for new endpoints
4. Update `server/README.md` if adding new features

### Updating documentation

1. Edit files in `docs/`
2. Run `npm run docs:generate` to update generated sections
3. Verify with `npm run docs:check`

## Troubleshooting

### Tests fail with module errors

Ensure you're using Node.js 18+:
```bash
node --version
```

### Lint errors on commit

The pre-commit hook runs linting. Fix issues with:
```bash
npm run lint:fix
```

### Server won't start

Check for port conflicts:
```bash
lsof -i :3000
```

Or use a different port:
```bash
PORT=3001 npm start
```

## Getting Help

- Check the [CLI Reference](../technical/cli-reference.md)
- Review the [Workflow Guide](../workflow/simplified-workflow.md)
- Open an issue on GitHub
