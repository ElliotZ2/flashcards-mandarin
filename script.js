const SETTINGS_KEY = "mandarin-flashcards.settings.v1";
const FOCUS_WEIGHT = 3;
const savedSettings = readSettings();

let wordsData = null;
let randomWord = null;
let recentlyChosenWords = [];
let isRevealed = false;
let promptMode = ["chinese", "translation", "mixed"].includes(savedSettings.promptMode)
    ? savedSettings.promptMode : "mixed";
let desktopSidebarCollapsed = savedSettings.sidebarCollapsed === true;
const selectedGroupNames = new Set(stringArray(savedSettings.selectedGroups));
const focusWords = new Set(stringArray(savedSettings.focusWords));
const wordCatalog = new Map();
let focusView = "saved";

const revealButton = document.getElementById("reveal-button");
const focusButton = document.getElementById("focus-button");
const toggleGroupsButton = document.getElementById("toggle-groups-button");
const sidebar = document.getElementById("sidebar");
const sidebarToggle = document.getElementById("sidebar-toggle");
const focusDialog = document.getElementById("focus-dialog");
const focusSearch = document.getElementById("focus-search");
const focusWordList = document.getElementById("focus-word-list");
const viewFocusButton = document.getElementById("view-focus-button");
const addFocusButton = document.getElementById("add-focus-button");

function stringArray(value) {
    return Array.isArray(value) ? value.filter(item => typeof item === "string") : [];
}

function readSettings() {
    try {
        const value = JSON.parse(localStorage.getItem(SETTINGS_KEY));
        return value && typeof value === "object" && !Array.isArray(value) ? value : {};
    } catch {
        return {};
    }
}

function saveSettings() {
    const status = document.getElementById("settings-status");
    const dialogStatus = document.getElementById("focus-save-status");
    try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify({
            selectedGroups: [...selectedGroupNames],
            focusWords: [...focusWords],
            promptMode,
            sidebarCollapsed: desktopSidebarCollapsed
        }));
        status.hidden = true;
        dialogStatus.textContent = "Changes save automatically.";
    } catch {
        status.textContent = "This browser couldn't save your settings. Changes will last for this visit.";
        status.hidden = false;
        dialogStatus.textContent = "Changes last for this visit; browser storage is unavailable.";
    }
}

async function main() {
    try {
        const response = await fetch("words.json");
        if (!response.ok) throw new Error("Unable to load words");
        wordsData = await response.json();
        for (const group of wordsData.groups) {
            for (const word of group.words) {
                if (!wordCatalog.has(word.chinese)) {
                    wordCatalog.set(word.chinese, { word, groupNames: [] });
                }
                wordCatalog.get(word.chinese).groupNames.push(group.name);
            }
        }
        // Chinese text identifies the same word across different groups.
        for (const key of focusWords) {
            if (!wordCatalog.has(key)) focusWords.delete(key);
        }
        populateGroups();
        showNextWord();
    } catch {
        wordsData = null;
        document.getElementById("prompt").textContent = "Couldn't load words. Refresh to try again.";
        updateFocusControls();
    }
}

function populateGroups() {
    const container = document.getElementById("groups-container");
    for (const group of wordsData.groups) {
        const label = document.createElement("label");
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.value = group.name;
        checkbox.checked = selectedGroupNames.has(group.name);
        label.append(checkbox, document.createTextNode(group.name));
        container.appendChild(label);
    }
    updateGroupToggle();
}

function getSelectedWords() {
    const selected = new Map();
    for (const group of wordsData?.groups || []) {
        if (!selectedGroupNames.has(group.name)) continue;
        for (const word of group.words) {
            if (!selected.has(word.chinese)) selected.set(word.chinese, word);
        }
    }
    return [...selected.values()];
}

