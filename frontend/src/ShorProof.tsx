import { useState, type ChangeEvent, type CSSProperties } from "react";

type AudioKind = "quiet" | "noisy";

const LANGUAGES = [
  { code: "bn-IN", name: "Bengali" },
  { code: "en-IN", name: "English (India)" },
  { code: "gu-IN", name: "Gujarati" },
  { code: "hi-IN", name: "Hindi" },
  { code: "kn-IN", name: "Kannada" },
  { code: "ml-IN", name: "Malayalam" },
  { code: "mr-IN", name: "Marathi" },
  { code: "pa-IN", name: "Punjabi" },
  { code: "ta-IN", name: "Tamil" },
  { code: "te-IN", name: "Telugu" },
];

const styles: Record<string, CSSProperties> = {
  page: {
    color: "#172033",
    width: "100%",
    maxWidth: 1100,
    margin: "0 auto",
    padding: "24px 16px 40px",
    boxSizing: "border-box",
    fontFamily: "Arial, sans-serif",
  },
  heading: { fontSize: 30, margin: "0 0 8px", fontWeight: 750 },
  subtitle: { color: "#64748b", lineHeight: 1.6, margin: "0 0 24px" },
  banner: {
    background: "#eff6ff",
    border: "1px solid #bfdbfe",
    borderRadius: 12,
    padding: 16,
    lineHeight: 1.6,
    marginBottom: 22,
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 290px), 1fr))",
    gap: 18,
  },
  card: {
    border: "1px solid #e2e8f0",
    borderRadius: 16,
    padding: 20,
    background: "#ffffff",
    minWidth: 0,
    boxSizing: "border-box",
  },
  cardTitle: { fontSize: 19, fontWeight: 700, margin: "0 0 8px" },
  description: { color: "#64748b", lineHeight: 1.55, fontSize: 14 },
  upload: {
    display: "block",
    border: "1px dashed #94a3b8",
    borderRadius: 12,
    padding: 16,
    marginTop: 16,
    background: "#f8fafc",
  },
  label: {
    display: "block",
    fontSize: 14,
    fontWeight: 650,
    margin: "16px 0 7px",
  },
  input: {
    width: "100%",
    boxSizing: "border-box",
    padding: "11px 12px",
    border: "1px solid #cbd5e1",
    borderRadius: 9,
    background: "#ffffff",
    color: "#172033",
    fontSize: 14,
  },
  textarea: {
    width: "100%",
    minHeight: 120,
    resize: "vertical",
    boxSizing: "border-box",
    padding: 12,
    border: "1px solid #cbd5e1",
    borderRadius: 9,
    fontFamily: "inherit",
    fontSize: 14,
    lineHeight: 1.6,
  },
  button: {
    border: 0,
    borderRadius: 10,
    padding: "12px 17px",
    fontWeight: 700,
    fontSize: 14,
    cursor: "pointer",
  },
  primary: { background: "#0f766e", color: "#ffffff" },
  secondary: {
    background: "#ffffff",
    color: "#334155",
    border: "1px solid #cbd5e1",
  },
  resultGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
    gap: 12,
    marginTop: 18,
  },
  metric: {
    border: "1px solid #e2e8f0",
    background: "#f8fafc",
    borderRadius: 12,
    padding: 16,
  },
  metricName: { fontSize: 13, color: "#64748b", marginBottom: 8 },
  metricValue: { fontSize: 20, fontWeight: 750 },
  footerNote: { color: "#64748b", fontSize: 12, lineHeight: 1.6 },
};

