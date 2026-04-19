import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import { base44 } from '@/api/apiClient';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';

export default function RegisterUser() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('doctor');

  const { data: users = [], isLoading: isLoadingUsers } = useQuery({
    queryKey: ['users'],
    queryFn: () => base44.entities.User.list(),
    enabled: user?.role === 'admin',
  });

  const createUser = useMutation({
    mutationFn: (newData) => base44.entities.User.create(newData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      setName('');
      setEmail('');
      setPassword('');
      setRole('doctor');
      toast.success('User registered successfully');
    },
    onError: (error) => {
      toast.error(error?.message || 'Could not register user');
    },
  });


  const handleSubmit = async (event) => {
    event.preventDefault();
    createUser.mutate({ name, email, password, role });
  };

  return (
    <div className="min-h-screen bg-slate-50 py-8">
      <div className="mx-auto w-full max-w-6xl space-y-8">
        <div className="bg-white rounded-xl shadow-lg p-8">
          <h1 className="text-2xl font-semibold text-slate-900">Register a new user</h1>
          <p className="text-sm text-slate-500 mt-1">Only admins can create new users.</p>
          <form className="mt-6 grid gap-4 md:grid-cols-2" onSubmit={handleSubmit}>
            <div>
              <label className="block text-xs font-medium text-slate-600">Name</label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                placeholder="Jane Doe"
              />
            </div>
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
            <div>
              <label className="block text-xs font-medium text-slate-600">Role</label>
              <Select value={role} onValueChange={setRole}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select a role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="doctor">Doctor</SelectItem>
                  <SelectItem value="receptionist">Receptionist</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="md:col-span-2">
              <Button type="submit" className="w-full" disabled={createUser.isLoading}>
                {createUser.isLoading ? 'Registering…' : 'Register user'}
              </Button>
            </div>
          </form>
        </div>

        <div className="bg-white rounded-xl shadow-lg p-8">
          <h2 className="text-xl font-semibold text-slate-900">All users</h2>
          <p className="text-sm text-slate-500 mt-1">A list of all registered users and their roles.</p>

          {isLoadingUsers ? (
            <div className="flex items-center justify-center py-16">
              <span className="text-slate-500">Loading users…</span>
            </div>
          ) : (
            <div className="mt-6 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-slate-200">
                  <tr>
                    <th className="py-3">Name</th>
                    <th className="py-3">Email</th>
                    <th className="py-3">Role</th>
                    <th className="py-3">Created</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="py-3">{u.name}</td>
                      <td className="py-3">{u.email}</td>
                      <td className="py-3 capitalize">{u.role}</td>
                      <td className="py-3 text-slate-500">{new Date(u.created_at).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
