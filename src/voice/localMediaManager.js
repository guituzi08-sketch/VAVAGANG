export async function requestMicrophone() {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error("Seu navegador não oferece acesso ao microfone.");
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      autoGainControl: true,
      echoCancellation: true,
      noiseSuppression: true,
    },
    video: false,
  });
  if (!stream.getAudioTracks().length) {
    stream.getTracks().forEach((track) => track.stop());
    throw new Error("O microfone não forneceu uma faixa de áudio.");
  }
  return stream;
}

export function stopMediaStream(stream) {
  stream?.getTracks().forEach((track) => track.stop());
}

export async function requestCamera() {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error("Seu navegador não oferece acesso à câmera.");
  return navigator.mediaDevices.getUserMedia({
    video: {
      width: { ideal: 1280 },
      height: { ideal: 720 },
      frameRate: { ideal: 30, max: 30 },
    },
    audio: false,
  });
}

export async function requestScreen() {
  if (!navigator.mediaDevices?.getDisplayMedia) throw new Error("Seu navegador não suporta compartilhamento de tela.");
  return navigator.mediaDevices.getDisplayMedia({
    video: { frameRate: { ideal: 30, max: 60 } },
    audio: true,
  });
}
