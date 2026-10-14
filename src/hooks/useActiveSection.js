import { useEffect, useState } from "react";

/*
 * Returns the id of the section currently under the middle of the viewport:
 * the last listed section whose top has scrolled past the midline. At the very
 * bottom of the page the last section wins, so short footers still register.
 */
export default function useActiveSection(ids) {
  const [active, setActive] = useState(null);
  const key = ids.join("|");

  useEffect(() => {
    const list = key.split("|");
    let frame = 0;

    const update = () => {
      frame = 0;
      const midline = window.innerHeight * 0.5;
      const atBottom =
        window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4;
      let current = null;
      list.forEach((id) => {
        const node = document.getElementById(id);
        if (node && node.getBoundingClientRect().top <= midline) current = id;
      });
      if (atBottom && document.getElementById(list[list.length - 1])) {
        current = list[list.length - 1];
      }
      setActive(current);
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
  }, [key]);

  return active;
}
