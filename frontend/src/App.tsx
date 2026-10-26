import { useEffect, useRef, useState } from 'react'

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || 'https://jalvaani.onrender.com'

type Language = {
  code: string
  name: string
}

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

const fallbackLanguages: Language[] = [
  { code: 'hi-IN', name: 'Hindi' },
  { code: 'en-IN', name: 'English (India)' },
  { code: 'bn-IN', name: 'Bengali' },
  { code: 'gu-IN', name: 'Gujarati' },
  { code: 'kn-IN', name: 'Kannada' },
  { code: 'ml-IN', name: 'Malayalam' },
  { code: 'mr-IN', name: 'Marathi' },
  { code: 'pa-IN', name: 'Punjabi' },
  { code: 'ta-IN', name: 'Tamil' },
  { code: 'te-IN', name: 'Telugu' },
]

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
    const tx = db.transaction(STORE_NAME, 'readonly')
    const request = tx.objectStore(STORE_NAME).getAll()

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
function App() {
  const [languages, setLanguages] =
    useState<Language[]>(fallbackLanguages)

  const [selectedLanguage, setSelectedLanguage] =
    useState('hi-IN')

  const [recordings, setRecordings] =
    useState<Recording[]>([])

  const [stories, setStories] =
    useState<Story[]>([])

  const [isRecording, setIsRecording] =
    useState(false)

  const [isTranscribing, setIsTranscribing] =
    useState(false)

  const [selectedRecording, setSelectedRecording] =
    useState<string | null>(null)

  const [transcript, setTranscript] =
    useState('')

  const [storyTitle, setStoryTitle] =
    useState('')

  const [storyConsent, setStoryConsent] =
    useState(false)

  const [message, setMessage] =
    useState('Loading JalVaani...')

  const [isOnline, setIsOnline] =
    useState(navigator.onLine)

  const [activeTab, setActiveTab] =
    useState<'dashboard' | 'recordings' | 'stories'>(
      'dashboard',
    )



  const mediaRecorderRef =
    useRef<MediaRecorder | null>(null)

  const audioChunksRef =
    useRef<Blob[]>([])

  const streamRef =
    useRef<MediaStream | null>(null)

  const recordingStartRef =
    useRef<number>(0)

  // Load saved recordings and stories from this device.
  useEffect(() => {
    let cancelled = false

    async function loadLocalData() {
      try {
        const saved = await loadRecordings()

        if (!cancelled) {
          setRecordings(
            saved
              .map((item) => ({
                ...item,
                url: URL.createObjectURL(item.blob),
              }))
              .sort(
                (a, b) =>
                  new Date(b.date).getTime() -
                  new Date(a.date).getTime(),
              ),
          )

          setStories(getStories())
          setMessage('Your workspace is ready.')
        }
      } catch (error) {
        console.error('Could not load local data:', error)

        if (!cancelled) {
          setStories(getStories())
          setMessage(
            'Local storage could not be opened. Please use a supported browser.',
          )
        }
      }
    }

    void loadLocalData()

    return () => {
      cancelled = true
    }
  }, [])

  // Load supported languages from the backend.
  useEffect(() => {
    let cancelled = false

    async function loadLanguages() {
      try {
        const response = await fetch(
          `${API_BASE_URL}/api/languages`,
        )

        if (!response.ok) {
          throw new Error('Language service unavailable')
        }

        const result = await response.json()

        const rawLanguages = Array.isArray(result)
          ? result
          : Array.isArray(result.languages)
            ? result.languages
            : Array.isArray(result.data)
              ? result.data
              : []

        const normalized: Language[] = rawLanguages
          .map((item: any) => ({
            code:
              item.code ??
              item.language_code ??
              item.languageCode ??
              '',
            name:
              item.name ??
              item.language ??
              item.display_name ??
              item.language_name ??
              '',
          }))
          .filter(
            (item: Language) =>
              item.code && item.name,
          )

        if (!cancelled && normalized.length > 0) {
          setLanguages(normalized)

          if (
            !normalized.some(
              (language) =>
                language.code === selectedLanguage,
            )
          ) {
            setSelectedLanguage(normalized[0].code)
          }
        }
      } catch (error) {
        console.warn(
          'Using fallback languages:',
          error,
        )
      }
    }

    void loadLanguages()

    return () => {
      cancelled = true
    }
  }, [])

  // Keep the connection indicator up to date.
  useEffect(() => {
    const updateOnlineStatus = () => {
      setIsOnline(navigator.onLine)
    }

    window.addEventListener(
      'online',
      updateOnlineStatus,
    )

    window.addEventListener(
      'offline',
      updateOnlineStatus,
    )

    return () => {
      window.removeEventListener(
        'online',
        updateOnlineStatus,
      )

      window.removeEventListener(
        'offline',
        updateOnlineStatus,
      )
    }
  }, [])

  // Release temporary audio URLs when the component closes.
  useEffect(() => {
    return () => {
      recordings.forEach((recording) => {
        URL.revokeObjectURL(recording.url)
      })

      streamRef.current
        ?.getTracks()
        .forEach((track) => track.stop())
    }
  }, [recordings])

  // Start recording audio.
  async function startRecording() {
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error(
          'Audio recording is not supported in this browser. Open the website using HTTPS.',
        )
      }

      const stream =
        await navigator.mediaDevices.getUserMedia({
          audio: true,
        })

      streamRef.current = stream
      audioChunksRef.current = []

      const recorder = new MediaRecorder(stream)
      mediaRecorderRef.current = recorder
      recordingStartRef.current = Date.now()

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data)
        }
      }

      recorder.onstop = async () => {
        try {
          const audioBlob = new Blob(
            audioChunksRef.current,
            {
              type: recorder.mimeType || 'audio/webm',
            },
          )

          if (audioBlob.size === 0) {
            setMessage('No audio was recorded. Please try again.')
            return
          }

          const now = new Date()
          const item: Recording = {
            id: crypto.randomUUID(),
            name: `Recording ${now.toLocaleString()}`,
            date: now.toISOString(),
            blob: audioBlob,
            url: URL.createObjectURL(audioBlob),
          }

          await saveRecording(item)

          setRecordings((previous) =>
            [item, ...previous],
          )

          setSelectedRecording(item.id)
          setTranscript('')
          setMessage(
            'Recording saved on this device. Select it to transcribe.',
          )
        } catch (error) {
          console.error('Save recording failed:', error)
          setMessage(
            'Could not save the recording. Check your browser storage.',
          )
        } finally {
          stream.getTracks().forEach((track) => track.stop())
          streamRef.current = null
          setIsRecording(false)
        }
      }

      recorder.start()
      setIsRecording(true)
      setMessage('Recording in progress. Speak clearly.')
    } catch (error) {
      console.error('Recording failed:', error)

      setMessage(
        error instanceof Error
          ? error.message
          : 'Microphone access failed. Allow microphone permission and try again.',
      )

      streamRef.current
        ?.getTracks()
        .forEach((track) => track.stop())

      streamRef.current = null
      setIsRecording(false)
    }
  }

  // Stop recording.
  function stopRecording() {
    const recorder = mediaRecorderRef.current

    if (recorder && recorder.state !== 'inactive') {
      recorder.stop()
      setMessage('Finishing and saving your recording...')
    }
  }

  // Send an audio recording to the backend for transcription.
  async function transcribeRecording(recording: Recording) {
    if (!navigator.onLine) {
      setMessage(
        'You are offline. Your recording is saved locally. Connect to the internet to transcribe it.',
      )
      return
    }

    setIsTranscribing(true)
    setSelectedRecording(recording.id)
    setMessage('Transcribing audio. Please wait...')

    try {
      const formData = new FormData()

      formData.append(
        'audio',
        recording.blob,
        `${recording.id}.webm`,
      )

      formData.append('language_code', selectedLanguage)

      const response = await fetch(
        `${API_BASE_URL}/api/transcribe`,
        {
          method: 'POST',
          body: formData,
        },
      )

      const result = await response.json().catch(() => null)

      if (!response.ok) {
        throw new Error(
          result?.detail ||
            result?.message ||
            `Transcription failed (HTTP ${response.status}).`,
        )
      }

      const text =
        result?.transcript ??
        result?.transcription ??
        result?.text ??
        result?.result?.text ??
        result?.data?.transcript ??
        result?.data?.text

      if (typeof text !== 'string' || !text.trim()) {
        throw new Error(
          'The backend response did not contain transcript text. Ask your backend teammate for the exact response format.',
        )
      }

      setTranscript(text)
      setMessage('Transcription complete. Review and edit the text below.')
    } catch (error) {
      console.error('Transcription error:', error)

      setMessage(
        error instanceof Error
          ? error.message
          : 'Transcription failed. Please try again.',
      )
    } finally {
      setIsTranscribing(false)
    }
  }

  // Delete a recording from this device.
  async function deleteRecording(id: string) {
    const recording = recordings.find(
      (item) => item.id === id,
    )

    if (!recording) return

    try {
      await removeStoredRecording(id)

      URL.revokeObjectURL(recording.url)

      setRecordings((previous) =>
        previous.filter((item) => item.id !== id),
      )

      if (selectedRecording === id) {
        setSelectedRecording(null)
        setTranscript('')
      }

      setMessage('Recording deleted from this device.')
    } catch (error) {
      console.error('Delete recording failed:', error)
      setMessage('Could not delete this recording.')
    }
  }

  // Save an edited transcript locally.
  function saveTranscript() {
    if (!selectedRecording) {
      setMessage('Select a recording before saving its transcript.')
      return
    }

    try {
      const key = 'jalvaani-transcripts'

      const saved: Record<string, string> = JSON.parse(
        localStorage.getItem(key) || '{}',
      )

      saved[selectedRecording] = transcript

      localStorage.setItem(key, JSON.stringify(saved))

      setMessage('Transcript saved on this device.')
    } catch (error) {
      console.error('Save transcript failed:', error)
      setMessage('Could not save the transcript.')
    }
  }

  // Load a saved transcript when a recording is selected.
  function selectRecording(recording: Recording) {
    setSelectedRecording(recording.id)

    try {
      const saved: Record<string, string> = JSON.parse(
        localStorage.getItem('jalvaani-transcripts') || '{}',
      )

      setTranscript(saved[recording.id] || '')
    } catch {
      setTranscript('')
    }

    setMessage(`Selected: ${recording.name}`)
  }

  // Save a story only after the user gives consent.
  function saveStory() {
    if (!storyConsent) {
      setMessage(
        'Please give consent before saving this story.',
      )
      return
    }

    if (!storyTitle.trim() || !transcript.trim()) {
      setMessage(
        'Enter a story title and transcript before saving.',
      )
      return
    }

    try {
      const story: Story = {
        id: crypto.randomUUID(),
        title: storyTitle.trim(),
        language: selectedLanguage,
        text: transcript.trim(),
        date: new Date().toISOString(),
      }

      const updatedStories = [story, ...getStories()]

      localStorage.setItem(
        'jalvaani-stories',
        JSON.stringify(updatedStories),
      )

      setStories(updatedStories)
      setStoryTitle('')
      setStoryConsent(false)
      setMessage('Story saved locally with your consent.')
    } catch (error) {
      console.error('Save story failed:', error)
      setMessage('Could not save the story.')
    }
  }

  // Delete a saved story.
  function deleteStory(id: string) {
    const updatedStories = getStories().filter(
      (story) => story.id !== id,
    )

    localStorage.setItem(
      'jalvaani-stories',
      JSON.stringify(updatedStories),
    )

    setStories(updatedStories)
    setMessage('Story deleted from this device.')
  }

  const styles = `
    * {
      box-sizing: border-box;
    }

    body {
      margin: 0;
      font-family: Inter, system-ui, -apple-system, BlinkMacSystemFont,
        "Segoe UI", sans-serif;
      background: #f3f7f6;
      color: #173b38;
    }

    button, input, select, textarea {
      font: inherit;
    }

    button {
      cursor: pointer;
    }

    button:disabled {
      cursor: not-allowed;
      opacity: 0.55;
    }

    .app {
      min-height: 100vh;
    }

    .topbar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 16px;
      padding: 18px 5%;
      background: #ffffff;
      border-bottom: 1px solid #dfe9e6;
      position: sticky;
      top: 0;
      z-index: 10;
    }

    .brand {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .brand-icon {
      width: 44px;
      height: 44px;
      display: grid;
      place-items: center;
      border-radius: 14px;
      background: #d9f4e9;
      font-size: 24px;
    }

    .brand h1 {
      margin: 0;
      font-size: 22px;
      letter-spacing: -0.6px;
    }

    .brand p {
      margin: 3px 0 0;
      color: #64807b;
      font-size: 12px;
    }

    .status {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 9px 13px;
      border-radius: 999px;
      background: #e8f7ee;
      color: #247447;
      font-size: 13px;
      font-weight: 650;
    }

    .status.offline {
      background: #fff0d9;
      color: #8c5a0b;
    }

    .layout {
      width: min(1180px, 92%);
      margin: 28px auto 50px;
    }

    .hero {
      padding: 32px;
      border-radius: 24px;
      background: linear-gradient(120deg, #124e48, #187967);
      color: white;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 24px;
      overflow: hidden;
    }

    .hero h2 {
      margin: 0 0 12px;
      font-size: clamp(26px, 4vw, 38px);
      letter-spacing: -1px;
    }

    .hero p {
      max-width: 620px;
      line-height: 1.7;
      margin: 0;
      color: #d7eee8;
    }

    .hero-symbol {
      font-size: 68px;
      flex-shrink: 0;
    }

    .section-title {
      margin: 30px 0 16px;
      font-size: 20px;
    }

    .nav {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      margin: 24px 0;
    }

    .nav button {
      border: 1px solid #d8e5e1;
      border-radius: 12px;
      padding: 11px 17px;
      color: #355c55;
      background: white;
      font-weight: 600;
    }

    .nav button.active {
      background: #175f54;
      border-color: #175f54;
      color: white;
    }

    .grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 18px;
    }

    .card {
      min-width: 0;
      padding: 23px;
      border-radius: 20px;
      background: white;
      border: 1px solid #e1ebe7;
      box-shadow: 0 5px 20px rgba(25, 70, 60, 0.035);
    }

    .card h3 {
      margin: 0 0 10px;
      font-size: 18px;
    }

    .muted {
      color: #6b827c;
      font-size: 14px;
      line-height: 1.6;
    }

    .field {
      display: flex;
      flex-direction: column;
      gap: 8px;
      margin: 17px 0;
    }

    .field label {
      font-size: 13px;
      font-weight: 700;
      color: #365b54;
    }

    .field input,
    .field select,
    .field textarea {
      width: 100%;
      border: 1px solid #d7e4df;
      border-radius: 11px;
      padding: 12px 13px;
      outline: none;
      background: #fcfefd;
      color: #173b38;
    }

    .field input:focus,
    .field select:focus,
    .field textarea:focus {
      border-color: #248b75;
      box-shadow: 0 0 0 3px #d9f4e9;
    }

    .field textarea {
      min-height: 155px;
      resize: vertical;
      line-height: 1.65;
    }

    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      margin-top: 16px;
    }

    .btn {
      border: 0;
      border-radius: 11px;
      padding: 11px 16px;
      background: #17685a;
      color: white;
      font-weight: 650;
    }

    .btn:hover:not(:disabled) {
      background: #105447;
    }

    .btn.secondary {
      background: #e8f4ef;
      color: #176052;
    }

    .btn.secondary:hover:not(:disabled) {
      background: #d7ebe2;
    }

    .btn.danger {
      background: #fff0ee;
      color: #a13d35;
    }

    .btn.danger:hover:not(:disabled) {
      background: #ffe0dc;
    }

    .message {
      margin: 18px 0;
      padding: 13px 16px;
      border-radius: 12px;
      background: #e6f4ee;
      color: #225c4b;
      line-height: 1.5;
      font-size: 14px;
      overflow-wrap: anywhere;
    }

    .recording-item,
    .story-item {
      padding: 16px 0;
      border-bottom: 1px solid #e8efec;
    }

    .recording-item:last-child,
    .story-item:last-child {
      border-bottom: 0;
    }

    .item-title {
      margin: 0 0 6px;
      font-weight: 700;
      overflow-wrap: anywhere;
    }

    .item-date {
      color: #758a84;
      font-size: 12px;
      margin-bottom: 12px;
    }

    .consent {
      display: flex;
      align-items: flex-start;
      gap: 10px;
      margin: 15px 0;
      font-size: 13px;
      line-height: 1.6;
      color: #496b63;
    }

    .consent input {
      margin-top: 4px;
      accent-color: #17685a;
    }

    .empty {
      padding: 22px 0;
      color: #789089;
      font-size: 14px;
      line-height: 1.6;
    }

    .footer {
      text-align: center;
      padding: 24px 12px;
      color: #789089;
      font-size: 12px;
    }

    @media (max-width: 700px) {
      .topbar {
        padding: 14px 4%;
        align-items: flex-start;
      }

      .brand h1 {
        font-size: 19px;
      }

      .brand p {
        max-width: 175px;
        line-height: 1.4;
      }

      .status {
        padding: 8px 10px;
        font-size: 11px;
      }

      .layout {
        width: 92%;
        margin-top: 18px;
      }

      .hero {
        padding: 24px 20px;
        border-radius: 18px;
      }

      .hero-symbol {
        display: none;
      }

      .grid {
        grid-template-columns: 1fr;
      }

      .card {
        padding: 19px;
      }

      .nav button {
        flex: 1;
        padding: 10px;
      }

      .actions .btn {
        flex: 1;
      }
    }
  `

  return (
    <>
      <style>{styles}</style>

      <div className="app">
        <header className="topbar">
          <div className="brand">
            <div className="brand-icon">🌊</div>
            <div>
              <h1>JalVaani</h1>
              <p>Voice intelligence for coastal communities</p>
            </div>
          </div>

          <div className={`status ${isOnline ? '' : 'offline'}`}>
            <span>{isOnline ? '●' : '●'}</span>
            {isOnline ? 'Online' : 'Offline'}
          </div>
        </header>

        <main className="layout">
          <section className="hero">
            <div>
              <h2>Every voice deserves to be understood.</h2>
              <p>
                Record local voices, transcribe speech, review uncertain
                words, and preserve community stories with consent.
                Your recordings are saved on this device.
              </p>
            </div>
            <div className="hero-symbol">🎙️</div>
          </section>

          <nav className="nav" aria-label="Main navigation">
            <button
              className={activeTab === 'dashboard' ? 'active' : ''}
              onClick={() => setActiveTab('dashboard')}
            >
              Dashboard
            </button>

            <button
              className={activeTab === 'recordings' ? 'active' : ''}
              onClick={() => setActiveTab('recordings')}
            >
              Recordings ({recordings.length})
            </button>

            <button
              className={activeTab === 'stories' ? 'active' : ''}
              onClick={() => setActiveTab('stories')}
            >
              YaadVault ({stories.length})
            </button>
          </nav>

          <div className="message" role="status" aria-live="polite">
            {message}
          </div>

          {activeTab === 'dashboard' && (
            <>
              <h2 className="section-title">Voice workspace</h2>

              <div className="grid">
                <section className="card">
                  <h3>🎙️ Record your voice</h3>
                  <p className="muted">
                    Choose a language and record a short voice sample.
                    Allow microphone access when your browser asks.
                  </p>

                  <div className="field">
                    <label htmlFor="language">
                      Transcription language
                    </label>

                    <select
                      id="language"
                      value={selectedLanguage}
                      onChange={(event) =>
                        setSelectedLanguage(event.target.value)
                      }
                    >
                      {languages.map((language) => (
                        <option
                          key={language.code}
                          value={language.code}
                        >
                          {language.name} ({language.code})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="actions">
                    {!isRecording ? (
                      <button
                        className="btn"
                        onClick={startRecording}
                        disabled={isTranscribing}
                      >
                        Start recording
                      </button>
                    ) : (
                      <button
                        className="btn danger"
                        onClick={stopRecording}
                      >
                        Stop and save
                      </button>
                    )}
                  </div>

                  <p className="muted">
                    {isRecording
                      ? 'Recording is in progress. Select Stop and save when finished.'
                      : 'Audio stays on this device until you choose to delete it.'}
                  </p>
                </section>

                <section className="card">
                  <h3>📝 ContextEcho</h3>
                  <p className="muted">
                    Select a recording to transcribe it. Review the
                    result carefully, especially names, numbers, dates,
                    money amounts, and directions.
                  </p>

                  <div className="field">
                    <label htmlFor="recording-select">
                      Choose a recording
                    </label>

                    <select
                      id="recording-select"
                      value={selectedRecording ?? ''}
                      onChange={(event) => {
                        const recording = recordings.find(
                          (item) => item.id === event.target.value,
                        )

                        if (recording) {
                          selectRecording(recording)
                        } else {
                          setSelectedRecording(null)
                          setTranscript('')
                        }
                      }}
                    >
                      <option value="">Select recording</option>

                      {recordings.map((recording) => (
                        <option
                          key={recording.id}
                          value={recording.id}
                        >
                          {recording.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="actions">
                    <button
                      className="btn"
                      disabled={
                        !selectedRecording ||
                        isTranscribing ||
                        isRecording
                      }
                      onClick={() => {
                        const recording = recordings.find(
                          (item) => item.id === selectedRecording,
                        )

                        if (recording) {
                          void transcribeRecording(recording)
                        }
                      }}
                    >
                      {isTranscribing
                        ? 'Transcribing...'
                        : 'Transcribe audio'}
                    </button>
                  </div>

                  {!isOnline && (
                    <p className="muted">
                      You are offline. Transcription requires an
                      internet connection, but saved recordings remain
                      available on this device.
                    </p>
                  )}
                </section>
              </div>

              <h2 className="section-title">Review and save</h2>

              <div className="grid">
                <section className="card">
                  <h3>✍️ Transcript editor</h3>
                  <p className="muted">
                    Edit the generated transcript before saving it.
                    Always verify the text against the original audio.
                  </p>

                  <div className="field">
                    <label htmlFor="transcript">
                      Transcript text
                    </label>

                    <textarea
                      id="transcript"
                      value={transcript}
                      onChange={(event) =>
                        setTranscript(event.target.value)
                      }
                      placeholder="Your transcript will appear here. You can also type or correct it manually."
                    />
                  </div>

                  <div className="actions">
                    <button
                      className="btn"
                      onClick={saveTranscript}
                      disabled={!selectedRecording}
                    >
                      Save transcript
                    </button>
                  </div>
                </section>

                <section className="card">
                  <h3>📚 YaadVault</h3>
                  <p className="muted">
                    Preserve a community memory, proverb, or local
                    expression only when the contributor has agreed.
                  </p>

                  <div className="field">
                    <label htmlFor="story-title">
                      Story title
                    </label>

                    <input
                      id="story-title"
                      value={storyTitle}
                      onChange={(event) =>
                        setStoryTitle(event.target.value)
                      }
                      placeholder="e.g. A story from our village"
                    />
                  </div>

                  <label className="consent">
                    <input
                      type="checkbox"
                      checked={storyConsent}
                      onChange={(event) =>
                        setStoryConsent(event.target.checked)
                      }
                    />

                    <span>
                      I confirm that the contributor has given
                      permission to save this story on this device.
                    </span>
                  </label>

                  <button
                    className="btn"
                    onClick={saveStory}
                    disabled={!storyConsent || !storyTitle.trim() || !transcript.trim()}
                  >
                    Save story with consent
                  </button>

                  <p className="muted">
                    Stories are stored locally in this prototype. They
                    are not uploaded to a shared server.
                  </p>
                </section>
              </div>
            </>
          )}

          {activeTab === 'recordings' && (
            <>
              <h2 className="section-title">Your recordings</h2>

              <section className="card">
                <p className="muted">
                  Recordings are stored in this browser on this device.
                </p>

                {recordings.length === 0 ? (
                  <div className="empty">
                    No recordings yet. Return to the Dashboard to
                    record your first audio sample.
                  </div>
                ) : (
                  recordings.map((recording) => (
                    <div className="recording-item" key={recording.id}>
                      <p className="item-title">{recording.name}</p>

                      <p className="item-date">
                        {new Date(recording.date).toLocaleString()}
                      </p>

                      <audio
                        controls
                        preload="none"
                        src={recording.url}
                        style={{ width: '100%', marginBottom: 12 }}
                      />

                      <div className="actions">
                        <button
                          className="btn secondary"
                          onClick={() => {
                            selectRecording(recording)
                            setActiveTab('dashboard')
                          }}
                        >
                          Edit transcript
                        </button>

                        <button
                          className="btn secondary"
                          disabled={isTranscribing || isRecording}
                          onClick={() => {
                            void transcribeRecording(recording)
                            setActiveTab('dashboard')
                          }}
                        >
                          Transcribe
                        </button>

                        <button
                          className="btn danger"
                          onClick={() => {
                            if (
                              window.confirm(
                                'Delete this recording from this device?',
                              )
                            ) {
                              void deleteRecording(recording.id)
                            }
                          }}
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </section>
            </>
          )}

          {activeTab === 'stories' && (
            <>
              <h2 className="section-title">
                YaadVault — Community stories
              </h2>

              <section className="card">
                <p className="muted">
                  Stories saved with consent on this device.
                </p>

                {stories.length === 0 ? (
                  <div className="empty">
                    No stories saved yet. Create a transcript on the
                    Dashboard and save it with consent.
                  </div>
                ) : (
                  stories.map((story) => (
                    <article className="story-item" key={story.id}>
                      <p className="item-title">{story.title}</p>

                      <p className="item-date">
                        {new Date(story.date).toLocaleString()} ·{' '}
                        {story.language}
                      </p>

                      <p style={{ lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
                        {story.text}
                      </p>

                      <button
                        className="btn danger"
                        onClick={() => {
                          if (
                            window.confirm(
                              'Delete this saved story from this device?',
                            )
                          ) {
                            deleteStory(story.id)
                          }
                        }}
                      >
                        Delete story
                      </button>
                    </article>
                  ))
                )}
              </section>
            </>
          )}
        </main>

        <footer className="footer">
          JalVaani © 2026 | Empowering coastal communities through
noise-resilient voice intelligence.
        </footer>
      </div>
    </>
  )
}

export default App

