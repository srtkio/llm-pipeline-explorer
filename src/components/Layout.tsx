import { motion } from 'framer-motion'
import { useEffect, useState } from 'react'

type Stage = { id: string; label: string; value: string }

// Sticky pipeline: each stage shows a live readout and lights up while its section is on screen.
export function Rail({ stages }: { stages: Stage[] }) {
  const [active, setActive] = useState<string | null>(null)
  useEffect(() => {
    const io = new IntersectionObserver(es => es.forEach(e => e.isIntersecting && setActive(e.target.id)), { rootMargin: '-45% 0px -50% 0px' })
    stages.forEach(s => { const el = document.getElementById(s.id); if (el) io.observe(el) })
    return () => io.disconnect()
  }, [stages.length]) // sections exist once on mount

  return (
    <nav className="rail">
      <div className="rail-in wrap">
        <a href="#top" className="logo"><span className="logo-a">token</span><span className="logo-b">scope</span></a>
        <ol className="stages">
          {stages.map((s, i) => (
            <li key={s.id}>
              {i > 0 && <span className="stage-arrow" aria-hidden>→</span>}
              <a href={`#${s.id}`} className={`stage${active === s.id ? ' on' : ''}`} aria-current={active === s.id ? 'step' : undefined}>
                {active === s.id && <motion.span layoutId="stage" className="stage-bg" transition={{ type: 'spring', stiffness: 500, damping: 40 }} />}
                <span className="stage-label">{s.label}</span>
                <span className="stage-value">{s.value}</span>
              </a>
            </li>
          ))}
        </ol>
        <a className="rail-src" href="https://github.com/srtkio/llm-pipeline-explorer" target="_blank" rel="noreferrer">Source</a>
      </div>
    </nav>
  )
}

export function Head({ step, title, lead, children }: { step: number; title: string; lead: string; children: React.ReactNode }) {
  return (
    <div className="head">
      <span className="head-step">Step {step}</span>
      <h2>{title}</h2>
      <p className="head-lead">{lead}</p>
      <details className="how">
        <summary>How it works</summary>
        <div className="how-body">{children}</div>
      </details>
    </div>
  )
}
