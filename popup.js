// MINDURE POPUP SCRIPT
const browserAPI = typeof browser !== 'undefined' ? browser : chrome;

// DOM elements
const toggleSwitch = document.getElementById('focus-toggle');
const statusText = document.getElementById('status-text');
const statusDescription = document.querySelector('.status p');
const githubBtn = document.getElementById('github');
const linkedinBtn = document.getElementById('linkedin');

// State variables
let currentSettings = {
    isEnabled: false,
    hasApiKey: false
};

// Initialize popup
document.addEventListener('DOMContentLoaded', async () => {
    console.log('Popup loaded');
    toggleSwitch.disabled = true;
    
    const debugInfo = await getStorageData(['isEnabled', 'groqApiKey']);
    console.log('Debug - Storage contents:', {
        isEnabled: debugInfo.isEnabled,
        hasApiKey: !!(debugInfo.groqApiKey || '').trim(),
        apiKeyLength: (debugInfo.groqApiKey || '').length
    });
    
    await loadSettings();
    setupEventListeners();
});

// Load settings from storage and background
async function loadSettings() {
    try {
        const result = await getStorageData(['isEnabled', 'groqApiKey']);
        currentSettings = {
            isEnabled: result.isEnabled || false,
            hasApiKey: !!(result.groqApiKey || '').trim()
        };
        
        console.log('Direct storage result:', result);
        console.log('Current settings:', currentSettings);
        
        try {
            const response = await sendMessageToBackground({ action: 'getStatus' });
            if (response && response.success) {
                currentSettings.isEnabled = response.isEnabled;
            }
        } catch (bgError) {
            console.log('Background script not responding, using storage data');
        }
        
        updateUI();
    } catch (error) {
        console.error('Error loading settings:', error);
        currentSettings = { isEnabled: false, hasApiKey: false };
        updateUI();
    }
}

// Update UI based on current settings
function updateUI() {
    console.log('Updating UI with settings:', currentSettings);
    
    if (!currentSettings.hasApiKey) {
        statusText.textContent = 'Setup Required';
        statusDescription.textContent = 'Please configure your API key in options.';
        toggleSwitch.disabled = true;
        toggleSwitch.checked = false;
        addSetupButton();
    } else {
        statusText.textContent = currentSettings.isEnabled ? 'Focus Guard Active' : 'Focus Guard Paused';
        statusDescription.textContent = currentSettings.isEnabled ? 
            'Your focus is protected.' : 
            'Click to activate focus protection.';
        toggleSwitch.disabled = false;
        toggleSwitch.checked = currentSettings.isEnabled;
        removeSetupButton();
    }
}

// Add setup button for API key configuration
function addSetupButton() {
    const existingBtn = document.getElementById('setup-btn');
    if (existingBtn) return;
    
    const setupBtn = document.createElement('button');
    setupBtn.id = 'setup-btn';
    setupBtn.className = 'action-btn';
    setupBtn.innerHTML = '<span class="btn-icon">⚙️</span> Setup';
    setupBtn.style.marginTop = '10px';
    
    setupBtn.addEventListener('click', () => {
        browserAPI.runtime.openOptionsPage();
    });
    
    document.querySelector('.container').appendChild(setupBtn);
}

// Remove setup button
function removeSetupButton() {
    const setupBtn = document.getElementById('setup-btn');
    if (setupBtn) {
        setupBtn.remove();
    }
}

// Setup event listeners
function setupEventListeners() {
    toggleSwitch.addEventListener('change', handleToggleChange);
    
    githubBtn.addEventListener('click', () => {
        browserAPI.tabs.create({ url: 'https://github.com/Dharun-2k7/Mindure' });
    });
    
    linkedinBtn.addEventListener('click', () => {
        browserAPI.tabs.create({ url: 'https://www.linkedin.com/in/dharun-kaarthick/' });
    });
    
    browserAPI.storage.onChanged.addListener((changes, namespace) => {
        if (namespace === 'sync' && (changes.groqApiKey || changes.isEnabled)) {
            console.log('Storage changed, reloading settings');
            loadSettings();
        }
    });
}

// Handle toggle switch change
async function handleToggleChange(event) {
    const newState = event.target.checked;
    console.log('Toggle changed to:', newState);
    
    if (!currentSettings.hasApiKey) {
        toggleSwitch.checked = false;
        alert('Please configure your API key first by clicking the Setup button.');
        return;
    }
    
    try {
        toggleSwitch.disabled = true;
        
        const response = await sendMessageToBackground({
            action: 'toggleEnabled',
            enabled: newState
        });
        
        if (response.success) {
            currentSettings.isEnabled = newState;
            updateUI();
            console.log('Focus guard toggled successfully:', newState);
        } else {
            throw new Error(response.error || 'Unknown error');
        }
    } catch (error) {
        console.error('Error toggling focus guard:', error);
        toggleSwitch.checked = !newState;
        alert('Error toggling focus guard. Please try again.');
    } finally {
        toggleSwitch.disabled = !currentSettings.hasApiKey;
    }
}

// Send message to background script with timeout
function sendMessageToBackground(message) {
    return new Promise((resolve) => {
        const timeout = setTimeout(() => {
            resolve({ success: false, error: 'Timeout' });
        }, 5000);
        
        try {
            browserAPI.runtime.sendMessage(message, (response) => {
                clearTimeout(timeout);
                if (browserAPI.runtime.lastError) {
                    console.error('Runtime error:', browserAPI.runtime.lastError);
                    resolve({ success: false, error: browserAPI.runtime.lastError.message });
                } else {
                    resolve(response || { success: false, error: 'No response' });
                }
            });
        } catch (error) {
            clearTimeout(timeout);
            resolve({ success: false, error: error.message });
        }
    });
}
document.addEventListener('DOMContentLoaded', () => {
    const toggleButton = document.getElementById('toggleButton');
    const statusText = document.getElementById('statusText');

    chrome.runtime.sendMessage({ action: 'getStatus' }, (response) => {
        if (response.success) {
            updateUI(response.isEnabled, response.hasApiKey);
        } else {
            console.error('Failed to get status:', response.error);
            statusText.textContent = 'Error: Check console';
        }
    });

    toggleButton.addEventListener('click', () => {
        const isEnabled = toggleButton.textContent === 'Disable';
        chrome.runtime.sendMessage({ action: 'toggleEnabled', enabled: isEnabled }, (response) => {
            if (response.success) {
                updateUI(response.enabled, true); // Assume hasApiKey remains true
            } else {
                console.error('Failed to toggle:', response.error);
                statusText.textContent = 'Error: Check console';
            }
        });
    });

    function updateUI(isEnabled, hasApiKey) {
        toggleButton.textContent = isEnabled ? 'Disable' : 'Enable';
        statusText.textContent = `Status: ${isEnabled ? 'Enabled' : 'Disabled'}${hasApiKey ? '' : ' (No API Key)'}`;
        toggleButton.disabled = !hasApiKey;
    }
});
// Get data from storage
function getStorageData(keys) {
    return new Promise((resolve) => {
        browserAPI.storage.sync.get(keys, (result) => {
            if (browserAPI.runtime.lastError) {
                console.error('Storage error:', browserAPI.runtime.lastError);
                resolve({});
            } else {
                resolve(result);
            }
        });
    });
}