function chooseRandomWord() {
    const selectedWords = getSelectedWords();
    if (!selectedWords.length) {
        randomWord = null;
        recentlyChosenWords = [];
        return;
    }
    const selectedKeys = new Set(selectedWords.map(word => word.chinese));
    // Keep the 20% cooldown, with no immediate repeats when at least two words exist.
    const capacity = Math.min(selectedWords.length - 1,
        Math.max(1, Math.floor(selectedWords.length * 0.2)));
    recentlyChosenWords = recentlyChosenWords.filter(key => selectedKeys.has(key));
    while (recentlyChosenWords.length > capacity) recentlyChosenWords.shift();
    const recentKeys = new Set(recentlyChosenWords);
    const available = selectedWords.filter(word => !recentKeys.has(word.chinese));
    const weightOf = word => focusWords.has(word.chinese) ? FOCUS_WEIGHT : 1;
    let ticket = Math.random() * available.reduce((sum, word) => sum + weightOf(word), 0);
    randomWord = available[available.length - 1];
    for (const word of available) {
        ticket -= weightOf(word);
        if (ticket < 0) {
            randomWord = word;
            break;
        }
    }
    recentlyChosenWords.push(randomWord.chinese);
    while (recentlyChosenWords.length > capacity) recentlyChosenWords.shift();
}

function renderPromptLines(lines, className = "") {
    const container = document.createElement("div");
    if (className) container.className = className;
    for (const line of lines) {
        const div = document.createElement("div");
        div.textContent = line;
        container.appendChild(div);
    }
    document.getElementById("prompt").replaceChildren(container);
}

function displayPrompt() {
    const prompt = document.getElementById("prompt");
    if (!randomWord) {
        prompt.textContent = "Select a group";
        return;
    }
    const showChinese = promptMode === "chinese" || (promptMode === "mixed" && Math.random() < 0.5);
    if (showChinese) prompt.textContent = randomWord.chinese;
    else renderPromptLines([randomWord.pinyin, randomWord.english], "prompt-translation");
}

function showNextWord() {
    chooseRandomWord();
    resetPrompt();
}

function resetPrompt() {
    isRevealed = false;
    revealButton.textContent = "Reveal";
    displayPrompt();
    updateFocusControls();
    clearCanvas();
}

function updateFocusControls() {
    const focused = !!randomWord && focusWords.has(randomWord.chinese);
    focusButton.textContent = focused ? "Unfocus" : "Focus";
    focusButton.setAttribute("aria-pressed", String(focused));
    focusButton.title = focused ? "Remove this word from extra practice" : "See this word more often";
    focusButton.disabled = !randomWord;
    revealButton.disabled = !randomWord;
    document.getElementById("sound-button").disabled = !randomWord;
    document.getElementById("focus-count").textContent = focusWords.size;
    viewFocusButton.disabled = !wordsData;
    addFocusButton.disabled = !wordsData;
}

function setWordFocused(key, focused) {
    if (!wordCatalog.has(key)) return;
    if (focused) focusWords.add(key);
    else focusWords.delete(key);
    updateFocusControls();
    saveSettings();
    if (focusDialog.open) renderFocusList();
}

revealButton.addEventListener("click", () => {
    if (!randomWord) return;
    if (isRevealed) showNextWord();
    else {
        renderPromptLines([randomWord.chinese, randomWord.pinyin, randomWord.english]);
        revealButton.textContent = "Next";
        isRevealed = true;
    }
});
focusButton.addEventListener("click", () => {
    if (randomWord) setWordFocused(randomWord.chinese, !focusWords.has(randomWord.chinese));
});

