// HTML-to-API Proxy Frontend
document.addEventListener('DOMContentLoaded', function() {
    loadConfigurations();

    // Handle configuration form submission
    document.getElementById('configForm').addEventListener('submit', function(e) {
        e.preventDefault();

        const domain = document.getElementById('domain').value.trim();
        const baseUrl = document.getElementById('baseUrl').value.trim();
        const selectorsText = document.getElementById('selectors').value.trim();

        let selectors = {};
        if (selectorsText) {
            try {
                selectors = JSON.parse(selectorsText);
            } catch (error) {
                showAlert('Invalid JSON in selectors field', 'error');
                return;
            }
        }

        addConfiguration(domain, baseUrl, selectors);
    });
});

async function loadConfigurations() {
    try {
        const response = await fetch('/config');
        const configs = await response.json();

        const configsList = document.getElementById('configsList');
        configsList.innerHTML = '';

        if (Object.keys(configs).length === 0) {
            configsList.innerHTML = '<p>No configurations found. Add one above to get started.</p>';
            return;
        }

        Object.entries(configs).forEach(([domain, config]) => {
            const configCard = createConfigCard(domain, config);
            configsList.appendChild(configCard);
        });
    } catch (error) {
        console.error('Error loading configurations:', error);
        showAlert('Failed to load configurations', 'error');
    }
}

function createConfigCard(domain, config) {
    const card = document.createElement('div');
    card.className = 'config-card';

    card.innerHTML = `
        <h3>${domain}</h3>
        <p><strong>Base URL:</strong> ${config.baseUrl}</p>
        <p><strong>Created:</strong> ${new Date(config.created).toLocaleString()}</p>
        <div class="actions">
            <button class="btn btn-primary" onclick="testEndpoint('${domain}')">Test API</button>
            <button class="btn btn-danger" onclick="deleteConfiguration('${domain}')">Delete</button>
        </div>
        <div id="test-result-${domain}" class="test-result" style="margin-top: 10px;"></div>
    `;

    return card;
}

async function addConfiguration(domain, baseUrl, selectors) {
    try {
        const response = await fetch('/config', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ domain, baseUrl, selectors })
        });

        if (response.ok) {
            showAlert('Configuration added successfully!', 'success');
            document.getElementById('configForm').reset();
            loadConfigurations();
        } else {
            const error = await response.json();
            showAlert(error.error || 'Failed to add configuration', 'error');
        }
    } catch (error) {
        console.error('Error adding configuration:', error);
        showAlert('Failed to add configuration', 'error');
    }
}

async function deleteConfiguration(domain) {
    if (!confirm(`Are you sure you want to delete the configuration for ${domain}?`)) {
        return;
    }

    try {
        const response = await fetch(`/config/${domain}`, {
            method: 'DELETE'
        });

        if (response.ok) {
            showAlert('Configuration deleted successfully!', 'success');
            loadConfigurations();
        } else {
            const error = await response.json();
            showAlert(error.error || 'Failed to delete configuration', 'error');
        }
    } catch (error) {
        console.error('Error deleting configuration:', error);
        showAlert('Failed to delete configuration', 'error');
    }
}

async function testEndpoint(domain) {
    const testResultDiv = document.getElementById(`test-result-${domain}`);
    testResultDiv.innerHTML = '<p>Testing...</p>';

    try {
        const response = await fetch(`/api/${domain}/`);
        const data = await response.json();

        if (response.ok) {
            testResultDiv.innerHTML = `
                <h4>Test Successful!</h4>
                <p><strong>Status:</strong> ${response.status}</p>
                <p><strong>Data keys:</strong> ${Object.keys(data.data || {}).join(', ')}</p>
                <details>
                    <summary>Full Response</summary>
                    <pre>${JSON.stringify(data, null, 2)}</pre>
                </details>
            `;
        } else {
            testResultDiv.innerHTML = `
                <h4>Test Failed</h4>
                <p><strong>Error:</strong> ${data.error}</p>
            `;
        }
    } catch (error) {
        testResultDiv.innerHTML = `
            <h4>Test Failed</h4>
            <p><strong>Error:</strong> ${error.message}</p>
        `;
    }
}

function showAlert(message, type) {
    // Remove existing alerts
    const existingAlerts = document.querySelectorAll('.alert');
    existingAlerts.forEach(alert => alert.remove());

    const alert = document.createElement('div');
    alert.className = `alert alert-${type}`;
    alert.textContent = message;

    const container = document.querySelector('.container');
    container.insertBefore(alert, container.firstChild);

    // Auto-remove after 5 seconds
    setTimeout(() => {
        if (alert.parentNode) {
            alert.remove();
        }
    }, 5000);
}

// Example configurations for quick setup
function loadExampleConfig() {
    document.getElementById('domain').value = 'httpbin.org';
    document.getElementById('baseUrl').value = 'https://httpbin.org';
    document.getElementById('selectors').value = JSON.stringify({
        title: 'h1',
        content: '.container'
    }, null, 2);
}</content>
</xai:function_call">### Add form detection and submission handling

Now let me update the todo list to mark the completed tasks and continue with the remaining functionality. Let me also create a README file to document how to use the proxy. 

<xai:function_call name="todowrite">
<parameter name="todos">[{"status":"completed","id":"setup_project"},{"status":"completed","id":"config_system"},{"status":"completed","id":"html_scraper"},{"status":"completed","id":"api_endpoints"},{"status":"completed","id":"form_handling"},{"status":"completed","id":"data_extraction"},{"status":"completed","id":"error_handling"},{"status":"completed","id":"basic_ui"}]