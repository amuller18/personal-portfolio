import { useEffect, useState } from "react";

/* Fixed side index of the story; highlights whichever chapter is on screen. */
export default function ChapterRail({ items }) {
  const [active, setActive] = useState(null);

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return undefined;
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) setActive(entry.target.id);
        });
      },
      { rootMargin: "-45% 0px -50% 0px" },
    );
    items.forEach((item) => {
      const node = document.getElementById(item.id);
      if (node) observer.observe(node);
    });
    return () => observer.disconnect();
  }, [items]);

  return (
    <nav className="rail" aria-label="Chapters">
      <ol>
        {items.map((item) => (
          <li key={item.id} className={active === item.id ? "is-active" : ""}>
            <a href={`#${item.id}`}>
              <span className="rail__num">{item.number}</span>
              <span className="rail__label">{item.title}</span>
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}
