// =============================================================================
// Nova — Claude API + Text-to-Speech (TTS)  : nova-chat.js
// -----------------------------------------------------------------------------
// This module is the "brain + voice" wiring for Nova. It:
//   1. Builds a small DEBUG text input (NOT the final client UI — a dev tool).
//   2. Sends the typed message to the Anthropic Claude API via fetch().
//   3. Parses a <topic>...</topic> tag out of Claude's reply and calls
//      onTopic(topic) so the 3D scene can shift colors.
//   4. Speaks the reply with the Web Speech API, and toggles onSpeaking(true/
//      false) so the avatar's particles/bloom react while she talks.
//
// It exposes ONE function, initNovaChat({ onTopic, onSpeaking }), which main.js
// calls and wires to setTopic() and the novaActive flag.
//
// ⚠️ SECURITY NOTE (read this): VITE_ANTHROPIC_API_KEY is bundled into the
// browser, so anyone who opens the page can read it. That is acceptable ONLY
// for a locked-down kiosk PC like the Maker's Lab installation. For anything
// public, the call must go through a tiny backend proxy (the `nova/` folder) so
// the key stays server-side. See the README note we should add later.
// =============================================================================

// -----------------------------------------------------------------------------
// CONFIG
// -----------------------------------------------------------------------------
const API_URL = "https://api.anthropic.com/v1/messages";
const API_KEY = import.meta.env.VITE_ANTHROPIC_API_KEY;

// Low-latency conversational model. Nova speaks her replies aloud, so response
// speed is felt directly — Sonnet 4.6 is the sweet spot. For maximum quality
// (at higher latency) swap this to "claude-opus-4-8".
const NOVA_MODEL = "claude-sonnet-4-6";

// Keep replies short — they're spoken aloud, so 2–4 sentences feels natural.
const MAX_TOKENS = 1024;

// The four topics Nova can detect. Must match the keys in main.js's setTopic().
const VALID_TOPICS = ["default", "sustainability", "innovation", "operations"];

// Nova's persona + the rule that she must tag every reply with a topic.
const SYSTEM_PROMPT = `You are Nova, the AI guide of Accenture's 1MW Maker's Lab — an emerging-technology innovation space that runs immersive client demos featuring VR, robotics, AI, holographic displays, and hand sensors.

Your personality: professional, warm, curious, and genuinely intelligent. You are a creative, knowledgeable guide to emerging technology — never robotic, never a generic chatbot. You speak naturally and conversationally, as a brilliant host would. You are concise: because your words are spoken aloud, keep replies to 2–4 sentences unless the visitor asks for depth.

After every reply, you MUST classify the visitor's current topic of interest using an XML tag on its own line at the very end of your response, in exactly this format:
<topic>VALUE</topic>

VALUE must be exactly one of:
- "sustainability" — climate, energy, environment, ESG, green tech
- "innovation" — R&D, new ideas, creativity, emerging/experimental tech
- "operations" — efficiency, logistics, process, supply chain, cost, scale
- "default" — greetings, small talk, or anything that fits none of the above

The <topic> tag is a machine instruction — it is removed before your words are spoken, so never refer to it in your reply.`;

// -----------------------------------------------------------------------------
// CONVERSATION STATE
// -----------------------------------------------------------------------------
// The Claude API is stateless — we resend the full history each turn so Nova
// remembers the conversation. (System prompt is sent separately, not in here.)
const messages = [];

// -----------------------------------------------------------------------------
// TTS OUTPUT ROUTING (setSinkId)
// -----------------------------------------------------------------------------
// IMPORTANT: The Web Speech API (speechSynthesis) used below CANNOT be routed
// to a chosen speaker — setSinkId only exists on media elements. So we keep a
// hidden <audio> element here and route IT to the dedicated speaker. Today the
// Web Speech path ignores this element; when we swap to a streaming TTS that
// returns an audio URL (in the `nova/` folder), call playRoutedAudio(url) and
// the voice will come out of the dedicated speaker.
let routedAudioEl = null;
let dedicatedSinkId = null;

