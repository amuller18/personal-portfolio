import { useEffect, useMemo, useRef, useState } from "react";
import { useSite } from "../../context/SiteContext";
import { profile, storyOrder } from "../../data/story";

function useCommands() {
  const { mode, setMode, goTo, trigger } = useSite();

  return useMemo(() => {
    const open = (url) => window.open(url, "_blank", "noopener,noreferrer");
    return [
      ...storyOrder.map((section) => ({
        id: section.id,
        group: "Chapters",
        label: section.title,
        hint: `Chapter ${section.number}`,
        keywords: `${section.era} ${section.headline}`,
        run: () => goTo(section.id),
      })),
      {
        id: "toolkit",
        group: "Sections",
        label: "The toolkit",
        hint: "Skills",
        run: () => goTo("toolkit"),
      },
      {
        id: "contact",
        group: "Sections",
        label: "Contact",
        hint: "Say hello",
        run: () => goTo("contact"),
      },
      {
        id: "mode",
        group: "Actions",
        label: mode === "story" ? "Switch to the 30-second version" : "Switch to the full story",
        hint: "Mode",
        keywords: "recruiter summary tldr quick short",
        run: () => setMode(mode === "story" ? "summary" : "story"),
      },
      {
        id: "email",
        group: "Actions",
        label: "Email Alex",
        hint: profile.email,
        run: () => {
          window.location.href = `mailto:${profile.email}`;
        },
      },
      {
        id: "linkedin",
        group: "Actions",
        label: "Open LinkedIn",
        hint: "↗",
        run: () => open(profile.linkedin),
      },
      {
        id: "github",
        group: "Actions",
        label: "Open GitHub",
        hint: "↗",
        run: () => open(profile.github),
      },
      {
        id: "snow",
        group: "Fun",
        label: "Let it snow",
        hint: "or type “ski”",
        keywords: "ski winter powder",
        run: () => trigger("snow"),
      },
      {
        id: "confetti",
        group: "Fun",
        label: "Confetti",
        hint: "↑↑↓↓←→←→BA",
        keywords: "konami party celebrate",
        run: () => trigger("confetti"),
      },
    ];
  }, [mode, setMode, goTo, trigger]);
}

/* ⌘K command palette: jump to any chapter or run a quick action. */
export default function CommandPalette() {
  const { paletteOpen, setPaletteOpen } = useSite();
  const commands = useCommands();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef(null);
  const listRef = useRef(null);
  const returnFocus = useRef(null);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands;
    return commands.filter((c) =>
      `${c.label} ${c.hint} ${c.group} ${c.keywords || ""}`.toLowerCase().includes(q),
    );
  }, [commands, query]);

  useEffect(() => {
    if (!paletteOpen) return undefined;
    returnFocus.current = document.activeElement;
    setQuery("");
    setActive(0);
    const id = window.requestAnimationFrame(() => inputRef.current?.focus());
    return () => {
      window.cancelAnimationFrame(id);
      returnFocus.current?.focus?.({ preventScroll: true });
    };
  }, [paletteOpen]);

  useEffect(() => {
    setActive(0);
  }, [query]);

  useEffect(() => {
    const node = listRef.current?.querySelector('[aria-selected="true"]');
    node?.scrollIntoView({ block: "nearest" });
  }, [active]);

  if (!paletteOpen) return null;

  const close = () => setPaletteOpen(false);
  const run = (command) => {
    close();
    window.setTimeout(() => command.run(), 0);
  };

  const onKeyDown = (e) => {
    if (e.key === "Escape") {
      e.preventDefault();
      close();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => (results.length ? (i + 1) % results.length : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (results.length ? (i - 1 + results.length) % results.length : 0));
    } else if (e.key === "Enter" && results[active]) {
      e.preventDefault();
      run(results[active]);
    } else if (e.key === "Tab") {
      e.preventDefault();
    }
  };

  let lastGroup = null;

  return (
    <div className="palette" onMouseDown={close}>
      <div
        className="palette__dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Command menu"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="palette__search">
          <span aria-hidden="true">⌕</span>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Jump to a chapter or run a command…"
            role="combobox"
            aria-expanded="true"
            aria-controls="palette-list"
            aria-activedescendant={results[active] ? `cmd-${results[active].id}` : undefined}
            aria-autocomplete="list"
          />
          <kbd>esc</kbd>
        </div>
        <ul id="palette-list" ref={listRef} className="palette__list" role="listbox">
          {results.length === 0 && <li className="palette__empty">No matches. Try “ski”.</li>}
          {results.map((command, i) => {
            const showGroup = command.group !== lastGroup;
            lastGroup = command.group;
            return (
              <li key={command.id} role="presentation">
                {showGroup && <span className="palette__group">{command.group}</span>}
                <div
                  id={`cmd-${command.id}`}
                  role="option"
                  aria-selected={i === active}
                  className={`palette__item ${i === active ? "is-active" : ""}`}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => run(command)}
                >
                  <span>{command.label}</span>
                  <span className="palette__hint">{command.hint}</span>
                </div>
              </li>
            );
          })}
        </ul>
        <div className="palette__foot">
          <span>
            <kbd>↑</kbd>
            <kbd>↓</kbd> navigate
          </span>
          <span>
            <kbd>↵</kbd> select
          </span>
        </div>
      </div>
    </div>
  );
}
