import { useEffect, useRef, useState } from 'react'
import './App.css'

type Recording = {
  id: string
  name: string
  date: string
  url: string
}

function App() {
  const [online, setOnline] = useState(navigator.onLine)
  const [recording, setRecording] = useState(false)
  const [recordings, setRecordings] = useState<Recording[]>([])
  const [transcript, setTranscript] = useState(
    'Welcome to JalVaani. Your reviewed transcript will appear here.'
  )
  const [story, setStory] = useState('')
  const [speaker, setSpeaker] = useState('')
  const [consent, setConsent] = useState(false)
  const [notice, setNotice] = useState('')
  const mediaRecorder = useRef<MediaRecorder | null>(null)
  const chunks = useRef<Blob[]>([])

  useEffect(() => {
    const onOnline = () => setOnline(true)
    const onOffline = () => setOnline(false)
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    return () => {
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
      recordings.forEach((item) => URL.revokeObjectURL(item.url))
    }
  }, [recordings])

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      chunks.current = []
      const recorder = new MediaRecorder(stream)
      mediaRecorder.current = recorder
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.current.push(event.data)
      }
      recorder.onstop = () => {
        const blob = new Blob(chunks.current, { type: 'audio/webm' })
        const url = URL.createObjectURL(blob)
        const item = {
          id: crypto.randomUUID(),
          name: `Coastal recording ${recordings.length + 1}`,
          date: new Date().toLocaleString(),
          url,
        }
        setRecordings((current) => [item, ...current])
        setNotice('Recording saved in this browser session.')
        stream.getTracks().forEach((track) => track.stop())
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
      setRecording(false)
    }
  }

  function saveTranscript() {
    localStorage.setItem('jalvaani-transcript', transcript)
    setNotice('Transcript saved in this browser.')
  }

  function saveStory() {
    if (!consent) {
      setNotice('Please confirm consent before saving this story.')
      return
    }
    const stories = JSON.parse(localStorage.getItem('jalvaani-stories') || '[]')
    stories.push({ story, speaker, date: new Date().toISOString() })
    localStorage.setItem('jalvaani-stories', JSON.stringify(stories))
    setStory('')
    setSpeaker('')
    setConsent(false)
    setNotice('Story saved in this browser with your consent.')
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="#home"><span className="brand-mark">J</span><span>JalVaani<small>COASTAL VOICE INTELLIGENCE</small></span></a>
        <nav><a href="#studio">Voice Studio</a><a href="#transcript">Transcript</a><a href="#vault">YaadVault</a></nav>
        <span className={online ? 'status online' : 'status offline'}><i />{online ? 'Online' : 'Offline'}</span>
      </header>

      <section className="hero" id="home">
        <div className="hero-copy">
          <span className="eyebrow">VOICE • CULTURE • COMMUNITY</span>
          <h1>When the sea gets loud,<br /><em>every voice matters.</em></h1>
          <p>Capture coastal voices, review transcripts, and preserve stories for the next generation—even when connectivity is unreliable.</p>
          <a className="primary-link" href="#studio">Open Voice Studio <span>↗</span></a>
          <div className="hero-note"><span>◉</span> Designed for noisy, low-connectivity environments</div>
        </div>
        <div className="wave-card">
          <div className="wave-top"><span>FIELD NOTE / 001</span><span>JALVAANI</span></div>
          <div className="sun" />
          <svg viewBox="0 0 480 200" role="img" aria-label="Illustrated coastal sound waves"><path d="M0 100 Q60 50 120 100 T240 100 T360 100 T480 100" /><path d="M0 120 Q60 70 120 120 T240 120 T360 120 T480 120" /><path d="M0 140 Q60 90 120 140 T240 140 T360 140 T480 140" /></svg>
          <div className="wave-footer"><span>LISTEN CLOSELY</span><span>20° / 40° N</span></div>
        </div>
      </section>

      <section className="stats">
        <div><span>01</span><strong>Capture</strong><small>Record voices locally</small></div>
        <div><span>02</span><strong>Review</strong><small>Correct words & numbers</small></div>
        <div><span>03</span><strong>Preserve</strong><small>Keep stories with consent</small></div>
        <div><span>04</span><strong>Continue</strong><small>Work through poor signal</small></div>
      </section>

      {notice && <div className="notice" role="status">{notice}<button onClick={() => setNotice('')} aria-label="Dismiss notice">×</button></div>}

      <section className="section-block" id="studio">
        <div className="section-heading"><div><span className="eyebrow">01 / FIELD RECORDING</span><h2>Voice Studio</h2><p>Capture a voice right from your device.</p></div><span className="section-number">REC / 01</span></div>
        <div className="studio-grid">
          <article className="panel recording-panel">
            <div className="panel-kicker">AUDIO CAPTURE <span className={recording ? 'pulse active' : 'pulse'} /></div>
            <div className="mic-orb">♫</div>
            <h3>{recording ? 'Listening to your voice…' : 'Ready when you are.'}</h3>
            <p>{recording ? 'Speak naturally. Stop when you have finished.' : 'Find a quieter moment if possible, then start a recording.'}</p>
            {!recording ? <button className="button-dark" onClick={startRecording}>● Start recording</button> : <button className="button-danger" onClick={stopRecording}>■ Stop & save</button>}
            <small className="helper">Microphone permission is required. Recordings stay in this browser session in this prototype.</small>
          </article>
          <article className="panel queue-panel">
            <div className="panel-kicker">LOCAL RECORDINGS <span>{recordings.length.toString().padStart(2, '0')} ITEMS</span></div>
            {recordings.length === 0 ? <div className="empty-state"><span>↗</span><strong>No recordings yet</strong><p>Your captured audio will appear here.</p></div> : recordings.map((item) => <div className="recording-item" key={item.id}><div className="file-icon">♫</div><div className="file-info"><strong>{item.name}</strong><small>{item.date}</small><audio controls src={item.url} /></div><button className="text-button" onClick={() => setRecordings((current) => current.filter((r) => r.id !== item.id))}>Remove</button></div>)}
            <div className="queue-foot"><span className={online ? 'tiny-dot online-dot' : 'tiny-dot offline-dot'} />{online ? 'Connection available' : 'Offline — keep working locally'}</div>
          </article>
        </div>
      </section>

      <section className="section-block" id="transcript">
        <div className="section-heading"><div><span className="eyebrow">02 / HUMAN REVIEW</span><h2>Transcript desk</h2><p>Review and correct what the system hears.</p></div><span className="section-number">EDIT / 02</span></div>
        <div className="panel transcript-panel">
          <div className="transcript-meta"><span>MOCK TRANSCRIPT</span><span>Manual review enabled</span></div>
          <label htmlFor="transcript">Transcript text</label>
          <textarea id="transcript" value={transcript} onChange={(e) => setTranscript(e.target.value)} rows={6} />
          <div className="review-note"><span>ⓘ</span><p>This is placeholder text, not AI-generated transcription. Review names, dates, amounts, and directions carefully before confirming.</p></div>
          <button className="button-dark" onClick={saveTranscript}>Save transcript</button>
        </div>
      </section>

      <section className="section-block" id="vault">
        <div className="section-heading"><div><span className="eyebrow">03 / LIVING HERITAGE</span><h2>YaadVault</h2><p>Preserve a memory, proverb, or coastal tradition—with permission.</p></div><span className="section-number">STORY / 03</span></div>
        <div className="vault-grid">
          <article className="vault-intro"><span className="vault-symbol">❧</span><h3>Every story deserves a future.</h3><p>Community knowledge belongs to the people who share it. Ask first, explain how it may be used, and respect a person's decision.</p><div className="vault-tag">CONSENT FIRST · COMMUNITY OWNED</div></article>
          <article className="panel story-panel">
            <label htmlFor="speaker">Speaker name or alias (optional)</label><input id="speaker" value={speaker} onChange={(e) => setSpeaker(e.target.value)} placeholder="e.g. A fisher from the village" />
            <label htmlFor="story">Story, proverb, or traditional knowledge</label><textarea id="story" value={story} onChange={(e) => setStory(e.target.value)} rows={5} placeholder="Write the story in the speaker's own words…" />
            <label className="consent-check"><input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} /><span>I have permission to preserve this story, and the speaker understands its intended use.</span></label>
            <button className="button-dark" onClick={saveStory}>Save with consent</button>
          </article>
        </div>
      </section>

      <footer><a className="brand footer-brand" href="#home"><span className="brand-mark">J</span><span>JalVaani<small>LET EVERY VOICE TRAVEL</small></span></a><p>Built with care for coastal communities.</p><a href="#home">Back to top ↑</a></footer>
    </main>
  )
}

export default App