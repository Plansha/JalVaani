import { useEffect, useRef, useState } from 'react'
import {
  saveRecording,
  getRecordings,
  deleteRecording,
  type StoredRecording,
} from './audioStorage'
import './App.css'

type Recording = {
  id: string
  name: string
  date: string
  url: string
}

type Story = {
  id: string
  title: string
  speaker: string
  story: string
  date: string
}

const TRANSCRIPT_KEY = 'jalvaani-transcript'
const STORIES_KEY = 'jalvaani-stories'

function App() {
  const [online, setOnline] = useState(navigator.onLine)
  const [recording, setRecording] = useState(false)
  const [recordings, setRecordings] = useState<Recording[]>([])
  const [transcript, setTranscript] = useState(
    () =>
      localStorage.getItem(TRANSCRIPT_KEY) ||
      'Sample transcript: The sea is our home, and its stories belong to the people who live beside it.'
  )
  const [story, setStory] = useState('')
  const [storyTitle, setStoryTitle] = useState('')
  const [speaker, setSpeaker] = useState('')
  const [consent, setConsent] = useState(false)
  const [stories, setStories] = useState<Story[]>([])
  const [notice, setNotice] = useState('')
  const [busy] = useState(false)

  const mediaRecorder = useRef<MediaRecorder | null>(null)
  const chunks = useRef<Blob[]>([])
  const recordingsRef = useRef<Recording[]>([])

  useEffect(() => {
    recordingsRef.current = recordings
  }, [recordings])

  useEffect(() => {
    let active = true

    const handleOnline = () => setOnline(true)
    const handleOffline = () => setOnline(false)

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    async function loadSavedRecordings() {
      try {
        const saved: StoredRecording[] = await getRecordings()

        if (!active) return

        const loaded = saved.map((item) => ({
          id: item.id,
          name: item.name,
          date: new Date(item.date).toLocaleString(),
          url: URL.createObjectURL(item.blob),
        }))

        setRecordings(loaded)
      } catch {
        if (active) {
          setNotice('Could not load saved recordings. Please refresh and try again.')
        }
      }
    }

    try {
      const savedStories = localStorage.getItem(STORIES_KEY)
      if (savedStories) {
        setStories(JSON.parse(savedStories) as Story[])
      }
    } catch {
      // Continue if saved story data cannot be read.
    }

    void loadSavedRecordings()

    return () => {
      active = false
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)

      recordingsRef.current.forEach((item) => {
        URL.revokeObjectURL(item.url)
      })
    }
  }, [])

  async function startRecording() {
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      setNotice('Audio recording is not supported in this browser. Please try a current version of Chrome.')
      return
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      chunks.current = []

      const recorder = new MediaRecorder(stream)
      mediaRecorder.current = recorder

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunks.current.push(event.data)
        }
      }

      recorder.onstop = async () => {
        const blob = new Blob(chunks.current, {
          type: recorder.mimeType || 'audio/webm',
        })

        const savedItem: StoredRecording = {
          id: crypto.randomUUID(),
          name: `Coastal recording ${new Date().toLocaleTimeString()}`,
          date: new Date().toISOString(),
          blob,
        }

        try {
          await saveRecording(savedItem)

          const displayItem: Recording = {
            id: savedItem.id,
            name: savedItem.name,
            date: new Date(savedItem.date).toLocaleString(),
            url: URL.createObjectURL(blob),
          }

          setRecordings((current) => [displayItem, ...current])
          setNotice('Recording saved on this device. You can play it again later in this browser.')
        } catch {
          setNotice('The recording was made, but could not be saved. Check available browser storage and try again.')
        } finally {
          stream.getTracks().forEach((track) => track.stop())
          setRecording(false)
        }
      }

      recorder.start()
      setRecording(true)
      setNotice('Recording in progress. Speak clearly near your microphone.')
    } catch {
      setNotice('Microphone access was not granted. Allow microphone access in your browser and try again.')
    }
  }

  function stopRecording() {
    if (mediaRecorder.current?.state === 'recording') {
      mediaRecorder.current.stop()
    }
  }

  async function removeRecording(item: Recording) {
    try {
      await deleteRecording(item.id)
      URL.revokeObjectURL(item.url)
      setRecordings((current) => current.filter((recordingItem) => recordingItem.id !== item.id))
      setNotice('Recording deleted from this device.')
    } catch {
      setNotice('Could not delete this recording. Please try again.')
    }
  }

  function saveTranscript() {
    try {
      localStorage.setItem(TRANSCRIPT_KEY, transcript)
      setNotice('Transcript saved in this browser.')
    } catch {
      setNotice('Could not save the transcript. Check browser storage and try again.')
    }
  }

  function saveStory() {
    if (!storyTitle.trim() || !speaker.trim() || !story.trim()) {
      setNotice('Please enter a story title, speaker name, and story before saving.')
      return
    }

    if (!consent) {
      setNotice('Please confirm consent before saving this story.')
      return
    }

    const newStory: Story = {
      id: crypto.randomUUID(),
      title: storyTitle.trim(),
      speaker: speaker.trim(),
      story: story.trim(),
      date: new Date().toLocaleString(),
    }

    try {
      const updatedStories = [newStory, ...stories]
      localStorage.setItem(STORIES_KEY, JSON.stringify(updatedStories))
      setStories(updatedStories)
      setStoryTitle('')
      setSpeaker('')
      setStory('')
      setConsent(false)
      setNotice('Story saved locally with the consent confirmation you provided.')
    } catch {
      setNotice('Could not save the story. Check browser storage and try again.')
    }
  }

  function removeStory(id: string) {
    const updatedStories = stories.filter((item) => item.id !== id)

    try {
      localStorage.setItem(STORIES_KEY, JSON.stringify(updatedStories))
      setStories(updatedStories)
      setNotice('Story removed from this browser.')
    } catch {
      setNotice('Could not update saved stories. Please try again.')
    }
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="#home" aria-label="JalVaani home">
          <span className="brand-mark">J</span>
          <span>
            <strong>JalVaani</strong>
            <small>Coastal voice intelligence</small>
          </span>
        </a>

        <nav className="nav-links" aria-label="Main navigation">
          <a href="#voice">Voice Studio</a>
          <a href="#transcript">Transcript</a>
          <a href="#stories">YaadVault</a>
        </nav>

        <div className={`connection-pill ${online ? 'is-online' : 'is-offline'}`}>
          <span className="status-dot" />
          {online ? 'Online' : 'Offline'}
        </div>
      </header>

      <section className="hero-section" id="home">
        <div className="hero-copy">
          <span className="eyebrow">VOICE • LANGUAGE • HERITAGE</span>
          <h1>Every coastal voice deserves to be heard.</h1>
          <p>
            Capture voices, review transcripts, and preserve coastal stories
            in one simple workspace—even when your connection is unreliable.
          </p>
          <div className="hero-actions">
            <a className="primary-button" href="#voice">Open Voice Studio</a>
            <a className="secondary-button" href="#stories">Preserve a story</a>
          </div>
          <p className="hero-note">
            Your recordings and stories are stored in this browser on this device.
          </p>
        </div>

        <div className="hero-visual" aria-label="JalVaani ocean-inspired illustration">
          <div className="sun-orb" />
          <div className="wave wave-one" />
          <div className="wave wave-two" />
          <div className="wave wave-three" />
          <div className="hero-visual-label">
            <span>01 / LISTEN</span>
            <strong>Voices carry our history.</strong>
          </div>
        </div>
      </section>

      <section className="stats-grid" aria-label="Workspace summary">
        <article className="stat-card">
          <span className="stat-icon">◉</span>
          <div>
            <strong>{recordings.length}</strong>
            <span>Saved recordings</span>
          </div>
        </article>
        <article className="stat-card">
          <span className="stat-icon">Aa</span>
          <div>
            <strong>{transcript.trim() ? transcript.trim().split(/\s+/).length : 0}</strong>
            <span>Transcript words</span>
          </div>
        </article>
        <article className="stat-card">
          <span className="stat-icon">⌂</span>
          <div>
            <strong>{stories.length}</strong>
            <span>Saved stories</span>
          </div>
        </article>
        <article className="stat-card">
          <span className="stat-icon">↯</span>
          <div>
            <strong>{online ? 'Connected' : 'Offline'}</strong>
            <span>Connection status</span>
          </div>
        </article>
      </section>

      {notice && (
        <div className="notice-banner" role="status">
          <span>{notice}</span>
          <button
            type="button"
            className="notice-close"
            onClick={() => setNotice('')}
            aria-label="Dismiss message"
          >
            ×
          </button>
        </div>
      )}

      <section className="workspace-section" id="voice">
        <div className="section-heading">
          <div>
            <span className="eyebrow">01 / CAPTURE</span>
            <h2>Voice Studio</h2>
            <p>Record coastal voices and keep the audio saved locally.</p>
          </div>
          <span className="section-tag">Local audio storage</span>
        </div>

        <div className="workspace-grid">
          <article className="panel recording-panel">
            <div className="panel-heading">
              <div>
                <span className="mini-label">AUDIO RECORDER</span>
                <h3>Capture a voice</h3>
              </div>
              <span className={`record-indicator ${recording ? 'recording-now' : ''}`}>
                <span className="status-dot" />
                {recording ? 'Recording' : 'Ready'}
              </span>
            </div>

            <div className="recorder-illustration">
              <div className={`mic-circle ${recording ? 'mic-active' : ''}`}>
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <rect x="9" y="2" width="6" height="13" rx="3" />
                  <path d="M5 11a7 7 0 0 0 14 0M12 18v4M8 22h8" />
                </svg>
              </div>
              <div className="sound-bars" aria-hidden="true">
                {Array.from({ length: 23 }, (_, index) => (
                  <span
                    key={index}
                    style={{ height: `${12 + ((index * 17) % 35)}px` }}
                  />
                ))}
              </div>
            </div>

            <p className="recorder-description">
              {recording
                ? 'Speak now. Select Stop recording when you are finished.'
                : 'Use your microphone to capture a local audio recording.'}
            </p>

            <div className="button-row">
              {!recording ? (
                <button
                  type="button"
                  className="primary-button"
                  onClick={() => void startRecording()}
                  disabled={busy}
                >
                  ● Start recording
                </button>
              ) : (
                <button
                  type="button"
                  className="danger-button"
                  onClick={stopRecording}
                >
                  ■ Stop recording
                </button>
              )}
            </div>

            <div className="privacy-note">
              <span>✓</span>
              Audio is saved in this browser's local database. It is not uploaded to a server.
            </div>
          </article>

          <article className="panel recordings-panel">
            <div className="panel-heading">
              <div>
                <span className="mini-label">YOUR AUDIO</span>
                <h3>Saved recordings</h3>
              </div>
              <span className="count-badge">{recordings.length}</span>
            </div>

            {recordings.length === 0 ? (
              <div className="empty-state">
                <span className="empty-icon">♫</span>
                <strong>No recordings yet</strong>
                <p>Your saved audio recordings will appear here.</p>
              </div>
            ) : (
              <div className="recording-list">
                {recordings.map((item) => (
                  <article className="recording-item" key={item.id}>
                    <div className="recording-file-icon">♫</div>
                    <div className="recording-details">
                      <strong>{item.name}</strong>
                      <small>{item.date}</small>
                      <audio controls preload="none" src={item.url}>
                        Your browser does not support audio playback.
                      </audio>
                    </div>
                    <button
                      type="button"
                      className="text-button"
                      onClick={() => void removeRecording(item)}
                    >
                      Delete
                    </button>
                  </article>
                ))}
              </div>
            )}

            <p className="subtle-note">
              Saved recordings are available in this browser on this device. Clearing site data may delete them.
            </p>
          </article>
        </div>
      </section>

      <section className="workspace-section" id="transcript">
        <div className="section-heading">
          <div>
            <span className="eyebrow">02 / REVIEW</span>
            <h2>Transcript Desk</h2>
            <p>Edit text and save your corrections locally.</p>
          </div>
          <span className="section-tag">Editable text</span>
        </div>

        <div className="panel transcript-panel">
          <div className="panel-heading">
            <div>
              <span className="mini-label">TRANSCRIPT WORKSPACE</span>
              <h3>Review the words</h3>
            </div>
            <span className="mock-badge">DEMO TEXT</span>
          </div>

          <div className="transcript-warning">
            <span>i</span>
            This is sample text, not a transcript generated by Gnani AI. Replace it with your verified transcript.
          </div>

          <label className="field-label" htmlFor="transcript-text">
            Transcript text
          </label>
          <textarea
            id="transcript-text"
            className="transcript-editor"
            value={transcript}
            onChange={(event) => setTranscript(event.target.value)}
            rows={7}
            placeholder="Enter or edit the transcript here..."
          />

          <div className="transcript-footer">
            <span>{transcript.trim() ? transcript.trim().split(/\s+/).length : 0} words</span>
            <button type="button" className="primary-button" onClick={saveTranscript}>
              Save transcript
            </button>
          </div>

          <div className="review-tip">
            <strong>Review tip</strong>
            <p>
              Double-check names, dates, amounts, directions, and dialect-specific words with the speaker or audio. Do not assume an automatically flagged word is wrong.
            </p>
          </div>
        </div>
      </section>

      <section className="workspace-section" id="stories">
        <div className="section-heading">
          <div>
            <span className="eyebrow">03 / PRESERVE</span>
            <h2>YaadVault</h2>
            <p>Keep community stories, sayings, and coastal memories.</p>
          </div>
          <span className="section-tag">Consent-first archive</span>
        </div>

        <div className="workspace-grid story-grid">
          <article className="panel story-form-panel">
            <div className="panel-heading">
              <div>
                <span className="mini-label">COMMUNITY ARCHIVE</span>
                <h3>Preserve a story</h3>
              </div>
              <span className="story-symbol">✳</span>
            </div>

            <form
              onSubmit={(event) => {
                event.preventDefault()
                saveStory()
              }}
            >
              <label className="field-label" htmlFor="story-title">Story title</label>
              <input
                id="story-title"
                value={storyTitle}
                onChange={(event) => setStoryTitle(event.target.value)}
                placeholder="e.g. The monsoon and the sea"
                required
              />

              <label className="field-label" htmlFor="speaker-name">Speaker or storyteller</label>
              <input
                id="speaker-name"
                value={speaker}
                onChange={(event) => setSpeaker(event.target.value)}
                placeholder="Name or chosen community label"
                required
              />

              <label className="field-label" htmlFor="story-text">Story, proverb, or memory</label>
              <textarea
                id="story-text"
                value={story}
                onChange={(event) => setStory(event.target.value)}
                rows={5}
                placeholder="Write the story in the speaker's own words..."
                required
              />

              <label className="consent-option">
                <input
                  type="checkbox"
                  checked={consent}
                  onChange={(event) => setConsent(event.target.checked)}
                />
                <span>
                  I confirm that the speaker has agreed to save this story in this browser for this demo.
                </span>
              </label>

              <button type="submit" className="primary-button">
                Save story locally
              </button>
            </form>

            <p className="subtle-note">
              This demo stores stories only in this browser. It does not publish or upload them.
            </p>
          </article>

          <article className="panel saved-stories-panel">
            <div className="panel-heading">
              <div>
                <span className="mini-label">YOUR COLLECTION</span>
                <h3>Saved stories</h3>
              </div>
              <span className="count-badge">{stories.length}</span>
            </div>

            {stories.length === 0 ? (
              <div className="empty-state">
                <span className="empty-icon">⌂</span>
                <strong>Your archive starts here</strong>
                <p>Stories you save with consent will appear in this list.</p>
              </div>
            ) : (
              <div className="saved-story-list">
                {stories.map((item) => (
                  <article className="saved-story" key={item.id}>
                    <div className="saved-story-top">
                      <span className="story-symbol">✳</span>
                      <button
                        type="button"
                        className="text-button"
                        onClick={() => removeStory(item.id)}
                      >
                        Delete
                      </button>
                    </div>
                    <h4>{item.title}</h4>
                    <p className="story-byline">
                      Shared by {item.speaker} · {item.date}
                    </p>
                    <p className="saved-story-content">{item.story}</p>
                  </article>
                ))}
              </div>
            )}
          </article>
        </div>
      </section>

      <footer className="app-footer">
        <a className="brand footer-brand" href="#home">
          <span className="brand-mark">J</span>
          <strong>JalVaani</strong>
        </a>
        <p>
          When the sea gets loud, every voice deserves to be understood.
        </p>
        <span>Frontend prototype · Local browser storage</span>
      </footer>
    </main>
  )
}

export default App