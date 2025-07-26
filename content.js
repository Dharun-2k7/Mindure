const browserAPI = typeof browser !== 'undefined' ? browser : chrome;

// Listen for messages from background and popup
browserAPI.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('Content script received message:', request);
    
    switch (request.action) {
        case 'checkPageContent':
        case 'getPageInfo':
            const pageInfo = getPageInfo();
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
        title: document.title,
        url: window.location.href,
        metaDescription: getMetaDescription(),
        domain: window.location.hostname
    };

    // --- YOUTUBE ENHANCEMENT ---
    // If on a YouTube watch page, extract channel name and video description
    if (window.location.hostname.includes('youtube.com') && window.location.pathname === '/watch') {
        // Try to get channel name
        const channelEl = document.querySelector('ytd-channel-name a, #owner-name a');
        info.youtubeChannel = channelEl ? channelEl.textContent.trim() : '';
        // Try to get video description
        const descEl = document.querySelector('#description, ytd-expander[collapsed]');
        info.youtubeDescription = descEl ? descEl.textContent.trim() : '';
    }
    // --- END YOUTUBE ENHANCEMENT ---

    return info;
}

// Get meta description
function getMetaDescription() {
    const metaDesc = document.querySelector('meta[name="description"]');
    return metaDesc ? metaDesc.getAttribute('content') : '';
}

// Block the current page
function blockPage() {
    // Create blocking overlay
    const overlay = document.createElement('div');
    overlay.id = 'mindure-block-overlay';
    overlay.innerHTML = `
        <div style="
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
        ">
            <div style="text-align: center; max-width: 600px; padding: 20px;">
                <h1 style="
                    font-size: 3rem;
                    color: #ff4500;
                    text-shadow: 0 0 10px rgba(255, 69, 0, 0.5);
                    margin-bottom: 20px;
                    letter-spacing: 2px;
                ">MINDURE</h1>
                <h2 style="
                    font-size: 1.8rem;
                    color: #ffffff;
                    margin-bottom: 15px;
                ">🚫 Content Blocked</h2>
                <p style="
                    font-size: 1.1rem;
                    color: #cccccc;
                    margin-bottom: 20px;
                    line-height: 1.6;
                ">This page has been identified as potentially distracting content.</p>
                <p style="
                    font-size: 1rem;
                    color: #888888;
                    margin-bottom: 30px;
                ">Stay focused on your goals! 🎯</p>
                <div style="display: flex; gap: 15px; justify-content: center; flex-wrap: wrap;">
                    <button id="mindure-override" style="
                        background-color: #ff4500;
                        border: none;
                        border-radius: 8px;
                        padding: 12px 24px;
                        font-size: 14px;
                        font-weight: 600;
                        color: #ffffff;
                        cursor: pointer;
                        transition: background-color 0.3s;
                    ">Override Block</button>
                    <button id="mindure-close-tab" style="
                        background-color: #333333;
                        border: none;
                        border-radius: 8px;
                        padding: 12px 24px;
                        font-size: 14px;
                        font-weight: 600;
                        color: #ffffff;
                        cursor: pointer;
                        transition: background-color 0.3s;
                    ">Close Tab</button>
                </div>
            </div>
        </div>
    `;
    
    // Remove existing overlay if any
    const existingOverlay = document.getElementById('mindure-block-overlay');
    if (existingOverlay) {
        existingOverlay.remove();
    }
    
    // Add overlay to page
    document.body.appendChild(overlay);
    
    // Add event listeners
    document.getElementById('mindure-override').addEventListener('click', () => {
        overlay.remove();
    });
    
    document.getElementById('mindure-close-tab').addEventListener('click', () => {
        window.close();
    });
    
    // Prevent scrolling
    document.body.style.overflow = 'hidden';
    
    console.log('Page blocked by Mindure');
}

// --- YOUTUBE SPA NAVIGATION HANDLING ---
// Listen for URL changes (YouTube SPA navigation)
let lastUrl = location.href;
new MutationObserver(() => {
    if (location.href !== lastUrl) {
        lastUrl = location.href;
        // Notify background to re-check the page
        browserAPI.runtime.sendMessage({ action: 'youtubeUrlChanged' });
    }
}).observe(document, { subtree: true, childList: true });
// --- END YOUTUBE SPA NAVIGATION HANDLING ---

// Initialize content script
console.log('Mindure content script loaded on:', window.location.href);