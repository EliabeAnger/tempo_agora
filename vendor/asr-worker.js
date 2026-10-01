// Tempo Agora PWSIS — reconhecimento de voz no próprio celular (Whisper).
// Roda separado da tela para não travar. Biblioteca e motor ficam dentro do app;
// só o modelo de voz (pesos do Whisper, sem código) é baixado do Hugging Face na primeira vez.
import { pipeline, env } from "./transformers.min.js";
env.allowLocalModels = false;
env.backends.onnx.wasm.wasmPaths = new URL("./", import.meta.url).href;
env.backends.onnx.wasm.numThreads = 1;
let asr = null, loading = null;
function load(model){
  if (asr) return Promise.resolve(asr);
  if (!loading) loading = pipeline("automatic-speech-recognition", model, {
    dtype: "q8", device: "wasm",
    progress_callback: p => { if (p.status === "progress" && p.total) postMessage({ type: "progress", file: p.file, loaded: p.loaded, total: p.total }); }
  }).then(a => (asr = a));
  return loading;
}
onmessage = async e => {
  try {
    if (e.data.type === "load") { await load(e.data.model); postMessage({ type: "ready" }); return; }
    if (e.data.type === "run") {
      const a = await load(e.data.model);
      const r = await a(e.data.audio, { language: "portuguese", task: "transcribe", chunk_length_s: 30 });
      postMessage({ type: "text", text: (r && r.text || "").trim() });
    }
  } catch (err) { postMessage({ type: "error", message: String(err && err.message || err) }); }
};
