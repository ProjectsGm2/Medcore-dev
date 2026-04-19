import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import { base44 } from '@/api/apiClient';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { resolveImageSrc } from '@/lib/utils';
import { toast } from 'sonner';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { data: branding = {} } = useQuery({
    queryKey: ['settings', 'branding'],
    queryFn: () => base44.settings.branding(),
    staleTime: 5 * 60 * 1000,
  });
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const clinicName = String(branding.clinic_name || '').trim() || 'Clinic';
  const logoUrl = resolveImageSrc(branding.logo || branding.small_logo || '');

  const from = new URLSearchParams(location.search).get('redirect') || '/';

  const handleSubmit = async (event) => {
    event.preventDefault();
    setLoading(true);
    try {
      await login(email.trim(), password);
      navigate(from, { replace: true });
    } catch (error) {
      toast.error(error.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 py-8">
      <div className="w-full max-w-md bg-white rounded-xl shadow-lg p-8">
        <div className="mb-6 flex flex-col items-center text-center">
          {logoUrl ? (
            <img src={logoUrl} alt={clinicName} className="mb-4 max-h-20 w-auto object-contain" />
          ) : null}
          <h1 className="text-2xl font-semibold text-slate-900">Sign in to {clinicName}</h1>
        </div>
        <p className="text-sm text-slate-500 mt-1">Enter your email and password to continue.</p>
        <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
          <div>
            <label className="block text-xs font-medium text-slate-600">Email</label>
            <Input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              required
              placeholder="you@company.com"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600">Password</label>
            <Input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              required
              placeholder="••••••••"
            />
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>
      </div>
    </div>
  );
}
