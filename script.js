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
const apiKeyInput = document.querySelector("#apiKeyInput");
const recordLanguage = document.querySelector("#recordLanguage");
const DEFAULT_API_KEY = "sk_l44nuzku_a6p1dXBLKNBF84TS5Hh7fNLP";

let mediaRecorder = null;
let mediaStream = null;
let audioChunks = [];
let finalTranscript = "";
let isPaused = false;
let isEditing = false;
let hasStopped = false;
let microphoneReady = false;

function showMessage(text) { message.textContent = text; message.classList.remove("hidden"); }
function hideMessage() { message.classList.add("hidden"); }
function getApiKey() {
  const configuredKey = (apiKeyInput && apiKeyInput.value ? apiKeyInput.value : DEFAULT_API_KEY).trim();
  return configuredKey || DEFAULT_API_KEY;
}
function getLanguageCode() { return (recordLanguage && recordLanguage.value ? recordLanguage.value : "unknown").trim(); }
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
function getSupportedMimeType() {
  if (typeof MediaRecorder === "undefined") return null;
  const types = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/ogg;codecs=opus"
  ];
  return types.find(type => MediaRecorder.isTypeSupported(type)) || null;
}

async function requestMicrophoneAccess() {
  if (microphoneReady) return true;
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    showMessage("This browser does not support microphone access. Use Safari or Chrome on a mobile device.");
    return false;
  }
  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    microphoneReady = true;
    permissionNotice.classList.add("hidden");
    return true;
  } catch (error) {
    permissionNotice.classList.remove("hidden");
    showMessage("Microphone access was blocked. Tap Allow in the browser prompt or enable microphone access in your device settings, then try again.");
    return false;
  }
}

function audioBufferToWav(audioBuffer) {
  const numChannels = audioBuffer.numberOfChannels;
  const sampleRate = audioBuffer.sampleRate;
  const format = 1;
  const bitDepth = 16;
  const bytesPerSample = bitDepth / 8;
  const blockAlign = numChannels * bytesPerSample;
  const dataLength = audioBuffer.length * blockAlign;
  const buffer = new ArrayBuffer(44 + dataLength);
  const view = new DataView(buffer);

  function writeString(offset, string) {
    for (let i = 0; i < string.length; i += 1) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  }

  writeString(0, "RIFF");
  view.setUint32(4, 36 + dataLength, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, format, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitDepth, true);
  writeString(36, "data");
  view.setUint32(40, dataLength, true);

  const channelData = [];
  for (let ch = 0; ch < numChannels; ch += 1) {
    channelData.push(audioBuffer.getChannelData(ch));
  }

  let offset = 44;
  for (let i = 0; i < audioBuffer.length; i += 1) {
    for (let ch = 0; ch < numChannels; ch += 1) {
      const sample = Math.max(-1, Math.min(1, channelData[ch][i]));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      offset += 2;
    }
  }

  return new Blob([buffer], { type: "audio/wav" });
}

async function blobToWav(blob) {
  if (blob.type === "audio/wav") return blob;
  const arrayBuffer = await blob.arrayBuffer();
  const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextCtor) throw new Error("AudioContext not supported in this browser");
  const audioContext = new AudioContextCtor();
  const decoded = await audioContext.decodeAudioData(arrayBuffer.slice(0));
  const wavBlob = audioBufferToWav(decoded);
  await audioContext.close();
  return wavBlob;
}

async function transcribeAudio(blob) {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error("The app key is missing. Please configure the Sarvam key before recording.");
  }

  const wavBlob = await blobToWav(blob);
  const formData = new FormData();
  formData.append("file", wavBlob, "voice.wav");
  formData.append("model", "saaras:v3");
  formData.append("language_code", getLanguageCode());

  const response = await fetch("https://api.sarvam.ai/speech-to-text", {
    method: "POST",
    headers: { "api-subscription-key": apiKey },
    body: formData
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(errorText || `Speech API error (${response.status})`);
  }

  const result = await response.json();
  if (!result || typeof result.transcript !== "string") {
    throw new Error("No transcript returned from the speech API.");
  }

  return result.transcript.trim();
}

