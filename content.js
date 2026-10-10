// content.js
// Handles interacting natively with YouTube DOM to capture accurate visually-rendered CC events.

const captureConfig = {
    findContainerIntervalMs: 1000,
    noCaptionWarningMs: 8000,
    duplicateTimeGapSec: 3.0 // Minimum seconds before considering consecutive identical text a new utterance after a pause
};

let state = {
    isCapturing: false,
    lastCapturedText: "",
    lastCapturedTimestamp: -1,
    captionCleared: true,
    captionContainerObserver: null,
    observedContainer: null,
    findContainerInterval: null,
    noCaptionTimeout: null,
    currentVideoId: null,
    inspectDebounceTimer: null
};

function getVideoId(url) {
    try {
        const urlObj = new URL(url);
        return urlObj.searchParams.get('v');
    } catch(e) {
        return null;
    }
}

/**
 * Detects standalone non-linguistic labels such as [음악], [박수], (웃음), [효과음], ♪, etc.
 * Preserves legitimate dialogue sentences that contain brackets or speaker tags like "[철수] 안녕!".
 */
function isNonSpeechLabel(text) {
    if (!text || typeof text !== 'string') return true;
    const trimmed = text.trim();
    if (!trimmed) return true;

    // Standalone music notes, symbols, or punctuation only
    if (/^[♪♫🎵🎶♩♬🎼\s\-_\.,~…!?:;]+$/.test(trimmed)) {
        return true;
    }

    // Check if the ENTIRE text is enclosed within a single set of brackets/parentheses
    const bracketRegex = /^(\[|\(|\（|\【|\<|\{|\《|\〔)\s*([^\]\)\）\】\>\}\》\〕\n\r]+)\s*(\]|\)|\）|\】|\>|\}|\》|\〕)$/;
    const match = trimmed.match(bracketRegex);

    if (match) {
        const inner = match[2].trim().toLowerCase();
        
        if (/^[♪♫🎵🎶♩♬🎼\s\-_\.,~…]+$/.test(inner)) {
            return true;
        }

        const exactTerms = new Set([
            '음악', '노래', '배경음악', 'bgm', 'ost', '오프닝', '엔딩', '음향', '효과음', '효과음향',
            '박수', '박수소리', '박수와 환호', '환호', '환호성', '함성', '함성소리',
            '웃음', '웃음소리', '폭소', '미소', '한숨', '숨소리', '거친 숨소리',
            '비명', '비명소리', '울음', '울음소리', '흐느낌', '오열', '침묵', '정적', '무음', '묵음',
            '기침', '기침소리', '사이렌', '사이렌 소리', '경적', '경적소리', '자막', '소리',
            '발소리', '발자국 소리', '문소리', '물소리', '빗소리', '바람소리', '파도소리', '천둥소리',
            '타자소리', '전화벨소리', '벨소리', '총소리', '폭발음', '폭발소리', '속삭임',
            '새소리', '종소리', '노크소리', '경고음', '기계음', '전자음', '신호음', '마찰음',
            'music', 'applause', 'cheering', 'laughter', 'chuckle', 'gasp', 'snicker',
            'sigh', 'sighs', 'scream', 'screaming', 'crying', 'sob', 'sobbing', 'silence',
            'cough', 'coughing', 'siren', 'horn', 'footsteps', 'door closes', 'door opens',
            'rain', 'wind', 'water', 'thunder', 'typing', 'ringtone', 'gunshot', 'explosion',
            'whisper', 'whispering', 'sound effect', 'sound effects', 'sfx', 'ambient',
            'instrumental', 'theme song', 'noise', 'applause and cheering'
        ]);

        if (exactTerms.has(inner)) {
            return true;
        }

        if (/^(잔잔한|경쾌한|슬픈|웅장한|긴장된|신나는|불안한|음산한|밝은|어두운|신비로운|부드러운|조용한|빠른|느린)?\s*(음악|bgm|노래|효과음|연주곡|멜로디)$/.test(inner)) {
            return true;
        }
        
        if (/^[가-힣\s]+(소리|음악|효과음|소음|음향|폭발음|경고음|기계음|신호음|마찰음|전자음|효과음향)$/.test(inner) && inner.length <= 15) {
            return true;
        }
    }

    return false;
}

