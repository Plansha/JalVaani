import { useEffect, useRef, useState } from 'react'

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || 'https://jalvaani.onrender.com'

type Language = { code: string; name: string }
type Recording = {
  id: string
  name: string
  date: string
  blob: Blob
  url: string
}
type Story = {
  id: string
  title: string
  language: string
  text: string
  date: string
}

const DB_NAME = 'jalvaani-local-db'
const STORE_NAME = 'recordings'

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1)

    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME, {
          keyPath: 'id',
        })
      }
    }

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function saveRecording(item: Recording) {
  const db = await openDatabase()

  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    tx.objectStore(STORE_NAME).put({
      id: item.id,
      name: item.name,
      date: item.date,
      blob: item.blob,
    })

    tx.oncomplete = () => {
      db.close()
      resolve()
    }

    tx.onerror = () => {
      db.close()
      reject(tx.error)
    }
  })
}

async function loadRecordings(): Promise<Array<Omit<Recording, 'url'>>> {
  const db = await openDatabase()

  return new Promise((resolve, reject) => {
    const request = db
      .transaction(STORE_NAME, 'readonly')
      .objectStore(STORE_NAME)
      .getAll()

    request.onsuccess = () => {
      db.close()
      resolve(request.result)
    }

    request.onerror = () => {
      db.close()
      reject(request.error)
    }
  })
}

async function removeStoredRecording(id: string) {
  const db = await openDatabase()

  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    tx.objectStore(STORE_NAME).delete(id)

    tx.oncomplete = () => {
      db.close()
      resolve()
    }

    tx.onerror = () => {
      db.close()
      reject(tx.error)
    }
  })
}

function getStories(): Story[] {
  try {
    return JSON.parse(
      localStorage.getItem('jalvaani-stories') || '[]',
    )
  } catch {
    return []
  }
}

