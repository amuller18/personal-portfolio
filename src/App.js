import "./App.css";
import React, { useEffect } from "react";
import { BrowserRouter as Router, Route, Routes } from "react-router-dom";
import { SiteProvider } from "./context/SiteContext";
import CommandPalette from "./Pages/Home/CommandPalette";
import { CursorEffects, EffectsLayer, Hotkeys } from "./Pages/Home/Effects";
import Navbar from "./Pages/Home/Navbar";
import Home from "./Pages/Home/Homescreen";

function NotFound() {
  return (
    <main className="not-found">
      <p className="eyebrow">404</p>
      <h1>This chapter doesn&apos;t exist.</h1>
      <a className="btn btn--primary" href="/">
        Back to the story
      </a>
    </main>
  );
}

/* A hello for anyone curious enough to open the developer console. */
function useConsoleGreeting() {
  useEffect(() => {
    console.log("%cHey, you opened the console 👋", "color:#7cf2c4;font:600 14px system-ui;");
    console.log("Try ⌘K / Ctrl+K, type “ski”, or enter the Konami code.");
  }, []);
}

function App() {
  useConsoleGreeting();
  return (
    <SiteProvider>
      <Router>
        <CursorEffects />
        <Hotkeys />
        <Navbar />
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
        <CommandPalette />
        <EffectsLayer />
      </Router>
    </SiteProvider>
  );
}

export default App;
