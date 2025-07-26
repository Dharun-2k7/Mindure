const browserAPI = typeof browser !== 'undefined' ? browser : chrome;

// Extension state
let isEnabled = false;
let groqApiKey = '';

// Initialize extension
browserAPI.runtime.onInstalled.addListener(() => {
    console.log('Mindure extension installed');
    loadSettings();
});

// Load settings from storage
async function loadSettings() {
    try {
        const result = await new Promise((resolve) => {
            browserAPI.storage.sync.get(['isEnabled', 'groqApiKey'], (result) => {
                resolve(result);
            });
        });
        
        isEnabled = result.isEnabled || false;
        groqApiKey = result.groqApiKey || '';
        console.log('Settings loaded:', { isEnabled, hasApiKey: !!groqApiKey });
    } catch (error) {
        console.error('Error loading settings:', error);
        isEnabled = false;
        groqApiKey = '';
    }
}

// Listen for storage changes
browserAPI.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'sync') {
        if (changes.isEnabled) {
            isEnabled = changes.isEnabled.newValue || false;
            console.log('isEnabled changed to:', isEnabled);
        }
        if (changes.groqApiKey) {
            groqApiKey = changes.groqApiKey.newValue || '';
            console.log('groqApiKey changed, hasKey:', !!groqApiKey);
        }
    }
});

// Listen for messages from popup and content scripts
browserAPI.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('Background received message:', request);
    
    switch (request.action) {
        case 'toggleEnabled':
            handleToggleEnabled(request, sendResponse);
            break;
        case 'analyzePage':
            handleAnalyzePage(request, sendResponse);
            break;
        case 'getStatus':
            handleGetStatus(sendResponse);
            break;
        case 'reloadSettings':
            loadSettings().then(() => {
                sendResponse({ success: true });
            });
            break;
        case 'youtubeUrlChanged':
            // Handle YouTube SPA navigation: re-analyze the page on URL change
            (async () => {
                const [tab] = await browserAPI.tabs.query({ active: true, currentWindow: true });
                if (!tab) return;
                const pageInfo = await browserAPI.tabs.sendMessage(tab.id, { action: 'getPageInfo' });
                if (!pageInfo) return;
                const isEducational = await analyzePageWithAI(pageInfo);
                if (!isEducational) {
                    await browserAPI.tabs.sendMessage(tab.id, { action: 'blockPage' });
                }
            })();
            break;
        default:
            sendResponse({ success: false, error: 'Unknown action' });
    }
    
    return true; // Keep message channel open for async response
});

// Handle toggle enabled/disabled
async function handleToggleEnabled(request, sendResponse) {
    try {
        isEnabled = request.enabled;
        await browserAPI.storage.sync.set({ isEnabled });
        console.log('Focus guard toggled:', isEnabled);
        sendResponse({ success: true, enabled: isEnabled });
    } catch (error) {
        console.error('Error toggling focus guard:', error);
        sendResponse({ success: false, error: error.message });
    }
}

// Handle get status
async function handleGetStatus(sendResponse) {
    // Reload settings to ensure we have the latest data
    await loadSettings();
    
    sendResponse({
        success: true,
        isEnabled,
        hasApiKey: !!groqApiKey
    });
}

// Handle page analysis
async function handleAnalyzePage(request, sendResponse) {
    try {
        if (!groqApiKey) {
            sendResponse({ success: false, error: 'No API key configured' });
            return;
        }

        if (!isEnabled) {
            sendResponse({ success: false, error: 'Focus guard is disabled' });
            return;
        }

        const isEducational = await analyzePageWithAI(request.pageInfo);
        sendResponse({ success: true, isEducational });
    } catch (error) {
        console.error('Error analyzing page:', error);
        sendResponse({ success: false, error: error.message });
    }
}

// Analyze page content with AI
async function analyzePageWithAI(pageInfo) {
    try {
        // --- ENHANCED YOUTUBE CONTEXT ---
        let youtubeDetails = '';
        if (pageInfo.domain && pageInfo.domain.includes('youtube.com') && pageInfo.youtubeChannel) {
            youtubeDetails = `\nYouTube Channel: ${pageInfo.youtubeChannel}`;
            if (pageInfo.youtubeDescription) {
                youtubeDetails += `\nVideo Description: ${pageInfo.youtubeDescription}`;
            }
        }
        // --- END ENHANCED YOUTUBE CONTEXT ---

        const prompt = `Analyze this webpage and determine if it's educational/productive or distracting:\n\nTitle: ${pageInfo.title}\nURL: ${pageInfo.url}\nMeta Description: ${pageInfo.metaDescription}${youtubeDetails}\n\nConsider the following as EDUCATIONAL/PRODUCTIVE:\n- Learning platforms (Khan Academy, Coursera, edX, etc.)\n- Programming/coding resources (GitHub, Stack Overflow, documentation)\n- News sites with educational content\n- Research papers and academic content\n- Professional development resources\n- Work-related tools and platforms\n\nConsider the following as DISTRACTING:\n- Social media platforms (Facebook, Instagram, Twitter, TikTok)\n- Entertainment sites (YouTube for non-educational content, Netflix, games)\n- Shopping sites (unless work-related)\n- Forums for casual discussion\n- Meme sites and time-wasting content\n\nIf this is a YouTube video and the channel or description does not clearly indicate educational or productive content, classify as DISTRACTING.\n\nRespond with only \"EDUCATIONAL\" or \"DISTRACTING\" based on the analysis.`;

        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${groqApiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: 'llama3-8b-8192',
                messages: [
                    {
                        role: 'user',
                        content: prompt
                    }
                ],
                temperature: 0.1,
                max_tokens: 10
            })
        });

        if (!response.ok) {
            throw new Error(`API request failed: ${response.status}`);
        }

        const data = await response.json();
        const result = data.choices[0]?.message?.content?.trim().toLowerCase();
        
        console.log('AI Analysis result:', result);
        return result === 'educational';
    } catch (error) {
        console.error('Error calling Groq API:', error);
        // Default to allowing the page if AI analysis fails
        return true;
    }
}

// Monitor navigation for automatic blocking
browserAPI.webNavigation.onCompleted.addListener(async (details) => {
    // Only process main frame navigation
    if (details.frameId !== 0) return;
    
    try {
        // Reload settings to ensure we have the latest state
        await loadSettings();
        
        if (!isEnabled || !groqApiKey) return;
        
        // Get page info
        const pageInfo = await browserAPI.tabs.sendMessage(details.tabId, { 
            action: 'getPageInfo' 
        });
        
        if (!pageInfo) return;
        
        // Analyze page
        const isEducational = await analyzePageWithAI(pageInfo);
        
        if (!isEducational) {
            // Block the page
            await browserAPI.tabs.sendMessage(details.tabId, { 
                action: 'blockPage' 
            });
        }
    } catch (error) {
        console.error('Error in navigation listener:', error);
    }
});

// Initialize settings on startup
loadSettings();