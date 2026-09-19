const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
const sourceLanguage = document.querySelector("#sourceLanguage");
const startButton = document.querySelector("#startButton");
const pauseButton = document.querySelector("#pauseButton");
const resumeButton = document.querySelector("#resumeButton");
const stopButton = document.querySelector("#stopButton");
const recordStage = document.querySelector("#recordStage");
const stageTitle = document.querySelector("#stageTitle");
const stageHint = document.querySelector("#stageHint");
const waves = document.querySelector("#waves");
const message = document.querySelector("#message");
const transcriptSection = document.querySelector("#transcriptSection");
const transcriptEditor = document.querySelector("#transcriptEditor");
const editButton = document.querySelector("#editButton");
const copyButton = document.querySelector("#copyButton");
const downloadButton = document.querySelector("#downloadButton");
const targetLanguage = document.querySelector("#targetLanguage");
const translateButton = document.querySelector("#translateButton");
const translationResult = document.querySelector("#translationResult");
const translatedText = document.querySelector("#translatedText");
const permissionNotice = document.querySelector("#permissionNotice");

let recognition;
let finalTranscript = "";
let isPaused = false;
let isEditing = false;
let hasStopped = false;
let recognitionError = false;
let usedCompatibilityRetry = false;
let microphoneReady = false;

function showMessage(text) { message.textContent = text; message.classList.remove("hidden"); }
function hideMessage() { message.classList.add("hidden"); }
function setButtonState(state) {
  startButton.classList.toggle("hidden", state !== "idle" && state !== "stopped");
  pauseButton.classList.toggle("hidden", state !== "recording");
  resumeButton.classList.toggle("hidden", state !== "paused");
  stopButton.classList.toggle("hidden", state !== "recording" && state !== "paused");
}
function updateTranscript() {
  transcriptEditor.value = finalTranscript;
  transcriptSection.classList.remove("hidden");
}
function setupRecognition() {
  if (!SpeechRecognition) {
    showMessage("Speech recognition is not supported in this browser. Try the latest Chrome or Safari.");
    startButton.disabled = true;
    return false;
  }
  recognition = new SpeechRecognition();
  // Short sessions are more reliable than one long-lived session in Chrome.
  recognition.continuous = false;
  recognition.interimResults = true;
  recognition.lang = sourceLanguage.value;
  recognition.onstart = () => {
    recognitionError = false;
    recordStage.classList.add("active");
    waves.classList.remove("hidden");
    stageTitle.textContent = isPaused ? "Listening again..." : "Listening...";
    stageHint.textContent = "Speak clearly — your words will appear below";
  };
  recognition.onresult = event => {
    let interim = "";
    for (let index = event.resultIndex; index < event.results.length; index += 1) {
      const result = event.results[index];
      if (result.isFinal) finalTranscript += `${result[0].transcript.trim()} `;
      else interim += result[0].transcript;
    }
    updateTranscript();
    if (interim) stageHint.textContent = `Hearing: ${interim}`;
  };
  recognition.onerror = event => {
    if (event.error === "aborted") return;
    if (event.error === "network" && !usedCompatibilityRetry) {
      usedCompatibilityRetry = true;
      recognitionError = true;
      recognition.lang = "en-US";
      hideMessage();
      window.setTimeout(() => {
        recognitionError = false;
        try { recognition.start(); } catch (error) { showSpeechServiceMessage(); }
      }, 250);
      return;
    }
    recognitionError = true;
    isPaused = true;
    setButtonState("idle");
    recordStage.classList.remove("active");
    waves.classList.add("hidden");
    stageTitle.textContent = "Ready when you are";
    stageHint.textContent = "Tap the button to try again";
    if (event.error === "not-allowed" || event.error === "service-not-allowed") {
      showMessage("Microphone or speech access was blocked. Allow microphone access, then try again.");
    } else if (event.error === "network") {
      showSpeechServiceMessage();
    } else {
      showMessage(`Microphone error: ${event.error}. Check browser permissions and try again.`);
    }
  };
  recognition.onend = () => {
    if (!isPaused && !hasStopped && !recognitionError && !stopButton.classList.contains("hidden")) {
      window.setTimeout(() => {
        try { recognition.start(); } catch (error) { /* the browser may still be closing the session */ }
      }, 100);
    }
  };
  return true;
}
async function requestMicrophoneAccess() {
  if (microphoneReady) return true;
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    showMessage("This browser does not support microphone access. Open Vaani in Safari or Chrome over HTTPS.");
    return false;
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach(track => track.stop());
    microphoneReady = true;
    permissionNotice.classList.add("hidden");
    return true;
  } catch (error) {
    permissionNotice.classList.remove("hidden");
    showMessage("Microphone access was blocked. Tap Allow in the browser prompt. If you already denied it, enable Microphone for this site in your device settings, then try again.");
    return false;
  }
}

