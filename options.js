const browserAPI = typeof browser !== 'undefined' ? browser : chrome;

// DOM elements
const apiKeyInput = document.getElementById('api-key');
const saveBtn = document.getElementById('save-btn');
const messageDiv = document.getElementById('message');

// Initialize options page
document.addEventListener('DOMContentLoaded', () => {
    console.log('Options page loaded');
    loadSettings();
    setupEventListeners();
});

// Load settings from storage
async function loadSettings() {
    try {
        const result = await getStorageData(['groqApiKey']);
        apiKeyInput.value = result.groqApiKey || '';
        console.log('Settings loaded successfully');
    } catch (error) {
        console.error('Error loading settings:', error);
        showMessage('Error loading settings', 'error');
    }
}

// Setup event listeners
function setupEventListeners() {
    // Save button
    saveBtn.addEventListener('click', handleSave);
    
    // Enter key in input
    apiKeyInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            handleSave();
        }
    });
    
    // Input validation
    apiKeyInput.addEventListener('input', () => {
        hideMessage();
        validateInput();
    });
}

// Validate input
function validateInput() {
    const apiKey = apiKeyInput.value.trim();
    
    if (!apiKey) {
        saveBtn.disabled = true;
        saveBtn.textContent = 'Enter API Key';
        return false;
    }
    
    if (apiKey.length < 20) {
        saveBtn.disabled = true;
        saveBtn.textContent = 'Invalid API Key';
        return false;
    }
    
    saveBtn.disabled = false;
    saveBtn.textContent = 'Save';
    return true;
}

// Handle save action
async function handleSave() {
    const apiKey = apiKeyInput.value.trim();
    
    if (!validateInput()) {
        showMessage('Please enter a valid API key', 'error');
        return;
    }
    
    try {
        // Show loading state
        saveBtn.disabled = true;
        saveBtn.textContent = 'Saving...';
        
        // Test API key
        const isValid = await testApiKey(apiKey);
        
        if (!isValid) {
            throw new Error('Invalid API key. Please check your key and try again.');
        }
        
        // Save to storage
        await setStorageData({ groqApiKey: apiKey });
        
        // Also update the background script
        try {
            browserAPI.runtime.sendMessage({ action: 'reloadSettings' });
        } catch (error) {
            console.log('Background script not responding, but settings saved');
        }
        
        // Show success message
        showMessage('API key saved successfully!', 'success');
        
        // Reset button
        saveBtn.textContent = 'Save';
        saveBtn.disabled = false;
        
        console.log('API key saved successfully');
        
    } catch (error) {
        console.error('Error saving API key:', error);
        showMessage(error.message || 'Error saving API key. Please try again.', 'error');
        
        // Reset button
        saveBtn.textContent = 'Save';
        saveBtn.disabled = false;
    }
}

// Test API key validity
async function testApiKey(apiKey) {
    try {
        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: 'llama3-8b-8192',
                messages: [
                    {
                        role: 'user',
                        content: 'Test message'
                    }
                ],
                temperature: 0.1,
                max_tokens: 5
            })
        });
        
        return response.ok;
    } catch (error) {
        console.error('Error testing API key:', error);
        return false;
    }
}

// Show message
function showMessage(text, type) {
    messageDiv.textContent = text;
    messageDiv.className = `message ${type}`;
    messageDiv.style.display = 'block';
    
    // Auto-hide success messages
    if (type === 'success') {
        setTimeout(() => {
            hideMessage();
        }, 3000);
    }
}

// Hide message
function hideMessage() {
    messageDiv.style.display = 'none';
    messageDiv.className = 'message';
}

// Get data from storage
function getStorageData(keys) {
    return new Promise((resolve, reject) => {
        browserAPI.storage.sync.get(keys, (result) => {
            if (browserAPI.runtime.lastError) {
                reject(browserAPI.runtime.lastError);
            } else {
                resolve(result);
            }
        });
    });
}

// Set data to storage
function setStorageData(data) {
    return new Promise((resolve, reject) => {
        browserAPI.storage.sync.set(data, () => {
            if (browserAPI.runtime.lastError) {
                reject(browserAPI.runtime.lastError);
            } else {
                resolve();
            }
        });
    });
}

// Initialize validation
validateInput();