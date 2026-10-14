import "./App.css";
import React from "react";
import { BrowserRouter as Router, Route, Routes } from "react-router-dom";
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

function App() {
  return (
    <Router>
      <Navbar />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Router>
  );
}

export default App;
