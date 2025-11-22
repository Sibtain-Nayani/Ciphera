import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import AppShell from '../features/layout/AppShell';
import Dashboard from '../features/dashboard/Dashboard';
import LoginPage from '../features/auth/LoginPage';
import UploadLanding from '../features/upload/UploadLanding';
import AnonymizationMenu from '../features/anonymization/AnonymizationMenu';
import Audit from '../features/audit/Audit';
import Settings from '../features/settings/Settings';
import { FileProvider } from '../store/FileContext';

function App() {
  return (
    <FileProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />

          <Route element={<AppShell />}>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/upload" element={<UploadLanding />} />
            <Route path="/anonymize" element={<AnonymizationMenu />} />
            <Route path="/audit" element={<Audit />} />
            <Route path="/settings" element={<Settings />} />
          </Route>

          {/* Fallback route */}
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>

        <Toaster position="bottom-right" toastOptions={{
          style: {
            background: '#18181b',
            color: '#fff',
            border: '1px solid rgba(255,255,255,0.1)',
          },
        }} />
      </BrowserRouter>
    </FileProvider >
  );
}

export default App;
