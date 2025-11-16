const express = require('express');
const https = require('https');
const axios = require('axios');
const axiosRetry = require('axios-retry');
const cheerio = require('cheerio');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');
const multer = require('multer');
const FormData = require('form-data');
const puppeteer = require('puppeteer');
const { CookieJar } = require('tough-cookie');
const { wrapper: cookieJarSupport } = require('axios-cookiejar-support');
const memoryCache = require('memory-cache');
const rateLimit = require('express-rate-limit');
const Joi = require('joi');

const app = express();
const PORT = process.env.PORT || 3000;

// IP Whitelisting
const allowedIPs = process.env.ALLOWED_IPS ? process.env.ALLOWED_IPS.split(',').map(ip => ip.trim()) : null;

// CORS Origins
const allowedOrigins = process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim()) : true;

// Middleware
app.set('trust proxy', 1);
app.use(helmet());
app.use(cors({ origin: allowedOrigins }));
app.use(morgan('combined')); // Console logging
app.use(morgan('combined', { stream: fs.createWriteStream(accessLogPath, { flags: 'a' }) })); // File logging
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// File upload middleware
const upload = multer();

// IP Whitelisting middleware
app.use('/api/', (req, res, next) => {
  if (allowedIPs && !allowedIPs.includes(req.ip)) {
    return res.status(403).json({ error: 'Access denied: IP not whitelisted' });
  }
  next();
});

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/', limiter);

// Stricter rate limiting for configuration endpoints
const configLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // limit each IP to 20 config requests per windowMs
  message: 'Too many configuration requests, please try again later.',
});
app.use('/config', configLimiter);

// Serve static files (HTML interface)
app.use(express.static(path.join(__dirname, 'public')));

// Configuration storage (in production, use a database)
let websiteConfigs = {};

// Session storage for cookie jars (in production, use Redis/database)
let sessionStore = {};

// Metrics storage
const metrics = {
  totalRequests: 0,
  totalErrors: 0,
  requestCountByDomain: {},
  responseTimeSum: 0,
  responseTimeCount: 0,
  startTime: Date.now()
};

// Circuit Breaker configuration
const CIRCUIT_BREAKER_FAILURE_THRESHOLD = parseInt(process.env.CIRCUIT_BREAKER_FAILURE_THRESHOLD) || 5;
const CIRCUIT_BREAKER_TIMEOUT = parseInt(process.env.CIRCUIT_BREAKER_TIMEOUT) || 60000; // 1 minute
const CIRCUIT_BREAKER_SUCCESS_THRESHOLD = parseInt(process.env.CIRCUIT_BREAKER_SUCCESS_THRESHOLD) || 3;

// Circuit Breaker storage
const circuitBreakers = {}; // domain -> { state: 'closed'|'open'|'half-open', failures: 0, lastFailure: timestamp, successes: 0 }

// Circuit Breaker functions
function getCircuitBreaker(domain) {
  if (!circuitBreakers[domain]) {
    circuitBreakers[domain] = {
      state: 'closed',
      failures: 0,
      lastFailure: null,
      successes: 0
    };
  }
  return circuitBreakers[domain];
}

function recordFailure(domain) {
  const cb = getCircuitBreaker(domain);
  cb.failures++;
  cb.lastFailure = Date.now();
  if (cb.failures >= CIRCUIT_BREAKER_FAILURE_THRESHOLD) {
    cb.state = 'open';
    console.log(`Circuit breaker opened for domain: ${domain}`);
  }
}

function recordSuccess(domain) {
  const cb = getCircuitBreaker(domain);
  if (cb.state === 'half-open') {
    cb.successes++;
    if (cb.successes >= CIRCUIT_BREAKER_SUCCESS_THRESHOLD) {
      cb.state = 'closed';
      cb.failures = 0;
      cb.successes = 0;
      console.log(`Circuit breaker closed for domain: ${domain}`);
    }
  } else if (cb.state === 'closed') {
    cb.failures = 0; // Reset on success
  }
}

function canProceed(domain) {
  const cb = getCircuitBreaker(domain);
  if (cb.state === 'closed') {
    return true;
  }
  if (cb.state === 'open') {
    if (Date.now() - cb.lastFailure > CIRCUIT_BREAKER_TIMEOUT) {
      cb.state = 'half-open';
      cb.successes = 0;
      console.log(`Circuit breaker half-open for domain: ${domain}`);
      return true;
    }
    return false;
  }
  return true; // half-open
}

