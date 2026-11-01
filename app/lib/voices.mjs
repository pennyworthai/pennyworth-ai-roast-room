import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";
import { APP_ROOT, env } from "./env.mjs";

const AUDIO_CACHE_DIR = path.join(APP_ROOT, "cache", "audio");
if (!fs.existsSync(AUDIO_CACHE_DIR)) {
  fs.mkdirSync(AUDIO_CACHE_DIR, { recursive: true });
}

// Ensure HuggingFace / transformers cache stays in Drive F project directory
process.env.HF_HOME = path.join(APP_ROOT, "cache", "huggingface");
process.env.TRANSFORMERS_CACHE = path.join(APP_ROOT, "cache", "transformers");

export const SEAT_VOICES = {
  chair: {
    kokoro: "bm_george",
    kokoroSpeed: 1.0,
    edge: "en-GB-ThomasNeural",
    edgeRate: "+0%",
    edgePitch: "-2Hz",
    gender: "male",
    description: "British boardroom chair & debate moderator"
  },
  bezos: {
    kokoro: "am_michael",
    kokoroSpeed: 1.02,
    edge: "en-US-ChristopherNeural",
    edgeRate: "+3%",
    edgePitch: "-2Hz",
    gender: "male",
    description: "Authoritative, customer-obsessed corporate visionary"
  },
  graham: {
    kokoro: "bm_daniel",
    kokoroSpeed: 0.95,
    edge: "en-US-AndrewMultilingualNeural",
    edgeRate: "-4%",
    edgePitch: "+0Hz",
    gender: "male",
    description: "Deliberate, intellectual startup philosopher"
  },
  hormozi: {
    kokoro: "am_liam",
    kokoroSpeed: 1.1,
    edge: "en-US-EricNeural",
    edgeRate: "+6%",
    edgePitch: "-3Hz",
    gender: "male",
    description: "Punchy, blunt, math and offers"
  },
  garyvee: {
    kokoro: "am_fenrir",
    kokoroSpeed: 1.18,
    edge: "en-US-GuyNeural",
    edgeRate: "+14%",
    edgePitch: "+2Hz",
    gender: "male",
    description: "Rapid-fire, gritty, passionate, attention-first"
  },
  martell: {
    kokoro: "am_adam",
    kokoroSpeed: 1.08,
    edge: "en-CA-LiamNeural",
    edgeRate: "+8%",
    edgePitch: "+0Hz",
    gender: "male",
    description: "High-energy founder coach, buy back your time"
  },
  wickman: {
    kokoro: "am_onyx",
    kokoroSpeed: 0.98,
    edge: "en-US-SteffanNeural",
    edgeRate: "+0%",
    edgePitch: "-2Hz",
    gender: "male",
    description: "Structured, calm, disciplined EOS operator"
  },
  buffett: {
    kokoro: "am_santa",
    kokoroSpeed: 0.88,
    edge: "en-US-RogerNeural",
    edgeRate: "-8%",
    edgePitch: "-4Hz",
    gender: "male",
    description: "Folksy, risk-averse, moat-focused investor"
  },
  naval: {
    kokoro: "bm_lewis",
    kokoroSpeed: 0.95,
    edge: "en-IN-PrabhatNeural",
    edgeRate: "+0%",
    edgePitch: "-1Hz",
    gender: "male",
    description: "Calm, aphoristic, specific knowledge & leverage"
  },
  sanchez: {
    kokoro: "af_nicole",
    kokoroSpeed: 1.08,
    edge: "en-US-MichelleNeural",
    edgeRate: "+6%",
    edgePitch: "+0Hz",
    gender: "female",
    description: "Fast, contrarian, cash-flowing small business buyer"
  },
  leila: {
    kokoro: "af_bella",
    kokoroSpeed: 1.05,
    edge: "en-US-AvaNeural",
    edgeRate: "+4%",
    edgePitch: "-1Hz",
    gender: "female",
    description: "Commanding, direct, hiring and culture architect"
  },
  blakely: {
    kokoro: "af_heart",
    kokoroSpeed: 1.05,
    edge: "en-US-EmmaNeural",
    edgeRate: "+5%",
    edgePitch: "+1Hz",
    gender: "female",
    description: "Warm, energetic, consumer product builder"
  },
  musk: {
    kokoro: "am_puck",
    kokoroSpeed: 1.12,
    edge: "en-US-BrianNeural",
    edgeRate: "+5%",
    edgePitch: "-1Hz",
    gender: "male",
    description: "Analytical, first-principles, rapid velocity"
  }
};

