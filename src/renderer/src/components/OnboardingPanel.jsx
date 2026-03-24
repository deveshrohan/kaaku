import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

function GoogleGIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
    </svg>
  )
}

const STEPS = ['welcome', 'slack', 'gmail', 'ai', 'done']

export default function OnboardingPanel({ onComplete }) {
  const [step, setStep] = useState(0)
  const [slackToken, setSlackToken] = useState('')
  const [aiProvider, setAiProvider] = useState('groq')
  const [aiKey, setAiKey] = useState('')
  const [gmailEmail, setGmailEmail] = useState('')
  const [gmailConnecting, setGmailConnecting] = useState(false)
  const [status, setStatus] = useState('')
  const [statusType, setStatusType] = useState('')

  function flash(msg, type = '') { setStatus(msg); setStatusType(type); setTimeout(() => setStatus(''), 4000) }

  function next() { setStep(s => Math.min(s + 1, STEPS.length - 1)); setStatus('') }

  async function saveSlack() {
    if (!slackToken.trim()) { next(); return }
    await window.wallE?.saveSettings({ slackUserToken: slackToken.trim() })
    flash('Saved', 'ok')
    setTimeout(next, 600)
  }

  async function connectGmail() {
    setGmailConnecting(true)
    setStatus('Opening Google sign-in...')
    setStatusType('')
    try {
      const result = await window.wallE?.gmailConnect()
      if (result?.email) {
        setGmailEmail(result.email)
        flash(`Connected as ${result.email}`, 'ok')
        setTimeout(next, 800)
      } else if (result?.error) {
        flash(result.error.slice(0, 60), 'err')
      }
    } catch (err) {
      flash(err.message?.slice(0, 60) || 'Connection failed', 'err')
    } finally {
      setGmailConnecting(false)
    }
  }

  async function saveAiKey() {
    if (!aiKey.trim()) { next(); return }
    const settings = aiProvider === 'groq'
      ? { groqApiKey: aiKey.trim(), llmProvider: 'groq' }
      : { claudeApiKey: aiKey.trim(), llmProvider: 'claude' }
    await window.wallE?.saveSettings(settings)
    flash('Saved', 'ok')
    setTimeout(next, 600)
  }

  async function finish() {
    await window.wallE?.saveSettings({ onboardingComplete: true })
    onComplete()
  }

  // What's connected for the summary
  const hasSlack = !!slackToken.trim()
  const hasGmail = !!gmailEmail
  const hasAi = !!aiKey.trim()

  return (
    <motion.div
      className="todo-panel"
      initial={{ y: 40, opacity: 0, scale: 0.96 }}
      animate={{ y: 0, opacity: 1, scale: 1 }}
      exit={{ y: 40, opacity: 0, scale: 0.96 }}
      transition={{ type: 'spring', stiffness: 320, damping: 28 }}
    >
      {/* Header */}
      <div className="todo-header">
        <div className="todo-title-group">
          {step > 0 && step < STEPS.length - 1 && (
            <button className="agent-back-btn" onClick={() => { setStep(s => s - 1); setStatus('') }}>
              &#8249;
            </button>
          )}
          <span className="todo-title">Kaaku</span>
        </div>
        <div className="todo-header-actions">
          <button className="close-btn" onClick={finish} aria-label="Skip setup">&#10005;</button>
        </div>
      </div>

      {/* Progress dots */}
      <div className="onboarding-progress">
        {STEPS.slice(1, -1).map((_, i) => (
          <div
            key={i}
            className={`onboarding-dot${i + 1 < step ? ' done' : ''}${i + 1 === step ? ' active' : ''}`}
          />
        ))}
      </div>

      {/* Step content */}
      <div className="onboarding-body">
        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            className="onboarding-step"
            initial={{ x: 30, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: -30, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 28 }}
          >
            {/* ── Welcome ─────────────────────────── */}
            {step === 0 && (
              <>
                <div className="onboarding-icon">&#10022;</div>
                <div className="onboarding-title">Welcome to Kaaku</div>
                <div className="onboarding-desc">
                  Your personal work assistant. Kaaku pulls tasks from Slack and Gmail
                  so you never miss an ask.
                </div>
                <div className="onboarding-desc" style={{ marginTop: 4, color: 'rgba(255,255,255,0.35)' }}>
                  Let's connect your accounts. Takes about a minute.
                </div>
                <button className="onboarding-cta" onClick={next}>
                  Let's connect
                </button>
                <button className="onboarding-skip" onClick={finish}>
                  Skip setup
                </button>
              </>
            )}

            {/* ── Slack ───────────────────────────── */}
            {step === 1 && (
              <>
                <div className="onboarding-icon">&#128172;</div>
                <div className="onboarding-title">Connect Slack</div>
                <div className="onboarding-desc">
                  Paste your Slack user token to auto-sync tasks from DMs and @mentions.
                </div>
                <div className="onboarding-field">
                  <label>User Token</label>
                  <input
                    placeholder="xoxp-your-token-here"
                    value={slackToken}
                    onChange={e => setSlackToken(e.target.value)}
                    autoFocus
                  />
                </div>
                <div className="onboarding-hint">
                  Find it at api.slack.com &gt; Your Apps &gt; OAuth &amp; Permissions &gt; User OAuth Token
                </div>
                {status && <div className={`onboarding-status ${statusType}`}>{status}</div>}
                <button className="onboarding-cta" onClick={saveSlack}>
                  {slackToken.trim() ? 'Save & continue' : 'Continue'}
                </button>
                <button className="onboarding-skip" onClick={next}>Skip</button>
              </>
            )}

            {/* ── Gmail ───────────────────────────── */}
            {step === 2 && (
              <>
                <div className="onboarding-icon">&#128231;</div>
                <div className="onboarding-title">Connect Gmail</div>
                <div className="onboarding-desc">
                  One-click sign-in to track actionable emails. Kaaku reads your inbox to find tasks — it never sends emails.
                </div>
                {gmailEmail ? (
                  <div className="onboarding-status ok">Connected as {gmailEmail}</div>
                ) : (
                  <button
                    className="google-signin-btn-sm"
                    onClick={connectGmail}
                    disabled={gmailConnecting}
                  >
                    <GoogleGIcon />
                    {gmailConnecting ? 'Connecting...' : 'Sign in with Google'}
                  </button>
                )}
                {status && !gmailEmail && <div className={`onboarding-status ${statusType}`}>{status}</div>}
                <button className="onboarding-cta" onClick={next}>
                  Continue
                </button>
                <button className="onboarding-skip" onClick={next}>Skip</button>
              </>
            )}

            {/* ── AI Provider ─────────────────────── */}
            {step === 3 && (
              <>
                <div className="onboarding-icon">&#129504;</div>
                <div className="onboarding-title">AI Provider</div>
                <div className="onboarding-desc">
                  Kaaku uses AI to classify your messages into actionable tasks.
                </div>
                <div className="onboarding-provider-toggle">
                  <button
                    className={`onboarding-provider-btn${aiProvider === 'groq' ? ' active' : ''}`}
                    onClick={() => { setAiProvider('groq'); setAiKey('') }}
                  >
                    Groq (free)
                  </button>
                  <button
                    className={`onboarding-provider-btn${aiProvider === 'claude' ? ' active' : ''}`}
                    onClick={() => { setAiProvider('claude'); setAiKey('') }}
                  >
                    Claude
                  </button>
                </div>
                <div className="onboarding-field">
                  <label>{aiProvider === 'groq' ? 'Groq API Key' : 'Claude API Key'}</label>
                  <input
                    placeholder={aiProvider === 'groq' ? 'gsk_...' : 'sk-ant-...'}
                    value={aiKey}
                    onChange={e => setAiKey(e.target.value)}
                    autoFocus
                  />
                </div>
                <div className="onboarding-hint">
                  {aiProvider === 'groq'
                    ? 'Free at groq.com — sign up and create an API key'
                    : 'Get your key at console.anthropic.com'}
                </div>
                {status && <div className={`onboarding-status ${statusType}`}>{status}</div>}
                <button className="onboarding-cta" onClick={saveAiKey}>
                  {aiKey.trim() ? 'Save & continue' : 'Continue'}
                </button>
                <button className="onboarding-skip" onClick={next}>Skip</button>
              </>
            )}

            {/* ── Done ────────────────────────────── */}
            {step === 4 && (
              <>
                <div className="onboarding-icon">&#10024;</div>
                <div className="onboarding-title">You're all set!</div>
                <div className="onboarding-summary">
                  <div className="onboarding-summary-item">
                    <div className={`onboarding-summary-dot${hasSlack ? ' connected' : ''}`} />
                    Slack {hasSlack ? 'connected' : 'not connected'}
                  </div>
                  <div className="onboarding-summary-item">
                    <div className={`onboarding-summary-dot${hasGmail ? ' connected' : ''}`} />
                    Gmail {hasGmail ? `connected (${gmailEmail})` : 'not connected'}
                  </div>
                  <div className="onboarding-summary-item">
                    <div className={`onboarding-summary-dot${hasAi ? ' connected' : ''}`} />
                    AI {hasAi ? `(${aiProvider})` : 'not configured'}
                  </div>
                </div>
                <div className="onboarding-desc">
                  {hasSlack || hasGmail
                    ? 'Kaaku will sync your tasks every 30 minutes.'
                    : 'You can connect integrations later in Settings.'}
                </div>
                <button className="onboarding-cta" onClick={finish}>
                  {hasSlack || hasGmail ? 'Sync now & get started' : 'Get started'}
                </button>
                <div className="onboarding-hint" style={{ marginTop: 4 }}>
                  Tip: Right-click the character for surprises!
                </div>
              </>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </motion.div>
  )
}