// Configuration validation schema
const configSchema = Joi.object({
  domain: Joi.string().domain().required(),
  baseUrl: Joi.string().uri().required(),
  selectors: Joi.object().optional(),
  webhookUrl: Joi.string().uri().optional(),
  auth: Joi.object({
    username: Joi.string().required(),
    password: Joi.string().required(),
    loginPath: Joi.string().default('login')
  }).optional(),
  useBrowser: Joi.boolean().optional()
});

// Load configuration from file if exists
const fs = require('fs');
const configPath = path.join(__dirname, 'config.json');
const sessionPath = path.join(__dirname, 'sessions.json');
const accessLogPath = path.join(__dirname, 'access.log');

if (fs.existsSync(configPath)) {
  try {
    websiteConfigs = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch (error) {
    console.error('Error loading config:', error);
  }
}

// Load sessions from file if exists
if (fs.existsSync(sessionPath)) {
  try {
    const sessionData = JSON.parse(fs.readFileSync(sessionPath, 'utf8'));
    // Recreate cookie jars from serialized data
    Object.keys(sessionData).forEach(domain => {
      const jar = new CookieJar();
      sessionData[domain].cookies.forEach(cookieData => {
        jar.setCookieSync(cookieData, sessionData[domain].baseUrl);
      });
      sessionStore[domain] = {
        jar,
        baseUrl: sessionData[domain].baseUrl,
        lastUsed: new Date(sessionData[domain].lastUsed)
      };
    });
  } catch (error) {
    console.error('Error loading sessions:', error);
  }
}

// Save configuration to file
function saveConfig() {
  try {
    fs.writeFileSync(configPath, JSON.stringify(websiteConfigs, null, 2));
  } catch (error) {
    console.error('Error saving config:', error);
  }
}

// Save sessions to file
function saveSessions() {
  try {
    const sessionData = {};
    Object.keys(sessionStore).forEach(domain => {
      const session = sessionStore[domain];
      sessionData[domain] = {
        baseUrl: session.baseUrl,
        lastUsed: session.lastUsed.toISOString(),
        cookies: session.jar.getCookiesSync(session.baseUrl).map(cookie => cookie.toString())
      };
    });
    fs.writeFileSync(sessionPath, JSON.stringify(sessionData, null, 2));
  } catch (error) {
    console.error('Error saving sessions:', error);
  }
}

// Get or create cookie jar for domain
async function getCookieJar(domain, baseUrl, config) {
  if (!sessionStore[domain]) {
    sessionStore[domain] = {
      jar: new CookieJar(),
      baseUrl,
      lastUsed: new Date()
    };

    // Perform automated login if auth is configured
    if (config && config.auth && config.auth.loginPath) {
      await performLogin(sessionStore[domain].jar, baseUrl, config.auth);
    }
  } else {
    sessionStore[domain].lastUsed = new Date();
  }
  return sessionStore[domain].jar;
}

// Perform automated login
async function performLogin(jar, baseUrl, auth) {
  const axiosInstance = cookieJarSupport(axios.create({ jar }));

  try {
    await axiosInstance.post(`${baseUrl}/${auth.loginPath}`, {
      username: auth.username,
      password: auth.password
    }, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'HTML-to-API-Proxy/1.0'
      }
    });
    console.log(`Automated login successful for ${baseUrl}`);
  } catch (error) {
    console.error('Automated login failed:', error.message);
  }
}

// Get page content with headless browser for JS execution
async function getPageWithBrowser(url, jar) {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  });

  try {
    const page = await browser.newPage();

    // Set cookies from jar
    const cookies = jar.getCookiesSync(url);
    for (const cookie of cookies) {
      await page.setCookie({
        name: cookie.key,
        value: cookie.value,
        domain: cookie.domain || new URL(url).hostname,
        path: cookie.path || '/',
        httpOnly: cookie.httpOnly,
        secure: cookie.secure
      });
    }

    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
    const content = await page.content();

    // Get cookies back to jar
    const pageCookies = await page.cookies();
    for (const cookie of pageCookies) {
      jar.setCookieSync(`${cookie.name}=${cookie.value}; Domain=${cookie.domain}; Path=${cookie.path}`, url);
    }

    return content;
  } finally {
    await browser.close();
  }
}

// Cache management functions
function getCacheKey(domain, path, method = 'GET') {
  return `${method}:${domain}:${path}`;
}

function getCachedResponse(key) {
  return memoryCache.get(key);
}