function normalizeSearch(value) {
    return value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function renderFocusList() {
    const previousInputs = [...focusWordList.querySelectorAll("input")];
    const focusedInput = previousInputs.includes(document.activeElement) ? document.activeElement : null;
    const previousIndex = previousInputs.indexOf(focusedInput);
    const previousKey = focusedInput?.dataset.focusWord;
    const scrollTop = focusWordList.scrollTop;
    const selectedWords = getSelectedWords();
    const selectedKeys = new Set(selectedWords.map(word => word.chinese));
    const candidates = focusView === "selected" ? selectedWords
        : [...wordCatalog.values()].filter(entry => focusWords.has(entry.word.chinese)).map(entry => entry.word);
    const query = normalizeSearch(focusSearch.value.trim());
    const matches = candidates.filter(word => normalizeSearch(
        [word.chinese, word.pinyin, word.english, ...wordCatalog.get(word.chinese).groupNames].join(" ")
    ).includes(query));
    const fragment = document.createDocumentFragment();

    for (const word of matches) {
        const entry = wordCatalog.get(word.chinese);
        const row = document.createElement("label");
        row.className = "focus-word-row";
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.dataset.focusWord = word.chinese;
        checkbox.checked = focusWords.has(word.chinese);
        const details = document.createElement("span");
        details.className = "focus-word-details";
        const title = document.createElement("span");
        title.className = "focus-word-title";
        const chinese = document.createElement("strong");
        chinese.lang = "zh-CN";
        chinese.textContent = word.chinese;
        const pinyin = document.createElement("span");
        pinyin.textContent = word.pinyin;
        title.append(chinese, pinyin);
        const english = document.createElement("span");
        english.className = "focus-word-english";
        english.textContent = word.english;
        const groups = document.createElement("span");
        groups.className = "focus-word-groups";
        groups.textContent = entry.groupNames.join(" · ")
            + (selectedKeys.has(word.chinese) ? "" : " · Outside selected groups");
        details.append(title, english, groups);
        row.append(checkbox, details);
        fragment.appendChild(row);
    }

    if (!matches.length) {
        const empty = document.createElement("p");
        empty.className = "focus-empty";
        empty.textContent = query ? "No words match your search."
            : focusView === "selected" ? "Select groups in the sidebar to add their words here."
            : "Your focus list is empty. Use Focus on a card, or add words from selected groups.";
        fragment.appendChild(empty);
    }
    focusWordList.replaceChildren(fragment);
    document.getElementById("focus-list-summary").textContent =
        focusWords.size + " focused · " + [...focusWords].filter(key => selectedKeys.has(key)).length
        + " in selected groups · " + matches.length + " shown";
    document.getElementById("focus-view-saved").setAttribute("aria-pressed", String(focusView === "saved"));
    document.getElementById("focus-view-selected").setAttribute("aria-pressed", String(focusView === "selected"));

    // Preserve keyboard focus and scrolling when checking a word or removing a row.
    if (focusedInput) {
        const inputs = [...focusWordList.querySelectorAll("input")];
        const nextInput = inputs.find(input => input.dataset.focusWord === previousKey)
            || inputs[Math.min(previousIndex, inputs.length - 1)];
        (nextInput || focusSearch).focus({ preventScroll: true });
    }
    focusWordList.scrollTop = scrollTop;
}

function openFocusDialog(view) {
    if (!wordsData) return;
    focusView = view;
    focusSearch.value = "";
    renderFocusList();
    focusWordList.scrollTop = 0;
    focusDialog.showModal();
    focusSearch.focus();
}
viewFocusButton.addEventListener("click", () => openFocusDialog("saved"));
addFocusButton.addEventListener("click", () => openFocusDialog("selected"));
document.getElementById("focus-view-saved").addEventListener("click", () => {
    focusView = "saved";
    renderFocusList();
    focusWordList.scrollTop = 0;
});
document.getElementById("focus-view-selected").addEventListener("click", () => {
    focusView = "selected";
    renderFocusList();
    focusWordList.scrollTop = 0;
});
focusSearch.addEventListener("input", () => {
    renderFocusList();
    focusWordList.scrollTop = 0;
});
focusWordList.addEventListener("change", event => {
    if (event.target.matches("input[data-focus-word]")) {
        setWordFocused(event.target.dataset.focusWord, event.target.checked);
    }
});
for (const id of ["close-focus-dialog", "focus-dialog-done"]) {
    document.getElementById(id).addEventListener("click", () => focusDialog.close());
}
focusDialog.addEventListener("click", event => {
    if (event.target !== focusDialog) return;
    const rect = focusDialog.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) {
        focusDialog.close();
    }
});

