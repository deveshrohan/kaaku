import { useState } from 'react'
import { motion } from 'framer-motion'

const ACTION_LABELS = {
  jira_create_issue:            { label: 'Create Jira Issue',    color: '#1868DB' },
  jira_add_comment:             { label: 'Add Jira Comment',     color: '#1868DB' },
  jira_update_issue:            { label: 'Update Jira Issue',    color: '#1868DB' },
  jira_transition_issue:        { label: 'Move Jira Issue',      color: '#1868DB' },
  github_create_branch:         { label: 'Create Git Branch',    color: '#7B68EE' },
  github_create_or_update_file: { label: 'Write File to GitHub', color: '#7B68EE' },
  github_create_pr:             { label: 'Open Pull Request',    color: '#7B68EE' },
  slack_post_message:           { label: 'Send Slack Message',   color: '#E01E5A' },
  gmail_send:                   { label: 'Send Email',           color: '#EA4335' },
}

export default function DraftApproval({ draft, lastThinking, onApprove, onReject }) {
  const [previewExpanded, setPreviewExpanded] = useState(false)
  const action = ACTION_LABELS[draft.tool] || { label: draft.tool, color: '#C8A44A' }
  const previewLong = draft.preview && draft.preview.length > 200

  return (
    <motion.div
      className="draft-approval"
      initial={{ y: 20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: 20, opacity: 0 }}
      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
    >
      {/* Action type badge */}
      <div className="draft-header">
        <span className="draft-action-badge" style={{ background: action.color + '22', color: action.color, borderColor: action.color + '44' }}>
          {action.label}
        </span>
      </div>

      {/* Consequence — what will happen */}
      {draft.consequence && (
        <div className="draft-consequence">{draft.consequence}</div>
      )}

      {/* Agent reasoning — why it wants to do this */}
      {lastThinking && (
        <div className="draft-reasoning">
          {lastThinking.length > 150 ? lastThinking.slice(0, 150) + '...' : lastThinking}
        </div>
      )}

      {/* Preview content */}
      <div
        className={`draft-preview${previewExpanded ? ' expanded' : ''}`}
        onClick={previewLong ? () => setPreviewExpanded(e => !e) : undefined}
        style={previewLong && !previewExpanded ? { cursor: 'pointer' } : {}}
      >
        {previewExpanded || !previewLong
          ? draft.preview
          : draft.preview.slice(0, 200) + '...'}
        {previewLong && (
          <span className="draft-preview-toggle">{previewExpanded ? ' ▾ less' : ' ▸ more'}</span>
        )}
      </div>

      <div className="draft-actions">
        <button className="draft-reject-btn" onClick={onReject}>Reject</button>
        <button className="draft-approve-btn" onClick={onApprove}>Approve</button>
      </div>
    </motion.div>
  )
}