function isAdActive() {
    try {
        const player = document.querySelector('.html5-video-player');
        if (player && (player.classList.contains('ad-showing') || player.classList.contains('ad-interrupting'))) {
            return true;
        }
        // Fallback for some YouTube versions or UI changes
        if (document.querySelector('.ytp-ad-player-overlay') || 
            document.querySelector('.ytp-ad-visit-advertiser-button') ||
            document.querySelector('.ytp-ad-skip-button-container')) {
            return true;
        }
    } catch (e) {
        console.debug("[BingeLingo Content] Ad detection error:", e);
    }
    return false;
}

function safeSendMessage(message) {
    try {
        if (chrome.runtime && chrome.runtime.sendMessage) {
            chrome.runtime.sendMessage(message, (response) => {
                const err = chrome.runtime.lastError;
                if (err) {
                    console.debug("[BingeLingo Content] sendMessage note:", err.message);
                }
            });
        }
    } catch (err) {
        console.debug("[BingeLingo Content] sendMessage exception:", err);
    }
}

// React natively to isolated state injections
chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.session) {
        handleSessionLifecycle(changes.session.newValue);
    }
});

// Cold startup execution verify
chrome.storage.local.get(['session'], (result) => {
    handleSessionLifecycle(result.session);
});

function handleSessionLifecycle(session) {
    if (!session) {
        stopCapturing();
        return;
    }

    const currentUrl = window.location.href;
    const expectedId = getVideoId(session.url);
    const myId = getVideoId(currentUrl);
    
    // Safety verification check: Make sure we are on the requested video tab
    const isCurrentVideoContext = (expectedId && myId && expectedId === myId) || 
                                 (!expectedId && session.url && currentUrl.startsWith(session.url.split('?')[0]));
    
    if (session.status === 'capturing' && isCurrentVideoContext) {
        if (!state.isCapturing) {
            startCapturing();
        }
    } else {
        if (state.isCapturing) {
            stopCapturing();
        }
    }
}

function startCapturing() {
    state.isCapturing = true;
    state.lastCapturedText = "";
    state.lastCapturedTimestamp = -1;
    state.captionCleared = true;
    state.currentVideoId = getVideoId(window.location.href);
    
    // Immediately attempt to attach and inspect
    safelyAttachObserver();
    
    // Scan actively for caption container in case CC is toggled dynamically
    if (state.findContainerInterval) clearInterval(state.findContainerInterval);
    state.findContainerInterval = setInterval(safelyAttachObserver, captureConfig.findContainerIntervalMs);
    resetNoCaptionsWarningTimeout();
}

function stopCapturing() {
    state.isCapturing = false;
    
    if (state.inspectDebounceTimer) {
        clearTimeout(state.inspectDebounceTimer);
        state.inspectDebounceTimer = null;
    }

    if (state.findContainerInterval) {
        clearInterval(state.findContainerInterval);
        state.findContainerInterval = null;
    }
    
    if (state.captionContainerObserver) {
        state.captionContainerObserver.disconnect();
        state.captionContainerObserver = null;
    }
    state.observedContainer = null;
    
    if (state.noCaptionTimeout) {
        clearTimeout(state.noCaptionTimeout);
        state.noCaptionTimeout = null;
    }
}

function safelyAttachObserver() {
    if (!state.isCapturing) return;

    const container = document.querySelector('.ytp-caption-window-container');
    
    if (container && (!state.captionContainerObserver || state.observedContainer !== container)) {
        if (state.captionContainerObserver) {
            state.captionContainerObserver.disconnect();
        }
        state.observedContainer = container;
        state.captionContainerObserver = new MutationObserver(() => {
            scheduleInspectVisibleCaptions();
        });
        
        state.captionContainerObserver.observe(container, {
            childList: true,
            subtree: true,
            characterData: true
        });

        // Inspect currently visible captions immediately
        scheduleInspectVisibleCaptions();
    } else if (!container && state.captionContainerObserver) {
        state.captionContainerObserver.disconnect();
        state.captionContainerObserver = null;
        state.observedContainer = null;
    }
}

