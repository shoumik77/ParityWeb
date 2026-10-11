import { useEffect, useRef, useState } from "react"
import pluginScreenshot from "./imports/parity-spectrum.png"
import demoVideo from "./imports/parity-demo.mp4"

function musicalSpectrumPath(
  beats: number,
  reference: boolean,
  floor = 220,
  levels: number[] = [],
) {
  const peak = (position: number, center: number, width: number) =>
    Math.exp(-Math.pow((position - center) / width, 2))
  const pulse = (phase: number) => {
    const cycle = ((phase % 1) + 1) % 1
    return cycle < 0.12
      ? 0.5 - 0.5 * Math.cos((cycle / 0.12) * Math.PI)
      : Math.exp(-Math.pow((cycle - 0.12) / 0.26, 2))
  }
  const timing = beats + (reference ? -0.025 : 0)
  const beatIndex = ((Math.floor(timing) % 8) + 8) % 8
  const accents = [1, 0.72, 0.86, 0.68, 0.96, 0.74, 0.82, 0.6]
  const kick = pulse(timing) * accents[beatIndex]
  const snare = pulse((timing - 1) / 2)
  const hats = pulse(timing * 2 + 0.5) * (beatIndex % 2 ? 0.7 : 1)
  const sustain = 0.5 + 0.5 * Math.sin((timing * Math.PI) / 8)
  const points = Array.from({ length: 81 }, (_, index) => {
    const position = index / 80
    const band = position * Math.max(0, levels.length - 1)
    const bandIndex = Math.floor(band)
    const blend = band - bandIndex
    const sampleLevel = (offset: number) =>
      levels[Math.max(0, Math.min(levels.length - 1, bandIndex + offset))] ?? 0
    const level =
      (sampleLevel(-1) * Math.pow(1 - blend, 3) +
        sampleLevel(0) * (3 * blend ** 3 - 6 * blend ** 2 + 4) +
        sampleLevel(1) * (-3 * blend ** 3 + 3 * blend ** 2 + 3 * blend + 1) +
        sampleLevel(2) * blend ** 3) /
      6
    const base =
      135 +
      position * 10 -
      peak(position, reference ? 0.17 : 0.19, 0.12) * 53 +
      peak(position, 0.48, 0.19) * 12 -
      peak(position, reference ? 0.8 : 0.83, 0.18) * (reference ? 43 : 35)
    const rhythm =
      kick * peak(position, 0.17, 0.14) * 10 +
      snare * peak(position, 0.5, 0.22) * 5 +
      hats * peak(position, 0.84, 0.18) * 3
    const phrase = sustain * peak(position, 0.34, 0.3) * 2
    const height =
      (Math.max(
        28,
        Math.min(190, base + level + phrase - rhythm + (reference ? 5 : 0)),
      ) *
        floor) /
      220
    return [position * 1000, height] as const
  })
  const commands = [`M${points[0][0].toFixed(2)} ${points[0][1].toFixed(2)}`]
  for (let index = 1; index < points.length - 1; index++) {
    const point = points[index]
    const next = points[index + 1]
    commands.push(
      `Q${point[0].toFixed(2)} ${point[1].toFixed(2)} ${((point[0] + next[0]) / 2).toFixed(2)} ${((point[1] + next[1]) / 2).toFixed(2)}`,
    )
  }
  const last = points[points.length - 1]
  commands.push(`L${last[0].toFixed(2)} ${last[1].toFixed(2)}`)
  return commands.join(" ")
}

