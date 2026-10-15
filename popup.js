// popup.js
// Controls user interface interactions, feedback rendering, and session lifecycle in the popup

let isProcessing = false;
let currentMessage = null; // { text: string, type: string }

function getVideoId(url) {
    try {
        const urlObj = new URL(url);
        return urlObj.searchParams.get('v');
    } catch(e) {
        return null;
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    const titleEl = document.getElementById('video-title');
    const statusEl = document.getElementById('capture-status');
    const linesEl = document.getElementById('lines-captured');
    const statsEl = document.getElementById('capture-stats');
    const messageEl = document.getElementById('message-box');
    const startBtn = document.getElementById('start-btn');
    const stopBtn = document.getElementById('stop-btn');
    const exportBtn = document.getElementById('export-btn');
    const sendBingeLingoBtn = document.getElementById('send-bingelingo-btn');
    const openLessonBtn = document.getElementById('open-lesson-builder-btn');
    
    function showMessage(text, type = "info") {
        if (!text) {
            currentMessage = null;
            messageEl.style.display = 'none';
            messageEl.textContent = '';
            messageEl.className = 'message-box';
            return;
        }
        currentMessage = { text, type };
        messageEl.textContent = text;
        messageEl.className = "message-box " + type;
        messageEl.style.display = 'block';
    }

    function renderStateFeedback() {
        if (isProcessing) return; // Prevent overwriting active processing feedback
        
        chrome.storage.local.get(['session'], (result) => {
            if (isProcessing) return;
            const session = result.session;
            
            if (session && session.status === 'capturing') {
                titleEl.textContent = session.title || "YouTube Video";
                titleEl.title = session.title || ""; 
                statusEl.textContent = "Status: 🔴 LIVE (Capturing)";
                statusEl.style.color = "#15803d"; // Green
                const count = session.lines ? session.lines.length : 0;
                linesEl.textContent = "Korean Lines Extracted: " + count;
                
                const stats = session.stats;
                if (stats && stats.rawObservations > 0) {
                    const adsText = (stats.adsFiltered > 0) ? (", " + stats.adsFiltered + " ads") : "";
                    statsEl.textContent = "Raw: " + stats.rawObservations + " | Filtered: " + (stats.duplicatesIgnored || 0) + " duplicates, " + (stats.nonSpeechIgnored || 0) + " non-speech" + adsText;
                    statsEl.style.display = 'block';
                } else {
                    statsEl.style.display = 'none';
                }
                
                startBtn.disabled = true;
                stopBtn.disabled = false;
                exportBtn.disabled = count === 0;
                sendBingeLingoBtn.disabled = count === 0;
                
                if (session.warning && !currentMessage) {
                    showMessage(session.warning, "warning");
                }
            } else if (session && session.lines && session.lines.length > 0) {
                titleEl.textContent = session.title || "YouTube Video";
                titleEl.title = session.title || "";
                statusEl.textContent = "Status: ⏸️ Stopped / Ready";
                statusEl.style.color = "#ca8a04"; // Warm Orange
                linesEl.textContent = "Korean Lines Extracted: " + session.lines.length;
                
                const stats = session.stats;
                if (stats && stats.rawObservations > 0) {
                    const adsText = (stats.adsFiltered > 0) ? (", " + stats.adsFiltered + " ads") : "";
                    statsEl.textContent = "Raw: " + stats.rawObservations + " | Filtered: " + (stats.duplicatesIgnored || 0) + " duplicates, " + (stats.nonSpeechIgnored || 0) + " non-speech" + adsText;
                    statsEl.style.display = 'block';
                } else {
                    statsEl.style.display = 'none';
                }
                
                startBtn.disabled = false;
                stopBtn.disabled = false;
                exportBtn.disabled = false;
                sendBingeLingoBtn.disabled = false;
            } else {
                titleEl.textContent = "No active capture";
                statusEl.textContent = "Status: ■ Idle";
                statusEl.style.color = "#737373";
                linesEl.textContent = "Korean Lines Extracted: 0";
                if (statsEl) statsEl.style.display = 'none';
                
                startBtn.disabled = false;
                stopBtn.disabled = true;
                exportBtn.disabled = true;
                sendBingeLingoBtn.disabled = true;
            }
        });
    }

    // Initial render
    renderStateFeedback();
    
    // Subscribe to storage updates
    chrome.storage.onChanged.addListener((changes, area) => {
        if (area === 'local' && changes.session) {
            renderStateFeedback();
        }
    });

    // Start Capture Button
    startBtn.addEventListener('click', async () => {
        if (isProcessing) return;
        showMessage('');
        
        const [targetTab] = await chrome.tabs.query({ active: true, currentWindow: true });
        
        if (!targetTab || !targetTab.url || !targetTab.url.includes("youtube.com/watch")) {
            showMessage("Please open and navigate to a YouTube video page (youtube.com/watch) first.", "warning");
            return;
        }

        const { session } = await chrome.storage.local.get(['session']);
        const isSameVideo = session && session.url && getVideoId(session.url) === getVideoId(targetTab.url);

        // Warn before overwriting previous lines from a different video
        if (!isSameVideo && session && session.lines && session.lines.length > 0) {
            const conflictVerified = confirm("Starting capture on a new video will discard " + session.lines.length + " lines captured from the previous video. Continue?");
            if (!conflictVerified) return;
        }

        let targetSession = {
            sessionId: (isSameVideo && session.sessionId) ? session.sessionId : ("session_" + Date.now()),
            status: 'capturing',
            tabId: targetTab.id,
            url: targetTab.url,
            title: targetTab.title ? targetTab.title.replace(/ - YouTube$/, '') : "YouTube Video",
            captureStartedAt: (isSameVideo && session.captureStartedAt) ? session.captureStartedAt : new Date().toISOString(),
            captureEndedAt: null,
            lines: (isSameVideo && session.lines) ? session.lines : [],
            stats: (isSameVideo && session.stats) ? session.stats : {
                rawObservations: 0,
                duplicatesIgnored: 0,
                nonSpeechIgnored: 0,
                usefulLinesRetained: 0
            },
            warning: null
        };

        await chrome.storage.local.set({ session: targetSession });
        showMessage("Capture started! Ensure Korean subtitles (CC) are enabled on the video.", "info");
    });

    // Stop & Generate Lesson Button
    stopBtn.addEventListener('click', async () => {
        if (isProcessing) return;
        isProcessing = true;

        // Immediate UI feedback
        startBtn.disabled = true;
        stopBtn.disabled = true;
        exportBtn.disabled = true;
        statusEl.textContent = "Status: ⏳ Stopping capture & processing...";
        statusEl.style.color = "#2563eb";
        showMessage("Stopping capture and processing Korean subtitles...", "info");

        try {
            const { session } = await chrome.storage.local.get(['session']);
            
            if (!session || !session.lines || session.lines.length === 0) {
                const stats = session?.stats;
                if (stats && stats.nonSpeechIgnored > 0 && stats.usefulLinesRetained === 0) {
                    showMessage("No spoken Korean dialogue captured yet (only non-speech labels like [음악] were detected). Play a section with spoken dialogue.", "warning");
                } else if (stats && stats.rawObservations > 0) {
                    showMessage("No valid dialogue lines were retained from captions. Ensure the video has spoken Korean dialogue.", "warning");
                } else {
                    showMessage("No subtitles captured yet. Ensure YouTube captions (CC) are enabled and Korean subtitles are selected.", "warning");
                }
                isProcessing = false;
                renderStateFeedback();
                return;
            }

            // Immediately mark status as idle so the content script stops capturing
            const updatedSession = { 
                ...session, 
                status: 'idle',
                captureEndedAt: new Date().toISOString()
            };
            await chrome.storage.local.set({ session: updatedSession });

            // Send message to background service worker to process session
            chrome.runtime.sendMessage({ type: 'PROCESS_SESSION' }, (response) => {
                isProcessing = false;
                
                const lastError = chrome.runtime.lastError;
                if (lastError) {
                    console.error("[BingeLingo] Runtime message error:", lastError);
                    showMessage("Service worker error: " + lastError.message + ". Your captured lines are safe. Use Export Session JSON.", "error");
                    renderStateFeedback();
                    return;
                }

                if (response && response.success) {
                    showMessage("Lesson generated successfully! Opening lesson...", "success");
                    renderStateFeedback();
                } else if (response && response.notConfigured) {
                    showMessage(response.error, "warning");
                    renderStateFeedback();
                } else {
                    const errDetail = response?.error || "Unknown error during lesson generation.";
                    showMessage("Generation failed: " + errDetail + " Your captured lines are preserved.", "error");
                    renderStateFeedback();
                }
            });

        } catch (err) {
            console.error("[BingeLingo] Stop handler error:", err);
            isProcessing = false;
            showMessage("Unexpected error: " + err.message + ". Your session data is preserved.", "error");
            renderStateFeedback();
        }
    });

    // Export Session JSON Button
    exportBtn.addEventListener('click', async () => {
        try {
            const { session } = await chrome.storage.local.get(['session']);
            if (!session || !session.lines || session.lines.length === 0) {
                const stats = session?.stats;
                if (stats && stats.nonSpeechIgnored > 0 && stats.usefulLinesRetained === 0) {
                    showMessage("No spoken Korean dialogue captured yet (only sound/music labels like [음악] were detected).", "warning");
                } else {
                    showMessage("No captured subtitle lines to export.", "warning");
                }
                return;
            }

            const exportData = {
                sessionId: session.sessionId || ("session_" + Date.now()),
                title: session.title || "YouTube Video",
                sourceUrl: session.url || "",
                language: "ko",
                captureStartedAt: session.captureStartedAt || null,
                captureEndedAt: session.captureEndedAt || new Date().toISOString(),
                exportedAt: new Date().toISOString(),
                timeRange: session.lines.length > 0 ? {
                    firstTimestampSec: Number(session.lines[0].timestamp.toFixed(2)),
                    lastTimestampSec: Number(session.lines[session.lines.length - 1].timestamp.toFixed(2)),
                    durationSeconds: Number((session.lines[session.lines.length - 1].timestamp - session.lines[0].timestamp).toFixed(2))
                } : null,
                stats: {
                    rawObservations: session.stats?.rawObservations || session.lines.length,
                    duplicatesIgnored: session.stats?.duplicatesIgnored || 0,
                    nonSpeechIgnored: session.stats?.nonSpeechIgnored || 0,
                    usefulLinesRetained: session.lines.length
                },
                lineCount: session.lines.length,
                lines: session.lines
            };

            const jsonString = JSON.stringify(exportData, null, 2);
            const blob = new Blob([jsonString], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            
            const cleanTitle = (session.title || "bingelingo_session")
                .replace(/[^a-zA-Z0-9가-힣_-]/g, "_")
                .substring(0, 40);
            const filename = cleanTitle + "_" + Date.now() + ".json";

            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

                        showMessage("Exported " + session.lines.length + " clean lines to " + filename, "success");
        } catch (err) {
            console.error("[BingeLingo] Export error:", err);
            showMessage("Failed to export JSON: " + err.message, "error");
        }
    });

    // Send captured Korean subtitles to the BingeLingo web app.
    sendBingeLingoBtn.addEventListener('click', async () => {
        if (isProcessing) return;
        const originalLabel = sendBingeLingoBtn.textContent;
        sendBingeLingoBtn.disabled = true;
        sendBingeLingoBtn.textContent = 'Opening BingeLingo...';
        try {
            const { session } = await chrome.storage.local.get(['session']);
            if (!session || !Array.isArray(session.lines) || session.lines.length === 0) {
                showMessage('Capture some Korean dialogue first, then send it to BingeLingo.', 'warning');
                return;
            }
            const payload = {
                title: session.title || 'Korean subtitle session',
                sourceUrl: session.url || '',
                language: 'ko',
                lines: session.lines.slice(0, 10).map(line => ({
                    text: String(line.text || line.korean || '').trim(),
                    timestamp: Number.isFinite(Number(line.timestamp)) ? Number(line.timestamp) : 0
                })).filter(line => line.text)
            };
            if (!payload.lines.length) {
                showMessage('No readable Korean dialogue lines were found in this session.', 'warning');
                return;
            }
            const encoded = btoa(unescape(encodeURIComponent(JSON.stringify(payload))));
            const targetUrl = 'https://bingelingo.hatchable.site/?capture=' + encodeURIComponent(encoded);
            if (targetUrl.length > 7000) {
                showMessage('This session is too large to send in one link. Export the JSON instead.', 'warning');
                return;
            }
            await chrome.tabs.create({ url: targetUrl });
            showMessage('Opened BingeLingo with ' + payload.lines.length + ' captured lines.', 'success');
        } catch (err) {
            console.error('[BingeLingo] Send-to-app error:', err);
            showMessage('Could not open BingeLingo: ' + err.message, 'error');
        } finally {
            sendBingeLingoBtn.textContent = originalLabel;
            renderStateFeedback();
        }
    });

    openLessonBtn.addEventListener('click', () => {
        chrome.tabs.create({ url: 'lesson.html' });
    });
});