function scheduleInspectVisibleCaptions() {
    if (!state.isCapturing) return;
    if (state.inspectDebounceTimer) return;
    
    state.inspectDebounceTimer = setTimeout(() => {
        state.inspectDebounceTimer = null;
        inspectVisibleCaptions();
    }, 50);
}

function inspectVisibleCaptions() {
    if (!state.isCapturing) return;
    
    // Check for active ads
    if (isAdActive()) {
        const videoElement = document.querySelector('video');
        const exactTime = videoElement && !isNaN(videoElement.currentTime) ? Number(videoElement.currentTime.toFixed(2)) : 0;
        
        safeSendMessage({
            type: 'ADD_OBSERVATION',
            payload: {
                category: 'AD_FILTERED',
                text: '[Advertisement Blocked]',
                timestamp: exactTime
            }
        });
        resetNoCaptionsWarningTimeout();
        return;
    }

    resetNoCaptionsWarningTimeout(); 

    const segments = document.querySelectorAll('.ytp-caption-segment');
    if (segments.length === 0) {
        // Caption window is empty; mark caption as cleared so future repetitions can be detected
        state.captionCleared = true;
        return;
    }

    // Merge fragments safely into clean normalized text
    const parsedText = Array.from(segments)
        .map(s => s.textContent.replace(/\s+/g, ' ').trim())
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();

    if (!parsedText) {
        state.captionCleared = true;
        return;
    }

    const videoElement = document.querySelector('video');
    const exactTime = videoElement && !isNaN(videoElement.currentTime) ? Number(videoElement.currentTime.toFixed(2)) : 0;

    // Filter standalone non-speech labels (e.g. [음악], [박수], ♪)
    if (isNonSpeechLabel(parsedText)) {
        if (state.lastCapturedText !== parsedText) {
            state.lastCapturedText = parsedText;
            state.lastCapturedTimestamp = exactTime;
            state.captionCleared = false;
            safeSendMessage({
                type: 'ADD_OBSERVATION',
                payload: {
                    category: 'NON_SPEECH',
                    text: parsedText,
                    timestamp: exactTime
                }
            });
        }
        return;
    }

    // Deduplication check
    const isSameText = (parsedText === state.lastCapturedText);
    const timeDiff = exactTime - state.lastCapturedTimestamp;

    if (isSameText) {
        // If caption remained on screen continuously, or reappeared within duplicate gap
        if (!state.captionCleared || (state.captionCleared && timeDiff >= 0 && timeDiff < captureConfig.duplicateTimeGapSec)) {
            safeSendMessage({
                type: 'ADD_OBSERVATION',
                payload: {
                    category: 'DUPLICATE',
                    text: parsedText,
                    timestamp: exactTime
                }
            });
            return;
        }
    }

    // Valid new dialogue line or legitimate repeated dialogue line after a pause
    state.lastCapturedText = parsedText;
    state.lastCapturedTimestamp = exactTime;
    state.captionCleared = false;

    safeSendMessage({
        type: 'ADD_OBSERVATION',
        payload: {
            category: 'USEFUL_LINE',
            text: parsedText,
            timestamp: exactTime
        }
    });
}

function resetNoCaptionsWarningTimeout() {
    if (state.noCaptionTimeout) {
        clearTimeout(state.noCaptionTimeout);
    }
    
    state.noCaptionTimeout = setTimeout(() => {
        if (state.isCapturing) {
            const fragmentsCheck = document.querySelectorAll('.ytp-caption-segment');
            if (fragmentsCheck.length === 0) {
                safeSendMessage({ type: 'NO_CAPTIONS_WARNING' });
            }
        }
    }, captureConfig.noCaptionWarningMs);
}

// Ensure smooth pause gracefully during local SPA page shifts
window.addEventListener('yt-navigate-finish', () => {
    const freshId = getVideoId(window.location.href);
    if (state.isCapturing && freshId && freshId !== state.currentVideoId) {
        chrome.storage.local.get(['session'], (block) => {
            if (block.session && block.session.status === 'capturing') {
                const modSession = block.session;
                modSession.status = 'idle'; // Pause safely rather than deleting the payload
                chrome.storage.local.set({ session: modSession });
            }
        });
    }
});