let kokoroInstance = null;
let kokoroLoading = null;

async function getKokoro() {
  if (kokoroInstance) return kokoroInstance;
  if (kokoroLoading) return kokoroLoading;

  kokoroLoading = (async () => {
    try {
      const { KokoroTTS } = await import("kokoro-js");
      const tts = await KokoroTTS.from_pretrained("onnx-community/Kokoro-82M-v1.0-ONNX", {
        dtype: "q8",
        device: "cpu"
      });
      kokoroInstance = tts;
      console.log("[Kokoro TTS] Model loaded successfully on CPU.");
      return tts;
    } catch (err) {
      console.error("[Kokoro TTS] Failed to load Kokoro:", err.message);
      throw err;
    } finally {
      kokoroLoading = null;
    }
  })();

  return kokoroLoading;
}

// Preferred TTS engine: "kokoro" (default) or "edge"
const TTS_ENGINE = (process.env.ROAST_TTS_ENGINE || env("ROAST_TTS_ENGINE") || "kokoro").toLowerCase();

/**
 * Synthesize speech for a seat.
 * Returns { filePath, mimeType, hash, cached }
 */
export async function synthesizeVoice(seatKey, text, options = {}) {
  const cleanSeat = (seatKey || "chair").toLowerCase();
  const voiceConfig = SEAT_VOICES[cleanSeat] || SEAT_VOICES.chair;
  const cleanText = text.replace(/[*_#`[\]()]/g, "").trim().slice(0, 1000);
  if (!cleanText) throw new Error("Empty text for voice synthesis");

  const requestedEngine = (options.engine || TTS_ENGINE).toLowerCase();

  // Try Kokoro first if requested
  if (requestedEngine === "kokoro") {
    const hash = crypto.createHash("md5").update(`kokoro:${cleanSeat}:${voiceConfig.kokoro}:${voiceConfig.kokoroSpeed}:${cleanText}`).digest("hex");
    const filePath = path.join(AUDIO_CACHE_DIR, `${hash}.wav`);

    if (fs.existsSync(filePath) && fs.statSync(filePath).size > 1000) {
      return { filePath, mimeType: "audio/wav", hash, cached: true, engine: "kokoro" };
    }

    try {
      const tts = await getKokoro();
      const rawAudio = await tts.generate(cleanText, {
        voice: voiceConfig.kokoro,
        speed: voiceConfig.kokoroSpeed || 1.0
      });
      await rawAudio.save(filePath);
      return { filePath, mimeType: "audio/wav", hash, cached: false, engine: "kokoro" };
    } catch (err) {
      console.warn(`[Kokoro TTS] Fallback to Edge-TTS for "${cleanSeat}": ${err.message}`);
      // Fall through to Edge-TTS fallback
    }
  }

  // Edge-TTS synthesis
  const hash = crypto.createHash("md5").update(`edge:${cleanSeat}:${voiceConfig.edge}:${voiceConfig.edgeRate}:${voiceConfig.edgePitch}:${cleanText}`).digest("hex");
  const filePath = path.join(AUDIO_CACHE_DIR, `${hash}.mp3`);

  if (fs.existsSync(filePath) && fs.statSync(filePath).size > 1000) {
    return { filePath, mimeType: "audio/mpeg", hash, cached: true, engine: "edge" };
  }

  const { MsEdgeTTS, OUTPUT_FORMAT } = await import("msedge-tts");
  const tts = new MsEdgeTTS();
  await tts.setMetadata(voiceConfig.edge, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);

  const { audioStream } = tts.toStream(cleanText, {
    rate: voiceConfig.edgeRate || "+0%",
    pitch: voiceConfig.edgePitch || "+0Hz"
  });

  const chunks = [];
  await new Promise((resolve, reject) => {
    audioStream.on("data", (chunk) => chunks.push(chunk));
    audioStream.on("close", resolve);
    audioStream.on("error", reject);
  });

  const buffer = Buffer.concat(chunks);
  if (buffer.length < 500) {
    throw new Error("Edge-TTS generated empty or corrupt audio");
  }

  fs.writeFileSync(filePath, buffer);
  return { filePath, mimeType: "audio/mpeg", hash, cached: false, engine: "edge" };
}
