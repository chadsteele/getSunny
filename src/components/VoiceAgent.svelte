<script lang="ts">
  import { onMount, tick } from 'svelte';
  import ChatThread from './ChatThread.svelte';
  import AudioControls from './AudioControls.svelte';
  import LanguageModel from './LanguageModel.svelte';
  import RecordingStatus from './RecordingStatus.svelte';
  import Sparkle from './Sparkle.svelte';
  import SpeechModel from './SpeechModel.svelte';
  import TranscriptionModel from './TranscriptionModel.svelte';
  import { logger as console } from '../lib/logger';
  import type {
    AppConfig,
    LanguageModelController,
    SpeechModelController,
    TranscriptionModelController,
  } from '../lib/model-config';

  type Status = 'downloading' | 'listening' | 'thinking' | 'speaking' | 'paused' | 'ended' | 'error';
  type ChatRole = 'user' | 'assistant' | 'status';
  type ChatMessage = { id: number; role: ChatRole; content: string };


  const SILENCE_THRESHOLD = 0.08;
  const MAX_RECORDING_MS = 3 * 60 * 1000;
  const SILENCE_END_MS = 10 * 1000;
  const KNOWN_VOCABULARY = ['Sunny', 'MasterMoney.ai', 'NeuroRecursion'];

  let systemPrompt = '';
  let status = $state<Status>('downloading');
  let intensity = $state(0.18);
  let sparkleVisible = $state(false);
  let conversationActive = $state(false);
  let modelsReady = $state(false);
  let welcomePlayed = $state(false);
  let chatMessages = $state<ChatMessage[]>([]);
  let nextMessageId = 0;
  let errorMessage = $state('');
  let downloadStatus = $state('Preparing voice models...');
  let downloadingModel = $state('voice models');
  let inputStream: MediaStream | undefined;
  let inputContext: AudioContext | undefined;
  let inputAnalyser: AnalyserNode | undefined;
  let inputData: Float32Array<ArrayBuffer> | undefined;
  let outputContext: AudioContext | undefined;
  let outputAnalyser: AnalyserNode | undefined;
  let outputData: Float32Array<ArrayBuffer> | undefined;
  let outputAudio: HTMLAudioElement | undefined;
  let finishPlayback: (() => void) | undefined;
  let animationFrame = 0;
  let processing = false;
  let startingConversation = false;
  let animationFrameCount = 0;
  let lastMicDebugAt = 0;
  let manualSpeechStartedAt = 0;
  let manualSilenceStartedAt = 0;
  let manualSpeechSamples: number[] = [];
  let lastManualCaptureAt = 0;
  let recordingStartedAt = $state<number | undefined>();
  let recordingElapsedMs = $state(0);
  let lastSpeechActivityAt = 0;
  let recordingTimer: ReturnType<typeof setInterval> | undefined;
  let config = $state<AppConfig | undefined>();
  let transcriptionModel = $state<TranscriptionModelController | undefined>();
  let languageModel = $state<LanguageModelController | undefined>();
  let speechModel = $state<SpeechModelController | undefined>();
  let modelPreparation: Promise<void> | undefined;
  let hasAnnouncedReady = false;
  let downloadingOccurred = false;
  let activeModelDownload = false;
  let lastStatusAnnouncement = '';
  const loggedProgress = new Map<string, number>();

  const recordingProgress = $derived(Math.min(100, (recordingElapsedMs / MAX_RECORDING_MS) * 100));
  const recordingRemainingMs = $derived(Math.max(0, MAX_RECORDING_MS - recordingElapsedMs));

  function addChatMessage(role: ChatRole, content: string) {
    const message = content.trim();
    if (!message) return;
    chatMessages.push({ id: nextMessageId++, role, content: message });
  }

  function conversationContext() {
    return chatMessages
      .filter(({ role }) => role !== 'status')
      .map(({ role, content }) => `${role === 'user' ? 'User' : 'Sunny'}: ${content}`)
      .join('\n\n');
  }

  const statusLabel = $derived(
    status === 'downloading'
      ? 'Downloading...'
      : status === 'listening'
      ? 'Listening...'
      : status === 'thinking'
        ? 'Thinking...'
        : status === 'speaking'
          ? 'Speaking...'
          : status === 'paused'
            ? 'Paused'
            : status === 'ended'
              ? 'Ended'
              : 'Something went wrong',
  );

  function speakDiagnostic(message: string) {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      console.warn('[Sunny] Browser speech diagnostics unavailable:', message);
      return;
    }
    console.log('[Sunny] Speaking diagnostic:', message);
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(message);
    utterance.rate = 1;
    utterance.volume = 0.8;
    window.speechSynthesis.speak(utterance);
  }

  $effect(() => {
    const currentStatus = status;
    if (currentStatus === 'listening') {
      if (!hasAnnouncedReady) {
        hasAnnouncedReady = true;
        if (downloadingOccurred) {
          lastStatusAnnouncement = 'ready';
          speakDiagnostic('Ready');
        } else {
          lastStatusAnnouncement = 'session-opening';
          void speakSessionOpening().catch((error: unknown) => {
            console.error('[Sunny] Session opening failed:', error);
            errorMessage = error instanceof Error ? error.message : 'Unable to speak the session opening.';
            status = 'error';
          });
        }
      }
      return;
    }
    if (currentStatus === 'speaking' || currentStatus === 'thinking') return;
    if (currentStatus === 'downloading' && !activeModelDownload) return;
    const announcementKey = `${currentStatus}:${currentStatus === 'downloading' ? downloadingModel : ''}`;
    if (announcementKey === lastStatusAnnouncement) return;
    lastStatusAnnouncement = announcementKey;
    speakDiagnostic(
      currentStatus === 'downloading'
        ? `Downloading ${downloadingModel}`
        : statusLabel,
    );
  });

  $effect(() => {
    const message = errorMessage;
    if (message) speakDiagnostic(`Error. ${message}`);
  });

  function getRms(data: Float32Array<ArrayBuffer>) {
    let total = 0;
    for (const sample of data) total += sample * sample;
    return Math.sqrt(total / data.length);
  }

  function animateAudio() {
    animationFrameCount += 1;
    if (animationFrameCount <= 3) {
      console.log('[Sunny] Audio animation loop tick:', {
        frame: animationFrameCount,
        status,
        hasInputAnalyser: Boolean(inputAnalyser),
        hasInputData: Boolean(inputData),
      });
    }
    const analyser = status === 'speaking' ? outputAnalyser : inputAnalyser;
    const data = status === 'speaking' ? outputData : inputData;
    if (analyser && data) {
      analyser.getFloatTimeDomainData(data);
      const volume = Math.min(1, getRms(data) * 7);
      const now = performance.now();
      if (analyser === inputAnalyser && now - lastMicDebugAt > 1000) {
        console.log('[Sunny] Mic analyser sample:', {
          volumePercent: Math.round(volume * 100),
          thresholdPercent: Math.round(SILENCE_THRESHOLD * 100),
          contextState: inputContext?.state,
          trackState: inputStream?.getAudioTracks().map((track) => track.readyState),
        });
        lastMicDebugAt = now;
      }
      if (analyser === inputAnalyser && status === 'listening' && !processing) {
        const sampleRate = inputContext?.sampleRate ?? 16_000;
        const captureInterval = (data.length / sampleRate) * 1000;
        if (volume >= SILENCE_THRESHOLD) {
          lastSpeechActivityAt = now;
          if (!manualSpeechStartedAt) {
            manualSpeechStartedAt = now;
            manualSpeechSamples = [];
            console.log('[Sunny] Mic fallback speech started:', {
              volumePercent: Math.round(volume * 100),
              thresholdPercent: Math.round(SILENCE_THRESHOLD * 100),
            });
          }
          manualSilenceStartedAt = 0;
        } else if (manualSpeechStartedAt) {
          if (!manualSilenceStartedAt) {
            manualSilenceStartedAt = now;
            console.debug('[Sunny] Mic fallback silence timer armed');
          }
        }
        if (manualSpeechStartedAt && now - lastManualCaptureAt >= captureInterval) {
          manualSpeechSamples.push(...data);
          lastManualCaptureAt = now;
        }
        if (manualSpeechStartedAt && manualSilenceStartedAt && now - manualSilenceStartedAt > 1800) {
          const audio = new Float32Array(manualSpeechSamples);
          manualSpeechStartedAt = 0;
          manualSilenceStartedAt = 0;
          manualSpeechSamples = [];
          lastManualCaptureAt = 0;
          if (audio.length > data.length) {
            console.log('[Sunny] Mic fallback speech ended; starting transcription:', {
              samples: audio.length,
              sampleRate,
              durationSeconds: audio.length / sampleRate,
            });
            void handleSpeech(audio, sampleRate);
          } else {
            console.warn('[Sunny] Mic fallback discarded a segment that was too short:', audio.length);
          }
          if (!manualSpeechStartedAt && now - lastSpeechActivityAt >= SILENCE_END_MS) {
            addChatMessage('status', 'Listening ended after 10 seconds without speech.');
            stopConversation();
            return;
          }
        }
      }
      const target = 0.18 + volume * 0.82;
      intensity += (target - intensity) * (volume > intensity ? 0.45 : 0.12);
    } else if (status === 'thinking') {
      intensity += (0.32 - intensity) * 0.08;
    }
    if (typeof window !== 'undefined' && (status === 'listening' || status === 'speaking')) {
      animationFrame = requestAnimationFrame(animateAudio);
    }
  }

  async function stopInputAnalyser() {
    if (typeof window !== 'undefined') cancelAnimationFrame(animationFrame);
    inputAnalyser = undefined;
    inputData = undefined;
    inputStream?.getTracks().forEach((track) => track.stop());
    inputStream = undefined;
    if (inputContext && inputContext.state !== 'closed') await inputContext.close();
    inputContext = undefined;
  }

  async function setupInputAnalyser() {
    const activeTracks = inputStream?.getAudioTracks().some((track) => track.readyState === 'live');
    if (inputAnalyser && inputContext && inputContext.state !== 'closed' && activeTracks) {
      console.debug('[Sunny] Reusing microphone analyser:', {
        contextState: inputContext.state,
        trackState: inputStream?.getAudioTracks().map((track) => track.readyState),
      });
      await inputContext.resume();
      console.debug('[Sunny] Microphone analyser resumed:', inputContext.state);
      intensity = 0.18;
      animateAudio();
      return;
    }
    await stopInputAnalyser();
    console.log('[Sunny] Requesting microphone access for sparkle analyser');
    inputStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        autoGainControl: true,
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        sampleRate: 16_000,
      },
    });
    console.log('[Sunny] Sparkle microphone stream acquired:', {
      tracks: inputStream.getAudioTracks().map((track) => ({
        label: track.label,
        enabled: track.enabled,
        muted: track.muted,
        readyState: track.readyState,
        settings: track.getSettings(),
      })),
    });
    inputContext = new AudioContext({ sampleRate: 16_000 });
    console.log('[Sunny] Sparkle microphone AudioContext created:', inputContext.state);
    await inputContext.resume();
    inputAnalyser = inputContext.createAnalyser();
    inputAnalyser.fftSize = 512;
    inputData = new Float32Array(inputAnalyser.fftSize);
    inputContext.createMediaStreamSource(inputStream).connect(inputAnalyser);
    console.log('[Sunny] Sparkle microphone analyser connected:', {
      contextState: inputContext.state,
      fftSize: inputAnalyser.fftSize,
    });
    animateAudio();
  }

  async function prepareModels() {
    if (modelPreparation) return modelPreparation;
    modelPreparation = (async () => {
      status = 'downloading';
      try {
        await loadSystemPrompt();
        if (!speechModel || !transcriptionModel || !languageModel) {
          throw new Error('Voice model components were not initialized.');
        }
        await languageModel.prepare();
        await speechModel.prepare();
        await transcriptionModel.prepare();
        downloadStatus = 'Models ready — you can talk';
        modelsReady = true;
        console.log('[Sunny] Model preparation complete');
        void beginWelcome();
      } catch (error) {
        console.error('[Sunny] Model preparation failed:', error);
        downloadStatus = 'Model download failed — check the console';
        status = 'error';
        throw error;
      }
    })();
    return modelPreparation;
  }

  async function loadConfig() {
    console.log('[Sunny] Loading model config from /api/config/');
    const response = await fetch('/api/config/', { cache: 'no-store' });
    if (!response.ok) {
      throw new Error(`Model config request failed: ${response.status} ${response.statusText}`);
    }
    const loadedConfig = (await response.json()) as AppConfig;
    if (!loadedConfig.models?.transcription || !loadedConfig.models.language || !loadedConfig.models.speech) {
      throw new Error('Model config endpoint returned an incomplete configuration.');
    }
    return loadedConfig;
  }

  async function loadSystemPrompt() {
    console.log('[Sunny] Loading system prompt from /api/prompt/');
    const isLocalhost =
      typeof window !== 'undefined' &&
      (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
    const response = await fetch('/api/prompt/', {
      cache: isLocalhost ? 'no-store' : 'default',
    });
    if (!response.ok) {
      throw new Error(`System prompt request failed: ${response.status} ${response.statusText}`);
    }
    const prompt = (await response.text()).trim();
    if (!prompt) throw new Error('System prompt endpoint returned an empty response.');
    systemPrompt = prompt;
    console.log('[Sunny] System prompt loaded:', { characterCount: prompt.length });
  }

  async function speakSessionOpening() {
    const openingMarker = 'Session Opening Script';
    const closingMarker = 'Session Closing (After Story Consolidation)';
    const openingStart = systemPrompt.indexOf(openingMarker);
    const closingStart = systemPrompt.indexOf(closingMarker);
    hasAnnouncedReady = true;
    if (openingStart < 0 || closingStart <= openingStart) {
      console.warn('[Sunny] System prompt has no session opening script; continuing without an opening announcement');
      return;
    }
    const opening = systemPrompt
      .slice(openingStart + openingMarker.length, closingStart)
      .trim()
      .replace(/^"|"$/g, '');
    console.log('[Sunny] Speaking session opening script');
    await speak(opening);
  }

  async function beginWelcome() {
    if (!modelsReady || welcomePlayed || startingConversation) return;
    startingConversation = true;
    errorMessage = '';
    try {
      await speakSessionOpening();
      welcomePlayed = true;
      if (languageModel) {
        addChatMessage('status', 'Sunny is preparing the local response model.');
        await languageModel.warm();
      }
      await startConversation();
    } catch (error) {
      console.error('[Sunny] Automatic welcome playback failed:', error);
      errorMessage = error instanceof Error ? error.message : 'Unable to play the introductory welcome.';
      addChatMessage(
        'status',
        'The browser blocked automatic audio playback. Press play once to start Sunny.',
      );
      sparkleVisible = false;
      status = 'paused';
    } finally {
      startingConversation = false;
    }
  }

  function updateDownloadProgress(label: string, progress: number) {
    const percent = Math.max(0, Math.min(100, Math.floor(progress)));
    const previous = loggedProgress.get(label) ?? -1;
    if (percent <= previous) return;
    loggedProgress.set(label, percent);
    downloadStatus = `Downloading ${label} model: ${percent}%`;
    if (percent < 100) addChatMessage('status', downloadStatus);
    console.log(`[Sunny] ${label} download: ${percent}%`);
  }

  function modelProgress(label: string, progress: number) {
    downloadingModel = `${label} model`;
    if (progress < 100) activeModelDownload = true;
    updateDownloadProgress(label, progress);
  }

  function modelDownloadState(state: string) {
    downloadStatus = state;
  }

  function markModelDownloaded() {
    downloadingOccurred = true;
  }

  function makeWav(audioData: Float32Array, sampleRate: number) {
    const buffer = new ArrayBuffer(44 + audioData.length * 2);
    const view = new DataView(buffer);
    const write = (offset: number, value: string) => {
      for (let index = 0; index < value.length; index += 1) view.setUint8(offset + index, value.charCodeAt(index));
    };
    write(0, 'RIFF');
    view.setUint32(4, 36 + audioData.length * 2, true);
    write(8, 'WAVE');
    write(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    write(36, 'data');
    view.setUint32(40, audioData.length * 2, true);
    for (let index = 0; index < audioData.length; index += 1) {
      const sample = Math.max(-1, Math.min(1, audioData[index]));
      view.setInt16(44 + index * 2, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
    }
    return new Blob([buffer], { type: 'audio/wav' });
  }

  function keepSessionOpen(reply: string) {
    const normalizedReply = reply.toLowerCase();
    const closingLanguage = [
      'story is complete',
      'session is complete',
      'next step will unlock',
      'your status is synchronized',
    ];
    if (!closingLanguage.some((phrase) => normalizedReply.includes(phrase))) return reply;
    console.warn('[Sunny] Rejected model-generated session closing:', reply);
    return 'What absurd event should happen next in Chad’s story?';
  }

  function transcriptWords(text: string) {
    return text.toLowerCase().match(/[a-z0-9]+(?:['.-][a-z0-9]+)*/g) ?? [];
  }

  function isSuspiciousTranscript(text: string) {
    const words = transcriptWords(text);
    if (!words.length) return false;
    const repeatedWord = words.some((word, index) => word.length > 2 && words[index - 1] === word);
    const unusualCharacters = text.replace(/[\p{L}\p{N}\s'.,!?-]/gu, '').length > 0;
    return repeatedWord || unusualCharacters || (words.length >= 3 && !text.includes(' '));
  }

  function safelyAcceptCorrection(original: string, candidate: string) {
    const cleanedCandidate = candidate.trim().replace(/^["']|["']$/g, '');
    if (!cleanedCandidate) return original;
    const originalWords = transcriptWords(original);
    const candidateWords = transcriptWords(cleanedCandidate);
    if (!originalWords.length || !candidateWords.length) return original;
    if (candidateWords.length > Math.max(originalWords.length + 3, Math.ceil(originalWords.length * 1.5))) {
      return original;
    }
    if (candidateWords.length < Math.max(1, Math.floor(originalWords.length * 0.5))) return original;
    const originalSet = new Set(originalWords);
    const sharedWords = candidateWords.filter((word) => originalSet.has(word)).length;
    if (sharedWords / Math.max(originalSet.size, candidateWords.length) < 0.35) return original;
    return cleanedCandidate;
  }

  async function correctSuspiciousTranscript(text: string) {
    if (!languageModel || !isSuspiciousTranscript(text)) return text;
    const recentContext = conversationContext().split('\n\n').slice(-6).join('\n\n');
    const correctionPrompt = `Correct this speech transcription only when it is clearly misspelled or grammatically malformed.
Return only the corrected transcription, with no explanation. Preserve the user's meaning, wording, and length. If it is already understandable, return it unchanged.
Known vocabulary: ${KNOWN_VOCABULARY.join(', ')}
Recent conversation:
${recentContext || '(none)'}
Transcription:
${text}`;
    try {
      const candidate = await languageModel.generate(correctionPrompt, Math.max(32, text.length));
      const corrected = safelyAcceptCorrection(text, candidate);
      if (corrected !== text) {
        console.log('[Sunny] Accepted local transcript correction:', { original: text, corrected });
      }
      return corrected;
    } catch (error) {
      console.warn('[Sunny] Transcript correction skipped:', error);
      return text;
    }
  }

  async function handleSpeech(audioData: Float32Array, sampleRate: number) {
    if (processing || !conversationActive || status === 'ended') {
      console.debug('[Sunny] Audio segment ignored:', {
        processing,
        conversationActive,
        status,
        samples: audioData.length,
      });
      return;
    }
    console.log('[Sunny] Microphone speech segment received:', {
      samples: audioData.length,
      sampleRate,
      durationSeconds: audioData.length / sampleRate,
    });
    console.log('[Sunny] Listening paused while processing the response');
    processing = true;
    status = 'thinking';
    await stopInputAnalyser();
    try {
      if (!transcriptionModel || !languageModel) {
        throw new Error('Voice model components were not initialized.');
      }
      console.log('[Sunny] Loading/using transcription model:', config?.models.transcription.name);
      console.debug('[Sunny] Starting transcription:', {
        sampleRate,
        samples: audioData.length,
        durationSeconds: audioData.length / sampleRate,
      });
      console.time('[Sunny] Transcription');
      const transcription = await transcriptionModel.transcribeAudio(makeWav(audioData, sampleRate));
      console.timeEnd('[Sunny] Transcription');
      console.log('[Sunny] Transcription result:', transcription);
      const rawText = transcription.text.trim();
      const text = await correctSuspiciousTranscript(rawText);
      console.log('[Sunny] Transcribed text:', {
        raw: rawText,
        corrected: text,
      });
      console.log('[Sunny] Transcription details:', {
        characterCount: text.length,
        sampleRate,
        durationSeconds: audioData.length / sampleRate,
      });
      if (!text) {
        console.log('[Sunny] Empty transcription; skipping LLM and TTS');
        addChatMessage('status', 'I could not make out that message. Please try again.');
        return;
      }
      addChatMessage('user', text);
      if (text.toLowerCase() === 'good night sunny') {
        console.log('Goodbye from Sunny.');
        status = 'ended';
        conversationActive = false;
        return;
      }

      const prompt = `${systemPrompt}

Conversation transcript:
${conversationContext()}

Respond to the latest User message only. Output only the final response; never output private reasoning or <think> tags. In one or two short sentences, acknowledge the story's tone, then encourage a darker sensory or emotional escalation with one direct question. Keep the response concise and complete.
Never end, close, complete, or pause the session yourself. The user ends the session only by saying exactly "good night sunny".
Assistant response:`;
      console.log('[Sunny] LLM request:', { prompt });
      console.log('[Sunny] Loading/using language model:', config?.models.language.name);
      const ttsQueue = createTtsQueue();
      let streamedChunkCount = 0;
      const generation = languageModel.generateStreaming(prompt, undefined, (chunk) => {
        streamedChunkCount += 1;
        ttsQueue.enqueue(chunk);
      });
      const speech = speakGeneratedChunks(ttsQueue);
      try {
        const generatedReply = await generation;
        const reply = keepSessionOpen(generatedReply.trim());
        console.log('[Sunny] Streaming LLM response:', { text: reply });
        if (streamedChunkCount === 0 && reply) {
          console.log('[Sunny] No streamed TTS chunks received; enqueueing complete response');
          ttsQueue.enqueue(reply);
        }
        ttsQueue.finish();
        await speech;
      } catch (error) {
        ttsQueue.fail(error);
        await speech.catch(() => undefined);
        throw error;
      }
    } catch (error) {
      console.error('Voice conversation failed:', error);
      console.error('[Sunny] Pipeline state at failure:', {
        status,
        conversationActive,
      });
      sparkleVisible = false;
      errorMessage = error instanceof Error ? error.message : 'Unable to continue the conversation.';
      addChatMessage('status', errorMessage);
      status = 'error';
    } finally {
      processing = false;
      if (conversationActive && status !== 'ended') {
        void startConversation().catch((error: unknown) => {
          console.error('[Sunny] Failed to restart microphone detection:', error);
          status = 'error';
          conversationActive = false;
        });
      }
    }
  }

  function splitTtsChunks(text: string, maxSentences = 3) {
    const sentences = text.trim().match(/[^.!?]+[.!?]+["']?(?=\s|$)|[^.!?]+$/g) ?? [];
    const chunks: string[] = [];
    for (let index = 0; index < sentences.length; index += maxSentences) {
      const chunk = sentences
        .slice(index, index + maxSentences)
        .join(' ')
        .trim();
      if (chunk) chunks.push(chunk);
    }
    return chunks.length ? chunks : [text.trim()];
  }

  function createTtsQueue() {
    const chunks: string[] = [];
    const waiters: Array<{
      resolve: (result: IteratorResult<string>) => void;
      reject: (error: unknown) => void;
    }> = [];
    let finished = false;
    let failure: unknown;

    return {
      enqueue(chunk: string) {
        const text = chunk.trim();
        if (!text || finished) return;
        const waiter = waiters.shift();
        if (waiter) waiter.resolve({ value: text, done: false });
        else chunks.push(text);
      },
      finish() {
        finished = true;
        while (waiters.length) waiters.shift()?.resolve({ value: undefined, done: true });
      },
      fail(error: unknown) {
        failure = error;
        finished = true;
        while (waiters.length) waiters.shift()?.reject(error);
      },
      next(): Promise<IteratorResult<string>> {
        if (failure !== undefined) return Promise.reject(failure);
        const chunk = chunks.shift();
        if (chunk) return Promise.resolve({ value: chunk, done: false });
        if (finished) return Promise.resolve({ value: undefined, done: true });
        return new Promise((resolve, reject) => waiters.push({ resolve, reject }));
      },
    };
  }

  async function synthesizeSpeechChunk(text: string) {
    console.log('[Sunny] TTS request:', { text });
    console.log('[Sunny] Loading/using speech model:', config?.models.speech.name);
    if (!speechModel) throw new Error('Speech model component was not initialized.');
    console.time('[Sunny] Piper synthesis');
    const audio = await speechModel.synthesize(text);
    console.timeEnd('[Sunny] Piper synthesis');
    console.log('[Sunny] Piper synthesis complete:', {
      characterCount: text.length,
      audioBytes: audio.size,
    });
    return audio;
  }

  async function playSpeechChunk(text: string, audio: Blob, resumeListening: boolean) {
    const url = URL.createObjectURL(audio);
    outputAudio = new Audio(url);
    outputAudio.playbackRate = 0.9;
    outputContext = new AudioContext();
    outputAnalyser = outputContext.createAnalyser();
    outputAnalyser.fftSize = 256;
    outputAnalyser.smoothingTimeConstant = 0;
    outputData = new Float32Array(outputAnalyser.fftSize);
    const source = outputContext.createMediaElementSource(outputAudio);
    source.connect(outputAnalyser);
    outputAnalyser.connect(outputContext.destination);
    outputAudio.onended = () => {
      URL.revokeObjectURL(url);
      outputContext?.close();
      outputContext = undefined;
      outputAnalyser = undefined;
      outputData = undefined;
      status = resumeListening && conversationActive ? 'listening' : 'speaking';
      const resolvePlayback = finishPlayback;
      finishPlayback = undefined;
      resolvePlayback?.();
      if (conversationActive && resumeListening) animateAudio();
    };
    const playbackComplete = new Promise<void>((resolve) => {
      finishPlayback = resolve;
    });
    console.log('[Sunny] Starting TTS playback');
    await outputContext.resume();
    animateAudio();
    await outputAudio.play();
    console.log('[Sunny] TTS playback started');
    await playbackComplete;
    console.log('[Sunny] TTS playback finished; response processing complete');
  }

  async function speak(text: string, resumeListening = true) {
    const chunks = splitTtsChunks(text);
    console.log('[Sunny] TTS message split into chunks:', {
      chunkCount: chunks.length,
      sentenceLimit: 3,
    });
    sparkleVisible = true;
    status = 'speaking';
    console.log('[Sunny] Input listening disabled during TTS synthesis');
    await stopInputAnalyser();
    let nextAudio = synthesizeSpeechChunk(chunks[0]);
    for (let index = 0; index < chunks.length; index += 1) {
      const isLastChunk = index === chunks.length - 1;
      addChatMessage('assistant', chunks[index]);
      await tick();
      const audio = await nextAudio;
      nextAudio = isLastChunk ? Promise.resolve(audio) : synthesizeSpeechChunk(chunks[index + 1]);
      await playSpeechChunk(chunks[index], audio, resumeListening && isLastChunk);
    }
  }

  async function speakGeneratedChunks(queue: ReturnType<typeof createTtsQueue>) {
    sparkleVisible = true;
    status = 'speaking';
    console.log('[Sunny] Input listening disabled during streaming TTS');
    await stopInputAnalyser();
    const first = await queue.next();
    if (first.done) throw new Error('Local language model returned no speakable response.');

    let currentText = first.value;
    let nextAudio = synthesizeSpeechChunk(currentText);
    while (true) {
      addChatMessage('assistant', currentText);
      await tick();
      const audio = await nextAudio;
      const playback = playSpeechChunk(currentText, audio, false);
      const next = await queue.next();
      const upcomingAudio = next.done ? undefined : synthesizeSpeechChunk(next.value);
      await playback;
      if (next.done) return;
      currentText = next.value;
      nextAudio = upcomingAudio!;
    }
  }

  async function startConversation() {
    if (startingConversation) {
      console.warn('[Sunny] Conversation start skipped: startup already in progress');
      return;
    }
    startingConversation = true;
    console.log('[Sunny] Starting conversation and microphone detection');
    errorMessage = '';
    conversationActive = true;
    sparkleVisible = true;
    status = 'listening';
    recordingStartedAt ??= Date.now();
    recordingElapsedMs = Date.now() - recordingStartedAt;
    lastSpeechActivityAt = performance.now();
    if (!recordingTimer) {
      recordingTimer = setInterval(() => {
        if (!recordingStartedAt || !conversationActive) return;
        recordingElapsedMs = Math.min(MAX_RECORDING_MS, Date.now() - recordingStartedAt);
        if (recordingElapsedMs >= MAX_RECORDING_MS) {
          addChatMessage('status', 'Three-minute recording limit reached.');
          stopConversation();
        }
      }, 250);
    }
    try {
      await setupInputAnalyser();
      console.log('[Sunny] Sparkle analyser ready; microphone detection is active');
      animateAudio();
    } catch (error) {
      console.error('[Sunny] Conversation startup failed:', error);
      throw error;
    } finally {
      startingConversation = false;
    }
  }

  function stopConversation(nextStatus: Status = 'paused') {
    conversationActive = false;
    sparkleVisible = false;
    status = nextStatus;
    manualSpeechStartedAt = 0;
    manualSilenceStartedAt = 0;
    manualSpeechSamples = [];
    lastManualCaptureAt = 0;
    if (recordingTimer) {
      clearInterval(recordingTimer);
      recordingTimer = undefined;
    }
    recordingStartedAt = undefined;
    recordingElapsedMs = 0;
    lastSpeechActivityAt = 0;
    const resolvePlayback = finishPlayback;
    finishPlayback = undefined;
    resolvePlayback?.();
    outputAudio?.pause();
    if (outputAudio) outputAudio.onended = null;
    void stopInputAnalyser();
    intensity = 0.18;
  }

  async function toggleConversation() {
    if (!modelsReady || startingConversation) {
      console.debug('[Sunny] Conversation start ignored until models are ready:', {
        modelsReady,
        startingConversation,
      });
      return;
    }
    if (!welcomePlayed) {
      await beginWelcome();
      return;
    }
    if (conversationActive) {
      stopConversation();
      return;
    }
    await startConversation();
  }

  onMount(() => {
    void (async () => {
      config = await loadConfig();
      await tick();
      await prepareModels();
    })().catch((error: unknown) => {
        console.error('Unable to start voice conversation:', error);
        errorMessage = error instanceof Error ? error.message : 'Microphone access is required.';
        addChatMessage('status', errorMessage);
        status = 'error';
        conversationActive = false;
      });
    return () => {
      stopConversation('ended');
      void stopInputAnalyser();
      void outputContext?.close();
    };
  });
</script>

{#if config}
  <TranscriptionModel
    bind:this={transcriptionModel}
    config={config.models.transcription}
    onProgress={(progress) => modelProgress('Transcription', progress)}
    onDownloadStateChange={modelDownloadState}
  />
  <LanguageModel
    bind:this={languageModel}
    config={config.models.language}
    onProgress={(progress) => modelProgress('LLM', progress)}
    onDownloadStateChange={modelDownloadState}
  />
  <SpeechModel
    bind:this={speechModel}
    config={config.models.speech}
    wasmPaths={config.assets}
    onProgress={(progress) => modelProgress('Speech', progress)}
    onDownloadStateChange={modelDownloadState}
    onDownloaded={markModelDownloaded}
  />
{/if}

<main class="session-main">
  <ChatThread messages={chatMessages} status={status} />
  <div
    class:hidden={!sparkleVisible}
    class="sparkle-overlay"
    aria-hidden={!sparkleVisible}
  >
    <Sparkle intensity={intensity} />
  </div>
  {#if conversationActive && status === 'listening'}
    <RecordingStatus progress={recordingProgress} remainingMs={recordingRemainingMs} />
  {/if}
</main>

<footer class="session-footer">
  <AudioControls bind:isPlaying={conversationActive} onToggle={toggleConversation} />
</footer>
