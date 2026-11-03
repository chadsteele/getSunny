<script lang="ts">
  import { onMount } from 'svelte';
  import { recordAudio } from 'vad-web';
  import { streamText, transcribe } from '@localmode/core';
  import {
    isModelCached as isTransformersModelCached,
    preloadModel as preloadTransformersModel,
    transformers,
  } from '@localmode/transformers';
  import { isModelCached as isWebLLMModelCached, preloadModel as preloadWebLLMModel, webllm } from '@localmode/webllm';
  import { download as downloadPiperVoice, stored as storedPiperVoices, TtsSession } from '@realtimex/piper-tts-web';
  import AudioControls from './AudioControls.svelte';
  import Sparkle from './Sparkle.svelte';

  type Status = 'listening' | 'thinking' | 'speaking' | 'paused' | 'ended' | 'error';

  const SYSTEM_PROMPT =
    'You are Sunny, a helpful voice assistant. Answer in one or two short conversational sentences, no more than 35 words.';
  const TRANSCRIPTION_MODEL = 'onnx-community/moonshine-tiny-ONNX';
  const LLM_MODEL = 'Qwen2.5-0.5B-Instruct-q4f16_1-MLC';
  const PIPER_VOICE = 'en_US-libritts_r-medium';
  const PIPER_WASM_PATHS = {
    onnxWasm: '/piper/onnx/',
    piperData: '/piper/phonemize/piper_phonemize.data',
    piperWasm: '/piper/phonemize/piper_phonemize.wasm',
  };
  const SILENCE_THRESHOLD = 0.08;

  let status = $state<Status>('listening');
  let intensity = $state(0.18);
  let conversationActive = $state(true);
  let lastUtterance = $state('');
  let errorMessage = $state('');
  let downloadStatus = $state('Preparing voice models...');
  let downloadProgress = $state(0);
  let isDownloading = $state(true);
  let inputVolume = $state(0);
  let disposeVad: (() => void) | undefined;
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
  let speechStartedAt = 0;
  let silenceStartedAt = 0;
  let forcingSpeechEnd = false;
  let speechEndTimer: ReturnType<typeof setTimeout> | undefined;
  let latestSpeechAudio: Float32Array | undefined;
  let latestSpeechSampleRate = 16_000;
  let flushedSpeechAudio: Float32Array | undefined;
  let flushedSpeechSampleRate = 16_000;
  let startingConversation = false;
  let animationFrameCount = 0;
  let lastMicDebugAt = 0;
  let manualSpeechStartedAt = 0;
  let manualSilenceStartedAt = 0;
  let manualSpeechSamples: number[] = [];
  let lastManualCaptureAt = 0;
  let ignoreVadUntil = 0;
  let llm = webllm.languageModel(LLM_MODEL);
  let transcriber = transformers.speechToText(TRANSCRIPTION_MODEL);
  let speaker: TtsSession | undefined;
  let modelPreparation: Promise<void> | undefined;
  const loggedProgress = new Map<string, number>();

  const statusLabel = $derived(
    status === 'listening'
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
      if (analyser === inputAnalyser) inputVolume = volume;
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
        if (manualSpeechStartedAt && manualSilenceStartedAt && now - manualSilenceStartedAt > 1000) {
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
            ignoreVadUntil = performance.now() + 5000;
            void handleSpeech(audio, sampleRate);
          } else {
            console.warn('[Sunny] Mic fallback discarded a segment that was too short:', audio.length);
          }
        }
      }
      const target = 0.18 + volume * 0.82;
      intensity += (target - intensity) * (volume > intensity ? 0.45 : 0.12);
      if (status === 'listening' && speechStartedAt && !processing) {
        if (volume < SILENCE_THRESHOLD) {
          if (!silenceStartedAt) {
            silenceStartedAt = performance.now();
            console.debug('[Sunny] Silence timer armed:', {
              volumePercent: Math.round(volume * 100),
              thresholdPercent: Math.round(SILENCE_THRESHOLD * 100),
            });
          }
          if (performance.now() - silenceStartedAt > 1000) {
            console.debug('[Sunny] Silence timer elapsed; requesting VAD flush');
            void forceSpeechEnd();
          }
        } else {
          if (silenceStartedAt) console.debug('[Sunny] Silence timer reset by microphone activity');
          silenceStartedAt = 0;
        }
      }
    } else if (status === 'thinking') {
      intensity += (0.32 - intensity) * 0.08;
    }
    if (status !== 'ended' && status !== 'paused' && status !== 'error') {
      animationFrame = requestAnimationFrame(animateAudio);
    }
  }

  async function forceSpeechEnd() {
    if (forcingSpeechEnd) {
      console.debug('[Sunny] VAD flush skipped: flush already in progress');
      return;
    }
    if (!disposeVad) {
      console.warn('[Sunny] VAD flush skipped: no disposer is available');
      return;
    }
    forcingSpeechEnd = true;
    console.warn('[Sunny] RMS fallback ending speech after sustained silence; disposing VAD');
    flushedSpeechAudio = undefined;
    const pendingAudio = latestSpeechAudio;
    const pendingSampleRate = latestSpeechSampleRate;
    console.debug('[Sunny] Cached speech segment:', {
      samples: pendingAudio?.length ?? 0,
      sampleRate: pendingSampleRate,
    });
    const dispose = disposeVad;
    disposeVad = undefined;
    speechStartedAt = 0;
    silenceStartedAt = 0;
    console.debug('[Sunny] Awaiting VAD disposal');
    await dispose();
    console.debug('[Sunny] VAD disposal complete');
    forcingSpeechEnd = false;
    const audioToTranscribe = flushedSpeechAudio ?? pendingAudio;
    const sampleRateToTranscribe = flushedSpeechAudio ? flushedSpeechSampleRate : pendingSampleRate;
    if (audioToTranscribe && conversationActive && status !== 'ended') {
      console.log('[Sunny] Transcribing cached VAD audio after silence fallback');
      await handleSpeech(audioToTranscribe, sampleRateToTranscribe);
      return;
    }
    if (conversationActive && !processing && status !== 'ended') {
      void startConversation().catch((error: unknown) => {
        console.error('[Sunny] Failed to restart VAD:', error);
        status = 'error';
        conversationActive = false;
      });
    }
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
      inputVolume = 0;
      intensity = 0.18;
      animateAudio();
      return;
    }
    if (inputContext && inputContext.state !== 'closed') await inputContext.close();
    inputAnalyser = undefined;
    inputData = undefined;
    console.log('[Sunny] Requesting microphone access for sparkle analyser');
    inputStream = await navigator.mediaDevices.getUserMedia({ audio: true });
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
      isDownloading = true;
      try {
        await preparePiperModel();
        await prepareTransformersModel('Transcription', TRANSCRIPTION_MODEL);
        await prepareWebLLMModel(LLM_MODEL);
        downloadStatus = 'Models ready — you can talk';
        downloadProgress = 100;
        isDownloading = false;
        console.log('[Sunny] Model preparation complete');
      } catch (error) {
        console.error('[Sunny] Model preparation failed:', error);
        downloadStatus = 'Model download failed — check the console';
        isDownloading = false;
        throw error;
      }
    })();
    return modelPreparation;
  }

  async function preparePiperModel() {
    speaker = await TtsSession.create({
      voiceId: PIPER_VOICE,
      allowLocalModels: true,
      fallbackStrategy: 'local',
      wasmPaths: PIPER_WASM_PATHS,
      logger: (message) => console.debug('[Sunny] Piper:', message),
    });
    console.log('[Sunny] Piper session ready:', {
      voice: PIPER_VOICE,
      localWasmPaths: PIPER_WASM_PATHS,
    });

    try {
      const storedVoices = await storedPiperVoices();
      if (storedVoices.includes(PIPER_VOICE)) {
        console.log('[Sunny] Piper voice already cached:', PIPER_VOICE);
        return;
      }

      console.log('[Sunny] Downloading Piper voice:', PIPER_VOICE);
      downloadStatus = 'Downloading Speech model: 0%';
      downloadProgress = 0;
      await downloadPiperVoice(PIPER_VOICE, (progress) => {
        const percent = progress.total
          ? (progress.loaded / progress.total) * 100
          : 0;
        updateDownloadProgress('Speech', percent);
      });
      console.log('[Sunny] Piper voice download complete:', PIPER_VOICE);
    } catch (error) {
      console.warn('[Sunny] Piper voice pre-cache unavailable; using runtime fallback:', error);
    }
  }

  async function prepareTransformersModel(
    label: string,
    modelId: string,
    settings?: { device?: 'webgpu' | 'wasm'; quantized?: boolean; ensureRuntimeFiles?: boolean },
  ) {
    if (!settings?.ensureRuntimeFiles && (await isTransformersModelCached(modelId))) {
      console.log(`[Sunny] ${label} model already cached:`, modelId);
      downloadStatus = `${label} model ready (cached)`;
      downloadProgress = 100;
      return;
    }
    console.log(`[Sunny] Starting ${label} model download:`, modelId);
    downloadStatus = `Downloading ${label} model: 0%`;
    downloadProgress = 0;
    await preloadTransformersModel(modelId, {
      device: settings?.device,
      quantized: settings?.quantized,
      onProgress: (progress) => {
        updateDownloadProgress(label, progress.progress ?? 0);
      },
    });
    updateDownloadProgress(label, 100);
    console.log(`[Sunny] ${label} model download complete:`, modelId);
  }

  async function prepareWebLLMModel(modelId: string) {
    if (await isWebLLMModelCached(modelId)) {
      console.log('[Sunny] WebLLM model already cached:', modelId);
      downloadProgress = 100;
      downloadStatus = 'LLM model ready (cached)';
      return;
    }
    console.log('[Sunny] Starting WebLLM model download:', modelId);
    downloadStatus = 'Downloading LLM model: 0%';
    downloadProgress = 0;
    await preloadWebLLMModel(modelId, {
      onProgress: (progress) => {
        updateDownloadProgress('LLM', progress.progress ?? 0);
      },
    });
    updateDownloadProgress('LLM', 100);
    console.log('[Sunny] WebLLM model download complete:', modelId);
  }

  function updateDownloadProgress(label: string, progress: number) {
    const percent = Math.max(0, Math.min(100, Math.floor(progress)));
    const previous = loggedProgress.get(label) ?? -1;
    if (percent <= previous) return;
    loggedProgress.set(label, percent);
    downloadProgress = percent;
    downloadStatus = `Downloading ${label} model: ${percent}%`;
    console.log(`[Sunny] ${label} download: ${percent}%`);
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
    console.log('[Sunny] VAD audio segment received:', {
      samples: audioData.length,
      sampleRate,
      durationSeconds: audioData.length / sampleRate,
    });
    const activeVad = disposeVad;
    disposeVad = undefined;
    activeVad?.();
    console.log('[Sunny] Listening paused while processing the response');
    processing = true;
    status = 'thinking';
    cancelAnimationFrame(animationFrame);
    try {
      console.log('[Sunny] Loading/using Moonshine STT model:', TRANSCRIPTION_MODEL);
      console.debug('[Sunny] Starting transcription:', {
        sampleRate,
        samples: audioData.length,
        durationSeconds: audioData.length / sampleRate,
      });
      console.time('[Sunny] Moonshine transcription');
      const transcription = await transcribe({
        model: transcriber,
        audio: makeWav(audioData, sampleRate),
      });
      console.timeEnd('[Sunny] Moonshine transcription');
      console.log('[Sunny] Moonshine transcription result:', transcription);
      console.log('[Sunny] Moonshine STT model ready');
      const text = transcription.text.trim();
      lastUtterance = text;
      console.log('[Sunny] Transcribed text:', JSON.stringify(text));
      console.log('[Sunny] Transcription details:', {
        characterCount: text.length,
        sampleRate,
        durationSeconds: audioData.length / sampleRate,
      });
      if (!text) {
        console.log('[Sunny] Empty transcription; skipping LLM and TTS');
        return;
      }
      if (text.toLowerCase() === 'good night sunny') {
        console.log('Goodbye from Sunny.');
        status = 'ended';
        conversationActive = false;
        return;
      }

      const prompt = `${SYSTEM_PROMPT}\n\nUser: ${text}`;
      console.log('[Sunny] LLM request:', { prompt });
      console.log('[Sunny] Loading/using WebLLM model:', LLM_MODEL);
      const response = await streamText({
        model: llm,
        prompt,
        maxTokens: 48,
      });
      let reply = '';
      for await (const chunk of response.stream) reply += chunk.text;
      console.log('[Sunny] WebLLM model ready');
      console.log('[Sunny] LLM response:', { text: reply });
      await speak(reply);
      // await speak(reply, false);
      // if (conversationActive) await speak("Okay. I'm listening");
    } catch (error) {
      console.error('Voice conversation failed:', error);
      console.error('[Sunny] Pipeline state at failure:', {
        status,
        hasSpeechAudio: Boolean(latestSpeechAudio),
        conversationActive,
      });
      errorMessage = error instanceof Error ? error.message : 'Unable to continue the conversation.';
      status = 'error';
    } finally {
      processing = false;
      if (conversationActive && status !== 'ended' && !disposeVad) {
        void startConversation().catch((error: unknown) => {
          console.error('[Sunny] Failed to restart VAD:', error);
          status = 'error';
          conversationActive = false;
        });
      }
    }
  }

  async function speak(text: string, resumeListening = true) {
    console.log('[Sunny] TTS request:', { text });
    console.log('[Sunny] Loading/using Piper TTS model:', PIPER_VOICE);
    status = 'speaking';
    console.log('[Sunny] Input listening disabled during TTS synthesis');
    if (!speaker) throw new Error('Piper TTS session is not ready.');
    console.time('[Sunny] Piper synthesis');
    const audio = await speaker.predict(text);
    console.timeEnd('[Sunny] Piper synthesis');
    console.log('[Sunny] Piper synthesis complete:', {
      characterCount: text.length,
      audioBytes: audio.size,
    });
    const url = URL.createObjectURL(audio);
    outputAudio = new Audio(url);
    outputContext = new AudioContext();
    outputAnalyser = outputContext.createAnalyser();
    outputAnalyser.fftSize = 512;
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
      status = resumeListening && conversationActive ? 'listening' : conversationActive ? 'speaking' : 'paused';
      const resolvePlayback = finishPlayback;
      finishPlayback = undefined;
      resolvePlayback?.();
      if (conversationActive && resumeListening) animateAudio();
    };
    animateAudio();
    const playbackComplete = new Promise<void>((resolve) => {
      finishPlayback = resolve;
    });
    console.log('[Sunny] Starting TTS playback');
    await outputAudio.play();
    console.log('[Sunny] TTS playback started');
    await playbackComplete;
    console.log('[Sunny] TTS playback finished; response processing complete');
  }

  async function startConversation() {
    if (startingConversation) {
      console.warn('[Sunny] Conversation start skipped: startup already in progress');
      return;
    }
    startingConversation = true;
    console.log('[Sunny] Starting conversation and VAD; vad-web will initialize Silero in its worker');
    errorMessage = '';
    conversationActive = true;
    status = 'listening';
    try {
      await setupInputAnalyser();
      console.log('[Sunny] Sparkle analyser ready; starting vad-web recorder');
      disposeVad = await recordAudio({
      onSpeechStart: () => {
        console.log('[Sunny] VAD speech started');
        if (speechEndTimer) clearTimeout(speechEndTimer);
        latestSpeechAudio = undefined;
      },
      onSpeechEnd: () => {
        console.log('[Sunny] VAD speech ended; manual microphone detector owns transcription');
      },
      onSpeechOngoing: ({ audioData, sampleRate }) => {
        latestSpeechAudio = audioData.slice();
        latestSpeechSampleRate = sampleRate;
        console.log('[Sunny] VAD speech ongoing:', {
          durationSeconds: audioData.length / sampleRate,
        });
      },
      onSpeechAvailable: ({ audioData, sampleRate }) => {
        if (speechEndTimer) clearTimeout(speechEndTimer);
        ignoreVadUntil = 0;
        console.log('[Sunny] Ignoring VAD audio segment; manual microphone detector is authoritative:', {
          samples: audioData.length,
          sampleRate,
          durationSeconds: audioData.length / sampleRate,
        });
      },
      });
      console.log('[Sunny] VAD recorder is ready; Silero worker initialization has started');
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
    status = nextStatus;
    manualSpeechStartedAt = 0;
    manualSilenceStartedAt = 0;
    manualSpeechSamples = [];
    lastManualCaptureAt = 0;
    disposeVad?.();
    disposeVad = undefined;
    const resolvePlayback = finishPlayback;
    finishPlayback = undefined;
    resolvePlayback?.();
    outputAudio?.pause();
    if (outputAudio) outputAudio.onended = null;
    void inputContext?.suspend();
    cancelAnimationFrame(animationFrame);
    intensity = 0.18;
  }

  async function toggleConversation() {
    if (conversationActive) {
      stopConversation();
      return;
    }
    await startConversation();
  }

  onMount(() => {
    void prepareModels().then(() => startConversation()).catch((error: unknown) => {
      console.error('Unable to start voice conversation:', error);
      errorMessage = error instanceof Error ? error.message : 'Microphone access is required.';
      status = 'error';
      conversationActive = false;
    });
    return () => {
      stopConversation('ended');
      inputStream?.getTracks().forEach((track) => track.stop());
      void inputContext?.close();
      void outputContext?.close();
    };
  });
</script>

<main class="session-main">
  <p class="eyebrow">{statusLabel}</p>
  {#if isDownloading && downloadProgress < 100}
    <div class="download-status" aria-live="polite">
      <span class="download-label">{downloadStatus}</span>
      <div class="download-track" role="progressbar" aria-label={downloadStatus} aria-valuemin="0" aria-valuemax="100" aria-valuenow={downloadProgress}>
        <span style={`width: ${downloadProgress}%`}></span>
      </div>
    </div>
  {/if}
  <Sparkle intensity={status === 'ended' ? 0 : intensity} isPlaying={status !== 'ended' && status !== 'paused'} />
  <p class="volume-status">
    Mic volume {Math.round(inputVolume * 100)}% · silence threshold {Math.round(SILENCE_THRESHOLD * 100)}%
  </p>
</main>

<footer class="session-footer">
  <div class="prompt">
    <span class="prompt-kicker">{lastUtterance || 'Take a breath...'}</span>
    <span class="prompt-title">{errorMessage || 'Let’s do this!'}</span>
  </div>
  <AudioControls bind:isPlaying={conversationActive} onToggle={toggleConversation} />
</footer>
