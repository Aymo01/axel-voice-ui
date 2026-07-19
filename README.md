# Axel Voice UI

A voice-activated web UI for **Axel**, an AI executive assistant. Say "Hey Axel" to wake it
up, talk to it, and hear it talk back — no buttons required.

## How it works

```
Always listening for "Hey Axel"
        ↓ (wake word detected)
Axel says "Hi! How can I help you today?"
        ↓
3D wireframe orb animates, mic recording begins
        ↓
Your speech is transcribed and sent to Axel's backend
        ↓
Axel's reply is shown in chat and spoken aloud
        ↓
Any pending approvals are shown (Approve / Reject)
        ↓
Back to listening for "Hey Axel"
```

## Stack

- React 18 + TypeScript + Vite
- Tailwind CSS v4
- Three.js + `@react-three/fiber` + `@react-three/postprocessing` (3D wireframe orb, particle
  halo, bloom glow)
- Web Audio API (mic level metering)
- Web Speech API (`SpeechRecognition` for transcription, `speechSynthesis` for voice output)
- Picovoice Porcupine (wake-word detection, runs entirely in-browser via WASM)
- Axios (Axel backend HTTP calls)

## Getting started

```bash
npm install
cp .env.example .env
# fill in .env — see "Wake-word setup" below
npm run dev
```

Opens on **http://localhost:5173**.

Speech recognition and wake-word detection both need microphone access, and
`SpeechRecognition` currently only ships in Chromium-based browsers (Chrome, Edge). Use one
of those for the full experience.

## Wake-word setup (required for voice activation)

Porcupine needs three things that can't be committed to a public repo (a personal API key,
a proprietary language model, and — for a fully custom phrase — a trained keyword file):

