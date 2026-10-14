import useActiveSection from "../../hooks/useActiveSection";

/*
 * Floating "next chapter" pill. It tracks where the reader is and always
 * points one step ahead: hero → chapter 01 → … → last chapter → contact.
 */
export default function NextChapterButton({ items }) {
  const stops = ["top", ...items.map((item) => item.id), "contact"];
  const active = useActiveSection(stops);

  const index = stops.indexOf(active);
  const hidden = index <= 0 || active === "contact";
  const nextId = stops[Math.min(index + 1, stops.length - 1)];
  const next = items.find((item) => item.id === nextId);

  const kicker = next ? `Next · Chapter ${next.number}` : "That's the story";
  const title = next ? next.title : "Get in touch";

  return (
    <a
      href={`#${nextId}`}
      className={`next-btn ${hidden ? "" : "is-visible"}`}
      aria-label={next ? `Next chapter: ${next.title}` : "Skip to contact"}
      aria-hidden={hidden}
      tabIndex={hidden ? -1 : 0}
    >
      <span className="next-btn__text" key={nextId}>
        <span className="next-btn__kicker">{kicker}</span>
        <span className="next-btn__title">{title}</span>
      </span>
      <span className="next-btn__arrow" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
          <path d="M12 5v14M6 13l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
    </a>
  );
}