//canvas
const canvas = document.getElementById("drawing-area");
const ctx = canvas.getContext("2d");
const mobileLayout = window.matchMedia("(max-width: 768px), (max-width: 1024px) and (orientation: landscape) and (hover: none) and (pointer: coarse)");

let isDrawing = false;
let drawingPointerId = null;
let canvasWidth = 0;
let canvasHeight = 0;

function resizeCanvas() {
    const rect = canvas.getBoundingClientRect();
    const ratio = mobileLayout.matches ? window.devicePixelRatio || 1 : 1;
    const width = mobileLayout.matches ? canvas.clientWidth : rect.width;
    const height = mobileLayout.matches ? canvas.clientHeight : rect.height;
    const pixelWidth = mobileLayout.matches ? Math.round(width * ratio) : Math.floor(width);
    const pixelHeight = mobileLayout.matches ? Math.round(height * ratio) : Math.floor(height);

    if (!width || !height || (canvas.width === pixelWidth && canvas.height === pixelHeight)) {
        return;
    }

    let previous;
    if (mobileLayout.matches && canvasWidth && canvasHeight) {
        previous = document.createElement("canvas");
        previous.width = canvas.width;
        previous.height = canvas.height;
        previous.getContext("2d").drawImage(canvas, 0, 0);
    }

    canvas.width = pixelWidth;
    canvas.height = pixelHeight;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);

    if (previous) {
        const scale = Math.min(width / canvasWidth, height / canvasHeight);
        const drawingWidth = canvasWidth * scale;
        const drawingHeight = canvasHeight * scale;
        ctx.drawImage(previous, (width - drawingWidth) / 2, (height - drawingHeight) / 2, drawingWidth, drawingHeight);
    }

    canvasWidth = width;
    canvasHeight = height;
    isDrawing = false;
    drawingPointerId = null;

    ctx.lineWidth = 4;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "white";
    ctx.fillStyle = "white";
}

function getPointerPosition(event) {
    const rect = canvas.getBoundingClientRect();

    return {
        x: event.clientX - rect.left - (mobileLayout.matches ? canvas.clientLeft : 0),
        y: event.clientY - rect.top - (mobileLayout.matches ? canvas.clientTop : 0)
    };
}

canvas.addEventListener("pointerdown", (event) => {
    if (drawingPointerId !== null || event.button !== 0) {
        return;
    }

    event.preventDefault();
    isDrawing = true;
    drawingPointerId = event.pointerId;

    // Keep receiving pointer events even if mouse leaves canvas
    canvas.setPointerCapture(event.pointerId);

    const position = getPointerPosition(event);

    if (mobileLayout.matches) {
        ctx.beginPath();
        ctx.arc(position.x, position.y, ctx.lineWidth / 2, 0, Math.PI * 2);
        ctx.fill();
    }

    ctx.beginPath();
    ctx.moveTo(position.x, position.y);
});

canvas.addEventListener("pointermove", (event) => {
    if (!isDrawing || event.pointerId !== drawingPointerId) {
        return;
    }

    const position = getPointerPosition(event);

    ctx.lineTo(position.x, position.y);
    ctx.stroke();
});

canvas.addEventListener("pointerup", (event) => {
    if (event.pointerId !== drawingPointerId) {
        return;
    }

    isDrawing = false;
    drawingPointerId = null;

    if (canvas.hasPointerCapture(event.pointerId)) {
        canvas.releasePointerCapture(event.pointerId);
    }
});

canvas.addEventListener("pointercancel", (event) => {
    if (event.pointerId !== drawingPointerId) {
        return;
    }

    isDrawing = false;
    drawingPointerId = null;
});

resizeCanvas();

function clearCanvas() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
}

