import React from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import Upload from "./components/upload/Upload";
import "./index.css";

export default function App() {
  return (
    <Router>
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
        <Route path="/upload" element={<Upload />} />
      </Routes>
    </Router>
  );
}
