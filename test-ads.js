// test-ads.js
// Zero-dependency unit tests for YouTube ad detection and filtering logic

function isAdActive(mockDocument) {
    try {
        const player = mockDocument.querySelector('.html5-video-player');
        if (player && (player.classList.contains('ad-showing') || player.classList.contains('ad-interrupting'))) {
            return true;
        }
        if (mockDocument.querySelector('.ytp-ad-player-overlay') || 
            mockDocument.querySelector('.ytp-ad-visit-advertiser-button') ||
            mockDocument.querySelector('.ytp-ad-skip-button-container')) {
            return true;
        }
    } catch (e) {
        return false;
    }
    return false;
}

// Mock DOM helper
function createMockDocument({ playerClasses = [], elementsPresent = [] }) {
    return {
        querySelector(selector) {
            if (selector === '.html5-video-player') {
                return {
                    classList: {
                        contains(cls) {
                            return playerClasses.includes(cls);
                        }
                    }
                };
            }
            if (elementsPresent.includes(selector)) {
                return {};
            }
            return null;
        }
    };
}

function runTests() {
    console.log("Running Ad Detection Unit Tests...");
    let passed = 0;
    let failed = 0;

    const testCases = [
        {
            name: "Ordinary Playback (No ads)",
            doc: createMockDocument({ playerClasses: [], elementsPresent: [] }),
            expected: false
        },
        {
            name: "Ad Showing Class (.ad-showing)",
            doc: createMockDocument({ playerClasses: ['ad-showing'], elementsPresent: [] }),
            expected: true
        },
        {
            name: "Ad Interrupting Class (.ad-interrupting)",
            doc: createMockDocument({ playerClasses: ['ad-interrupting'], elementsPresent: [] }),
            expected: true
        },
        {
            name: "Ad Overlay Present (.ytp-ad-player-overlay)",
            doc: createMockDocument({ playerClasses: [], elementsPresent: ['.ytp-ad-player-overlay'] }),
            expected: true
        },
        {
            name: "Skip Button Present (.ytp-ad-skip-button-container)",
            doc: createMockDocument({ playerClasses: [], elementsPresent: ['.ytp-ad-skip-button-container'] }),
            expected: true
        },
        {
            name: "No Player Present (Conservative fallback)",
            doc: { querySelector: () => null },
            expected: false
        }
    ];

    testCases.forEach(tc => {
        const result = isAdActive(tc.doc);
        if (result === tc.expected) {
            console.log(`[PASS] ${tc.name}`);
            passed++;
        } else {
            console.error(`[FAIL] ${tc.name}: expected ${tc.expected}, got ${result}`);
            failed++;
        }
    });

    console.log(`\nTest Summary: ${passed} passed, ${failed} failed.`);
    if (failed > 0) {
        process.exit(1);
    }
}

runTests();
