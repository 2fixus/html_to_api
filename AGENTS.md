# AGENTS.md

## Build/Lint/Test Commands

- **Build**: No build step required (pure Node.js)
- **Lint**: `npm run lint` (ESLint)
- **Test All**: `npm test` (Jest)
- **Test Single**: `npm test -- <test_name>` (Jest)
- **Start**: `npm start`
- **Dev**: `npm run dev` (with nodemon)

## Code Style Guidelines

### General
- Use JavaScript/Node.js with ES6+ features
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

## Advanced Features Roadmap

### Authentication & Sessions
- **Session Management**: Cookie persistence across requests
- **Login Automation**: Automated authentication flows
- **Token Handling**: API key and bearer token support
- **Multi-user Sessions**: Isolated sessions per user/client

### Performance & Reliability
- **Caching Layer**: Redis/memory caching for responses
- **Rate Limiting**: Per-domain and per-client limits
- **Retry Logic**: Exponential backoff for failed requests
- **Circuit Breaker**: Prevent cascading failures
- **Request Queuing**: Handle high traffic gracefully

### Advanced Data Processing
- **JavaScript Execution**: Puppeteer/Playwright integration for SPA sites
- **File Upload Support**: Handle multipart/form-data uploads
- **Binary Content**: Support for images, PDFs, downloads
- **Content Type Detection**: Auto-detect and handle different media types
- **Data Transformation**: Custom mapping and filtering rules

### Security & Compliance
- **Request Signing**: HMAC signatures for API requests
- **IP Whitelisting**: Restrict access by IP/client
- **Audit Logging**: Track all requests and responses
- **Data Sanitization**: Clean and validate extracted data
- **CORS Policies**: Granular cross-origin control

### Advanced Scraping Features
- **Pagination Detection**: Auto-handle paginated content
- **Infinite Scroll**: Handle dynamic loading
- **AJAX Interception**: Capture async requests
- **WebSocket Proxy**: Forward real-time connections
- **Browser Automation**: Headless browser integration

### API Enhancements
- **Webhook Support**: Async notifications for long operations
- **Batch Operations**: Multiple requests in single API call
- **Response Streaming**: Handle large responses efficiently
- **API Versioning**: Maintain backward compatibility
- **Custom Endpoints**: User-defined API routes

### Monitoring & Analytics
- **Usage Metrics**: Request counts, response times, error rates
- **Health Checks**: Per-domain availability monitoring
- **Performance Monitoring**: Identify slow endpoints
- **Error Tracking**: Detailed error reporting and alerting
- **Access Logs**: Comprehensive request/response logging

### Enterprise Features
- **Multi-tenancy**: Isolated configurations per organization
- **Plugin System**: Extensible architecture for custom features
- **Configuration API**: Programmatic config management
- **Backup/Restore**: Configuration persistence
- **High Availability**: Load balancing and failover

### Developer Experience
- **OpenAPI Spec**: Auto-generated API documentation
- **SDK Generation**: Client libraries for popular languages
- **Testing Tools**: Built-in API testing interface
- **Debug Mode**: Detailed request/response inspection
- **Configuration Validation**: Schema validation for configs

## Cursor Rules
None specified

## Copilot Rules
None specified