export default function ShorProof() {
  const [language, setLanguage] = useState("hi-IN");
  const [quietAudio, setQuietAudio] = useState<File | null>(null);
  const [noisyAudio, setNoisyAudio] = useState<File | null>(null);
  const [referenceText, setReferenceText] = useState("");
  const [message, setMessage] = useState(
    "Add the required files and reference transcript to prepare a test."
  );
  const [loading, setLoading] = useState(false);
const [result, setResult] = useState<Record<string, unknown> | null>(null);
const [error, setError] = useState("");

  function handleFileChange(
    kind: AudioKind,
    event: ChangeEvent<HTMLInputElement>
  ) {
    const file = event.target.files?.[0] ?? null;

    if (file && !file.type.startsWith("audio/")) {
      setMessage("Please choose a supported audio file.");
      event.target.value = "";
      return;
    }

    if (kind === "quiet") {
      setQuietAudio(file);
    } else {
      setNoisyAudio(file);
    }

    setMessage(
      file
        ? `${kind === "quiet" ? "Quiet" : "Noisy"} audio selected.`
        : "File selection cleared."
    );
  }

  async function runComparison() {
  if (!quietAudio || !noisyAudio) {
    setError("Please upload both quiet and noisy audio files.");
    setMessage("");
    return;
  }

  if (!referenceText.trim()) {
    setError("Please enter the reference transcript first.");
    setMessage("");
    return;
  }

  setLoading(true);
  setError("");
  setResult(null);
  setMessage("Uploading audio and waiting for the backend...");

  try {
    const formData = new FormData();
    formData.append("quiet_audio", quietAudio);
    formData.append("noisy_audio", noisyAudio);
    formData.append("language_code", language);
    formData.append("reference_transcript", referenceText.trim());

    const response = await fetch(
      "https://jalvaani.onrender.com/api/shorproof/compare",
      {
        method: "POST",
        body: formData,
        signal: AbortSignal.timeout(120000),
      }
    );

    const body = await response.text();

    let data: Record<string, unknown>;
    try {
      data = JSON.parse(body) as Record<string, unknown>;
    } catch {
      throw new Error(
        `The server returned an unexpected response (HTTP ${response.status}).`
      );
    }

    if (!response.ok) {
      throw new Error(
        String(data.detail ?? data.message ?? data.error ??
          `Request failed: HTTP ${response.status}`)
      );
    }

    setResult(data);
    setMessage("The backend returned a response successfully.");
  } catch (err) {
    setError(
      err instanceof Error
        ? err.message
        : "An unexpected error occurred."
    );
    setMessage("");
  } finally {
    setLoading(false);
  }
}

  function resetForm() {
    setLanguage("hi-IN");
    setQuietAudio(null);
    setNoisyAudio(null);
    setReferenceText("");
    setMessage("Add the required files and reference transcript to prepare a test.");
    setLoading(false);
setResult(null);
setError("");

    const inputs = document.querySelectorAll<HTMLInputElement>(
      ".shorproof-audio-input"
    );
    inputs.forEach((input) => {
      input.value = "";
    });
  }

  return (
    <main style={styles.page}>
      <header>
        <div style={{ color: "#0f766e", fontWeight: 750, marginBottom: 8 }}>
          JALVAANI / SHORPROOF
        </div>
        <h1 style={styles.heading}>Noise-Robustness Testing</h1>
        <p style={styles.subtitle}>
          Prepare a controlled comparison to investigate how background noise
          affects speech transcription.
        </p>
      </header>

      <section style={styles.banner} aria-live="polite">
  <strong>
    Integration status: {result ? "Response received" : loading ? "Processing" : error ? "Request failed" : "Ready to test"}
  </strong>
  <div>{message}</div>
  {error && (
    <p style={{ color: "#b91c1c" }}>
      <strong>Error:</strong> {error}
    </p>
  )}
</section>

      <section style={styles.card}>
        <h2 style={styles.cardTitle}>Test configuration</h2>

        <label htmlFor="shorproof-language" style={styles.label}>
          Speech language
        </label>
        <select
          id="shorproof-language"
          style={styles.input}
          value={language}
          onChange={(event) => setLanguage(event.target.value)}
        >
          {LANGUAGES.map((item) => (
            <option key={item.code} value={item.code}>
              {item.name} ({item.code})
            </option>
          ))}
        </select>

        <label htmlFor="shorproof-reference" style={styles.label}>
          Reference transcript
        </label>
        <textarea
          id="shorproof-reference"
          style={styles.textarea}
          value={referenceText}
          onChange={(event) => setReferenceText(event.target.value)}
          placeholder="Enter exactly what was spoken in the recording..."
        />
        <p style={styles.footerNote}>
          The reference transcript is the text used to compare against actual
          speech-recognition output. Check it carefully before evaluating results.
        </p>
      </section>

      <div style={{ height: 18 }} />

      <section style={styles.grid}>
        <article style={styles.card}>
          <h2 style={styles.cardTitle}>1. Quiet-condition audio</h2>
          <p style={styles.description}>
            Select a recording captured in a relatively quiet environment.
          </p>

          <label style={styles.upload} htmlFor="shorproof-quiet-file">
            <strong>Choose quiet audio</strong>
            <div style={styles.description}>Select an audio file from your device.</div>
            <input
              className="shorproof-audio-input"
              id="shorproof-quiet-file"
              type="file"
              accept="audio/*"
              style={{ ...styles.input, marginTop: 12 }}
              onChange={(event) => handleFileChange("quiet", event)}
            />
          </label>

          {quietAudio && (
            <p style={{ overflowWrap: "anywhere", fontSize: 13 }}>
              <strong>Selected:</strong> {quietAudio.name}
              <br />
              <strong>Size:</strong> {(quietAudio.size / 1024).toFixed(1)} KB
              <br />
              <strong>Format:</strong> {quietAudio.type || "Not reported"}
            </p>
          )}
        </article>

        <article style={styles.card}>
          <h2 style={styles.cardTitle}>2. Noisy-condition audio</h2>
          <p style={styles.description}>
            Select the corresponding recording captured with background noise.
            Use the same spoken content where possible.
          </p>

          <label style={styles.upload} htmlFor="shorproof-noisy-file">
            <strong>Choose noisy audio</strong>
            <div style={styles.description}>Select an audio file from your device.</div>
            <input
              className="shorproof-audio-input"
              id="shorproof-noisy-file"
              type="file"
              accept="audio/*"
              style={{ ...styles.input, marginTop: 12 }}
              onChange={(event) => handleFileChange("noisy", event)}
            />
          </label>

          {noisyAudio && (
            <p style={{ overflowWrap: "anywhere", fontSize: 13 }}>
              <strong>Selected:</strong> {noisyAudio.name}
              <br />
              <strong>Size:</strong> {(noisyAudio.size / 1024).toFixed(1)} KB
              <br />
              <strong>Format:</strong> {noisyAudio.type || "Not reported"}
            </p>
          )}
        </article>
      </section>

      <section style={{ ...styles.card, marginTop: 18 }}>
        <h2 style={styles.cardTitle}>3. Comparison results</h2>
        <p style={styles.description}>
          These metrics will be populated only after the backend processes both
          audio files and returns verifiable results.
        </p>

        <div style={styles.resultGrid}>
  {([
  ["Quiet WER", result?.quiet_wer],
  ["Noisy WER", result?.noisy_wer],
  ["Character Error Rate", result?.cer ?? result?.overall_cer],
  ["Latency", result?.latency_ms ?? result?.latency],
] as [string, unknown][]).map(([name, value]) => (
    <div key={String(name)} style={styles.metric}>
      <div style={styles.metricName}>{String(name)}</div>
      <div style={styles.metricValue}>
        {value === undefined || value === null
          ? "Not returned"
          : typeof value === "number"
            ? `${value}${String(name) === "Latency" ? " ms" : ""}`
            : String(value)}
      </div>
    </div>
  ))}
</div>

{result && (
  <details style={{ marginTop: 16 }}>
    <summary>View complete backend response</summary>
    <pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
      {JSON.stringify(result, null, 2)}
    </pre>
  </details>
)}

        <p role="status" aria-live="polite" style={{ lineHeight: 1.6 }}>
          {message}
        </p>

        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 10,
            marginTop: 16,
          }}
        >
          <button
  type="button"
  style={{
    ...styles.button,
    ...styles.primary,
    opacity: loading ? 0.7 : 1,
  }}
  onClick={runComparison}
  disabled={loading}
>
  {loading ? "Comparing audio..." : "Compare audio"}
</button>
          <button
            type="button"
            style={{ ...styles.button, ...styles.secondary }}
            onClick={resetForm}
          >
            Reset
          </button>
        </div>

        <p style={{ ...styles.footerNote, marginTop: 18 }}>
          Note: Selecting files does not upload them. This version does not send
          audio to the backend, calculate metrics, or save a test report.
        </p>
      </section>
    </main>
  );
}