async function startRecording() {
  hideMessage();
  if (!(await requestMicrophoneAccess())) return;
  if (!recognition && !setupRecognition()) return;
  if (hasStopped) {
    finalTranscript = "";
    transcriptEditor.value = "";
    translationResult.classList.add("hidden");
    hasStopped = false;
  }
  isPaused = false;
  hasStopped = false;
  recognitionError = false;
  usedCompatibilityRetry = false;
  recognition.lang = sourceLanguage.value;
  try { recognition.start(); setButtonState("recording"); } catch (error) { showMessage("Unable to start the microphone. Please try again."); }
}
function showSpeechServiceMessage() {
  showMessage("This browser cannot reach its speech service. Try Chrome on localhost with internet access, or type your transcript below.");
  transcriptSection.classList.remove("hidden");
  transcriptEditor.classList.add("editing");
  transcriptEditor.focus();
  editButton.innerHTML = "✓ <span>Save edits</span>";
  isEditing = true;
}
function pauseRecording() {
  isPaused = true;
  recognition.stop();
  setButtonState("paused");
  recordStage.classList.remove("active");
  waves.classList.add("hidden");
  stageTitle.textContent = "Recording paused";
  stageHint.textContent = "Resume whenever you are ready";
}
function stopRecording() {
  isPaused = true;
  hasStopped = true;
  if (recognition) recognition.stop();
  setButtonState("stopped");
  recordStage.classList.remove("active");
  waves.classList.add("hidden");
  stageTitle.textContent = "Recording complete";
  stageHint.textContent = finalTranscript.trim() ? "Your words are ready to edit below" : "No speech was detected — try recording again";
  updateTranscript();
}
function copyText(text, button) {
  if (!text.trim()) { showMessage("There is no text to copy yet."); return; }
  navigator.clipboard.writeText(text).then(() => {
    const original = button.innerHTML; button.textContent = "Copied!";
    setTimeout(() => { button.innerHTML = original; }, 1400);
  }).catch(() => showMessage("Copy was blocked by the browser. Please select and copy the text manually."));
}
function downloadText(text, filename) {
  if (!text.trim()) { showMessage("There is no text to download yet."); return; }
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = `${filename}.txt`;
  document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(link.href);
}

startButton.addEventListener("click", startRecording);
resumeButton.addEventListener("click", startRecording);
pauseButton.addEventListener("click", pauseRecording);
stopButton.addEventListener("click", stopRecording);
sourceLanguage.addEventListener("change", () => { if (recognition && !stopButton.classList.contains("hidden")) recognition.lang = sourceLanguage.value; });
editButton.addEventListener("click", () => {
  isEditing = !isEditing; transcriptEditor.classList.toggle("editing", isEditing);
  editButton.innerHTML = isEditing ? "✓ <span>Save edits</span>" : "✎ <span>Edit</span>";
  if (!isEditing) { finalTranscript = transcriptEditor.value; updateTranscript(); }
});
copyButton.addEventListener("click", () => copyText(transcriptEditor.value, copyButton));
downloadButton.addEventListener("click", () => downloadText(transcriptEditor.value, "vaani-transcript"));
document.querySelector("#copyTranslation").addEventListener("click", event => copyText(translatedText.textContent, event.currentTarget));
document.querySelector("#downloadTranslation").addEventListener("click", () => downloadText(translatedText.textContent, "vaani-translation"));
translateButton.addEventListener("click", async () => {
  const text = transcriptEditor.value.trim();
  if (!text) { showMessage("Record or write some text before translating."); return; }
  translateButton.disabled = true; translateButton.textContent = "Translating...";
  try {
    const response = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${sourceLanguage.value.slice(0, 2)}|${targetLanguage.value}`);
    if (!response.ok) throw new Error("translation request failed");
    const data = await response.json();
    if (!data.responseData || !data.responseData.translatedText) throw new Error("empty translation");
    translatedText.textContent = data.responseData.translatedText;
    translationResult.classList.remove("hidden");
  } catch (error) {
    showMessage("Translation is temporarily unavailable. Check your connection and try again.");
  } finally { translateButton.disabled = false; translateButton.textContent = "Translate ✦"; }
});
document.querySelector("#permissionButton").addEventListener("click", () => { void requestMicrophoneAccess(); });
if (!SpeechRecognition) showMessage("Speech recognition is not supported in this browser. Try Chrome or Safari.");
