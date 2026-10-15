import { useState } from 'react'

// The visible label is "Show"/"Hide" and the accessible name is the same word
// plus its object, so the name still contains the visible text (WCAG 2.5.3)
// while a screen reader does not announce a bare "Show" out of context.
export default function PasswordInput({ id, autoComplete, ...inputProps }) {
  const [visible, setVisible] = useState(false)

  return (
    <div className="password-field">
      <input
        {...inputProps}
        id={id}
        type={visible ? 'text' : 'password'}
        autoComplete={autoComplete}
      />
      <button
        type="button"
        className="password-toggle"
        onClick={() => setVisible((v) => !v)}
        aria-label={`${visible ? 'Hide' : 'Show'} password`}
      >
        {visible ? 'Hide' : 'Show'}
      </button>
    </div>
  )
}