function useMusicalSpectrum(playing: boolean, floor: number) {
  const graphRef = useRef<SVGSVGElement>(null)
  const bandsRef = useRef(
    Array.from({ length: 10 }, () => ({
      mix: 0,
      reference: 0,
      mixTarget: 0,
      refTarget: 0,
      nextUpdate: 0,
    })),
  )
  const clockRef = useRef(0)

  useEffect(() => {
    const graph = graphRef.current
    if (!graph || !playing) return
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)")
    const mix = graph.querySelector<SVGPathElement>("[data-music='mix']")
    const reference = graph.querySelector<SVGPathElement>("[data-music='ref']")
    const fill = graph.querySelector<SVGPathElement>("[data-music='fill']")
    let frame = 0
    let visible = true
    let previous = 0

    const draw = (time: number) => {
      frame = 0
      if (!visible || preference.matches || document.hidden) return
      frame = requestAnimationFrame(draw)
      if (time - previous < 16) return
      const elapsed = previous ? Math.min(time - previous, 50) : 16
      previous = time
      clockRef.current += elapsed / 1000
      const beats = clockRef.current * (108 / 60)
      bandsRef.current.forEach((band, index) => {
        if (time >= band.nextUpdate) {
          const range = index < 3 ? 16 : index < 7 ? 12 : 10
          band.mixTarget = (Math.random() - 0.5) * range
          band.refTarget =
            band.mixTarget * 0.55 + (Math.random() - 0.5) * range * 0.65
          band.nextUpdate = time + 550 + Math.random() * 1300
        }
        const attack = band.mixTarget < band.mix ? 220 : 450
        band.mix +=
          (band.mixTarget - band.mix) * (1 - Math.exp(-elapsed / attack))
        const refAttack = band.refTarget < band.reference ? 240 : 500
        band.reference +=
          (band.refTarget - band.reference) *
          (1 - Math.exp(-elapsed / refAttack))
      })
      const mixLevels = bandsRef.current.map((band) => band.mix)
      const refLevels = bandsRef.current.map((band) => band.reference)
      const mixCurve = musicalSpectrumPath(beats, false, floor, mixLevels)
      mix?.setAttribute("d", mixCurve)
      reference?.setAttribute(
        "d",
        musicalSpectrumPath(beats, true, floor, refLevels),
      )
      fill?.setAttribute("d", `${mixCurve} L1000 ${floor} L0 ${floor} Z`)
    }
    const restart = () => {
      cancelAnimationFrame(frame)
      frame = 0
      previous = 0
      if (visible && !preference.matches && !document.hidden)
        frame = requestAnimationFrame(draw)
    }
    const observer = new IntersectionObserver((entries) => {
      visible = entries[0].isIntersecting
      restart()
    })
    observer.observe(graph)
    preference.addEventListener("change", restart)
    document.addEventListener("visibilitychange", restart)
    restart()
    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
      preference.removeEventListener("change", restart)
      document.removeEventListener("visibilitychange", restart)
    }
  }, [playing, floor])
  return graphRef
}

function Arrow({ down = false }: { down?: boolean }) {
  return <span aria-hidden="true">{down ? "↓" : "↗"}</span>
}

function SignalRibbon({ quiet = false }: { quiet?: boolean }) {
  const lines = Array.from({ length: 4 }, (_, layer) => {
    const points = Array.from({ length: 241 }, (_, index) => {
      const horizontal = -100 + index * (1400 / 240)
      const envelope =
        8 + Math.exp(-Math.pow((horizontal - 600) / 380, 2)) * (42 - layer * 5)
      const vertical =
        80 +
        Math.sin(horizontal / (45 + layer * 5) + layer * 0.7) * envelope +
        Math.sin(horizontal / 160 + layer) * 7
      return [horizontal, vertical] as const
    })
    const commands = [`M${points[0][0]} ${points[0][1].toFixed(2)}`]
    for (let index = 1; index < points.length - 1; index++) {
      const point = points[index]
      const next = points[index + 1]
      commands.push(
        `Q${point[0].toFixed(2)} ${point[1].toFixed(2)} ${((point[0] + next[0]) / 2).toFixed(2)} ${((point[1] + next[1]) / 2).toFixed(2)}`,
      )
    }
    return commands.join(" ")
  })
  return (
    <div
      className={`signal-ribbon ${quiet ? "signal-ribbon--quiet" : ""}`}
      aria-hidden="true"
    >
      <svg
        viewBox="0 0 1200 160"
        preserveAspectRatio="none"
        className="h-full w-full"
      >
        <g className="signal-current">
          <path
            d={lines[0]}
            fill="none"
            stroke="var(--orange)"
            strokeWidth="1.4"
            vectorEffect="non-scaling-stroke"
          />
          <path
            d={lines[1]}
            fill="none"
            stroke="var(--orange)"
            strokeWidth="1"
            opacity=".5"
            vectorEffect="non-scaling-stroke"
          />
        </g>
        <g className="signal-current signal-current--second">
          <path
            d={lines[2]}
            fill="none"
            stroke="var(--taupe)"
            strokeWidth="1.2"
            vectorEffect="non-scaling-stroke"
          />
          <path
            d={lines[3]}
            fill="none"
            stroke="var(--orange)"
            strokeWidth="1"
            opacity=".6"
            vectorEffect="non-scaling-stroke"
          />
        </g>
      </svg>
    </div>
  )
}

