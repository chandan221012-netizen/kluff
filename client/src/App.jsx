
import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Home from './pages/Home';
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
      <div className="min-h-screen py-4">
        <Routes>
          {/* Main SaaS Platform Landing Page */}
          <Route path="/" element={<Home />} />

          {/* Customer QR Upload & Spooling Route */}
          <Route path="/print/:token" element={<CustomerPrint />} />

          {/* Protected Shop Owner Dashboard */}
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <ShopDashboard />
              </ProtectedRoute>
            }
          />

          {/* Dev Test Shortcut Route */}
          <Route path="/test" element={<Navigate to="/print/test-shop-token-123" replace />} />

          {/* Shop Owner Auth Routes */}
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />

          {/* Fallback Route */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </Router>
  );
}