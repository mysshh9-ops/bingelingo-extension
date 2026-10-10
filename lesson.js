// lesson.js - Part 1: State, Romanizer, Status helper, and File Validation
let importedSession = null;
let selectedLineIndices = new Set();
let currentLessonData = null;

function romanizeKorean(text) {
    if (!text || typeof text !== 'string') return '';
    const commonMap = {
        '안녕하세요': 'annyeonghaseyo',
        '안녕': 'annyeong',
        '감사합니다': 'gamsahamnida',
        '고맙습니다': 'gomapseumnida',
        '네': 'ne',
        '아니요': 'aniyo',
        '뭐': 'mwo',
        '왜': 'wae',
        '진짜': 'jinjja',
        '정말': 'jeongmal',
        '알았어': 'arasseo',
        '알겠습니다': 'algetseumnida'
    };

    if (commonMap[text.trim()]) {
        return commonMap[text.trim()];
    }

    return text
        .replace(/가/g, 'ga').replace(/나/g, 'na').replace(/다/g, 'da').replace(/라/g, 'ra').replace(/마/g, 'ma')
        .replace(/바/g, 'ba').replace(/사/g, 'sa').replace(/아/g, 'a').replace(/자/g, 'ja').replace(/차/g, 'cha')
        .replace(/카/g, 'ka').replace(/타/g, 'ta').replace(/파/g, 'pa').replace(/하/g, 'ha')
        .replace(/고/g, 'go').replace(/노/g, 'no').replace(/도/g, 'do').replace(/로/g, 'ro').replace(/모/g, 'mo')
        .replace(/보/g, 'bo').replace(/소/g, 'so').replace(/오/g, 'o').replace(/조/g, 'jo').replace(/초/g, 'cho')
        .replace(/구/g, 'gu').replace(/누/g, 'nu').replace(/두/g, 'du').replace(/루/g, 'ru').replace(/무/g, 'mu')
        .replace(/부/g, 'bu').replace(/수/g, 'su').replace(/우/g, 'u').replace(/주/g, 'ju').replace(/추/g, 'chu')
        .replace(/기/g, 'gi').replace(/니/g, 'ni').replace(/디/g, 'di').replace(/리/g, 'ri').replace(/미/g, 'mi')
        .replace(/비/g, 'bi').replace(/시/g, 'si').replace(/이/g, 'i').replace(/지/g, 'ji').replace(/치/g, 'chi')
        .replace(/\s+/g, ' ');
}

function showMessage(text, type = 'success') {
    const box = document.getElementById('status-message');
    box.textContent = text;
    box.className = 'message ' + type;
    box.classList.remove('hidden');
    setTimeout(() => {
        box.classList.add('hidden');
    }, 6000);
}

document.getElementById('json-file-input').addEventListener('change', (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const data = JSON.parse(e.target.result);
            
            if (!data || typeof data !== 'object') {
                throw new Error("Invalid JSON root object.");
            }
            if (!Array.isArray(data.lines)) {
                throw new Error("Invalid session JSON: missing 'lines' array.");
            }
            if (data.lines.length === 0) {
                throw new Error("The imported session JSON contains 0 dialogue lines.");
            }

            for (let i = 0; i < data.lines.length; i++) {
                const line = data.lines[i];
                if (!line || typeof line.text !== 'string' || typeof line.timestamp !== 'number') {
                    throw new Error(`Malformed line object at index ${i}. Each line must have 'text' and 'timestamp'.`);
                }
            }

            importedSession = data;
            selectedLineIndices.clear();
            data.lines.forEach((_, idx) => selectedLineIndices.add(idx));

            renderSelectionCard();
            showMessage(`Successfully imported session: "${data.title || 'Untitled'}" (${data.lines.length} lines).`, 'success');
        } catch (err) {
            console.error("[BingeLingo Lesson Parser Error]:", err);
            showMessage("Failed to parse JSON file: " + err.message, 'error');
            importedSession = null;
            document.getElementById('selection-card').classList.add('hidden');
            document.getElementById('lesson-card').classList.add('hidden');
        }
    };
    reader.readAsText(file);
});

