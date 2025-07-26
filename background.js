const browserAPI = typeof browser !== 'undefined' ? browser : chrome;

// Extension state
let isEnabled = false;
let groqApiKey = '';
const analysisCache = new Map();
const CACHE_DURATION = 60 * 60 * 1000; // 1 hour

// Initialize extension
browserAPI.runtime.onInstalled.addListener(() => {
    console.log('Mindure extension installed');
    loadSettings();
});

// Load settings from storage
async function loadSettings() {
    try {
        const result = await new Promise((resolve, reject) => {
            browserAPI.storage.sync.get(['isEnabled', 'groqApiKey'], (result) => {
                if (browserAPI.runtime.lastError) {
                    reject(browserAPI.runtime.lastError);
                } else {
                    resolve(result);
                }
            });
        });
        
        isEnabled = result.isEnabled || false;
        groqApiKey = result.groqApiKey || '';
        console.log('Settings loaded - isEnabled:', isEnabled, 'hasApiKey:', !!groqApiKey);
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
            (async () => {
                console.log('youtubeUrlChanged - isEnabled:', isEnabled);
                if (!isEnabled) {
                    sendResponse({ success: true }); // No action if disabled
                    return;
                }
                try {
                    let tabs;
                    try {
                        tabs = await browserAPI.tabs.query({ active: true, currentWindow: true });
                    } catch (queryError) {
                        console.error('Error querying tabs:', queryError);
                        sendResponse({ success: false, error: 'Failed to query active tab' });
                        return;
                    }

                    const tab = tabs && tabs[0];
                    if (!tab) {
                        console.error('No active tab found');
                        sendResponse({ success: false, error: 'No active tab' });
                        return;
                    }

                    if (!tab.id) {
                        console.error('Invalid tab ID');
                        sendResponse({ success: false, error: 'Invalid tab ID' });
                        return;
                    }

                    let pageInfo;
                    try {
                        pageInfo = await browserAPI.tabs.sendMessage(tab.id, { action: 'getPageInfo' });
                    } catch (messageError) {
                        console.error('Error sending message to content script:', messageError);
                        sendResponse({ success: false, error: 'Failed to get page info' });
                        return;
                    }

                    if (!pageInfo) {
                        console.error('No page info received');
                        sendResponse({ success: false, error: 'No page info' });
                        return;
                    }

                    if (pageInfo.domain && pageInfo.domain.includes('youtube.com')) {
                        const cachedResult = analysisCache.get(`${pageInfo.url}:${pageInfo.title}`);
                        if (cachedResult && !cachedResult.result) {
                            analysisCache.delete(`${pageInfo.url}:${pageInfo.title}`);
                        }
                    }

                    const isEducational = await analyzePageWithAI(pageInfo);
                    if (!isEducational) {
                        try {
                            await browserAPI.tabs.sendMessage(tab.id, { action: 'blockPage' });
                        } catch (blockError) {
                            console.error('Error sending blockPage message:', blockError);
                            sendResponse({ success: false, error: 'Failed to block page' });
                            return;
                        }
                    }
                    sendResponse({ success: true });
                } catch (error) {
                    console.error('Error in youtubeUrlChanged handler:', error);
                    sendResponse({ success: false, error: error.message || 'Unexpected error' });
                }
            })();
            break;
        default:
            sendResponse({ success: false, error: 'Unknown action' });
    }
    
    return true;
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
        if (!isEnabled) {
            sendResponse({ success: false, error: 'Focus guard is disabled' });
            return;
        }
        if (!groqApiKey) {
            sendResponse({ success: false, error: 'No API key configured' });
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
    const cacheKey = `${pageInfo.url}:${pageInfo.title}`;
    const cachedResult = analysisCache.get(cacheKey);
    if (cachedResult && Date.now() - cachedResult.timestamp < CACHE_DURATION) {
        console.log('Using cached analysis result:', cachedResult.result);
        return cachedResult.result;
    }

    try {
        let youtubeDetails = '';
        if (pageInfo.domain && pageInfo.domain.includes('youtube.com') && pageInfo.youtubeChannel) {
            youtubeDetails = `\nYouTube Channel: ${pageInfo.youtubeChannel}`;
            if (pageInfo.youtubeDescription) {
                youtubeDetails += `\nVideo Description: ${pageInfo.youtubeDescription}`;
            }
        }

        const prompt = `Analyze this webpage and determine if it's educational/productive or distracting:\n\nTitle: ${pageInfo.title}\nURL: ${pageInfo.url}\nMeta Description: ${pageInfo.metaDescription}${youtubeDetails}\n\nConsider the following as EDUCATIONAL/PRODUCTIVE:\n- Learning platforms (Khan Academy, Coursera, edX, etc.)\n- Programming/coding resources (GitHub, Stack Overflow, documentation)\n- News sites with educational content\n- Research papers and academic content\n- Professional development resources\n- Work-related tools and platforms\n- YouTube videos with clear educational intent (e.g., lectures, tutorials, courses from channels like Khan Academy, CrashCourse, or similar, indicated by titles like 'Lecture on...', 'Tutorial:...', or descriptions mentioning 'learn', 'teach', 'course')\n\nConsider the following as DISTRACTING:\n- Social media platforms (Facebook, Instagram, Twitter, TikTok)\n- Entertainment sites (YouTube for non-educational content, Netflix, games)\n- Shopping sites (unless work-related)\n- Forums for casual discussion\n- Meme sites and time-wasting content\n- Entertainment YouTube channels or creators like Sidemen, MrBeast, PewDiePie, or similar known for gaming, comedy, vlogs, or challenges unless the video title or description clearly indicates educational content\n\nFor YouTube videos, classify as EDUCATIONAL only if the title or description explicitly mentions educational keywords (e.g., 'learn', 'teach', 'tutorial', 'lecture', 'course') or the channel is known for educational content (e.g., Khan Academy). Otherwise, classify as DISTRACTING.\n\nRespond with only \"EDUCATIONAL\" or \"DISTRACTING\" based on the analysis.`;

        console.log('Sending prompt to Groq API:', prompt);
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
        
        if (!result) {
            console.warn('No result from API, defaulting to DISTRACTING');
            return false;
        }

        const finalResult = result === 'educational';
        analysisCache.set(cacheKey, { result: finalResult, timestamp: Date.now() });
        return finalResult;
    } catch (error) {
        console.error('Error calling Groq API:', error);
        return true;
    }
}

// Monitor navigation for automatic blocking
browserAPI.webNavigation.onCompleted.addListener(async (details) => {
    if (details.frameId !== 0) return;
    
    console.log('webNavigation.onCompleted - isEnabled:', isEnabled);
    if (!isEnabled) return;

    try {
        await loadSettings();
        
        if (!isEnabled || !groqApiKey) return;

        let tabs;
        try {
            tabs = await browserAPI.tabs.query({ active: true, currentWindow: true });
        } catch (queryError) {
            console.error('Error querying tabs in navigation listener:', queryError);
            return;
        }

        const tab = tabs && tabs[0];
        if (!tab || !tab.id) return;

        let pageInfo;
        try {
            pageInfo = await browserAPI.tabs.sendMessage(tab.id, { action: 'getPageInfo' });
        } catch (messageError) {
            console.error('Error sending message to content script:', messageError);
            return;
        }
        
        if (!pageInfo) return;

        if (pageInfo.domain && pageInfo.domain.includes('youtube.com')) {
            const cachedResult = analysisCache.get(`${pageInfo.url}:${pageInfo.title}`);
            if (cachedResult && !cachedResult.result) {
                analysisCache.delete(`${pageInfo.url}:${pageInfo.title}`);
            }
        }

        const isEducational = await analyzePageWithAI(pageInfo);
        
        if (!isEnabled) return; // Double-check after async operation
        
        if (!isEducational) {
            try {
                await browserAPI.tabs.sendMessage(tab.id, { action: 'blockPage' });
            } catch (blockError) {
                console.error('Error sending blockPage message:', blockError);
            }
        }
    } catch (error) {
        console.error('Error in navigation listener:', error);
    }
});