import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

const LINKS = [
  { href: "#hustle", label: "Story" },
  { href: "#traderranker", label: "TraderRanker" },
  { href: "#wolfe", label: "Wall Street" },
  { href: "#now", label: "Now" },
  { href: "#next", label: "What's next" },
  { href: "#contact", label: "Contact" },
];

export default function Navbar() {
  const [open, setOpen] = useState(false);
  const [progress, setProgress] = useState(0);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      setProgress(max > 0 ? window.scrollY / max : 0);
      setScrolled(window.scrollY > 24);
    };
    const onScroll = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <header className={`nav ${scrolled ? "nav--scrolled" : ""}`}>
      <div className="nav__inner">
        <a href="#top" className="nav__brand" aria-label="Back to top">
          <img src="./img/logo.png" alt="" width="36" height="36" />
          <span>Alex Muller</span>
        </a>
        <button
          type="button"
          className={`nav__toggle ${open ? "is-open" : ""}`}
          aria-expanded={open}
          aria-controls="nav-links"
          aria-label={open ? "Close menu" : "Open menu"}
          onClick={() => setOpen((v) => !v)}
        >
          <span />
          <span />
        </button>
        <nav id="nav-links" className={`nav__links ${open ? "is-open" : ""}`}>
          {LINKS.map((link) => (
            <a key={link.href} href={link.href} onClick={() => setOpen(false)}>
              {link.label}
            </a>
          ))}
          <Link to="/ski" className="nav__game" onClick={() => setOpen(false)}>
            Ski the story ⛷
          </Link>
          <Link to="/climb" className="nav__game" onClick={() => setOpen(false)}>
            Climb the story 🧗
          </Link>
        </nav>
      </div>
      <div
        className="nav__progress"
        style={{ transform: `scaleX(${progress})` }}
        aria-hidden="true"
      />
    </header>
  );
}
