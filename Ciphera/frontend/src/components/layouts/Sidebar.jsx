import React from "react";
import { NavLink } from "react-router-dom";
import "./sidebar.css";

export default function Sidebar() {
  const links = Array.from({ length: 12 }, (_, i) => ({
    to: `/design${String(i + 1).padStart(2, "0")}`,
    label: `Design ${i + 1}`,
  }));

  return (
    <aside className="sidebar">
      <div className="brand">Ciphera</div>
      <nav>
        <ul>
          {links.map((l) => (
            <li key={l.to}>
              <NavLink to={l.to} className={({ isActive }) => (isActive ? "active" : "")}>
                {l.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
      <div className="sidebar-footer">v1.0</div>
    </aside>
  );
}