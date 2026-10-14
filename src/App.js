import "./App.css";
import React, { lazy, Suspense } from "react";
import { BrowserRouter as Router, Outlet, Route, Routes } from "react-router-dom";
import Navbar from "./Pages/Home/Navbar";
import Home from "./Pages/Home/Homescreen";

/* Game modes are full-screen and load on demand. */
const SkiGame = lazy(() => import("./games/ski/SkiGame"));

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

function SiteLayout() {
  return (
    <>
      <Navbar />
      <Outlet />
    </>
  );
}

function App() {
  return (
    <Router>
      <Routes>
        <Route
          path="/ski"
          element={
            <Suspense fallback={<div className="game-loading">Loading the lift…</div>}>
              <SkiGame />
            </Suspense>
          }
        />
        <Route element={<SiteLayout />}>
          <Route path="/" element={<Home />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </Router>
  );
}

export default App;