1. **AccessKey** — create a free account at [console.picovoice.ai](https://console.picovoice.ai/)
   and copy your AccessKey into `VITE_PICOVOICE_ACCESS_KEY`.
2. **Language model** — download `porcupine_params.pv` (the English acoustic model) from the
   [Porcupine GitHub repo](https://github.com/Picovoice/porcupine/tree/master/lib/common) and
   place it in `public/porcupine_params.pv`.
3. **The "Hey Axel" wake word** — train a custom keyword for the phrase "Hey Axel" on the
   Picovoice Console (Wake Word tab → target **WebAssembly**), download the `.ppn` file, and
   place it in `public/`. Point `VITE_PORCUPINE_KEYWORD_PATH` at it (e.g.
   `/Hey-Axel_en_wasm_v3_0_0.ppn`).

**Don't want to train a custom keyword right away?** Leave `VITE_PORCUPINE_KEYWORD_PATH`
empty and set `VITE_PORCUPINE_BUILTIN_KEYWORD` to one of Porcupine's free built-in words
(`Computer`, `Jarvis`, `Picovoice`, `Porcupine`, etc. — see `.env.example`). The app will
listen for that instead so you can test the rest of the pipeline immediately.

If neither is configured, the app still runs — it shows a "wake-word unavailable" notice and
falls back to a text box so you can exercise the chat/approval flow without voice.

## Talking to the Axel backend

Requests go to `VITE_AXEL_API_URL` (defaults to the production Railway deployment):

- `POST /chat` — `{ message, user_id: "web-voice-user", mode: "default" }`, expects a
  text response back (`response` / `message` / `text` field).
- `GET /status` — polled after each reply for pending approvals (`pending_approvals` /
  `approvals` / `pending` array).
- `POST /approve` / `POST /reject` — `{ id, user_id }`, fired when you click Approve/Reject
  on a pending action.

If your backend uses different endpoint names or payload shapes for approve/reject, adjust
[`src/hooks/useAxelAPI.ts`](src/hooks/useAxelAPI.ts) — those two are the only ones not given
explicitly in the spec, so they're a best guess.

## Project structure

```
src/
  components/
    OrbVisualization.tsx   # 3D wireframe orb: noise-displaced icosahedron, particle
                           # halo, bloom — reacts to idle/listening/talking/processing
    orbShaders.ts          # GLSL: simplex-noise vertex displacement + gradient fragment shader
    WakeWordDetector.tsx   # Wake-word status readout (text only, no visualization)
    ActivityPanel.tsx      # Right-side HUD terminal log (corner brackets, status dots)
    ChatDisplay.tsx        # Minimal transcript (last 3 messages, fade-in)
    PendingApprovals.tsx   # Approve/Reject cards
  hooks/
    useWakeWordDetection.ts # Picovoice Porcupine integration
    useVoiceInput.ts         # SpeechRecognition + mic level metering
    useTextToSpeech.ts       # speechSynthesis wrapper + voice selection
    useAxelAPI.ts            # Axios client for the Axel backend
  App.tsx                   # State machine wiring it all together
```

### The orb

`OrbVisualization` renders an `IcosahedronGeometry` as a wireframe, displacing every vertex
along its normal by a 3D simplex-noise value computed live in the vertex shader (GPU-side, so
subdivision level and particle count stay cheap). A `Points` halo (~2200 particles) surrounds
it with a custom twinkle/pulse shader, and `@react-three/postprocessing`'s `Bloom` gives both
the wireframe and particles their glow. Four animation presets (`idle` / `listening` /
`talking` / `processing`) lerp the noise amplitude/frequency/speed, rotation speed, glow
intensity, and particle pulse — `listening` also reacts to live mic level, and `processing`
adds a scanning-band shader effect. State comes from `App.tsx`'s phase machine.

## Deployment (Railway)

The frontend deploys to Railway the same way as the Axel backend:

1. `npm run build` locally to sanity-check the production build.
2. Push this repo to GitHub: `https://github.com/Aymo01/axel-voice-ui`.
3. In Railway: **New Project → Deploy from GitHub** → select `axel-voice-ui`.
4. Add the environment variables from `.env.example` (at minimum `VITE_AXEL_API_URL`, plus
   the Picovoice ones if you want wake-word detection live in production) in Railway's
   Variables tab.
5. Railway auto-deploys on push. You'll get a public URL like
   `https://axel-voice-ui.up.railway.app`.

Both backend and frontend then run on Railway, talking over HTTPS.

> Note: since `.ppn` / `.pv` model files live in `public/`, make sure they're committed (or
> fetched at build time) — don't add them to `.gitignore`.

## Known limitations

- `SpeechRecognition` is Chromium-only; Firefox/Safari users get a text-input fallback error.
- Wake-word detection requires the manual Picovoice setup above — there's no way to ship a
  working "Hey Axel" model without it (proprietary, per-account files).
- Approve/Reject endpoint contract is inferred — verify against the real Axel backend.
- The production bundle is large (~4.7MB) because Picovoice and Three.js both inline sizeable
  WASM/runtime payloads. Dynamic `import()` code-splitting was tried and reverted — on this
  Rolldown-based Vite build it silently dropped most of Porcupine's WASM binary (worked in dev,
  broke in the production bundle), so both libraries are loaded eagerly via static imports.
- **On the "CORS issue"**: verified directly against the live backend (`OPTIONS` preflight and
  a real `POST /chat` both come back with `access-control-allow-origin: *`) — CORS is already
  correctly configured in `Axle/src/index.ts` and deployed. The actual failure behind
  "Axel's backend is unreachable" is a backend-side 500:
  `Failed to look up conversation: TypeError: fetch failed`, thrown from the Supabase query in
  `Axle/src/agent.ts`. That looks like a Supabase connectivity/env-var problem on Railway
  (`SUPABASE_URL` / `SUPABASE_KEY`), not anything fixable from this frontend repo. The activity
  log panel now surfaces the real backend response body when a request fails, instead of a
  generic "unreachable" message, to make this kind of issue easier to spot going forward.
