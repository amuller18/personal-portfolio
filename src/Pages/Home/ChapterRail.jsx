import useActiveSection from "../../hooks/useActiveSection";

/* Fixed side index of the story; highlights whichever chapter is on screen. */
export default function ChapterRail({ items }) {
  const active = useActiveSection(items.map((item) => item.id));

  return (
    <nav className="rail" aria-label="Chapters">
      <ol>
        {items.map((item) => (
          <li key={item.id} className={active === item.id ? "is-active" : ""}>
            <a
              href={`#${item.id}`}
              title={item.title}
              aria-label={item.title}
              aria-current={active === item.id ? "location" : undefined}
            >
              {item.number}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}