function renderSelectionCard() {
    if (!importedSession) return;

    const metaEl = document.getElementById('video-meta');
    metaEl.textContent = `Video: ${importedSession.title || 'Unknown'} (${importedSession.lines.length} total captured lines)`;

    const listEl = document.getElementById('lines-list');
    listEl.innerHTML = '';

    importedSession.lines.forEach((line, idx) => {
        const item = document.createElement('div');
        item.className = 'line-item';

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = selectedLineIndices.has(idx);
        checkbox.dataset.index = idx;
        checkbox.addEventListener('change', (e) => {
            const i = Number(e.target.dataset.index);
            if (e.target.checked) {
                selectedLineIndices.add(i);
            } else {
                selectedLineIndices.delete(i);
            }
        });

        const textSpan = document.createElement('span');
        textSpan.style.flex = '1';
        textSpan.textContent = `[${line.timestamp.toFixed(1)}s] ${line.text}`;

        item.appendChild(checkbox);
        item.appendChild(textSpan);
        listEl.appendChild(item);
    });

    document.getElementById('selection-card').classList.remove('hidden');
    document.getElementById('lesson-card').classList.add('hidden');
}

document.getElementById('select-all-btn').addEventListener('click', () => {
    if (!importedSession) return;
    importedSession.lines.forEach((_, idx) => selectedLineIndices.add(idx));
    renderSelectionCard();
});

document.getElementById('deselect-all-btn').addEventListener('click', () => {
    selectedLineIndices.clear();
    renderSelectionCard();
});

document.getElementById('generate-lesson-btn').addEventListener('click', () => {
    if (!importedSession || selectedLineIndices.size === 0) {
        showMessage("Please select at least one dialogue line to generate a lesson.", "error");
        return;
    }

    const selectedLines = Array.from(selectedLineIndices)
        .sort((a, b) => a - b)
        .map(idx => importedSession.lines[idx]);

    currentLessonData = buildLessonStructure(importedSession.title, selectedLines);
    renderLesson(currentLessonData);
    document.getElementById('lesson-card').scrollIntoView({ behavior: 'smooth' });
});

function buildLessonStructure(title, lines) {
    const vocabList = lines.map(line => {
        const text = line.text.trim();
        return {
            korean: text,
            romanization: romanizeKorean(text),
            meaning: `[Offline Demo Translation] Contextual meaning for "${text}" based on video subtitle at ${line.timestamp}s.`
        };
    });

    const contextualNotes = `This micro-lesson was generated offline from "${title || 'YouTube Video'}". It contains ${lines.length} selected Korean dialogue lines. Note: Translations and breakdowns are provided in offline fallback/demo mode without connecting to a live neural translation model.`;

    const questions = [];
    const maxQuestions = Math.min(5, lines.length);
    for (let i = 0; i < maxQuestions; i++) {
        const targetLine = lines[i];
        const correctRomanization = romanizeKorean(targetLine.text);
        
        const wrongOptions = [
            romanizeKorean("안녕하세요"),
            romanizeKorean("정말 감사합니다"),
            romanizeKorean("잠깐만요"),
            romanizeKorean("어떻게 지내세요")
        ].filter(r => r !== correctRomanization);

        while (wrongOptions.length < 3) {
            wrongOptions.push("fallback_" + Math.random().toString(36).substring(7));
        }

        const options = [correctRomanization, ...wrongOptions.slice(0, 3)];
        options.sort(() => Math.random() - 0.5);

        questions.push({
            prompt: `What is the correct romanization or pronunciation for the line: "${targetLine.text}"?`,
            options: options,
            correctAnswer: correctRomanization,
            explanation: `The Korean phrase "${targetLine.text}" romanizes to "${correctRomanization}".`
        });
    }

    return {
        title: title || "Korean YouTube Micro-Lesson",
        lines: lines,
        vocab: vocabList,
        notes: contextualNotes,
        quiz: questions
    };
}

