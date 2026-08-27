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
  return navigator.mediaDevices.getUserMedia({ video: true, audio: false });
}

export async function requestScreen() {
  if (!navigator.mediaDevices?.getDisplayMedia) throw new Error("Seu navegador não suporta compartilhamento de tela.");
  return navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
}