const fallbackLanguages: Language[] = [
  { code: 'bn-IN', name: 'Bengali' },
  { code: 'en-IN', name: 'English (India)' },
  { code: 'gu-IN', name: 'Gujarati' },
  { code: 'hi-IN', name: 'Hindi' },
  { code: 'kn-IN', name: 'Kannada' },
  { code: 'ml-IN', name: 'Malayalam' },
  { code: 'mr-IN', name: 'Marathi' },
  { code: 'pa-IN', name: 'Punjabi' },
  { code: 'ta-IN', name: 'Tamil' },
  { code: 'te-IN', name: 'Telugu' },
]
function App() {
  const [languages, setLanguages] =
    useState<Language[]>(fallbackLanguages)
  const [language, setLanguage] = useState('hi-IN')
  const [recordings, setRecordings] = useState<Recording[]>([])
  const [isRecording, setIsRecording] = useState(false)
  const [isOnline, setIsOnline] = useState(navigator.onLine)
  const [, setQueueCount] = useState(0)
  const [status, setStatus] = useState('Ready to capture your voice.')
  const [error, setError] = useState('')
  const [activeTab, setActiveTab] = useState('dashboard')
  const [transcript, setTranscript] = useState('')
  const [transcriptTitle, setTranscriptTitle] = useState('')
  const [stories, setStories] = useState<Story[]>(getStories)
  const [storyTitle, setStoryTitle] = useState('')
  const [storyText, setStoryText] = useState('')
  const [storyLanguage, setStoryLanguage] = useState('hi-IN')
  const [consent, setConsent] = useState(false)
  
 const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<Blob[]>([])

  useEffect(() => {
    const updateConnection = () => setIsOnline(navigator.onLine)

    window.addEventListener('online', updateConnection)
    window.addEventListener('offline', updateConnection)

    return () => {
      window.removeEventListener('online', updateConnection)
      window.removeEventListener('offline', updateConnection)
      streamRef.current?.getTracks().forEach((track) => track.stop())
      recordings.forEach((item) => URL.revokeObjectURL(item.url))
    }
  }, [])

  useEffect(() => {
    async function initialise() {
      try {
        const saved = await loadRecordings()
        const restored: Recording[] = saved.map((item) => ({
          ...item,
          url: URL.createObjectURL(item.blob),
        }))
        setRecordings(restored)
        setQueueCount(restored.length)
      } catch {
        setError('Local audio storage is unavailable in this browser.')
      }
    }

    void initialise()
  }, [])

  useEffect(() => {
    async function fetchLanguages() {
      try {
        const response = await fetch(`${API_BASE_URL}/api/languages`)
        if (!response.ok) throw new Error('Language service unavailable')

        const data = await response.json()
        const list = Array.isArray(data)
          ? data
          : data.languages ?? data.data ?? []

        if (Array.isArray(list) && list.length > 0) {
          const normalised = list.map((item: any) => ({
            code: item.code ?? item.language_code ?? item.id,
            name: item.name ?? item.language ?? item.label,
          }))

          setLanguages(
            normalised.filter(
              (item: Language) => item.code && item.name,
            ),
          )
        }
      } catch {
        setStatus('Using available languages. Check your connection for updates.')
      }
    }

    void fetchLanguages()
  }, [])

  async function startRecording() {
    setError('')

    if (!navigator.mediaDevices?.getUserMedia) {
      setError('Audio recording is not supported in this browser.')
      return
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
      })

      streamRef.current = stream
      chunksRef.current = []

      const recorder = new MediaRecorder(stream)
      mediaRecorderRef.current = recorder

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data)
      }

      recorder.onstop = async () => {
        const blob = new Blob(chunksRef.current, {
          type: recorder.mimeType || 'audio/webm',
        })

        stream.getTracks().forEach((track) => track.stop())
        streamRef.current = null

        if (blob.size === 0) {
          setError('No audio was captured. Please try again.')
          return
        }

        const item: Recording = {
          id: crypto.randomUUID(),
          name: `Voice recording ${new Date().toLocaleString()}`,
          date: new Date().toISOString(),
          blob,
          url: URL.createObjectURL(blob),
        }

        try {
          await saveRecording(item)
          setRecordings((previous) => [item, ...previous])
          setQueueCount((previous) => previous + 1)
          setStatus('Recording saved on this device.')
        } catch {
          URL.revokeObjectURL(item.url)
          setError('Could not save audio locally. Please try again.')
        }
      }

      recorder.start()
      setIsRecording(true)
      setStatus('Recording in progress. Speak clearly.')
    } catch {
      setError('Microphone access failed. Allow microphone permission and try again.')
    }
  }

  function stopRecording() {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop()
    }

    setIsRecording(false)
    setStatus('Saving your recording...')
  }

  async function deleteRecording(item: Recording) {
    try {
      await removeStoredRecording(item.id)
      URL.revokeObjectURL(item.url)
      setRecordings((previous) =>
        previous.filter((recording) => recording.id !== item.id),
      )
      setQueueCount((previous) => Math.max(0, previous - 1))
      setStatus('Recording deleted from this device.')
    } catch {
      setError('Could not delete this recording.')
    }
  }

  function saveTranscript() {
    localStorage.setItem(
      'jalvaani-transcript',
      JSON.stringify({
        title: transcriptTitle,
        language,
        text: transcript,
        updatedAt: new Date().toISOString(),
      }),
    )
    setStatus('Transcript saved on this device.')
  }

  function loadTranscript() {
    try {
      const saved = JSON.parse(
        localStorage.getItem('jalvaani-transcript') || 'null',
      )

      if (saved) {
        setTranscriptTitle(saved.title || '')
        setTranscript(saved.text || '')
        setLanguage(saved.language || 'hi-IN')
        setStatus('Saved transcript loaded.')
      } else {
        setStatus('No saved transcript found yet.')
      }
    } catch {
      setError('Could not load the saved transcript.')
    }
  }
  function saveStory() {
    if (!consent) {
      setError('Please give consent before saving your story.')
      return
    }

    if (!storyTitle.trim() || !storyText.trim()) {
      setError('Please enter a story title and story text.')
      return
    }

    const story: Story = {
      id: crypto.randomUUID(),
      title: storyTitle.trim(),
      language: storyLanguage,
      text: storyText.trim(),
      date: new Date().toISOString(),
    }

    const updated = [story, ...stories]

    try {
      localStorage.setItem('jalvaani-stories', JSON.stringify(updated))
      setStories(updated)
      setStoryTitle('')
      setStoryText('')
      setConsent(false)
      setError('')
      setStatus('Your story was saved on this device.')
    } catch {
      setError('Could not save your story. Please try again.')
    }
  }

  function deleteStory(id: string) {
    const updated = stories.filter((story) => story.id !== id)

    try {
      localStorage.setItem('jalvaani-stories', JSON.stringify(updated))
      setStories(updated)
      setStatus('Story deleted from this device.')
    } catch {
      setError('Could not delete this story.')
    }
  }

  const styles = `
    @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Manrope:wght@400;500;600;700;800&display=swap');

    * { box-sizing: border-box; }
    body { margin: 0; background: #f4f7f5; color: #173b36; font-family: 'DM Sans', sans-serif; }
    button, input, textarea, select { font: inherit; }
    button { cursor: pointer; }
    .app { min-height: 100vh; }
    .topbar { display:flex; align-items:center; justify-content:space-between; gap:16px; padding:18px 5%; background:#fff; border-bottom:1px solid #e3ebe6; }
    .brand { display:flex; align-items:center; gap:12px; font-family:Manrope,sans-serif; font-size:21px; font-weight:800; }
    .logo { display:grid; place-items:center; width:42px; height:42px; border-radius:14px; color:#fff; background:#167d68; font-size:23px; }
    .tagline { color:#71827b; font-size:12px; margin-top:3px; }
    .connection { display:flex; align-items:center; gap:8px; padding:9px 13px; border-radius:30px; background:#eef6f0; font-size:12px; font-weight:700; }
    .dot { width:8px; height:8px; border-radius:50%; background:#16a36c; }
    .dot.offline { background:#d97706; }
    .layout { display:grid; grid-template-columns:220px minmax(0,1fr); max-width:1440px; margin:auto; padding:28px 5%; gap:28px; }
    .sidebar { display:flex; flex-direction:column; gap:8px; }
    .navbtn { border:0; border-radius:12px; padding:13px 15px; text-align:left; background:transparent; color:#60766d; font-weight:600; }
    .navbtn.active { background:#dff2e9; color:#126a56; }
    .sidebar-note { margin-top:20px; padding:16px; background:#fff; border:1px solid #e2ebe5; border-radius:16px; font-size:12px; line-height:1.7; color:#687b72; }
    .main { min-width:0; }
    .hero { position:relative; overflow:hidden; border-radius:24px; padding:34px; color:white; background:linear-gradient(115deg,#0c584d,#16846b 68%,#42a783); }
    .eyebrow { text-transform:uppercase; letter-spacing:2px; font-size:11px; font-weight:800; opacity:.8; }
    h1,h2,h3,p { margin-top:0; }
    h1 { font-family:Manrope,sans-serif; font-size:clamp(28px,4vw,42px); line-height:1.15; margin:13px 0; }
    .hero p { max-width:560px; line-height:1.7; color:#e0f3eb; margin-bottom:22px; }
    .hero-bubble { position:absolute; right:35px; top:30px; font-size:82px; opacity:.22; }
    .stats { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:14px; margin:20px 0; }
    .stat,.panel { background:#fff; border:1px solid #e3ebe6; border-radius:18px; padding:20px; }
    .stat-label { font-size:12px; color:#72837a; }
    .stat-value { font-family:Manrope,sans-serif; font-size:26px; font-weight:800; margin:8px 0 4px; }
    .muted { color:#75867d; font-size:13px; line-height:1.6; }
    .section-title { display:flex; align-items:center; justify-content:space-between; gap:12px; margin:26px 0 14px; }
    .section-title h2 { font-family:Manrope,sans-serif; font-size:21px; margin:0; }
    .panel { margin-bottom:18px; }
    .panel h3 { font-family:Manrope,sans-serif; font-size:17px; margin-bottom:8px; }
    .btn { border:0; border-radius:11px; padding:12px 17px; font-weight:700; background:#167d68; color:white; }
    .btn:hover { background:#106552; }
    .btn.light { background:#e5f3ec; color:#126a56; }
    .btn.outline { background:#fff; border:1px solid #cddbd2; color:#3e5e51; }
    .btn.danger { background:#fff0ed; color:#b73c2e; }
    .btn:disabled { opacity:.5; cursor:not-allowed; }
    .actions { display:flex; flex-wrap:wrap; gap:10px; margin-top:15px; }
    .field { display:flex; flex-direction:column; gap:7px; margin:15px 0; }
    .field label { font-size:13px; font-weight:700; color:#395a4d; }
    .field input,.field textarea,.field select { width:100%; padding:12px 13px; border:1px solid #d5e1d9; border-radius:11px; background:#fbfdfb; color:#173b36; outline-color:#16846b; }
    .field textarea { min-height:140px; resize:vertical; line-height:1.6; }
    .recording { display:flex; align-items:center; justify-content:space-between; gap:12px; padding:13px 0; border-bottom:1px solid #edf1ed; }
    .recording:last-child { border-bottom:0; }
    .recording-name { font-size:13px; font-weight:700; overflow-wrap:anywhere; }
    .recording small { color:#7a8a81; display:block; margin-top:5px; }
    .audio { width:100%; margin-top:10px; }
    .notice { border-radius:11px; padding:12px 14px; margin:12px 0; background:#eaf5ed; color:#28674b; font-size:13px; line-height:1.5; }
    .notice.error { background:#fff0ed; color:#ad3a2b; }
    .notice.warning { background:#fff5df; color:#8b5b12; }
    .story-card { padding:16px 0; border-bottom:1px solid #edf1ed; }
    .story-card:last-child { border-bottom:0; }
    .story-card h3 { margin-bottom:7px; }
    .consent { display:flex; align-items:flex-start; gap:10px; font-size:13px; line-height:1.6; margin:16px 0; color:#526c60; }
    .consent input { margin-top:4px; }
    .footer { text-align:center; padding:24px; color:#829087; font-size:12px; }
    @media(max-width:760px) {
      .topbar { padding:14px 5%; }
      .layout { grid-template-columns:1fr; padding-top:18px; gap:18px; }
      .sidebar { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); }
      .sidebar-note { display:none; }
      .hero { padding:25px; }
      .hero-bubble { right:15px; top:20px; font-size:54px; }
      .stats { gap:9px; }
      .stat { padding:13px; }
      .stat-value { font-size:21px; }
      .stat-label { font-size:11px; }
      .panel { padding:16px; }
      .connection { font-size:11px; }
    }
    @media(max-width:400px) {
      .stats { grid-template-columns:1fr; }
      .brand { font-size:18px; }
    }
  `
  return (
    <div className="app">
      <style>{styles}</style>

      <header className="topbar">
        <div className="brand">
          <div className="logo">〰</div>
          <div>
            JalVaani
            <div className="tagline">Every voice deserves to be understood.</div>
          </div>
        </div>

        <div className="connection">
          <span className={`dot ${isOnline ? '' : 'offline'}`} />
          {isOnline ? 'Online' : 'Offline mode'}
        </div>
      </header>

      <div className="layout">
        <aside className="sidebar">
          {[
            ['dashboard', '⌂  Dashboard'],
            ['recordings', '◉  Audio recordings'],
            ['transcript', '▤  Transcript editor'],
            ['stories', '♡  YaadVault stories'],
          ].map(([id, label]) => (
            <button
              key={id}
              className={`navbtn ${activeTab === id ? 'active' : ''}`}
              onClick={() => {
                setActiveTab(id)
                setError('')
              }}
            >
              {label}
            </button>
          ))}

          <div className="sidebar-note">
            <strong>Designed for the coast</strong>
            <p>
              Capture voices, review transcripts and preserve local stories,
              even when internet access is unreliable.
            </p>
            <span>Local-first experience</span>
          </div>
        </aside>

        <main className="main">
          {activeTab === 'dashboard' && (
            <>
              <section className="hero">
                <div className="hero-bubble">〰</div>
                <div className="eyebrow">Voice · Language · Heritage</div>
                <h1>When the sea gets loud, every voice matters.</h1>
                <p>
                  A noise-resilient voice workspace for coastal communities.
                  Record locally, review words carefully and preserve stories
                  with consent.
                </p>
                <button
                  className="btn"
                  onClick={() => setActiveTab('recordings')}
                >
                  Start recording →
                </button>
              </section>

              <div className="stats">
                <div className="stat">
                  <div className="stat-label">Saved recordings</div>
                  <div className="stat-value">{recordings.length}</div>
                  <div className="muted">Stored on this device</div>
                </div>
                <div className="stat">
                  <div className="stat-label">Preserved stories</div>
                  <div className="stat-value">{stories.length}</div>
                  <div className="muted">Consent-based collection</div>
                </div>
                <div className="stat">
                  <div className="stat-label">Connection</div>
                  <div className="stat-value">{isOnline ? 'Online' : 'Offline'}</div>
                  <div className="muted">
                    {isOnline ? 'Network detected' : 'Local features available'}
                  </div>
                </div>
              </div>

              <section className="panel">
                <h3>Quick actions</h3>
                <p className="muted">
                  Your recordings and saved stories remain on this device.
                  Automatic cloud upload is not enabled in this frontend.
                </p>
                <div className="actions">
                  <button className="btn" onClick={() => setActiveTab('recordings')}>
                    Record audio
                  </button>
                  <button className="btn light" onClick={() => setActiveTab('transcript')}>
                    Edit transcript
                  </button>
                  <button className="btn outline" onClick={() => setActiveTab('stories')}>
                    Preserve a story
                  </button>
                </div>
              </section>

              <section className="panel">
                <h3>How JalVaani works</h3>
                <p className="muted">
                  01 — Capture audio locally.
                  <br />
                  02 — Review and correct transcript text.
                  <br />
                  03 — Preserve community stories only with consent.
                  <br />
                  04 — Connect backend transcription when its API is integrated.
                </p>
              </section>
            </>
          )}

          {activeTab === 'recordings' && (
            <>
              <div className="section-title">
                <h2>Audio recordings</h2>
              </div>

              <section className="panel">
                <h3>Capture a voice</h3>
                <p className="muted">
                  Allow microphone permission when your browser asks.
                  Recordings are saved locally on this device.
                </p>

                <div className="field">
                  <label htmlFor="recording-language">Recording language</label>
                  <select
                    id="recording-language"
                    value={language}
                    onChange={(event) => setLanguage(event.target.value)}
                  >
                    {languages.map((item) => (
                      <option key={item.code} value={item.code}>
                        {item.name} ({item.code})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="actions">
                  {!isRecording ? (
                    <button className="btn" onClick={() => void startRecording()}>
                      ◉ Start recording
                    </button>
                  ) : (
                    <button className="btn danger" onClick={stopRecording}>
                      ■ Stop recording
                    </button>
                  )}
                </div>

                <div className="notice">{status}</div>

                {error && <div className="notice error">{error}</div>}
              </section>

              <section className="panel">
                <h3>Saved audio ({recordings.length})</h3>

                {recordings.length === 0 && (
                  <p className="muted">
                    No recordings yet. Start recording to see your audio here.
                  </p>
                )}

                {recordings.map((item) => (
                  <div className="recording" key={item.id}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="recording-name">{item.name}</div>
                      <small>{new Date(item.date).toLocaleString()}</small>
                      <audio className="audio" controls src={item.url}>
                        Your browser does not support audio playback.
                      </audio>
                    </div>
                    <button
                      className="btn danger"
                      onClick={() => void deleteRecording(item)}
                    >
                      Delete
                    </button>
                  </div>
                ))}
              </section>
            </>
          )}

          {activeTab === 'transcript' && (
            <>
              <div className="section-title">
                <h2>Transcript editor</h2>
              </div>

              <section className="panel">
                <h3>Review every word</h3>
                <p className="muted">
                  Enter or edit a transcript below. Pay special attention to
                  names, numbers, dates, money and directions. This editor
                  does not yet run speech-to-text automatically.
                </p>

                <div className="field">
                  <label htmlFor="transcript-language">Language</label>
                  <select
                    id="transcript-language"
                    value={language}
                    onChange={(event) => setLanguage(event.target.value)}
                  >
                    {languages.map((item) => (
                      <option key={item.code} value={item.code}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="field">
                  <label htmlFor="transcript-title">Transcript title</label>
                  <input
                    id="transcript-title"
                    value={transcriptTitle}
                    onChange={(event) => setTranscriptTitle(event.target.value)}
                    placeholder="e.g. Fisherman's morning report"
                  />
                </div>

                <div className="field">
                  <label htmlFor="transcript-text">Transcript text</label>
                  <textarea
                    id="transcript-text"
                    value={transcript}
                    onChange={(event) => setTranscript(event.target.value)}
                    placeholder="Type or paste the transcript here, then review uncertain words..."
                  />
                </div>

                <div className="notice warning">
                  Important: manually verify uncertain words against the audio.
                  This version does not automatically detect transcription errors.
                </div>

                <div className="actions">
                  <button className="btn" onClick={saveTranscript}>
                    Save transcript
                  </button>
                  <button className="btn light" onClick={loadTranscript}>
                    Load saved transcript
                  </button>
                  <button
                    className="btn outline"
                    onClick={() => {
                      setTranscript('')
                      setTranscriptTitle('')
                    }}
                  >
                    Clear editor
                  </button>
                </div>

                {error && <div className="notice error">{error}</div>}
                <div className="muted" style={{ marginTop: 14 }}>
                  {transcript.trim()
                    ? `${transcript.trim().split(/\s+/).length} words · ${transcript.length} characters`
                    : 'Your transcript is empty.'}
                </div>
              </section>
            </>
          )}

          {activeTab === 'stories' && (
            <>
              <div className="section-title">
                <h2>YaadVault</h2>
              </div>

              <section className="panel">
                <h3>Preserve a community story</h3>
                <p className="muted">
                  Preserve coastal memories, proverbs, dialects and traditional
                  knowledge. Ask permission before recording or saving
                  someone else's story.
                </p>

                <div className="field">
                  <label htmlFor="story-title">Story title</label>
                  <input
                    id="story-title"
                    value={storyTitle}
                    onChange={(event) => setStoryTitle(event.target.value)}
                    placeholder="Give this story a title"
                  />
                </div>

                <div className="field">
                  <label htmlFor="story-language">Story language</label>
                  <select
                    id="story-language"
                    value={storyLanguage}
                    onChange={(event) => setStoryLanguage(event.target.value)}
                  >
                    {languages.map((item) => (
                      <option key={item.code} value={item.code}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="field">
                  <label htmlFor="story-text">Story or proverb</label>
                  <textarea
                    id="story-text"
                    value={storyText}
                    onChange={(event) => setStoryText(event.target.value)}
                    placeholder="Write the story here..."
                  />
                </div>

                <label className="consent">
                  <input
                    type="checkbox"
                    checked={consent}
                    onChange={(event) => setConsent(event.target.checked)}
                  />
                  <span>
                    I confirm that I have permission to preserve this story
                    and understand that this demo stores it in this browser
                    on this device.
                  </span>
                </label>

                <button className="btn" onClick={saveStory}>
                  Save with consent
                </button>

                {error && <div className="notice error">{error}</div>}
              </section>

              <section className="panel">
                <h3>Preserved stories ({stories.length})</h3>

                {stories.length === 0 && (
                  <p className="muted">
                    No stories saved yet. Your first story can be preserved above.
                  </p>
                )}

                {stories.map((story) => (
                  <article className="story-card" key={story.id}>
                    <h3>{story.title}</h3>
                    <p className="muted">
                      {story.language} · {new Date(story.date).toLocaleDateString()}
                    </p>
                    <p style={{ whiteSpace: 'pre-wrap', lineHeight: 1.7 }}>
                      {story.text}
                    </p>
                    <button
                      className="btn danger"
                      onClick={() => deleteStory(story.id)}
                    >
                      Delete story
                    </button>
                  </article>
                ))}
              </section>
            </>
          )}

          <footer className="footer">
            JalVaani · Every voice deserves to be understood.
            <br />
            Local demo · Check consent before preserving community knowledge.
          </footer>
        </main>
      </div>
    </div>
  )
}

export default App