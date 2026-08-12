import { NavLink, Routes, Route } from "react-router-dom";
import { HomePage } from "./pages/HomePage";
import { AboutPage } from "./pages/AboutPage";
import { FileStockPage } from "./pages/FileStockPage";

// Route-level composition lives here. Pages compose components and use hooks
// for data; components and hooks never wire routes themselves. EVERY feature
// page MUST be (a) added to <Routes> below and (b) reachable from a nav
// affordance (the navbar links) , an unrouted page is dead to the user, which
// the kit's UX gate (lakebase-sftdd-ux-clean) flags. Model new pages on the
// AboutPage example: routed here + linked in the navbar + styled via global.css.
export function App() {
  return (
    <>
      <nav className="navbar">
        <span className="navbar__brand">
          <img className="navbar__icon" src="/favicon.svg" alt="" />
          stockflow-instrumented-20260809-105157
        </span>
        <span className="navbar__links">
          <NavLink
            to="/"
            end
            className={({ isActive }) => `navbar__link${isActive ? " navbar__link--active" : ""}`}
          >
            Home
          </NavLink>
          <NavLink
            to="/file-stock"
            className={({ isActive }) => `navbar__link${isActive ? " navbar__link--active" : ""}`}
          >
            File Stock
          </NavLink>
          <NavLink
            to="/about"
            className={({ isActive }) => `navbar__link${isActive ? " navbar__link--active" : ""}`}
          >
            About
          </NavLink>
        </span>
      </nav>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/file-stock" element={<FileStockPage />} />
        <Route path="/about" element={<AboutPage />} />
      </Routes>
    </>
  );
}
