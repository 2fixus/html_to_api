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
const { CookieJar } = require('tough-cookie');
const { wrapper: cookieJarSupport } = require('axios-cookiejar-support');
const memoryCache = require('memory-cache');
const rateLimit = require('express-rate-limit');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(helmet());
app.use(cors());
app.use(morgan('combined'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// File upload middleware
const upload = multer();

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

// Load configuration from file if exists
const fs = require('fs');
const configPath = path.join(__dirname, 'config.json');
const sessionPath = path.join(__dirname, 'sessions.json');

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
function getCookieJar(domain, baseUrl) {
  if (!sessionStore[domain]) {
    sessionStore[domain] = {
      jar: new CookieJar(),
      baseUrl,
      lastUsed: new Date()
    };
  } else {
    sessionStore[domain].lastUsed = new Date();
  }
  return sessionStore[domain].jar;
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
  const cacheKey = getCacheKey(domain, path, method);

  // Try to get from cache first (only for GET requests)
  if (method === 'GET') {
    const cached = getCachedResponse(cacheKey);
    if (cached) {
      return { ...cached, cached: true };
    }
  }

  const url = `${config.baseUrl}/${path}`;
  const jar = getCookieJar(domain, config.baseUrl);
  const axiosInstance = cookieJarSupport(axios.create({ jar }));

  // Configure retry logic with exponential backoff
  axiosRetry(axiosInstance, {
    retries: 3,
    retryDelay: axiosRetry.exponentialDelay,
    retryCondition: (error) => {
      return axiosRetry.isNetworkOrIdempotentRequestError(error) || error.code === 'ECONNRESET';
    }
  });

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
  const $ = cheerio.load(response.data);
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

  return result;
}

// Dynamic API endpoint generation
app.get('/api/:domain/*', async (req, res) => {
  const domain = req.params.domain;
  const path = req.params[0] || '';
  const config = websiteConfigs[domain];

  if (!config) {
    return res.status(404).json({ error: `Domain ${domain} not configured` });
  }

  try {
    const result = await makeAPICall(domain, path, 'GET', null, config);
    res.json(result);
  } catch (error) {
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
    return res.status(404).json({ error: `Domain ${domain} not configured` });
  }

  try {
    const result = await makeAPICall(domain, path, 'POST', req, config);
    res.json(result);
  } catch (error) {
    console.error('Error submitting form:', error);
    res.status(500).json({ error: 'Failed to submit form', details: error.message });
  }
});

// Configuration endpoints
app.get('/config', (req, res) => {
  res.json(websiteConfigs);
});

app.post('/config', (req, res) => {
  const { domain, baseUrl, selectors, auth } = req.body;

  if (!domain || !baseUrl) {
    return res.status(400).json({ error: 'Domain and baseUrl are required' });
  }

  websiteConfigs[domain] = {
    baseUrl,
    selectors: selectors || {},
    auth: auth || null, // { username, password, loginPath }
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
