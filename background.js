import { CONFIG } from './config.js';

// Background Service Worker
// Coordinates subtitle storage, data quality statistics, and backend API communication.

let sessionUpdateQueue = Promise.resolve();

function safelyUpdateSession(updater) {
    sessionUpdateQueue = sessionUpdateQueue.then(() => new Promise((resolve) => {
        chrome.storage.local.get(['session'], (result) => {
            if (chrome.runtime.lastError) {
                console.error("[BingeLingo Service Worker] storage.get error:", chrome.runtime.lastError);
                resolve();
                return;
            }
            const session = result.session;
            if (session && session.status === 'capturing') {
                const modified = updater(session);
                if (modified !== false) {
                    chrome.storage.local.set({ session }, () => {
                        if (chrome.runtime.lastError) {
                            console.error("[BingeLingo Service Worker] storage.set error:", chrome.runtime.lastError);
                        }
                        resolve();
                    });
                    return;
                }
            }
            resolve();
        });
    })).catch(err => {
        console.error("[BingeLingo Service Worker] update queue error:", err);
    });
    return sessionUpdateQueue;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'ADD_OBSERVATION') {
        safelyUpdateSession((session) => {
            if (!session.stats) {
                session.stats = {
                    rawObservations: 0,
                    duplicatesIgnored: 0,
                    nonSpeechIgnored: 0,
                    usefulLinesRetained: 0
                };
            }
            
            session.stats.rawObservations = (session.stats.rawObservations || 0) + 1;
            const { category, text, timestamp } = message.payload || {};

            if (category === 'NON_SPEECH') {
                session.stats.nonSpeechIgnored = (session.stats.nonSpeechIgnored || 0) + 1;
            } else if (category === 'AD_FILTERED') {
                session.stats.adsFiltered = (session.stats.adsFiltered || 0) + 1;
            } else if (category === 'DUPLICATE') {
                session.stats.duplicatesIgnored = (session.stats.duplicatesIgnored || 0) + 1;
            } else if (category === 'USEFUL_LINE') {
                session.stats.usefulLinesRetained = (session.stats.usefulLinesRetained || 0) + 1;
                if (!session.lines) session.lines = [];
                if (session.lines.length < 5000) {
                    session.lines.push({ text, timestamp });
                    session.warning = null;
                }
            }
        });
        return false;
    } else if (message.type === 'ADD_LINE') {
        safelyUpdateSession((session) => {
            if (!session.stats) {
                session.stats = { rawObservations: 0, duplicatesIgnored: 0, nonSpeechIgnored: 0, usefulLinesRetained: 0 };
            }
            session.stats.rawObservations = (session.stats.rawObservations || 0) + 1;
            session.stats.usefulLinesRetained = (session.stats.usefulLinesRetained || 0) + 1;
            if (!session.lines) session.lines = [];
            if (session.lines.length < 5000) {
                session.lines.push(message.payload);
                session.warning = null;
            }
        });
        return false;
    } else if (message.type === 'NO_CAPTIONS_WARNING') {
        safelyUpdateSession((session) => {
            session.warning = "No visible captions found. Please ensure Korean subtitles (CC) are enabled.";
        });
        return false;
    } else if (message.type === 'PROCESS_SESSION') {
        processSession()
            .then(res => sendResponse(res))
            .catch(err => {
                console.error("[BingeLingo Service Worker Error]:", err);
                sendResponse({ success: false, error: err.message || "Unknown error during session processing." });
            });
        return true; // Keep the message channel open for the async response
    }
});

function isConfigMissing(url) {
    if (!url || typeof url !== 'string') return true;
    const trimmed = url.trim();
    return trimmed === "" || 
           trimmed.includes("<YOUR_PROJECT_ID>") || 
           trimmed.includes("your-project-ref") ||
           trimmed.includes("<PROJECT_REF>") ||
           !trimmed.startsWith("http");
}