const clearButton = document.getElementById("clear-button");
clearButton.addEventListener("click", clearCanvas);

window.addEventListener("resize", resizeCanvas);
new ResizeObserver(resizeCanvas).observe(canvas);

let chineseVoice;

function loadVoices() {
    if (!window.speechSynthesis) {
        return;
    }

    const voices = window.speechSynthesis.getVoices();

    chineseVoice = voices.find(voice =>
        voice.lang === "zh-CN"
    );
}

window.speechSynthesis?.addEventListener("voiceschanged", loadVoices);

loadVoices();

const soundButton = document.getElementById("sound-button");

soundButton.addEventListener("click", function () {
    if (!randomWord || !window.speechSynthesis || !window.SpeechSynthesisUtterance) {
        return;
    }

    const speech = new SpeechSynthesisUtterance(randomWord.chinese);

    speech.lang = "zh-CN";

    if (chineseVoice) {
        speech.voice = chineseVoice;
    }

    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(speech);
});

function updateGroupToggle() {
    const checkboxes = [...document.querySelectorAll("#groups-container input")];
    toggleGroupsButton.textContent = checkboxes.length && checkboxes.every(checkbox => checkbox.checked)
        ? "Deselect All" : "Select All";
}
function updateGroupSelection() {
    selectedGroupNames.clear();
    for (const checkbox of document.querySelectorAll("#groups-container input:checked")) {
        selectedGroupNames.add(checkbox.value);
    }
    updateGroupToggle();
    saveSettings();
    recentlyChosenWords = [];
    showNextWord();
}
toggleGroupsButton.addEventListener("click", () => {
    const checkboxes = [...document.querySelectorAll("#groups-container input")];
    const allSelected = checkboxes.every(checkbox => checkbox.checked);
    for (const checkbox of checkboxes) checkbox.checked = !allSelected;
    updateGroupSelection();
});
document.getElementById("groups-container").addEventListener("change", updateGroupSelection);

function setSidebarCollapsed(collapsed) {
    sidebar.classList.toggle("collapsed", collapsed);
    sidebarToggle.setAttribute("aria-expanded", String(!collapsed));
    sidebarToggle.setAttribute("aria-label", mobileLayout.matches
        ? (collapsed ? "Show study options" : "Hide study options")
        : (collapsed ? "Expand study options" : "Collapse study options"));
    sidebarToggle.textContent = mobileLayout.matches
        ? (collapsed ? "Study options ▾" : "Study options ▴")
        : (collapsed ? "→" : "←");
}
sidebarToggle.addEventListener("click", () => {
    setSidebarCollapsed(!sidebar.classList.contains("collapsed"));
    if (!mobileLayout.matches) {
        desktopSidebarCollapsed = sidebar.classList.contains("collapsed");
        saveSettings();
    }
});
function syncSidebarLayout() {
    setSidebarCollapsed(mobileLayout.matches || desktopSidebarCollapsed);
    resizeCanvas();
}
mobileLayout.addEventListener("change", syncSidebarLayout);
syncSidebarLayout();
document.addEventListener("pointerdown", event => {
    if (mobileLayout.matches && !focusDialog.open && !sidebar.contains(event.target)) {
        setSidebarCollapsed(true);
    }
});
document.addEventListener("keydown", event => {
    if (mobileLayout.matches && !focusDialog.open && event.key === "Escape" && !sidebar.classList.contains("collapsed")) {
        setSidebarCollapsed(true);
        sidebarToggle.focus();
    }
});
sidebar.addEventListener("transitionend", resizeCanvas);

for (const radio of document.querySelectorAll("input[name='prompt-mode']")) {
    radio.checked = radio.value === promptMode;
}
document.getElementById("study-mode").addEventListener("change", event => {
    if (event.target.name !== "prompt-mode") return;
    promptMode = event.target.value;
    saveSettings();
    if (wordsData && !randomWord) chooseRandomWord();
    resetPrompt();
});
updateFocusControls();
main();