// Try to find the dedicated speaker by its label (from VITE_NOVA_SPEAKER) and
// route the <audio> element to it via setSinkId(). Enumerating devices with
// labels requires microphone permission to have been granted at least once.
async function setupDedicatedSpeaker() {
  routedAudioEl = new Audio();
  routedAudioEl.autoplay = true;

  const wantLabel = (import.meta.env.VITE_NOVA_SPEAKER || "").trim().toLowerCase();
  if (!wantLabel) return; // no preference — use system default

  // setSinkId is not supported in every browser (Chrome/Edge: yes; Safari: no).
  if (typeof routedAudioEl.setSinkId !== "function") {
    console.warn("setSinkId not supported in this browser — using default output.");
    return;
  }

  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const speaker = devices.find(
      (d) => d.kind === "audiooutput" && d.label.toLowerCase().includes(wantLabel)
    );
    if (speaker) {
      await routedAudioEl.setSinkId(speaker.deviceId);
      dedicatedSinkId = speaker.deviceId;
      console.log(`Nova voice routed to "${speaker.label}".`);
    } else {
      console.warn(`No audio output matching "${wantLabel}" — using default.`);
    }
  } catch (err) {
    console.warn("Could not route to dedicated speaker:", err);
  }
}

// For the FUTURE streaming-TTS path: play an audio URL through the routed
// element so it comes out of the dedicated speaker. (Unused by Web Speech.)
export function playRoutedAudio(url, { onStart, onEnd } = {}) {
  if (!routedAudioEl) routedAudioEl = new Audio();
  routedAudioEl.src = url;
  routedAudioEl.onplay = () => onStart && onStart();
  routedAudioEl.onended = () => onEnd && onEnd();
  routedAudioEl.play();
}

// -----------------------------------------------------------------------------
// TTS (Web Speech API) — the working "now" path
// -----------------------------------------------------------------------------
// Picks a pleasant English voice once the browser has loaded its voice list.
let novaVoice = null;
function pickVoice() {
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return;
  // Prefer a natural-sounding English voice; fall back to the first English one.
  novaVoice =
    voices.find((v) => /en/i.test(v.lang) && /(female|samantha|google|zira|aria)/i.test(v.name)) ||
    voices.find((v) => /en/i.test(v.lang)) ||
    voices[0];
}
if ("speechSynthesis" in window) {
  pickVoice();
  // Voices often load asynchronously, so re-pick when they become available.
  window.speechSynthesis.onvoiceschanged = pickVoice;
}

// speak(): say `text` aloud. onStart/onEnd let the caller flip novaActive so
// the avatar reacts while she's talking.
function speak(text, { onStart, onEnd } = {}) {
  if (!("speechSynthesis" in window) || !text) {
    // No TTS available — still fire the callbacks so the visual state is sane.
    onStart && onStart();
    onEnd && onEnd();
    return;
  }
  window.speechSynthesis.cancel(); // stop anything currently being said
  const utterance = new SpeechSynthesisUtterance(text);
  if (novaVoice) utterance.voice = novaVoice;
  utterance.rate = 1.0;
  utterance.pitch = 1.05; // a touch brighter — Nova's voice
  utterance.onstart = () => onStart && onStart();
  utterance.onend = () => onEnd && onEnd();
  utterance.onerror = () => onEnd && onEnd(); // never leave her "stuck speaking"
  window.speechSynthesis.speak(utterance);
}

