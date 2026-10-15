import assert from "node:assert/strict";
import test from "node:test";

const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");

async function withMediaDevices(mediaDevices, run) {
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: { mediaDevices },
  });
  try {
    await run();
  } finally {
    if (originalNavigator) Object.defineProperty(globalThis, "navigator", originalNavigator);
    else delete globalThis.navigator;
  }
}

test("solicita microfone com processamento de voz e valida a faixa", async () => {
  const { requestMicrophone } = await import("./localMediaManager.js");
  const audioTrack = { kind: "audio" };
  const stream = { getAudioTracks: () => [audioTrack] };
  await withMediaDevices({
    getUserMedia: async (constraints) => {
      assert.equal(constraints.audio.echoCancellation, true);
      assert.equal(constraints.audio.noiseSuppression, true);
      assert.equal(constraints.audio.autoGainControl, true);
      assert.equal(constraints.video, false);
      return stream;
    },
  }, async () => assert.strictEqual(await requestMicrophone(), stream));
});

test("limita a webcam a 720p e 30 fps", async () => {
  const { requestCamera } = await import("./localMediaManager.js");
  const stream = { getVideoTracks: () => [{ kind: "video" }] };
  await withMediaDevices({
    getUserMedia: async (constraints) => {
      assert.equal(constraints.video.width.ideal, 1280);
      assert.equal(constraints.video.height.ideal, 720);
      assert.equal(constraints.video.frameRate.max, 30);
      assert.equal(constraints.audio, false);
      return stream;
    },
  }, async () => assert.strictEqual(await requestCamera(), stream));
});

test("solicita compartilhamento com áudio e taxa de quadros limitada", async () => {
  const { requestScreen } = await import("./localMediaManager.js");
  const stream = { getVideoTracks: () => [{ kind: "video" }] };
  await withMediaDevices({
    getDisplayMedia: async (constraints) => {
      assert.equal(constraints.video.frameRate.ideal, 30);
      assert.equal(constraints.video.frameRate.max, 60);
      assert.equal(constraints.audio, true);
      return stream;
    },
  }, async () => assert.strictEqual(await requestScreen(), stream));
});

test("encerra tracks quando o microfone não fornece áudio", async () => {
  const { requestMicrophone } = await import("./localMediaManager.js");
  let stopped = false;
  const stream = {
    getAudioTracks: () => [],
    getTracks: () => [{ stop: () => { stopped = true; } }],
  };
  await withMediaDevices({ getUserMedia: async () => stream }, async () => {
    await assert.rejects(requestMicrophone(), /faixa de áudio/);
    assert.equal(stopped, true);
  });
});