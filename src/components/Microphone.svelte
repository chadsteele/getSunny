<script lang="ts">
  import { onMount } from 'svelte';
  import AudioControl from './AudioControl.svelte';
  import SpeechToText from './SpeechToText.svelte';

  interface Props {
    muted: boolean;
    active: boolean;
    canListen: () => boolean;
    silenceTimeoutMs: number;
    onToggle: () => void | Promise<void>;
    onStreamChange: (stream: MediaStream | undefined) => void;
    onRecording: (audio: Blob) => void;
    onError: (error: unknown) => void;
  }

  let {
    muted,
    active,
    canListen,
    silenceTimeoutMs,
    onToggle,
    onStreamChange,
    onRecording,
    onError,
  }: Props = $props();
  let stream = $state<MediaStream | undefined>();
  let speechToText: SpeechToText;
  let version = 0;

  export function stop() {
    version += 1;
    stream?.getTracks().forEach((track) => track.stop());
    stream = undefined;
    onStreamChange(undefined);
  }

  export async function start() {
    if (!canListen() || stream) return;
    const requestVersion = ++version;
    try {
      const current = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      if (requestVersion !== version || !canListen()) {
        current.getTracks().forEach((track) => track.stop());
        return;
      }
      stream = current;
      onStreamChange(current);
    } catch (error) {
      if (requestVersion === version) onError(error);
    }
  }

  export function observe(level: number) {
    speechToText?.observe(level);
  }

  onMount(() => stop);
</script>

<SpeechToText
  bind:this={speechToText}
  {active}
  {stream}
  {silenceTimeoutMs}
  {onRecording}
  {onError}
/>
<AudioControl {muted} label={muted ? 'Unmute microphone' : 'Mute microphone'} onclick={onToggle}>
  <path d="M12 14a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v5a3 3 0 0 0 3 3Z" />
  <path d="M5 11a7 7 0 0 0 14 0M12 18v3M8 21h8" />
  {#if muted}<path class="slash" d="m4 4 16 16" />{/if}
</AudioControl>
