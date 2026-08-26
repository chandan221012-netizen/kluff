
import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import CustomerPrint from './pages/CustomerPrint';
import ShopDashboard from './pages/ShopDashboard';
import Login from './pages/Login';
import Register from './pages/Register';


function ProtectedRoute({ children }) {
  const token = localStorage.getItem('ownerToken');
  if (!token) {
    return <Navigate to="/login" replace />;
  }
  return children;
}

export default function App() {
  return (
    <Router>
      <div className="min-h-screen bg-slate-50 py-4">
        <Routes>
          {/* Customer QR Upload Route */}
          <Route path="/print/:token" element={<CustomerPrint />} />

          <Route path="/dashboard" element={<ShopDashboard />} />

          {/* Dev Test Shortcut Route */}
          <Route path="/test" element={<Navigate to="/print/test-shop-token-123" replace />} />

          {/* Shop Owner Auth Routes */}
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />

          {/* Fallback Home Route */}
          <Route
            path="*"
            element={
              <div className="text-center p-8 text-slate-500">
                Scan a shop QR code to print documents.
              </div>
            }
          />
        </Routes>
      </div>
    </Router>
  );
}