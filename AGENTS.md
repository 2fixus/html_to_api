# AGENTS.md

## Build/Lint/Test Commands

- **Build**: `npm run build` or `cargo build --release` (TBD based on tech stack)
- **Lint**: `npm run lint` or `cargo clippy` (TBD based on tech stack)
- **Test All**: `npm test` or `cargo test` (TBD based on tech stack)
- **Test Single**: `npm test -- <test_name>` or `cargo test <test_name>` (TBD based on tech stack)

## Code Style Guidelines

### General
- Use TypeScript/JavaScript or Rust (TBD based on implementation)
- Follow existing patterns in the codebase
- Write self-documenting code with clear variable/function names

### Imports
- Group imports: standard library, third-party, local modules
- Use absolute imports for internal modules
- Avoid wildcard imports

### Formatting
- Use consistent indentation (2 spaces for JS/TS, 4 spaces for Rust)
- Max line length: 100 characters
- Trailing commas in multi-line structures

### Types
- Use strong typing where possible
- Define interfaces for API responses
- Avoid `any` type except for external API data

### Naming Conventions
- Functions: camelCase
- Classes/Types: PascalCase
- Constants: UPPER_SNAKE_CASE
- Files: kebab-case

### Error Handling
- Use try/catch for async operations
- Return Result types in Rust
- Log errors appropriately without exposing sensitive data
- Validate input data at API boundaries

### Security
- Never log sensitive information
- Validate and sanitize all user inputs
- Use HTTPS for all external communications
- Implement proper authentication/authorization

## Cursor Rules
None specified

## Copilot Rules
None specified