function PluginWindow() {
  const graphRef = useMusicalSpectrum(true, 300)
  return (
    <div className="hero-plugin">
      <img
        src={pluginScreenshot}
        alt="The new dark Parity interface, with spectrum comparison, loudness and stereo measurements, and copper-accented master controls."
        className="block h-auto w-full"
        width={1100}
        height={750}
        decoding="async"
      />
      <svg
        ref={graphRef}
        className="plugin-live-spectrum"
        viewBox="0 0 1000 300"
        preserveAspectRatio="none"
        role="img"
        aria-label="Gently pulsing mix and reference spectrum preview"
      >
        <defs>
          <pattern id="plugin-grid" width="100" height="30" patternUnits="userSpaceOnUse">
            <path d="M 0 0 V 30 M 0 30 H 100" fill="none" stroke="var(--line-soft)" strokeWidth="1" />
          </pattern>
        </defs>
        <rect width="1000" height="300" fill="var(--graph-background)" />
        <rect width="1000" height="300" fill="url(#plugin-grid)" />
        <path data-music="fill" d={`${musicalSpectrumPath(0, false, 300)} L1000 300 L0 300 Z`} fill="var(--ink)" fillOpacity="0.045" />
        <path data-music="mix" d={musicalSpectrumPath(0, false, 300)} fill="none" stroke="var(--ink)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
        <path data-music="ref" d={musicalSpectrumPath(0, true, 300)} fill="none" stroke="var(--orange)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
      </svg>
    </div>
  )
}

function CountValue({ value }: { value: string }) {
  const [visible, setVisible] = useState(false)
  const [displayValue, setDisplayValue] = useState(value)
  const ref = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true)
          observer.disconnect()
        }
      },
      { threshold: 0.6 },
    )
    if (ref.current) observer.observe(ref.current)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (
      !visible ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    )
      return
    const target = Number(value.replace("−", "-"))
    if (!Number.isFinite(target)) return
    let frame = 0
    const start = performance.now()
    const animate = (time: number) => {
      const progress = Math.min((time - start) / 1200, 1)
      const current = target * (1 - Math.pow(1 - progress, 3))
      setDisplayValue(
        progress === 1 ? value : current.toFixed(1).replace("-", "−"),
      )
      if (progress < 1) frame = requestAnimationFrame(animate)
    }
    frame = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(frame)
  }, [visible, value])

  return (
    <span className={visible ? "number number--visible" : "number"} ref={ref}>
      {displayValue}
    </span>
  )
}

const features = [
  [
    "01",
    "Instant A/B",
    "Switch between your mix and reference without breaking your workflow.",
  ],
  [
    "02",
    "Loudness",
    "Compare momentary, short-term, and integrated loudness using industry-standard LUFS measurement.",
  ],
  [
    "03",
    "Spectrum",
    "See how the frequency balance of your mix compares against your reference.",
  ],
  [
    "04",
    "Stereo",
    "Compare correlation and stereo width between your mix and reference.",
  ],
]

const loudnessRows = [
  ["Momentary", "−12.8", "−11.4", "−1.4", "LUFS"],
  ["Short-term", "−13.2", "−12.1", "−1.1", "LUFS"],
  ["Integrated", "−14.1", "−12.9", "−1.2", "LUFS"],
  ["True Peak", "−1.2", "−0.8", "−0.4", "dBTP"],
]

const featureDetails = [
  "Keep your reference inside the session. Move between MIX and REF to check balance, tone, and dynamics without switching applications.",
  "Momentary readings show the immediate picture; short-term readings reveal a phrase; integrated loudness gives you the whole-track perspective. True peak helps you check headroom.",
  "Compare low-end weight, midrange balance, and high-frequency energy. The overlay puts both curves in the same frame so differences are easier to spot.",
  "Use correlation and width together to understand the stereo picture. Compare your mix with the reference before making decisions about space and separation.",
]

