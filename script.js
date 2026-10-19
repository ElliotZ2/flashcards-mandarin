let wordsData;

async function loadWords() {
    const response = await fetch("words.json");
    wordsData = await response.json();

    console.log(wordsData);
}

async function main() {
    await loadWords();
    populateGroups();
    chooseRandomWord();
    displayPrompt();
}

main();

function populateGroups() {
    const groupsContainer = document.getElementById("groups-container");
    for (let i = 0; i < wordsData.groups.length; i++) {
        const group = wordsData.groups[i];
        const label = document.createElement("label");
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.checked = false;
        label.appendChild(checkbox);
        label.appendChild(
            document.createTextNode(group.name)
        );
        groupsContainer.appendChild(label);
    }
}

let randomWord;
let recentlyChosenWords = [];
let promptMode = "mixed";

function chooseRandomWord() {
    const groupsContainer = document.getElementById("groups-container");
    const labels = groupsContainer.querySelectorAll("label");
    const selectedWords = [];

    for (const label of labels) {
        const checkbox = label.querySelector("input");

        if (checkbox.checked) {
            const groupName = label.textContent.trim();
            const group = wordsData.groups.find(group => group.name === groupName);

            for (const word of group.words) {
                const alreadyExists = selectedWords.some(selectedWord => selectedWord.chinese === word.chinese);

                if (!alreadyExists) {
                    selectedWords.push(word);
                }
            }
        }
    }

    if (selectedWords.length === 0) {
        randomWord = null;
        return;
    }

    const recentWordsCapacity = Math.floor(selectedWords.length * 0.2);

    while (recentlyChosenWords.length > recentWordsCapacity) {
        recentlyChosenWords.shift();
    }

    const availableWords = selectedWords.filter(word =>
        !recentlyChosenWords.some(recentWord => recentWord.chinese === word.chinese)
    );

    const randomIndex = Math.floor(Math.random() * availableWords.length);
    randomWord = availableWords[randomIndex];

    recentlyChosenWords.push(randomWord);

    while (recentlyChosenWords.length > recentWordsCapacity) {
        recentlyChosenWords.shift();
    }

    console.log(randomWord);
}

function displayPrompt() {
    const prompt = document.getElementById("prompt");

    if (!randomWord) {
        prompt.textContent = "Select a group";
        return;
    }

    const promptType = promptMode === "mixed"
        ? Math.floor(Math.random() * 2)
        : promptMode === "chinese" ? 0 : 1;

    if (promptType === 0) {
        prompt.textContent = randomWord.chinese;
    } else {
        prompt.innerHTML = `
            <div class="prompt-translation">
                <div>${randomWord.pinyin}</div>
                <div>${randomWord.english}</div>
            </div>
        `;
    }
}

let isRevealed = false;

const revealButton = document.getElementById("reveal-button");
revealButton.addEventListener("click", function () {
    if (!wordsData) {
        return;
    }

    if (!isRevealed && randomWord !== null) {
        //show all info for current word
        const prompt = document.getElementById("prompt");
        prompt.innerHTML = `
            <div>
                <div>${randomWord.chinese}</div>
                <div>${randomWord.pinyin}</div>
                <div>${randomWord.english}</div>
            </div>
        `;
        //change button text to "Next"
        revealButton.textContent = "Next";
        isRevealed = true;
    }
    else {
        //choose new random word
        chooseRandomWord();
        //hide answer again
        displayPrompt();
        //change button text back to "reveal"
        revealButton.textContent = "Reveal";
        clearCanvas();
        isRevealed = false;
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

const toggleGroupsButton = document.getElementById("toggle-groups-button");

toggleGroupsButton.addEventListener("click", function () {
    const checkboxes = document.querySelectorAll("#groups-container input[type='checkbox']");
    const allSelected = Array.from(checkboxes).every(checkbox => checkbox.checked);

    for (const checkbox of checkboxes) {
        checkbox.checked = !allSelected;
    }

    toggleGroupsButton.textContent = allSelected ? "Select All" : "Deselect All";
    updateMobileSelection();
});

const sidebar = document.getElementById("sidebar");
const sidebarToggle = document.getElementById("sidebar-toggle");
let desktopSidebarCollapsed = sidebar.classList.contains("collapsed");

function setSidebarCollapsed(collapsed) {
    sidebar.classList.toggle("collapsed", collapsed);
    sidebarToggle.setAttribute("aria-expanded", String(!collapsed));
    sidebarToggle.setAttribute("aria-label", mobileLayout.matches
        ? (collapsed ? "Show study options" : "Hide study options")
        : (collapsed ? "Expand groups" : "Collapse groups"));
    sidebarToggle.textContent = mobileLayout.matches
        ? (collapsed ? "Study options ▾" : "Study options ▴")
        : (collapsed ? "→" : "←");
}

sidebarToggle.addEventListener("click", () => {
    setSidebarCollapsed(!sidebar.classList.contains("collapsed"));
    if (!mobileLayout.matches) {
        desktopSidebarCollapsed = sidebar.classList.contains("collapsed");
    }
});

function syncSidebarLayout() {
    setSidebarCollapsed(mobileLayout.matches || desktopSidebarCollapsed);
    resizeCanvas();
}

mobileLayout.addEventListener("change", syncSidebarLayout);
syncSidebarLayout();

document.addEventListener("pointerdown", (event) => {
    if (mobileLayout.matches && !sidebar.contains(event.target)) {
        setSidebarCollapsed(true);
    }
});

document.addEventListener("keydown", (event) => {
    if (mobileLayout.matches && event.key === "Escape" && !sidebar.classList.contains("collapsed")) {
        setSidebarCollapsed(true);
        sidebarToggle.focus();
    }
});

function updateMobileSelection() {
    if (!mobileLayout.matches) {
        return;
    }

    chooseRandomWord();
    displayPrompt();
    revealButton.textContent = "Reveal";
    isRevealed = false;
    clearCanvas();
}

document.getElementById("groups-container").addEventListener("change", () => {
    if (mobileLayout.matches) {
        const checkboxes = document.querySelectorAll("#groups-container input");
        toggleGroupsButton.textContent = Array.from(checkboxes).every(checkbox => checkbox.checked)
            ? "Deselect All" : "Select All";
        updateMobileSelection();
    }
});

sidebar.addEventListener("transitionend", resizeCanvas);

document.getElementById("study-mode").addEventListener("change", (event) => {
    if (event.target.name !== "prompt-mode") {
        return;
    }

    promptMode = event.target.value;
    if (wordsData && !randomWord) {
        chooseRandomWord();
    }
    displayPrompt();
    revealButton.textContent = "Reveal";
    isRevealed = false;
    clearCanvas();
});

//TODO: keep track of words that you dont know
//dont allow too many of these unknown words to stack up