function renderLesson(lesson) {
    document.getElementById('lesson-title').textContent = lesson.title;

    const linesDisplay = document.getElementById('lesson-lines-display');
    linesDisplay.innerHTML = lesson.lines.map(l => `<div>• <strong>[${l.timestamp.toFixed(1)}s]</strong> ${l.text}</div>`).join('');

    const vocabTbody = document.getElementById('vocab-tbody');
    vocabTbody.innerHTML = lesson.vocab.map(v => `
        <tr>
            <td><strong>${v.korean}</strong></td>
            <td><em>${v.romanization}</em></td>
            <td>${v.meaning}</td>
        </tr>
    `).join('');

    document.getElementById('contextual-notes').textContent = lesson.notes;

    const quizContainer = document.getElementById('quiz-container');
    quizContainer.innerHTML = '';

    lesson.quiz.forEach((q, qIdx) => {
        const qDiv = document.createElement('div');
        qDiv.className = 'quiz-question';
        qDiv.innerHTML = `
            <p style="font-weight: 600; margin-bottom: 8px;">Q${qIdx + 1}. ${q.prompt}</p>
            <div class="quiz-options" data-question-index="${qIdx}">
                ${q.options.map((opt) => `
                    <label>
                        <input type="radio" name="question-${qIdx}" value="${escapeHtml(opt)}">
                        ${escapeHtml(opt)}
                    </label>
                `).join('')}
            </div>
            <div id="explanation-${qIdx}" class="hidden" style="margin-top: 6px; font-size: 12px; color: #475569; background: #f1f5f9; padding: 6px 10px; border-radius: 4px;"></div>
        `;
        quizContainer.appendChild(qDiv);
    });

    document.getElementById('quiz-results').classList.add('hidden');
    document.getElementById('lesson-card').classList.remove('hidden');
}

function escapeHtml(str) {
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

document.getElementById('submit-quiz-btn').addEventListener('click', () => {
    if (!currentLessonData || !currentLessonData.quiz) return;

    let score = 0;
    const total = currentLessonData.quiz.length;

    currentLessonData.quiz.forEach((q, qIdx) => {
        const selectedRadio = document.querySelector(`input[name="question-${qIdx}"]:checked`);
        const expDiv = document.getElementById(`explanation-${qIdx}`);
        
        if (selectedRadio && selectedRadio.value === q.correctAnswer) {
            score++;
            expDiv.textContent = "✅ Correct! " + q.explanation;
            expDiv.style.color = "#166534";
            expDiv.style.background = "#f0fdf4";
        } else {
            const userChoice = selectedRadio ? selectedRadio.value : "None";
            expDiv.textContent = `❌ Incorrect (You chose: "${userChoice}"). Correct answer: "${q.correctAnswer}". ${q.explanation}`;
            expDiv.style.color = "#991b1b";
            expDiv.style.background = "#fef2f2";
        }
        expDiv.classList.remove('hidden');
    });

    const feedbackEl = document.getElementById('quiz-feedback');
    feedbackEl.textContent = `You scored ${score} out of ${total} (${Math.round((score/total)*100)}%).`;
    document.getElementById('quiz-results').classList.remove('hidden');
    document.getElementById('quiz-results').scrollIntoView({ behavior: 'smooth' });
});

document.getElementById('retry-quiz-btn').addEventListener('click', () => {
    const radios = document.querySelectorAll('input[type="radio"]');
    radios.forEach(r => r.checked = false);

    currentLessonData.quiz.forEach((_, qIdx) => {
        const expDiv = document.getElementById(`explanation-${qIdx}`);
        if (expDiv) expDiv.classList.add('hidden');
    });

    document.getElementById('quiz-results').classList.add('hidden');
});