async function processSession() {
    const result = await chrome.storage.local.get(['session']);
    const session = result.session;
    
    if (!session || !session.lines || session.lines.length === 0) {
        const stats = session?.stats;
        if (stats && stats.nonSpeechIgnored > 0 && stats.usefulLinesRetained === 0) {
            return { 
                success: false, 
                error: "No spoken Korean dialogue was captured (only non-speech labels like [음악] were detected). Please play a video section with dialogue." 
            };
        }
        return { success: false, error: "No subtitles captured yet." };
    }

    if (session.lines.length < 3) {
        return { 
            success: false, 
            error: `Only ${session.lines.length} clean dialogue lines were captured. Please capture a larger clip of the video before generating a comprehensive lesson (or use Export Session JSON).` 
        };
    }

    if (isConfigMissing(CONFIG.BINGELINGO_FUNCTION_URL)) {
        return { 
            success: false, 
            notConfigured: true,
            error: `Captured ${session.lines.length} clean Korean dialogue lines! Backend lesson generation is not connected yet (config.js). You can export the session JSON below.` 
        };
    }
    
    const payload = {
        title: session.title || "Unknown YouTube Title",
        sourceUrl: session.url,
        language: 'ko',
        sessionId: session.sessionId || ("session_" + Date.now()),
        captureStartedAt: session.captureStartedAt || null,
        captureEndedAt: session.captureEndedAt || new Date().toISOString(),
        stats: session.stats || {
            rawObservations: session.lines.length,
            duplicatesIgnored: 0,
            nonSpeechIgnored: 0,
            usefulLinesRetained: session.lines.length
        },
        lines: session.lines
    };

    const headers = {
        'Content-Type': 'application/json'
    };

    if (CONFIG.SUPABASE_ANON_KEY && 
        !CONFIG.SUPABASE_ANON_KEY.includes("<YOUR_") && 
        !CONFIG.SUPABASE_ANON_KEY.includes("your-anon-key")) {
        headers['Authorization'] = `Bearer ${CONFIG.SUPABASE_ANON_KEY}`;
        headers['apikey'] = CONFIG.SUPABASE_ANON_KEY;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    let res;
    try {
        res = await fetch(CONFIG.BINGELINGO_FUNCTION_URL, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify(payload),
            signal: controller.signal
        });
    } catch (fetchErr) {
        clearTimeout(timeoutId);
        if (fetchErr.name === 'AbortError') {
            return { success: false, error: "Backend request timed out (30s). Please check your server or network connection." };
        }
        return { success: false, error: `Network error connecting to backend: ${fetchErr.message}` };
    }
    clearTimeout(timeoutId);

    if (!res.ok) {
        const errText = await res.text();
        let detail = errText;
        try {
            const errJson = JSON.parse(errText);
            detail = errJson.error || errJson.message || errText;
        } catch (_) {}
        return { 
            success: false, 
            error: `Backend returned error HTTP ${res.status}: ${detail.substring(0, 180)}` 
        };
    }

    let data;
    try {
        data = await res.json();
    } catch (parseErr) {
        return { success: false, error: "Backend responded, but did not return valid JSON." };
    }

    if (data.error) {
        return { success: false, error: `Backend processing error: ${data.error}` };
    }
    
    const appUrl = (CONFIG.BINGELINGO_APP_URL && !CONFIG.BINGELINGO_APP_URL.includes("your-bingelingo-domain"))
        ? CONFIG.BINGELINGO_APP_URL.replace(/\/+$/, '')
        : "";

    const targetSessionId = data.sessionId || payload.sessionId;
    const redirectUrl = data.lessonUrl || (appUrl ? `${appUrl}/lesson/${targetSessionId}` : null);
    
    if (redirectUrl) {
        chrome.tabs.create({ url: redirectUrl });
    }
    
    // Purge session locally only upon confirmed success
    await chrome.storage.local.remove('session');
    
    return { success: true, lessonUrl: redirectUrl };
}