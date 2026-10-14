import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

/*
 * Site-wide state shared by the navbar, command palette, hotkeys and pages:
 * which mode is showing (full story or 30-second summary), whether the
 * command palette is open, and the one-shot easter-egg effects.
 */
const SiteContext = createContext(null);

const MODE_PARAM = "mode";
const SUMMARY_VALUE = "30s";

function readModeFromUrl() {
  try {
    const value = new URLSearchParams(window.location.search).get(MODE_PARAM);
    return value === SUMMARY_VALUE ? "summary" : "story";
  } catch {
    return "story";
  }
}

export function SiteProvider({ children }) {
  const [mode, setModeState] = useState(readModeFromUrl);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [effects, setEffects] = useState({ snow: 0, confetti: 0, toast: null });
  const pendingScroll = useRef(null);
  const firstRender = useRef(true);

  const setMode = useCallback((next) => {
    setModeState(next);
    try {
      const url = new URL(window.location.href);
      if (next === "summary") url.searchParams.set(MODE_PARAM, SUMMARY_VALUE);
      else url.searchParams.delete(MODE_PARAM);
      url.hash = "";
      window.history.replaceState(null, "", url);
    } catch {
      // Older browsers without URL support simply skip the shareable link.
    }
  }, []);

  /* After the mode changes, land on the requested section or the top. */
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    const target = pendingScroll.current;
    pendingScroll.current = null;
    window.requestAnimationFrame(() => {
      const node = target && document.getElementById(target);
      if (node) node.scrollIntoView();
      else window.scrollTo(0, 0);
    });
  }, [mode]);

  const goTo = useCallback(
    (id) => {
      if (mode !== "story") {
        pendingScroll.current = id;
        setMode("story");
        return;
      }
      const node = document.getElementById(id);
      if (node) node.scrollIntoView();
    },
    [mode, setMode],
  );

  const trigger = useCallback((name) => {
    const toasts = {
      snow: "Easter egg found: snow day",
      confetti: "Easter egg found: Konami code",
    };
    setEffects((current) => ({
      ...current,
      [name]: current[name] + 1,
      toast: { id: Date.now(), text: toasts[name] },
    }));
  }, []);

  const value = useMemo(
    () => ({ mode, setMode, goTo, paletteOpen, setPaletteOpen, effects, trigger }),
    [mode, setMode, goTo, paletteOpen, effects, trigger],
  );

  return <SiteContext.Provider value={value}>{children}</SiteContext.Provider>;
}

export function useSite() {
  const context = useContext(SiteContext);
  if (!context) throw new Error("useSite must be used inside <SiteProvider>");
  return context;
}