async function startRecording() {
  hideMessage();
  if (!(await requestMicrophoneAccess())) return;
  if (!getApiKey()) {
    showMessage("Sarvam API key is missing. Please add the configured app key.");
    return;
  }
  if (typeof MediaRecorder === "undefined") {
    showMessage("This browser does not support MediaRecorder. Use Safari or Chrome on mobile.");
    return;
  }

  if (hasStopped) {
    finalTranscript = "";
    transcriptEditor.value = "";
    translationResult.classList.add("hidden");
    hasStopped = false;
  }

  audioChunks = [];
  const mimeType = getSupportedMimeType();
  mediaRecorder = mimeType ? new MediaRecorder(mediaStream, { mimeType }) : new MediaRecorder(mediaStream);
  mediaRecorder.ondataavailable = event => {
    if (event.data && event.data.size > 0) audioChunks.push(event.data);
  };

  mediaRecorder.onstop = async () => {
    try {
      const blob = new Blob(audioChunks, { type: mediaRecorder.mimeType || "audio/webm" });
      const transcript = await transcribeAudio(blob);
      finalTranscript = transcript;
      updateTranscript();
      stageTitle.textContent = "Recording complete";
      stageHint.textContent = "Your words are ready to edit below";
      setButtonState("stopped");
      hasStopped = true;
      isPaused = false;
      recordStage.classList.remove("active");
      waves.classList.add("hidden");
    } catch (error) {
      showMessage(error.message || "The recording could not be transcribed. Please try again.");
      stageTitle.textContent = "Ready when you are";
      stageHint.textContent = "Tap the button to start speaking";
      setButtonState("idle");
      recordStage.classList.remove("active");
      waves.classList.add("hidden");
    }
  };

  mediaRecorder.start();
  isPaused = false;
  hasStopped = false;
  recordStage.classList.add("active");
  waves.classList.remove("hidden");
  stageTitle.textContent = "Listening...";
  stageHint.textContent = "Speak clearly — your words will appear below";
  setButtonState("recording");
}

function pauseRecording() {
  if (!mediaRecorder || mediaRecorder.state !== "recording") return;
  mediaRecorder.pause();
  isPaused = true;
  setButtonState("paused");
  recordStage.classList.remove("active");
  waves.classList.add("hidden");
  stageTitle.textContent = "Recording paused";
  stageHint.textContent = "Resume whenever you are ready";
}

function resumeRecording() {
  if (!mediaRecorder || mediaRecorder.state !== "paused") return;
  mediaRecorder.resume();
  isPaused = false;
  setButtonState("recording");
  recordStage.classList.add("active");
  waves.classList.remove("hidden");
  stageTitle.textContent = "Listening again...";
  stageHint.textContent = "Speak clearly — your words will appear below";
}

function stopRecording() {
  if (!mediaRecorder) return;
  if (mediaRecorder.state !== "inactive") {
    mediaRecorder.stop();
  }
  if (mediaStream) {
    mediaStream.getTracks().forEach(track => track.stop());
    mediaStream = null;
    microphoneReady = false;
  }
  isPaused = false;
  setButtonState("stopped");
  recordStage.classList.remove("active");
  waves.classList.add("hidden");
}

function copyText(text, button) {
  if (!text.trim()) { showMessage("There is no text to copy yet."); return; }
  navigator.clipboard.writeText(text).then(() => {
    const original = button.innerHTML;
    button.innerHTML = "Copied!";
    setTimeout(() => { button.innerHTML = original; }, 1200);
  }).catch(() => showMessage("Copy was blocked by the browser. Please select and copy the text manually."));
}

function downloadText(text, filename) {
  if (!text.trim()) { showMessage("There is no text to download yet."); return; }
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `${filename}.txt`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(link.href);
}

startButton.addEventListener("click", () => { void startRecording(); });
resumeButton.addEventListener("click", resumeRecording);
pauseButton.addEventListener("click", pauseRecording);
stopButton.addEventListener("click", stopRecording);

editButton.addEventListener("click", () => {
  isEditing = !isEditing;
  transcriptEditor.classList.toggle("editing", isEditing);
  editButton.innerHTML = isEditing ? "✓ <span>Save edits</span>" : "✎ <span>Edit</span>";
  if (!isEditing) {
    finalTranscript = transcriptEditor.value;
    updateTranscript();
  }
});

copyButton.addEventListener("click", () => copyText(transcriptEditor.value, copyButton));
downloadButton.addEventListener("click", () => downloadText(transcriptEditor.value, "vaani-transcript"));

document.querySelector("#copyTranslation").addEventListener("click", event => copyText(translatedText.textContent, event.currentTarget));
document.querySelector("#downloadTranslation").addEventListener("click", () => downloadText(translatedText.textContent, "vaani-translation"));

translateButton.addEventListener("click", async () => {
  const text = transcriptEditor.value.trim();
  if (!text) {
    showMessage("Record or write some text before translating.");
    return;
  }

  translateButton.disabled = true;
  translateButton.textContent = "Translating...";

  try {
    const response = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=autodetect|${targetLanguage.value}`);
    if (!response.ok) throw new Error("translation request failed");
    const data = await response.json();
    if (!data.responseData || !data.responseData.translatedText) throw new Error("empty translation");
    translatedText.textContent = data.responseData.translatedText;
    translationResult.classList.remove("hidden");
  } catch (error) {
    showMessage("Translation is temporarily unavailable. Check your connection and try again.");
  } finally {
    translateButton.disabled = false;
    translateButton.textContent = "Translate ✦";
  }
});

document.querySelector("#permissionButton").addEventListener("click", () => { void requestMicrophoneAccess(); });

if (typeof MediaRecorder === "undefined") {
  showMessage("This browser does not support MediaRecorder. Use Safari or Chrome on mobile.");
}
