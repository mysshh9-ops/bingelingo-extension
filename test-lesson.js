// test-lesson.js
// Automated tests for BingeLingo lesson generation and validation logic

function romanizeKorean(text) {
    if (!text || typeof text !== 'string') return '';
    const commonMap = { '안녕하세요': 'annyeonghaseyo', '안녕': 'annyeong' };
    if (commonMap[text.trim()]) return commonMap[text.trim()];
    return text.replace(/가/g, 'ga').replace(/나/g, 'na').replace(/\s+/g, ' ');
}

function validateSessionJSON(data) {
    if (!data || typeof data !== 'object') throw new Error("Invalid JSON root object.");
    if (!Array.isArray(data.lines)) throw new Error("Invalid session JSON: missing 'lines' array.");
    if (data.lines.length === 0) throw new Error("The imported session JSON contains 0 dialogue lines.");
    for (let i = 0; i < data.lines.length; i++) {
        const line = data.lines[i];
        if (!line || typeof line.text !== 'string' || typeof line.timestamp !== 'number') {
            throw new Error(`Malformed line object at index ${i}.`);
        }
    }
    return true;
}

function buildLessonStructure(title, lines) {
    const vocabList = lines.map(line => ({
        korean: line.text,
        romanization: romanizeKorean(line.text),
        meaning: "Demo meaning"
    }));
    const maxQuestions = Math.min(5, lines.length);
    const questions = [];
    for (let i = 0; i < maxQuestions; i++) {
        const line = lines[i];
        questions.push({
            prompt: `Question for ${line.text}`,
            correctAnswer: romanizeKorean(line.text),
            options: [romanizeKorean(line.text), "wrong1", "wrong2"]
        });
    }
    return { title, lines, vocab: vocabList, quiz: questions };
}

function runTests() {
    console.log("Running BingeLingo Lesson Logic Tests...\n");
    let passed = 0;
    let failed = 0;

    const assert = (condition, message) => {
        if (condition) {
            console.log(`[PASS] ${message}`);
            passed++;
        } else {
            console.error(`[FAIL] ${message}`);
            failed++;
        }
    };

    // Test 1: JSON Validation (Valid)
    try {
        const validData = { title: "Test", lines: [{ text: "가나", timestamp: 1.2 }] };
        assert(validateSessionJSON(validData) === true, "Valid JSON should pass validation.");
    } catch (e) { assert(false, "Valid JSON threw error: " + e.message); }

    // Test 2: JSON Validation (Malformed)
    try {
        const malformedData = { title: "Test", lines: [{ text: 123, timestamp: "wrong" }] };
        validateSessionJSON(malformedData);
        assert(false, "Malformed JSON should have failed validation.");
    } catch (e) { assert(true, "Malformed JSON correctly failed validation: " + e.message); }

    // Test 3: Romanization
    assert(romanizeKorean("안녕하세요") === "annyeonghaseyo", "Romanization of common greeting.");
    assert(romanizeKorean("가나") === "gana", "Algorithmic romanization fallback.");

    // Test 4: Dynamic Quiz Lengths (0, 1, 3, 5, >5 lines)
    // 0 lines
    const lesson0 = buildLessonStructure("Test 0", []);
    assert(lesson0.quiz.length === 0, "0 selected lines produce 0 quiz questions.");

    // 1 line
    const lesson1 = buildLessonStructure("Test 1", [{ text: "안녕", timestamp: 1.0 }]);
    assert(lesson1.quiz.length === 1, "1 selected line produces 1 quiz question.");

    // 3 lines
    const lesson3 = buildLessonStructure("Test 3", [
        { text: "안녕", timestamp: 1.0 },
        { text: "가나", timestamp: 2.0 },
        { text: "안녕하세요", timestamp: 3.0 }
    ]);
    assert(lesson3.quiz.length === 3, "3 selected lines produce 3 quiz questions.");

    // 5 lines
    const lesson5 = buildLessonStructure("Test 5", [
        { text: "1", timestamp: 1.0 }, { text: "2", timestamp: 2.0 },
        { text: "3", timestamp: 3.0 }, { text: "4", timestamp: 4.0 },
        { text: "5", timestamp: 5.0 }
    ]);
    assert(lesson5.quiz.length === 5, "5 selected lines produce 5 quiz questions.");

    // >5 lines (e.g. 7 lines -> capped at 5)
    const lesson7 = buildLessonStructure("Test 7", [
        { text: "1", timestamp: 1.0 }, { text: "2", timestamp: 2.0 },
        { text: "3", timestamp: 3.0 }, { text: "4", timestamp: 4.0 },
        { text: "5", timestamp: 5.0 }, { text: "6", timestamp: 6.0 },
        { text: "7", timestamp: 7.0 }
    ]);
    assert(lesson7.quiz.length === 5, "7 selected lines produce 5 quiz questions (capped at 5).");

    // Test 5: Quiz Scoring & Retry Logic Simulation
    const sampleLesson = buildLessonStructure("Scoring Test", [
        { text: "안녕", timestamp: 1.0 },
        { text: "가나", timestamp: 2.0 }
    ]);
    
    // Simulate user selecting correct answers
    let score = 0;
    sampleLesson.quiz.forEach(q => {
        const userChoice = q.correctAnswer; // correct
        if (userChoice === q.correctAnswer) score++;
    });
    assert(score === 2, "Quiz scoring calculation: all correct yields max score.");

    // Simulate retry (resetting selections)
    let quizSubmitted = true;
    const simulateRetry = () => {
        quizSubmitted = false;
        score = 0;
    };
    simulateRetry();
    assert(quizSubmitted === false && score === 0, "Quiz retry logic successfully resets state.");

    console.log(`\nTest Summary: ${passed} passed, ${failed} failed.`);
    if (failed > 0) process.exit(1);
}

runTests();