function setCachedResponse(key, data, ttl = 300000) { // 5 minutes default
  memoryCache.put(key, data, ttl);
}

// Enhanced API call with caching
async function makeAPICall(domain, path, method = 'GET', data = null, config) {
  // Check circuit breaker
  if (!canProceed(domain)) {
    throw new Error('Circuit breaker is open for this domain');
  }

  const cacheKey = getCacheKey(domain, path, method);

  // Try to get from cache first (only for GET requests)
  if (method === 'GET') {
    const cached = getCachedResponse(cacheKey);
    if (cached) {
      return { ...cached, cached: true };
    }
  }

  const url = `${config.baseUrl}/${path}`;
  const jar = await getCookieJar(domain, config.baseUrl, config);
  const axiosInstance = cookieJarSupport(axios.create({ jar }));

  // Configure retry logic with exponential backoff
  axiosRetry(axiosInstance, {
    retries: 3,
    retryDelay: axiosRetry.exponentialDelay,
    retryCondition: (error) => {
      return axiosRetry.isNetworkOrIdempotentRequestError(error) || error.code === 'ECONNRESET';
    }
  });

  let html;

  if (method === 'GET' && config.useBrowser) {
    // Use headless browser for JS execution
    html = await getPageWithBrowser(url, jar);
  } else {
    // Use axios for regular requests
    const axiosConfig = {
      method,
      url,
      headers: {
        'User-Agent': 'HTML-to-API-Proxy/1.0'
      }
    };

    if (method === 'POST' && data) {
      if (data.files && data.files.length > 0) {
        // Handle file uploads
        const form = new FormData();

        // Add form fields
        Object.keys(data.body || {}).forEach(key => {
          form.append(key, data.body[key]);
        });

        // Add files
        data.files.forEach(file => {
          form.append(file.fieldname, file.buffer, {
            filename: file.originalname,
            contentType: file.mimetype
          });
        });

        axiosConfig.data = form;
        axiosConfig.headers = { ...axiosConfig.headers, ...form.getHeaders() };
      } else {
        // Regular form data
        axiosConfig.data = data.body || data;
        axiosConfig.headers['Content-Type'] = 'application/x-www-form-urlencoded';
      }
    }

    const response = await axiosInstance.request(axiosConfig);
    html = response.data;
  }

  const $ = cheerio.load(html);
  const extractedData = extractData($, config);

  const result = {
    domain,
    url,
    data: extractedData,
    timestamp: new Date().toISOString(),
    status: response.status
  };

  // Cache GET responses
  if (method === 'GET') {
    setCachedResponse(cacheKey, result);
  }

  // Send webhook notification if configured
  if (config.webhookUrl) {
    axios.post(config.webhookUrl, result).catch(err => console.error('Webhook failed:', err));
  }

  return result;
}

// Dynamic API endpoint generation
app.get('/api/:domain/*', async (req, res) => {
  const domain = req.params.domain;
  const path = req.params[0] || '';
  const config = websiteConfigs[domain];

  if (!config) {
    metrics.totalErrors++;
    return res.status(404).json({ error: `Domain ${domain} not configured` });
  }

  const start = Date.now();
  try {
    const result = await makeAPICall(domain, path, 'GET', null, config);
    const end = Date.now();
    metrics.totalRequests++;
    metrics.requestCountByDomain[domain] = (metrics.requestCountByDomain[domain] || 0) + 1;
    metrics.responseTimeSum += (end - start);
    metrics.responseTimeCount++;
    recordSuccess(domain);
    res.json(result);
  } catch (error) {
    metrics.totalErrors++;
    recordFailure(domain);
    console.error('Error fetching page:', error);
    res.status(500).json({ error: 'Failed to fetch page', details: error.message });
  }
});

// POST endpoint for form submissions
app.post('/api/:domain/*', upload.any(), async (req, res) => {
  const domain = req.params.domain;
  const path = req.params[0] || '';
  const config = websiteConfigs[domain];

  if (!config) {
    metrics.totalErrors++;
    return res.status(404).json({ error: `Domain ${domain} not configured` });
  }

  const start = Date.now();
  try {
    const result = await makeAPICall(domain, path, 'POST', req, config);
    const end = Date.now();
    metrics.totalRequests++;
    metrics.requestCountByDomain[domain] = (metrics.requestCountByDomain[domain] || 0) + 1;
    metrics.responseTimeSum += (end - start);
    metrics.responseTimeCount++;
    recordSuccess(domain);
    res.json(result);
  } catch (error) {
    metrics.totalErrors++;
    recordFailure(domain);
    console.error('Error submitting form:', error);
    res.status(500).json({ error: 'Failed to submit form', details: error.message });
  }
});

