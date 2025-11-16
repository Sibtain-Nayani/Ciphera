import React from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import Sidebar from "./components/layouts/Sidebar";
import Topbar from "./components/layouts/Topbar";
import Design01 from "./components/design01/Design01";
import Design02 from "./components/design02/Design02";
import Design03 from "./components/design03/Design03";
import Design04 from "./components/design04/Design04";
import Design05 from "./components/design05/Design05";
import Design06 from "./components/design06/Design06";
import Design07 from "./components/design07/Design07";
import Design08 from "./components/design08/Design08";
import Design09 from "./components/design09/Design09";
import Design10 from "./components/design10/Design10";
import Design11 from "./components/design11/Design11";
import Design12 from "./components/design12/Design12";
import "./index.css";

export default function App() {
  return (
    <Router>
      <div className="app-root">
        <Sidebar />
        <div className="content-area">
          <Topbar />
          <main className="main-view">
            <Routes>
              <Route path="/" element={<Design01 />} />
              <Route path="/design01" element={<Design01 />} />
              <Route path="/design02" element={<Design02 />} />
              <Route path="/design03" element={<Design03 />} />
              <Route path="/design04" element={<Design04 />} />
              <Route path="/design05" element={<Design05 />} />
              <Route path="/design06" element={<Design06 />} />
              <Route path="/design07" element={<Design07 />} />
              <Route path="/design08" element={<Design08 />} />
              <Route path="/design09" element={<Design09 />} />
              <Route path="/design10" element={<Design10 />} />
              <Route path="/design11" element={<Design11 />} />
              <Route path="/design12" element={<Design12 />} />
            </Routes>
          </main>
        </div>
      </div>
    </Router>
  );
}
