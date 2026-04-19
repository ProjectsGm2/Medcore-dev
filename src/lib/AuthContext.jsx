import React, { createContext, useState, useContext, useEffect } from 'react';
import { base44 } from '@/api/apiClient';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [permissions, setPermissions] = useState({});
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [authError, setAuthError] = useState(null);

  useEffect(() => {
    const token = localStorage.getItem('medcore_access_token');
    if (!token) {
      // No session token means the user must log in.
      setIsLoadingAuth(false);
      setAuthError({ type: 'auth_required', message: 'Authentication required' });
      return;
    }

    const checkAuth = async () => {
      try {
        const currentUser = await base44.auth.me();

        // If the backend responds with no user (unexpected), treat as unauthenticated.
        if (!currentUser) {
          localStorage.removeItem('medcore_access_token');
          setUser(null);
          setAuthError({ type: 'auth_required', message: 'Authentication required' });
          return;
        }

        setUser(currentUser);
        setAuthError(null);

        // Fetch permissions from settings
        try {
          const settings = await base44.settings.all();
          if (settings.permissions_json) {
            setPermissions(JSON.parse(settings.permissions_json));
          }
        } catch (e) {
          console.error("Failed to load permissions", e);
        }
      } catch (error) {
        setUser(null);
        // If the token is invalid or expired, force login.
        if (error?.status === 401 || error?.status === 403) {
          localStorage.removeItem('medcore_access_token');
          setAuthError({ type: 'auth_required', message: 'Authentication required' });
        } else {
          // If the API itself is unreachable, show a friendly message.
          setAuthError({
            type: 'auth_unavailable',
            message:
              'Authentication is not available. Contact your vendor to register a user.',
          });
        }
      } finally {
        setIsLoadingAuth(false);
      }
    };

    checkAuth();
  }, []);

  const login = async (email, password) => {
    const data = await base44.auth.login({ email, password });
    setUser(data.user);
    setAuthError(null);
    
    // Fetch permissions after login
    try {
      const settings = await base44.settings.all();
      if (settings.permissions_json) {
        setPermissions(JSON.parse(settings.permissions_json));
      }
    } catch (e) {
      console.error("Failed to load permissions after login", e);
    }
    
    return data;
  };

  const logout = () => {
    base44.auth.logout('/login');
    setUser(null);
    setPermissions({});
    setAuthError({ type: 'auth_required', message: 'Not authenticated' });
  };

  const navigateToLogin = () => {
    base44.auth.redirectToLogin(window.location.href);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        permissions,
        isLoadingAuth,
        authError,
        login,
        logout,
        navigateToLogin,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const usePermission = () => {
  const { user, permissions } = useAuth();
  
  const can = (module, action) => {
    if (!user) return false;
    // Admins have full access to everything always
    if (user.role === 'admin') return true;
    
    const role = user.role?.toLowerCase() || 'user';
    const rolePerms = permissions[role];
    
    if (!rolePerms) return false;
    
    const modulePerms = rolePerms[module];
    if (!modulePerms) return false;
    
    return !!modulePerms[action];
  };
  
  return { can };
};
