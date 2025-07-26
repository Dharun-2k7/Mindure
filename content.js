const browserAPI = typeof browser !== 'undefined' ? browser : chrome;

// Listen for messages from background and popup
browserAPI.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('Content script received message:', request);
    
    switch (request.action) {
        case 'checkPageContent':
        case 'getPageInfo':
            const pageInfo = getPageInfo();
            console.log('Page info collected:', pageInfo); // Debug log
            sendResponse(pageInfo);
            break;
        case 'blockPage':
            blockPage();
            sendResponse({ success: true });
            break;
        default:
            sendResponse({ success: false, error: 'Unknown action' });
    }
    
    return true;
});

// Get page information
function getPageInfo() {
    const info = {
        title: document.title || 'No Title',
        url: window.location.href,
        metaDescription: getMetaDescription(),
        domain: window.location.hostname
    };

    // --- YOUTUBE ENHANCEMENT ---
    // If on a YouTube watch page, extract channel name and video description
    if (window.location.hostname.includes('youtube.com') && window.location.pathname === '/watch') {
        // Retry selectors with a timeout to handle dynamic loading
        const getElementWithRetry = (selector, maxAttempts = 5, delay = 500) => {
            return new Promise((resolve) => {
                let attempts = 0;
                const interval = setInterval(() => {
                    const el = document.querySelector(selector);
                    if (el || attempts >= maxAttempts) {
                        clearInterval(interval);
                        resolve(el ? el.textContent.trim() : '');
                    }
                    attempts++;
                }, delay);
            });
        };

        (async () => {
            info.youtubeChannel = await getElementWithRetry('ytd-channel-name a, #owner-name a') || 'Unknown Channel';
            info.youtubeDescription = await getElementWithRetry('#description, ytd-expander[collapsed]') || 'No Description';
        })();
    }
    // --- END YOUTUBE ENHANCEMENT ---

    return info;
}

// Get meta description
function getMetaDescription() {
    const metaDesc = document.querySelector('meta[name="description"]');
    return metaDesc ? metaDesc.getAttribute('content') : '';
}

// Block the current page with enhanced override feedback
function blockPage() {
    const overlay = document.createElement('div');
    overlay.id = 'mindure-block-overlay';
    overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background-color: #1a1a1a;
        color: #ffffff;
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 999999;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif;
        flex-direction: column;
    `;

    const content = document.createElement('div');
    content.style.cssText = `
        text-align: center;
        max-width: 600px;
        padding: 20px;
    `;

    const title = document.createElement('h1');
    title.textContent = 'MINDURE';
    title.style.cssText = `
        font-size: 3rem;
        color: #ff4500;
        text-shadow: 0 0 10px rgba(255, 69, 0, 0.5);
        margin-bottom: 20px;
        letter-spacing: 2px;
    `;

    const subtitle = document.createElement('h2');
    subtitle.textContent = '🚫 Content Blocked';
    subtitle.style.cssText = `
        font-size: 1.8rem;
        color: #ffffff;
        margin-bottom: 15px;
    `;

    const message = document.createElement('p');
    message.textContent = 'This page has been identified as potentially distracting content.';
    message.style.cssText = `
        font-size: 1.1rem;
        color: #cccccc;
        margin-bottom: 20px;
        line-height: 1.6;
    `;

    const focusMessage = document.createElement('p');
    focusMessage.textContent = 'Stay focused or override to continue. 🎯';
    focusMessage.style.cssText = `
        font-size: 1rem;
        color: #888888;
        margin-bottom: 30px;
    `;

    const buttonContainer = document.createElement('div');
    buttonContainer.style.cssText = `
        display: flex;
        gap: 15px;
        justify-content: center;
        flex-wrap: wrap;
    `;

    const overrideBtn = document.createElement('button');
    overrideBtn.id = 'mindure-override';
    overrideBtn.textContent = 'Override Block';
    overrideBtn.style.cssText = `
        background-color: #ff4500;
        border: none;
        border-radius: 8px;
        padding: 12px 24px;
        font-size: 14px;
        font-weight: 600;
        color: #ffffff;
        cursor: pointer;
        transition: background-color 0.3s;
    `;
    overrideBtn.addEventListener('click', () => {
        overlay.remove();
        console.log('Block overridden by user');
    });

    const closeBtn = document.createElement('button');
    closeBtn.id = 'mindure-close-tab';
    closeBtn.textContent = 'Close Tab';
    closeBtn.style.cssText = `
        background-color: #333333;
        border: none;
        border-radius: 8px;
        padding: 12px 24px;
        font-size: 14px;
        font-weight: 600;
        color: #ffffff;
        cursor: pointer;
        transition: background-color 0.3s;
    `;
    closeBtn.addEventListener('click', () => window.close());

    buttonContainer.append(overrideBtn, closeBtn);
    content.append(title, subtitle, message, focusMessage, buttonContainer);
    overlay.append(content);
    
    const existingOverlay = document.getElementById('mindure-block-overlay');
    if (existingOverlay) {
        existingOverlay.remove();
    }
    
    document.body.appendChild(overlay);
    
    document.body.style.overflow = 'hidden';
    
    console.log('Page blocked by Mindure');
}

// --- YOUTUBE SPA NAVIGATION HANDLING ---
let lastUrl = location.href;
new MutationObserver(() => {
    if (location.href !== lastUrl) {
        lastUrl = location.href;
        browserAPI.runtime.sendMessage({ action: 'youtubeUrlChanged' });
    }
}).observe(document.head, { childList: true });
// --- END YOUTUBE SPA NAVIGATION HANDLING ---

// Initialize content script
console.log('Mindure content script loaded on:', window.location.href);