// -----------------------------------------------------------------------------
// CLAUDE API CALL
// -----------------------------------------------------------------------------
async function callClaude() {
  const response = await fetch(API_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": API_KEY,
      "anthropic-version": "2023-06-01",
      // Required to call the API directly from a browser (enables CORS). This
      // also signals you accept that the key is exposed client-side.
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model: NOVA_MODEL,
      max_tokens: MAX_TOKENS,
      // System prompt as an array with cache_control so the (stable) persona is
      // cached and not re-billed every turn. NOTE: caching only kicks in once
      // the cached prefix passes the model's minimum (~2048 tokens for Sonnet),
      // so for this short prompt it's a no-op now but correct as it grows.
      system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
      messages,
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Claude API ${response.status}: ${detail}`);
  }

  const data = await response.json();
  // The reply is in content[]; concatenate any text blocks.
  return data.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("");
}

// -----------------------------------------------------------------------------
// TOPIC PARSING
// -----------------------------------------------------------------------------
// Pull the <topic>X</topic> tag out of the reply. Returns the topic (or null)
// and the reply with the tag removed (so it isn't spoken).
function extractTopic(reply) {
  const match = reply.match(/<topic>\s*(.*?)\s*<\/topic>/i);
  let topic = null;
  if (match) {
    const candidate = match[1].toLowerCase();
    if (VALID_TOPICS.includes(candidate)) topic = candidate;
  }
  // Remove the tag (and trim leftover whitespace) for the spoken/displayed text.
  const spoken = reply.replace(/<topic>.*?<\/topic>/gi, "").trim();
  return { topic, spoken };
}

// =============================================================================
// PUBLIC ENTRY POINT
// =============================================================================
// onTopic(topic)        → called with a valid topic string to retint the scene.
// onSpeaking(isSpeaking)→ called true when Nova starts talking, false when done.
// =============================================================================
export function initNovaChat({ onTopic, onSpeaking }) {
  buildDebugUI(onTopic, onSpeaking);
  // Set up speaker routing in the background (no-op without VITE_NOVA_SPEAKER).
  setupDedicatedSpeaker();
}

// --- The debug input panel ---------------------------------------------------
function buildDebugUI(onTopic, onSpeaking) {
  const panel = document.createElement("div");
  panel.id = "nova-debug";
  panel.innerHTML = `
    <div id="nova-log" style="font:12px/1.4 monospace; color:#d9c7ff; max-height:160px;
         overflow:auto; margin-bottom:8px; white-space:pre-wrap;"></div>
    <div style="display:flex; gap:6px;">
      <input id="nova-input" type="text" placeholder="Say something to Nova… (debug)"
        style="flex:1; padding:8px; border-radius:6px; border:1px solid #6a4aa0;
        background:#160a28; color:#fff; font:13px sans-serif; outline:none;" />
      <button id="nova-send" style="padding:8px 14px; border:0; border-radius:6px;
        background:#a100ff; color:#fff; font:13px sans-serif; cursor:pointer;">Send</button>
    </div>`;
  // Fixed panel in the corner — clearly a dev tool, sits above the 3D canvas.
  Object.assign(panel.style, {
    position: "fixed", left: "16px", bottom: "16px", width: "360px", zIndex: "1000",
    background: "rgba(10,0,22,0.82)", padding: "12px", borderRadius: "10px",
    border: "1px solid #4a2d7a", backdropFilter: "blur(6px)",
  });
  document.body.appendChild(panel);

  const input = panel.querySelector("#nova-input");
  const sendBtn = panel.querySelector("#nova-send");
  const log = panel.querySelector("#nova-log");

  const print = (who, text) => {
    log.textContent += `${who}: ${text}\n`;
    log.scrollTop = log.scrollHeight;
  };

  if (!API_KEY || API_KEY.includes("REPLACE_ME")) {
    print("system", "⚠️ No API key set. Add VITE_ANTHROPIC_API_KEY to .env and restart Vite.");
  }

  async function send() {
    const text = input.value.trim();
    if (!text) return;
    input.value = "";
    sendBtn.disabled = true;
    print("you", text);

    // Add the visitor's message to the running history.
    messages.push({ role: "user", content: text });

    try {
      const reply = await callClaude();
      messages.push({ role: "assistant", content: reply }); // remember her reply

      const { topic, spoken } = extractTopic(reply);
      if (topic && onTopic) onTopic(topic); // shift the scene's colors
      print("nova", spoken + (topic ? `   [topic: ${topic}]` : ""));

      // Speak it, flipping the avatar's active state around the speech.
      speak(spoken, {
        onStart: () => onSpeaking && onSpeaking(true),
        onEnd: () => onSpeaking && onSpeaking(false),
      });
    } catch (err) {
      print("system", "Error: " + err.message);
      console.error(err);
    } finally {
      sendBtn.disabled = false;
      input.focus();
    }
  }

  sendBtn.addEventListener("click", send);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") send();
  });
}
