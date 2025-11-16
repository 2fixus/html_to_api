const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(helmet());
app.use(cors());
app.use(morgan('combined'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files (HTML interface)
app.use(express.static(path.join(__dirname, 'public')));

// Configuration storage (in production, use a database)
let websiteConfigs = {};

// Load configuration from file if exists
const fs = require('fs');
const configPath = path.join(__dirname, 'config.json');
if (fs.existsSync(configPath)) {
  try {
    websiteConfigs = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch (error) {
    console.error('Error loading config:', error);
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

// Dynamic API endpoint generation
app.get('/api/:domain/*', async (req, res) => {
  const domain = req.params.domain;
  const path = req.params[0] || '';
  const config = websiteConfigs[domain];

  if (!config) {
    return res.status(404).json({ error: `Domain ${domain} not configured` });
  }

  try {
    const url = `${config.baseUrl}/${path}`;
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'HTML-to-API-Proxy/1.0'
      }
    });

    const $ = cheerio.load(response.data);

    // Extract structured data based on configuration
    const extractedData = extractData($, config);

    res.json({
      domain,
      url,
      data: extractedData,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error fetching page:', error);
    res.status(500).json({ error: 'Failed to fetch page', details: error.message });
  }
});

// POST endpoint for form submissions
app.post('/api/:domain/*', async (req, res) => {
  const domain = req.params.domain;
  const path = req.params[0] || '';
  const config = websiteConfigs[domain];

  if (!config) {
    return res.status(404).json({ error: `Domain ${domain} not configured` });
  }

  try {
    const url = `${config.baseUrl}/${path}`;
    const response = await axios.post(url, req.body, {
      headers: {
        'User-Agent': 'HTML-to-API-Proxy/1.0',
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });

    const $ = cheerio.load(response.data);
    const extractedData = extractData($, config);

    res.json({
      domain,
      url,
      data: extractedData,
      timestamp: new Date().toISOString()
    });
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
  const { domain, baseUrl, selectors } = req.body;

  if (!domain || !baseUrl) {
    return res.status(400).json({ error: 'Domain and baseUrl are required' });
  }

  websiteConfigs[domain] = {
    baseUrl,
    selectors: selectors || {},
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

app.listen(PORT, () => {
  console.log(`HTML-to-API Proxy server running on port ${PORT}`);
  console.log(`Access the web interface at http://localhost:${PORT}`);
});