// Configuration endpoints
app.get('/config', (req, res) => {
  res.json(websiteConfigs);
});

app.post('/config', (req, res) => {
  const { error, value } = configSchema.validate(req.body);

  if (error) {
    return res.status(400).json({ error: error.details[0].message });
  }

  const { domain, baseUrl, selectors, auth, webhookUrl, useBrowser } = value;

  websiteConfigs[domain] = {
    baseUrl,
    selectors: selectors || {},
    auth: auth || null,
    webhookUrl: webhookUrl || null,
    useBrowser: useBrowser || false,
    created: new Date().toISOString()
  };

  saveConfig();
  res.json({ success: true, config: websiteConfigs[domain] });
});

app.delete('/config/:domain', (req, res) => {
  const domain = req.params.domain;

  if (!websiteConfigs[domain]) {
    return res.status(404).json({ error: 'Domain not found' });
  }

  delete websiteConfigs[domain];
  saveConfig();
  res.json({ success: true });
});

// Session management endpoints
app.get('/sessions', (req, res) => {
  const sessions = {};
  Object.keys(sessionStore).forEach(domain => {
    const session = sessionStore[domain];
    sessions[domain] = {
      baseUrl: session.baseUrl,
      lastUsed: session.lastUsed,
      cookieCount: session.jar.getCookiesSync(session.baseUrl).length
    };
  });
  res.json(sessions);
});

app.delete('/sessions/:domain', (req, res) => {
  const domain = req.params.domain;

  if (!sessionStore[domain]) {
    return res.status(404).json({ error: 'Session not found' });
  }

  delete sessionStore[domain];
  saveSessions();
  res.json({ success: true });
});

app.delete('/sessions', (req, res) => {
  sessionStore = {};
  saveSessions();
  res.json({ success: true, message: 'All sessions cleared' });
});

// Cache management endpoints
app.get('/cache/stats', (req, res) => {
  res.json({
    cacheSize: memoryCache.size(),
    cacheKeys: memoryCache.keys(),
    cacheInfo: 'Memory cache active'
  });
});

app.delete('/cache', (req, res) => {
  memoryCache.clear();
  res.json({ success: true, message: 'Cache cleared' });
});

// Data extraction function
function extractData($, config) {
  const data = {};

  // Extract data based on configured selectors
  if (config.selectors) {
    Object.keys(config.selectors).forEach(key => {
      const selector = config.selectors[key];
      if (typeof selector === 'string') {
        data[key] = $(selector).text().trim();
      } else if (selector.type === 'array') {
        data[key] = [];
        $(selector.selector).each((i, el) => {
          const item = {};
          if (selector.fields) {
            Object.keys(selector.fields).forEach(field => {
              item[field] = $(el).find(selector.fields[field]).text().trim();
            });
          } else {
            item.text = $(el).text().trim();
          }
          data[key].push(item);
        });
      }
    });
  }

  // Extract forms
  data.forms = [];
  $('form').each((i, form) => {
    const $form = $(form);
    const formData = {
      action: $form.attr('action'),
      method: $form.attr('method') || 'GET',
      inputs: []
    };

    $form.find('input, select, textarea').each((j, input) => {
      const $input = $(input);
      formData.inputs.push({
        name: $input.attr('name'),
        type: $input.attr('type'),
        value: $input.attr('value'),
        placeholder: $input.attr('placeholder')
      });
    });

    data.forms.push(formData);
  });

  return data;
}

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Batch operations endpoint
app.post('/batch', async (req, res) => {
  const { requests } = req.body;

  if (!Array.isArray(requests)) {
    return res.status(400).json({ error: 'requests must be an array' });
  }

  if (requests.length > 10) {
    return res.status(400).json({ error: 'Maximum 10 requests per batch' });
  }

  const results = [];

  for (const request of requests) {
    const { domain, path, method = 'GET', data } = request;

    if (!domain || !websiteConfigs[domain]) {
      results.push({ success: false, error: `Domain ${domain} not configured` });
      continue;
    }

    try {
      const result = await makeAPICall(domain, path, method, data, websiteConfigs[domain]);
      results.push({ success: true, result });
    } catch (error) {
      results.push({ success: false, error: error.message });
    }
  }

  res.json({ results });
});

