# BingeLingo Subtitle Capture Extension (Manifest V3)

This is a companion Chrome Extension explicitly designed for grabbing correctly rendered native YouTube Korean subtitle (CC) captions, cleaning and filtering non-speech artifacts, and seamlessly routing them to your BingeLingo backend for creating personalized lesson plans or exporting offline JSON datasets.

---

## 🛠 Features & Capabilities
* **Live Visual Capture**: Captures visibly rendered `.ytp-caption-segment` Korean subtitles directly from YouTube watch pages.
* **Intelligent Deduplication**: Suppresses consecutive identical subtitle re-renders caused by YouTube DOM updates while preserving legitimate repeated dialogue lines spoken after a configurable time gap (3.0s).
* **Non-Speech Noise Filtering**: Automatically filters standalone bracketed sound effects and ambient labels (such as `[음악]`, `[박수]`, `[웃음]`, `[효과음]`, `♪`, `[Music]`, etc.) while safeguarding dialogue lines with speaker tags or acting cues (e.g. `[철수] 안녕하세요?`, `(웃으며) 밥 먹었어?`).
* **Capture Statistics Tracking**: Real-time tracking and display of raw observations, duplicate frames ignored, non-speech labels ignored, and clean useful lines retained.
* **Resilient State Management**: Preserves captured lines even across pause, fast-forwarding, SPA page shifts, or dropped network connections.
* **Offline Export**: Includes a local **Export Session JSON** button that exports video title, source URL, timestamps span, capture time bounds, quality statistics, and clean Korean dialogue lines without requiring any backend connectivity.
* **Safe Stop & Generate**: Halts caption extraction, updates UI to a visible processing status, validates the backend endpoint, and reports actionable feedback.

---

## 🚀 Configuration (When Ready to Connect to Backend)

Open **`config.js`** in the extension folder and update the fields:

1. **`BINGELINGO_FUNCTION_URL`**: Your active Supabase Edge Function URL (e.g. `https://<YOUR_PROJECT_ID>.supabase.co/functions/v1/process-session`).
2. **`SUPABASE_ANON_KEY`**: Your Supabase Public Anon key (never use the Service Role key).
3. **`BINGELINGO_APP_URL`**: The base URL of your BingeLingo frontend (for opening generated lessons).

> **Note:** If `config.js` is unconfigured, clicking **Stop & Generate Lesson** cleanly preserves your session and reminds you that offline JSON export is available. Your captured dialogue lines are never lost.

---

## 📦 How to Reload and Test in Chrome

1. Open Google Chrome and go to `chrome://extensions/`.
2. Toggle **Developer mode** (top right corner) to **ON**.
3. Locate **BingeLingo Subtitle Capture**.
4. Click the **🔄 (Reload)** icon on the extension card.
5. Open a YouTube video with Korean subtitles (e.g. `https://www.youtube.com/watch?v=...`).
6. Turn on YouTube captions (CC) and ensure the subtitle language is set to **Korean**.
7. Click the BingeLingo extension icon and click **Start Capture**.
8. Play the video and observe:
   - **Korean Lines Extracted**: Displays count of retained clean dialogue lines.
   - **Filtered Stats**: Shows raw observation counts and numbers of filtered duplicate frames and non-speech labels.
9. Click **Stop & Generate Lesson** or **Export Session JSON**:
   - Inspect the downloaded `.json` to verify that `[음악]` and duplicate redraws are absent from the `lines` array while the `stats` metadata retains the debug counts.