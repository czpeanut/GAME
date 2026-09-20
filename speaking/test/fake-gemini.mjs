// A stand-in for the Gemini API, so the browser test can drive the real
// server's real request handling without a key and without cost.
//
// It implements the two shapes the server talks to: the streaming TTS
// endpoint (server-sent events carrying base64 audio deltas) and the older
// buffered one. Point the server at it with GEMINI_BASE and
// GEMINI_INTERACTIONS.

import { createServer } from 'node:http';

// A speech-shaped clip: bursts of tone with near-silence between them, so the
// mouth has something to follow and something to close on.
//
// The timing matters. Mandarin runs 5-6 syllables a second - about 110ms of
// voicing and then a 70ms gap - and a mouth that cannot shut inside that gap
// hangs open across a whole phrase. The clip used to be 400ms bursts with
// 200ms of silence, which any mouth can follow and which therefore proved
// nothing. The amplitudes vary so the wide-open shape has to be earned.
const SPEECH_PATTERN = [[0.09, 0.001]];
[0.6, 0.85, 0.35, 0.75, 0.3, 0.7].forEach((amplitude) => {
  SPEECH_PATTERN.push([0.11, amplitude], [0.07, 0.006]);
});
SPEECH_PATTERN.push([0.2, 0.001]);

export function speechPcm({ rate = 24000, pattern } = {}) {
  const shape = pattern ?? SPEECH_PATTERN;
  const frames = Math.round(shape.reduce((sum, [s]) => sum + s, 0) * rate);
  const pcm = Buffer.alloc(frames * 2);
  let at = 0;
  for (const [seconds, amplitude] of shape) {
    const length = Math.round(seconds * rate);
    for (let i = 0; i < length && at < frames; i++, at++) {
      const value = amplitude * Math.sin((2 * Math.PI * 220 * at) / rate);
      pcm.writeInt16LE(Math.round(value * 32767), at * 2);
    }
  }
  return pcm;
}

export function startFakeGemini({ chunks = 6, chunkDelayMs = 30, answer = '' } = {}) {
  const calls = { interactions: 0, generateContent: 0, ttsTexts: [] };

  const server = createServer(async (req, res) => {
    let body = '';
    for await (const part of req) body += part;
    const parsed = body ? JSON.parse(body) : {};

    if (req.url.startsWith('/v1beta/interactions')) {
      calls.interactions++;
      calls.ttsTexts.push(parsed.input);
      if (process.env.FAKE_GEMINI_NO_STREAM === '1') {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: { message: 'model not available' } }));
      }

      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' });
      const pcm = speechPcm();
      const size = Math.ceil(pcm.length / chunks);
      for (let i = 0; i < chunks; i++) {
        const slice = pcm.subarray(i * size, (i + 1) * size);
        if (!slice.length) break;
        const payload = JSON.stringify({
          index: i,
          event_type: 'step.delta',
          delta: { type: 'audio', data: slice.toString('base64') },
        });
        res.write(`event: step.delta\ndata: ${payload}\n\n`);
        await new Promise((r) => setTimeout(r, chunkDelayMs));
      }
      return res.end();
    }

    if (req.url.includes(':generateContent')) {
      calls.generateContent++;
      if (req.url.includes('tts')) {
        calls.ttsTexts.push(parsed.contents?.[0]?.parts?.[0]?.text);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({
          candidates: [{
            content: {
              parts: [{
                inlineData: {
                  mimeType: 'audio/L16;codec=pcm;rate=24000',
                  data: speechPcm().toString('base64'),
                },
              }],
            },
          }],
        }));
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ candidates: [{ content: { parts: [{ text: answer }] } }] }));
    }

    res.writeHead(404).end('{}');
  });

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({
        port,
        calls,
        base: `http://127.0.0.1:${port}/v1beta/models`,
        interactions: `http://127.0.0.1:${port}/v1beta/interactions`,
        stop: () => new Promise((r) => server.close(r)),
      });
    });
  });
}
