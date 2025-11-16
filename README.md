# HTML-to-API Proxy

A dynamic proxy server that converts any HTML-based website into a RESTful API. Perfect for integrating legacy HTML websites with modern applications.

## Features

- **Dynamic API Generation**: Automatically creates REST endpoints for any configured website
- **HTML Parsing**: Extracts structured data from HTML pages using CSS selectors
- **Form Detection**: Identifies and handles HTML forms for POST requests
- **Bidirectional Communication**: Both GET (read) and POST (write) operations
- **Configuration Management**: Web-based interface for managing website configurations
- **CORS Support**: Ready for cross-origin requests from web applications
- **Security**: Helmet middleware for security headers
- **Session Management**: Cookie persistence for authenticated sessions
- **Error Handling**: Comprehensive error reporting and recovery

## Advanced Capabilities

### ✅ **Implemented Advanced Features**
- **Session Management**: Cookie persistence across requests for authenticated sites
- **Response Caching**: Memory-based caching with configurable TTL (5 minutes default)
- **Rate Limiting**: 100 requests per 15 minutes per IP, 20 config requests per 15 minutes
- **Custom Data Selectors**: Extract specific data using CSS selectors
- **Form Field Detection**: Automatic discovery of input fields and form actions
- **Response Transformation**: Convert HTML responses to structured JSON
- **Multi-domain Support**: Configure multiple websites simultaneously
- **Real-time Testing**: Built-in API testing interface
- **Session Persistence**: Sessions saved to disk and restored on restart
- **Cache Management**: API endpoints to monitor and clear cache
- **Retry Logic**: Exponential backoff for failed requests (3 retries)
- **Real-time Testing**: Built-in API testing interface in web UI

### 🔄 **Planned Advanced Features**
- **JavaScript Execution**: Handle dynamic/SPA websites with headless browser
- **Authentication Automation**: Automated login flows and session management
- **File Upload Support**: Handle forms with file attachments
- **Webhook Integration**: Async notifications for long-running operations
- **Monitoring Dashboard**: Usage analytics and performance metrics

## Quick Start

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Start the server:**
   ```bash
   npm start
   ```

3. **Open your browser:**
   ```
   http://localhost:3000
   ```

4. **Configure a website:**
   - Enter a domain name (e.g., `example.com`)
   - Enter the base URL (e.g., `https://example.com`)
   - Optionally add CSS selectors for data extraction
   - Click "Add Configuration"

5. **Use the API:**
   ```bash
   # GET request
   curl http://localhost:3000/api/example.com/

   # POST request (for forms)
   curl -X POST http://localhost:3000/api/example.com/login \
     -d "username=test&password=test"
   ```

## API Endpoints

### GET `/api/{domain}/{path}`
Fetch and parse an HTML page from the configured domain.

**Example:**
```bash
curl http://localhost:3000/api/httpbin.org/get
```

**Response:**
```json
{
  "domain": "httpbin.org",
  "url": "https://httpbin.org/get",
  "data": {
    "forms": [],
    "title": "httpbin.org",
    "content": "..."
  },
  "timestamp": "2024-01-01T00:00:00.000Z",
  "cached": false
}
```

**Note:** GET responses are cached for 5 minutes. Subsequent identical requests will return `"cached": true`.

### POST `/api/{domain}/{path}`
Submit form data to an HTML page.

**Example:**
```bash
curl -X POST http://localhost:3000/api/example.com/login \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username=test&password=test"
```

### Configuration Management

- `GET /config` - List all configurations
- `POST /config` - Add new configuration
- `DELETE /config/{domain}` - Remove configuration

### Session Management

- `GET /sessions` - List all active sessions with cookie counts
- `DELETE /sessions/{domain}` - Clear session for specific domain
- `DELETE /sessions` - Clear all sessions

### Cache Management

- `GET /cache/stats` - Get cache statistics and keys
- `DELETE /cache` - Clear all cached responses

### Health & Monitoring

- `GET /health` - Health check endpoint

## Configuration Format

```json
{
  "domain": "example.com",
  "baseUrl": "https://example.com",
  "selectors": {
    "title": "h1",
    "content": ".main-content",
    "items": {
      "type": "array",
      "selector": ".item",
      "fields": {
        "name": ".name",
        "price": ".price"
      }
    }
  }
}
```

## Selector Types

### Simple Text Extraction
```json
"title": "h1"
```

### Array Extraction
```json
"items": {
  "type": "array",
  "selector": ".item",
  "fields": {
    "name": ".name",
    "price": ".price"
  }
}
```

## Development

```bash
# Run in development mode with auto-restart
npm run dev

# Run tests
npm test

# Lint code
npm run lint
```

## Use Cases

- **Legacy System Integration**: Connect modern apps to old HTML-based systems
- **Web Scraping APIs**: Create APIs for websites without official APIs
- **Rapid Prototyping**: Quickly create APIs for HTML mockups
- **Data Extraction**: Extract structured data from any website

## Security Considerations

- This proxy makes requests on behalf of users - implement proper authentication
- Be mindful of the target websites' terms of service
- Rate limiting may be needed for production use
- Validate and sanitize all inputs

## License

MIT</content>
</xai:function_call">### Implement data extraction and transformation

Now let me install the dependencies and test the application to make sure everything works correctly. 

<xai:function_call name="bash">
<parameter name="command">cd /home/a/https_to_API && npm install