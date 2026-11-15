import assert from 'node:assert/strict';
import test, { after, before } from 'node:test';
import { createServer } from 'vite';

let server;
let render;
let VoiceAgent;
let Microphone;
let Speaker;
let Footer;
let outline;

before(async () => {
  server = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom' });
  ({ render } = await server.ssrLoadModule('svelte/server'));
  VoiceAgent = (await server.ssrLoadModule('/src/components/VoiceAgent.svelte')).default;
  Microphone = (await server.ssrLoadModule('/src/components/Microphone.svelte')).default;
  Speaker = (await server.ssrLoadModule('/src/components/Speaker.svelte')).default;
  Footer = (await server.ssrLoadModule('/src/components/Footer.svelte')).default;
  outline = (await server.ssrLoadModule('/src/lib/sessions/outline.ts')).default;
});

after(async () => {
  await server?.close();
});

test('voice controls preserve their labels, state, and footer order', () => {
  const { body } = render(VoiceAgent, { props: { session: outline[0], showingLogs: false } });
  assert.match(body, /class="sparkle-stage/);
  assert.match(body, /aria-label="Conversation"/);
  assert.match(
    body,
    /aria-label="Mute speaker" aria-pressed="false"[\s\S]*class="status-area[\s\S]*Connecting to Sunny[\s\S]*aria-label="Unmute microphone" aria-pressed="true"/,
  );
  assert.doesNotMatch(body, /role="progressbar"/);
});

test('microphone and speaker controls expose both mute states', () => {
  const microphoneProps = {
    active: false,
    canListen: () => false,
    silenceTimeoutMs: 1800,
    onToggle: () => {},
    onStreamChange: () => {},
    onRecording: () => {},
    onError: () => {},
  };
  const speakerProps = {
    onToggle: () => {},
    onVisualizerStart: () => {},
    onVisualizerStop: () => {},
  };
  for (const muted of [false, true]) {
    const mic = render(Microphone, { props: { ...microphoneProps, muted } }).body;
    const speaker = render(Speaker, { props: { ...speakerProps, muted } }).body;
    assert.match(mic, new RegExp(`aria-label="${muted ? 'Unmute' : 'Mute'} microphone"`));
    assert.match(speaker, new RegExp(`aria-label="${muted ? 'Unmute' : 'Mute'} speaker"`));
    assert.match(mic, new RegExp(`aria-pressed="${muted}"`));
    assert.match(speaker, new RegExp(`aria-pressed="${muted}"`));
  }
});

test('progress indicator renders status and the thinking progress bar only when requested', () => {
  const props = {
    title: 'Sunny is thinking...',
    status: 'Working',
    speakerControl: () => {},
    microphoneControl: () => {},
  };
  const visible = render(Footer, { props: { ...props, showProgress: true } }).body;
  assert.match(visible, /role="progressbar" aria-label="Sunny is thinking\.\.\."/);
  assert.match(visible, /aria-valuenow="0"/);
  assert.match(visible, /0% · 1:00 remaining/);
  assert.match(visible, /class="status-area[^"]*" aria-live="polite">Working/);
  const hidden = render(Footer, { props: { ...props, showProgress: false } }).body;
  assert.doesNotMatch(hidden, /role="progressbar"/);
  assert.match(hidden, />Working</);
});