// Help endpoint
app.get('/help', (req, res) => {
  res.json({
    name: 'HTML-to-API Proxy',
    version: '1.0.0',
    description: 'A dynamic proxy server that converts any HTML-based website into a RESTful API.',
    features: [
      'Dynamic API Generation',
      'HTML Parsing with CSS selectors',
      'Form Detection and Submission',
      'Session Management',
      'Response Caching',
      'Rate Limiting',
      'IP Whitelisting',
      'File Upload Support',
      'Authentication Automation',
      'JavaScript Execution with headless browser',
      'Webhook Integration',
      'Monitoring Dashboard',
      'Real-time Testing Interface',
      'Batch Operations',
      'Audit Logging',
      'CORS Policies',
      'Configuration Validation',
      'Circuit Breaker'
    ],
    endpoints: {
      'GET /': 'Serves the web interface',
      'GET /config': 'List all configurations',
      'POST /config': 'Add new configuration',
      'DELETE /config/{domain}': 'Remove configuration',
      'GET /api/{domain}/{path}': 'Fetch and parse HTML page',
      'POST /api/{domain}/{path}': 'Submit form data',
      'POST /batch': 'Execute multiple requests in batch',
      'GET /sessions': 'List active sessions',
      'DELETE /sessions/{domain}': 'Clear session for domain',
      'DELETE /sessions': 'Clear all sessions',
      'GET /cache/stats': 'Get cache statistics',
      'DELETE /cache': 'Clear all cached responses',
      'GET /metrics': 'Get usage metrics',
      'GET /health': 'Health check',
      'GET /help': 'This help information'
    },
    configuration: {
      domain: 'Domain name (required)',
      baseUrl: 'Base URL (required)',
      selectors: 'CSS selectors for data extraction (optional)',
      webhookUrl: 'URL for webhook notifications (optional)',
      auth: {
        username: 'Username for authentication',
        password: 'Password for authentication',
        loginPath: 'Login endpoint path'
      },
      useBrowser: 'Use headless browser for JS execution (boolean, optional)'
    },
    examples: {
      configuration: {
        domain: 'example.com',
        baseUrl: 'https://example.com',
        selectors: {
          title: 'h1',
          content: '.main-content'
        },
        webhookUrl: 'https://webhook.site/xxx',
        auth: {
          username: 'user',
          password: 'pass',
          loginPath: 'login'
        },
        useBrowser: true
      },
      api_get: 'GET /api/example.com/page',
      api_post: 'POST /api/example.com/login -d "username=user&password=pass"',
      batch: {
        requests: [
          { domain: 'example.com', path: 'page1', method: 'GET' },
          { domain: 'example.com', path: 'login', method: 'POST', data: { username: 'user', password: 'pass' } }
        ]
      }
    },
    security: 'Never log sensitive information. Validate inputs. Use HTTPS in production.'
  });
});

// Metrics endpoint
app.get('/metrics', (req, res) => {
  const avgResponseTime = metrics.responseTimeCount > 0 ? metrics.responseTimeSum / metrics.responseTimeCount : 0;
  const uptime = Date.now() - metrics.startTime;

  res.json({
    totalRequests: metrics.totalRequests,
    totalErrors: metrics.totalErrors,
    errorRate: metrics.totalRequests > 0 ? (metrics.totalErrors / metrics.totalRequests) * 100 : 0,
    averageResponseTime: Math.round(avgResponseTime),
    requestCountByDomain: metrics.requestCountByDomain,
    uptime: uptime,
    uptimeFormatted: `${Math.floor(uptime / 1000 / 60 / 60)}h ${Math.floor((uptime / 1000 / 60) % 60)}m`
  });
});

// Root endpoint serves the HTML interface
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Graceful shutdown handler
process.on('SIGINT', () => {
  console.log('Saving sessions before shutdown...');
  saveSessions();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('Saving sessions before shutdown...');
  saveSessions();
  process.exit(0);
});

const httpsOptions = {
  key: fs.readFileSync('key.pem'),
  cert: fs.readFileSync('cert.pem')
};

const server = https.createServer(httpsOptions, app);

server.listen(PORT, () => {
  console.log(`HTML-to-API Proxy server running on HTTPS port ${PORT}`);
  console.log(`Access the web interface at https://localhost:${PORT}`);
  console.log(`Session management and caching enabled!`);
});
