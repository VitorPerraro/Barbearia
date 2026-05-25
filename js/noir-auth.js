/* NOIR BARBER — Autenticação via Supabase Auth (senha no servidor) */
(function (global) {
  const LOCK_KEY = 'noir_login_lock';
  const MAX_ATTEMPTS = 5;
  const LOCK_MINUTES = 15;

  function db() {
    return global.NoirSupabase.getClient();
  }

  function getLock() {
    try {
      const raw = sessionStorage.getItem(LOCK_KEY);
      return raw ? JSON.parse(raw) : { attempts: 0, until: null };
    } catch {
      return { attempts: 0, until: null };
    }
  }

  function setLock(lock) {
    sessionStorage.setItem(LOCK_KEY, JSON.stringify(lock));
  }

  function isLocked() {
    const lock = getLock();
    if (lock.until && Date.now() < lock.until) return true;
    if (lock.until && Date.now() >= lock.until) setLock({ attempts: 0, until: null });
    return false;
  }

  function lockRemainingMs() {
    const lock = getLock();
    return lock.until ? Math.max(0, lock.until - Date.now()) : 0;
  }

  function recordFailedAttempt() {
    const lock = getLock();
    lock.attempts += 1;
    if (lock.attempts >= MAX_ATTEMPTS) {
      lock.until = Date.now() + LOCK_MINUTES * 60 * 1000;
      lock.attempts = 0;
    }
    setLock(lock);
  }

  function clearLock() {
    setLock({ attempts: 0, until: null });
  }

  function translateAuthError(msg) {
    const m = (msg || '').toLowerCase();
    if (m.includes('invalid login') || m.includes('invalid credentials')) {
      return 'E-mail ou senha incorretos.';
    }
    if (m.includes('email not confirmed')) {
      return 'Confirme seu e-mail no Supabase antes de entrar.';
    }
    if (m.includes('too many requests')) {
      return 'Muitas tentativas. Aguarde alguns minutos.';
    }
    return msg || 'Erro ao autenticar.';
  }

  const NoirAuth = {
    async init() {
      if (!global.NoirSupabase.isConfigured()) return null;
      const { data: { session } } = await db().auth.getSession();
      return session;
    },

    async login(email, password) {
      if (!global.NoirSupabase.isConfigured()) {
        throw new Error('Supabase não configurado. Edite js/supabase-config.js');
      }
      if (isLocked()) {
        const mins = Math.ceil(lockRemainingMs() / 60000);
        throw new Error(`Muitas tentativas. Aguarde ${mins} minuto(s).`);
      }

      const { data, error } = await db().auth.signInWithPassword({
        email: (email || '').trim().toLowerCase(),
        password,
      });

      if (error) {
        recordFailedAttempt();
        throw new Error(translateAuthError(error.message));
      }

      clearLock();
      return { session: data.session, user: data.user };
    },

    async changePassword(email, currentPassword, newPassword) {
      if (newPassword.length < 8) {
        throw new Error('A nova senha deve ter no mínimo 8 caracteres.');
      }
      if (!/[A-Z]/.test(newPassword) || !/[a-z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
        throw new Error('Use maiúsculas, minúsculas e números na nova senha.');
      }

      const { error: signError } = await db().auth.signInWithPassword({
        email: (email || '').trim().toLowerCase(),
        password: currentPassword,
      });
      if (signError) throw new Error('Senha atual incorreta.');

      const { error } = await db().auth.updateUser({ password: newPassword });
      if (error) throw new Error(translateAuthError(error.message));
      return true;
    },

    async isAuthenticated() {
      if (!global.NoirSupabase.isConfigured()) return false;
      const { data: { session } } = await db().auth.getSession();
      return !!session;
    },

    async getSession() {
      const { data: { session } } = await db().auth.getSession();
      return session;
    },

    async getUserEmail() {
      const session = await this.getSession();
      return session?.user?.email || '';
    },

    async logout() {
      await db().auth.signOut();
    },

    onAuthStateChange(callback) {
      return db().auth.onAuthStateChange((_event, session) => callback(session));
    },

    isLocked,
    lockRemainingMs,
    isConfigured: () => global.NoirSupabase.isConfigured(),
  };

  global.NoirAuth = NoirAuth;
})(typeof window !== 'undefined' ? window : globalThis);
