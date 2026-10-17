// 16-bit mono WAV encoding: the one format every audio backend accepts.

/** Float samples (-1..1, soft-limited) → WAV file bytes. Non-looping sounds get a 5 ms fade against clicks. */
export function encodeWav(a: Float32Array, sampleRate: number, loop = false): Uint8Array {
  const n = a.length,
    b = new Uint8Array(44 + n * 2),
    v = new DataView(b.buffer);
  const w = (o: number, s: string) => {
    for (let i = 0; i < s.length; i++) b[o + i] = s.charCodeAt(i);
  };
  w(0, "RIFF");
  v.setUint32(4, 36 + n * 2, true);
  w(8, "WAVE");
  w(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  w(36, "data");
  v.setUint32(40, n * 2, true);
  // soft limiter, 5 ms fade in/out against clicks
  const fade = loop ? 0 : Math.floor(sampleRate * 0.005);
  for (let i = 0; i < n; i++) {
    let x = Math.tanh(a[i] * 1.2);
    if (i < fade) x *= i / fade;
    if (i > n - fade) x *= (n - i) / fade;
    v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, x)) * 32000, true);
  }
  return b;
}

/** The same as a `data:` URI, for backends that load sounds from URLs. */
export function wavDataUri(a: Float32Array, sampleRate: number, loop = false): string {
  const bytes = encodeWav(a, sampleRate, loop);
  let s = "";
  for (let i = 0; i < bytes.length; i += 8192)
    s += String.fromCharCode.apply(null, bytes.subarray(i, i + 8192) as unknown as number[]);
  return "data:audio/wav;base64," + btoa(s);
}
