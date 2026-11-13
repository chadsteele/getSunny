<script lang="ts">
  import { logger as console } from '../lib/logger';

  interface Props {
    active: boolean;
    stream: MediaStream | undefined;
    silenceTimeoutMs: number;
    onRecording: (audio: Blob) => void;
    onError: (error: unknown) => void;
  }

  let { active, stream, silenceTimeoutMs, onRecording, onError }: Props = $props();
  let recorder: MediaRecorder | undefined;
  let heardSpeech = false;
  let lastSpeechAt = 0;
  let startedAt = 0;
  let lastDiagnosticAt = 0;
  let peakLevel = 0;
  const speechThreshold = 0.02;
  const maxRecordingMs = 60_000;

  export function observe(level: number) {
    if (!recorder || recorder.state !== 'recording') return;
    const now = performance.now();
    peakLevel = Math.max(peakLevel, level);
    if (now - lastDiagnosticAt >= 10_000) {
      console.log('[Sunny] Recording microphone levels:', {
        peak: Number(peakLevel.toFixed(4)),
        threshold: speechThreshold,
        speechDetected: heardSpeech,
      });
      lastDiagnosticAt = now;
      peakLevel = 0;
    }
    if (level >= speechThreshold) {
      if (!heardSpeech) console.log('[Sunny] Speech detected; recording until silence');
      heardSpeech = true;
      lastSpeechAt = now;
    }
    if (
      (heardSpeech && now - lastSpeechAt >= silenceTimeoutMs) ||
      now - startedAt >= maxRecordingMs
    ) {
      recorder.stop();
    }
  }

  $effect(() => {
    if (!active || !stream) return;
    const currentStream = stream;
    let cancelled = false;
    let failed = false;
    function startRecording() {
      if (cancelled) return;
      try {
        const chunks: Blob[] = [];
        const mimeType = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find((type) =>
          MediaRecorder.isTypeSupported(type),
        );
        const current = new MediaRecorder(currentStream, mimeType ? { mimeType } : undefined);
        recorder = current;
        heardSpeech = false;
        startedAt = performance.now();
        lastDiagnosticAt = startedAt;
        peakLevel = 0;
        current.ondataavailable = (event) => {
          if (event.data.size) chunks.push(event.data);
        };
        current.onerror = () => {
          failed = true;
          if (!cancelled) onError(new Error('Microphone recording failed.'));
        };
        current.onstop = () => {
          if (recorder === current) recorder = undefined;
          if (cancelled || failed) return;
          if (!heardSpeech) {
            startRecording();
            return;
          }
          const audio = new Blob(chunks, { type: current.mimeType || 'audio/webm' });
          if (!audio.size) {
            onError(new Error('Microphone recording was empty.'));
            return;
          }
          console.log('[Sunny] Recorded speech for transcription:', {
            bytes: audio.size,
            type: audio.type,
          });
          onRecording(audio);
        };
        current.start(250);
        console.log('[Sunny] Microphone recording started:', current.mimeType);
      } catch (error) {
        onError(error);
      }
    }
    startRecording();
    return () => {
      cancelled = true;
      if (recorder?.state === 'recording') recorder.stop();
      recorder = undefined;
    };
  });
</script>