export default function App() {
  const [menuOpen, setMenuOpen] = useState(false)
  const [showIntro, setShowIntro] = useState(
    () => !window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  )
  const pageRef = useRef<HTMLElement>(null)
  const progressRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!showIntro) return
    const timer = window.setTimeout(() => setShowIntro(false), 1550)
    return () => window.clearTimeout(timer)
  }, [showIntro])

  useEffect(() => {
    const page = pageRef.current
    if (!page) return
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)")
    if (reducedMotion.matches) return
    const targets = page.querySelectorAll<HTMLElement>(
      ".section-kicker, .feature-item, .workflow > h2, .steps article, .open-source-grid > div, .download > h2",
    )
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return
          entry.target.classList.add("is-revealed")
          observer.unobserve(entry.target)
        })
      },
      { threshold: 0.12, rootMargin: "0px 0px -24px 0px" },
    )
    targets.forEach((target) => {
      if (target.getBoundingClientRect().top < window.innerHeight) return
      target.classList.add("scroll-reveal")
      observer.observe(target)
    })
    const showFocused = (event: FocusEvent) => {
      const target = event.target as HTMLElement
      target.closest(".scroll-reveal")?.classList.add("is-revealed")
    }
    const showAll = () => {
      if (reducedMotion.matches)
        targets.forEach((target) => target.classList.add("is-revealed"))
    }
    page.addEventListener("focusin", showFocused)
    reducedMotion.addEventListener("change", showAll)
    return () => {
      observer.disconnect()
      targets.forEach((target) =>
        target.classList.remove("scroll-reveal", "is-revealed"),
      )
      page.removeEventListener("focusin", showFocused)
      reducedMotion.removeEventListener("change", showAll)
    }
  }, [])

  useEffect(() => {
    let frame = 0
    const update = () => {
      frame = 0
      const distance =
        document.documentElement.scrollHeight - window.innerHeight
      const progress =
        distance > 0 ? Math.min(Math.max(window.scrollY / distance, 0), 1) : 0
      if (progressRef.current)
        progressRef.current.style.transform = `scaleX(${progress})`
    }
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update)
    }
    update()
    window.addEventListener("scroll", schedule, { passive: true })
    window.addEventListener("resize", schedule)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener("scroll", schedule)
      window.removeEventListener("resize", schedule)
    }
  }, [])

  return (
    <main
      ref={pageRef}
      onClickCapture={(event) => {
        if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
        const link = (event.target as Element).closest<HTMLAnchorElement>('a[href^="#"]')
        if (!link) return
        const id = link.getAttribute("href")?.slice(1)
        const destination = id ? document.getElementById(id) : null
        if (!destination) return
        event.preventDefault()
        event.stopPropagation()
        setMenuOpen(false)
        destination.querySelectorAll(".scroll-reveal").forEach((element) => {
          element.classList.add("is-revealed")
        })
        destination.scrollIntoView({
          behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth",
          block: "start",
        })
      }}
    >
      {showIntro && (
        <div
          className="refresh-intro pointer-events-none fixed inset-0 z-[100] grid place-items-center overflow-hidden bg-[var(--cream)]"
          aria-hidden="true"
        >
          <svg
            className="h-auto w-[min(76vw,420px)] text-[var(--ink)]"
            viewBox="0 0 420 120"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <g className="intro-position">
              <g className="intro-parity">
                <path
                  className="intro-parity-stroke"
                  d="M 43 92 V 28 H 65 C 91 28 91 62 65 62 H 43"
                  pathLength="1"
                />
              </g>
            </g>
            <g className="intro-letters">
              <path
                d="M 105 92 L 125 28 L 145 92 M 112 70 H 138"
                pathLength="1"
              />
              <path
                d="M 172 92 V 28 H 193 C 219 28 219 61 193 61 H 172 M 193 61 L 214 92"
                pathLength="1"
              />
              <path d="M 245 28 V 92" pathLength="1" />
              <path d="M 278 28 H 320 M 299 28 V 92" pathLength="1" />
              <path
                d="M 345 28 L 367 61 L 389 28 M 367 61 V 92"
                pathLength="1"
              />
            </g>
          </svg>
        </div>
      )}
      <div ref={progressRef} className="reading-progress" aria-hidden="true" />
      <nav
        className="nav shell"
        aria-label="Primary navigation"
        onKeyDown={(event) => {
          if (event.key === "Escape") setMenuOpen(false)
        }}
      >
        <a className="wordmark" href="#top" aria-label="Parity home" onClick={() => setMenuOpen(false)}>
          <svg
            className="nav-wordmark"
            viewBox="35 20 362 80"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M 43 92 V 28 H 65 C 91 28 91 62 65 62 H 43" />
            <path d="M 105 92 L 125 28 L 145 92 M 112 70 H 138" />
            <path d="M 172 92 V 28 H 193 C 219 28 219 61 193 61 H 172 M 193 61 L 214 92" />
            <path d="M 245 28 V 92" />
            <path d="M 278 28 H 320 M 299 28 V 92" />
            <path d="M 345 28 L 367 61 L 389 28 M 367 61 V 92" />
          </svg>
        </a>
        <button
          type="button"
          className="ml-auto mr-4 min-h-11 px-3 font-mono text-[10px] tracking-widest min-[801px]:hidden"
          aria-expanded={menuOpen}
          aria-controls="mobile-navigation"
          onClick={() => setMenuOpen(!menuOpen)}
        >
          {menuOpen ? "CLOSE −" : "MENU +"}
        </button>
        <div className="nav-links">
          <a href="#features">Features</a>
          <a href="#workflow">Workflow</a>
          <a href="#docs">Open source</a>
          <a className="button button--small" href="#download" onClick={() => setMenuOpen(false)}>
            Get Parity <Arrow down />
          </a>
        </div>
        {menuOpen && (
          <div
            id="mobile-navigation"
            className="absolute inset-x-0 top-full flex flex-col border-b border-[var(--line)] bg-[var(--cream)] px-6 py-4 shadow-lg min-[801px]:hidden"
          >
            {[
              ["FEATURES", "#features"],
              ["WORKFLOW", "#workflow"],
              ["OPEN SOURCE", "#docs"],
              ["DOWNLOAD", "#download"],
            ].map(([label, href]) => (
              <a
                key={href}
                href={href}
                onClick={() => setMenuOpen(false)}
                className="border-b border-[var(--line-soft)] py-4 font-mono text-xs tracking-widest last:border-0 hover:text-[var(--orange)]"
              >
                {label} <span className="float-right">↗</span>
              </a>
            ))}
          </div>
        )}
      </nav>

      <section className="hero shell" id="top">
        <div className="hero-copy">
          <h1 aria-label="Parity">
            <svg
              className="hero-wordmark"
              viewBox="35 20 362 80"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M 43 92 V 28 H 65 C 91 28 91 62 65 62 H 43" />
              <path d="M 105 92 L 125 28 L 145 92 M 112 70 H 138" />
              <path d="M 172 92 V 28 H 193 C 219 28 219 61 193 61 H 172 M 193 61 L 214 92" />
              <path d="M 245 28 V 92" />
              <path d="M 278 28 H 320 M 299 28 V 92" />
              <path d="M 345 28 L 367 61 L 389 28 M 367 61 V 92" />
            </svg>
          </h1>
          <div className="hero-support">
            <p>
              A free, open-source reference-track plugin built for your DAW.
              Compare your mix to your favorite tracks without interrupting your
              workflow.
            </p>
          </div>
          <div className="button-row">
            <a className="button button--dark" href="#download">
              Get Parity for macOS <Arrow down />
            </a>
            <a className="text-link" href="#features">
              See how it works <Arrow />
            </a>
          </div>
        </div>
        <div className="hero-visual">
          <PluginWindow />
        </div>
      </section>

      <section className="features shell" id="features">
        <div className="section-kicker">
          <h2>
            The tools to
            <br />
            trust your mix.
          </h2>
          <p className="feature-intro">
            Switch, measure, and compare. Get the context you need without
            adding another step to your workflow.
          </p>
        </div>
        <div className="feature-list">
          {features.map(([number, title, copy], index) => (
            <details className="feature-item group" key={number}>
              <summary className="feature-row">
                <span className="feature-number">{number}</span>
                <h3>{title}</h3>
                <p>{copy}</p>
                <span
                  className="feature-arrow group-open:rotate-45"
                  aria-hidden="true"
                >
                  +
                </span>
              </summary>
              <div className="border-t border-[var(--line-soft)] py-7 pl-12 pr-5">
                <p className="max-w-2xl text-sm leading-relaxed text-[var(--taupe)] md:text-base">
                  {featureDetails[index]}
                </p>
              </div>
            </details>
          ))}
        </div>
      </section>

      <section className="loudness">
        <div className="shell loudness-layout">
          <div className="section-kicker">
            <h2>
              Loudness,
              <br />
              in context.
            </h2>
            <p className="feature-intro">
              Compare the numbers alongside what you hear. Keep loudness,
              dynamics, and headroom in perspective.
            </p>
          </div>
          <div className="loudness-table">
            <div className="loudness-row loudness-head">
              <span>Measurement</span>
              <span>MIX</span>
              <span className="ref-text">REF</span>
              <span>MIX−REF</span>
              <span>UNIT</span>
            </div>
            {loudnessRows.map(([label, mix, ref, delta, unit]) => (
              <div className="loudness-row" key={label}>
                <span className="loudness-label">{label}</span>
                <CountValue value={mix} />
                <span className="ref-text">
                  <CountValue value={ref} />
                </span>
                <CountValue value={delta} />
                <span className="unit">{unit}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="product-views shell" aria-label="Parity demo">
        <div className="product-views-heading">
          <div>
            <h2>A closer look.<br /><span>Every detail in view.</span></h2>
            <p>From loudness to the final peaks. One focused workspace.</p>
          </div>
        </div>
        <video
          src={demoVideo}
          autoPlay
          muted
          loop
          playsInline
          preload="metadata"
          aria-label="Screen recording of the Parity plugin comparing a mix to a reference track"
        />
      </section>

      <section className="workflow shell" id="workflow">
        <h2>
          Stay in the music.
          <br />
          Keep your flow.
        </h2>
        <div className="steps">
          <article>
            <span>01</span>
            <h3>Load a reference</h3>
            <p>Drop in a track you trust.</p>
          </article>
          <article>
            <span>02</span>
            <h3>Compare your mix</h3>
            <p>Switch instantly between MIX and REF.</p>
          </article>
          <article>
            <span>03</span>
            <h3>Make your adjustments</h3>
            <p>
              Use loudness, spectrum, and stereo differences to guide your
              decisions.
            </p>
          </article>
        </div>
      </section>

      <section className="open-source" id="docs">
        <div className="shell open-source-grid">
          <div>
            <h2>
              Built for producers.
              <br />
              Open by design.
            </h2>
          </div>
          <div className="open-source-copy">
            <p>
              Parity is free and open source. A focused tool for producers and
              engineers who want a clearer picture of their work, with the
              freedom to explore what’s under the hood.
            </p>
            <div className="button-row">
              <a
                className="text-link"
                href="https://github.com/shoumik77/Parity"
                target="_blank"
                rel="noopener noreferrer"
              >
                View on GitHub <Arrow />
              </a>
              <a className="text-link" href="#workflow">
                How it works <Arrow />
              </a>
            </div>
          </div>
        </div>
      </section>

      <section className="questions shell" id="questions">
        <div>
          <h2>
            A few things
            <br />
            worth knowing.
          </h2>
        </div>
        <div>
          {[
            [
              "Which plugin formats are available?",
              "Parity is a native macOS plugin available in VST3 and Audio Unit (AU) formats. Use the format supported by your DAW.",
            ],
            [
              "What can I compare?",
              "Switch between your mix and a reference track, then compare their spectrum, loudness, true peak, stereo correlation, and width.",
            ],
            [
              "How do I install it?",
              "Unzip the download and run the included Install Parity script — it copies the plugins into your VST3 and Components folders. Parity isn't notarized yet, so right-click the script and choose Open if macOS warns about an unidentified developer.",
            ],
            ["Is Parity free?", "Yes. Parity is free and open source."],
          ].map(([question, answer]) => (
            <details key={question} className="question-item group">
              <summary className="flex cursor-pointer items-center justify-between gap-6 py-6 text-base leading-relaxed">
                <span>{question}</span>
                <span
                  aria-hidden="true"
                  className="shrink-0 text-[var(--taupe)] transition-transform group-open:rotate-45"
                >
                  +
                </span>
              </summary>
              <p className="max-w-[52ch] pb-6 pr-8 text-sm leading-relaxed text-[var(--taupe)]">
                {answer}
              </p>
            </details>
          ))}
        </div>
      </section>

      <section className="download shell" id="download">
        <SignalRibbon quiet />
        <h2>
          Your next mix.
          <br />A clearer view.
        </h2>
        <a
          className="button button--download"
          href="https://github.com/shoumik77/Parity/releases/latest/download/Parity-macOS.zip"
        >
          Get Parity for macOS <Arrow down />
        </a>
      </section>

      <footer className="footer shell">
        <div>
          <span className="wordmark">PARITY</span>
        </div>
        <div className="footer-links">
          <a href="#features">Features</a>
          <a href="#docs">Open source</a>
          <a href="#questions">FAQs</a>
        </div>
        <span>2026</span>
      </footer>
    </main>
  )
}
