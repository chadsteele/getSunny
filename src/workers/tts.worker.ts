import { TtsSession } from '@realtimex/piper-tts-web';

type InitMessage = {
  type: 'init';
  voiceId: string;
  wasmPaths: {
    onnxWasm: string;
    piperData: string;
    piperWasm: string;
  };
};

type SynthesizeMessage = {
  type: 'synthesize';
  requestId: number;
  text: string;
};

type WorkerMessage = InitMessage | SynthesizeMessage;

let session: TtsSession | undefined;

self.onmessage = async (event: MessageEvent<WorkerMessage>) => {
  const message = event.data;

  if (message.type === 'init') {
    try {
      session = await TtsSession.create({
        voiceId: message.voiceId,
        allowLocalModels: true,
        fallbackStrategy: 'local',
        wasmPaths: message.wasmPaths,
        logger: (logMessage) => console.debug('[Sunny] Piper worker:', logMessage),
      });
      self.postMessage({ type: 'ready' });
    } catch (error) {
      self.postMessage({
        type: 'error',
        error: error instanceof Error ? error.message : 'Piper worker initialization failed.',
      });
    }
    return;
  }

  if (!session) {
    self.postMessage({
      type: 'error',
      requestId: message.requestId,
      error: 'Piper worker session is not ready.',
    });
    return;
  }

  try {
    const audio = await session.predict(message.text);
    self.postMessage({ type: 'result', requestId: message.requestId, audio });
  } catch (error) {
    self.postMessage({
      type: 'error',
      requestId: message.requestId,
      error: error instanceof Error ? error.message : 'Piper worker synthesis failed.',
    });
  }
};
