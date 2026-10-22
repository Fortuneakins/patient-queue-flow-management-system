import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { api, ApiError, SOCKET_URL } from '../services/api';

const STORAGE_TOKEN = 'pqfms_token';
const STORAGE_USER = 'pqfms_user';

export function usePQFMS() {
  const [token, setToken] = useState(() => localStorage.getItem(STORAGE_TOKEN));

  const [user, setUser] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_USER) || 'null');
    } catch {
      return null;
    }
  });

  const [publicQueue, setPublicQueue] = useState({
    now_serving: null,
    waiting_counts: {
      1: 0,
      2: 0,
      3: 0,
      4: 0
    }
  });

  const [predictions, setPredictions] = useState({
    '1': null,
    '2': null,
    '3': null,
    '4': null,
    degraded: true,
    estimate_quality: 'LOADING',
    reason: 'Waiting for a live operational estimate.',
    staffed_doctors: 0
  });

  const [staffQueue, setStaffQueue] = useState([]);
  const [patients, setPatients] = useState([]);
  const [history, setHistory] = useState([]);
  const [overview, setOverview] = useState(null);
  const [staff, setStaff] = useState([]);
  const [shifts, setShifts] = useState([]);
  const [staffPerformance, setStaffPerformance] = useState([]);
  const [dischargeLog, setDischargeLog] = useState([]);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [liveConnected, setLiveConnected] = useState(false);

  const socketRef = useRef(null);

  const logout = useCallback(() => {
    localStorage.removeItem(STORAGE_TOKEN);
    localStorage.removeItem(STORAGE_USER);

    setToken(null);
    setUser(null);
    setStaffQueue([]);
    setPatients([]);
    setHistory([]);
    setOverview(null);
    setStaff([]);
    setShifts([]);
    setStaffPerformance([]);
    setDischargeLog([]);
  }, []);

  const clearError = useCallback(() => setError(''), []);

  const surfaceError = useCallback(
    (err) => {
      const message =
        err instanceof ApiError
          ? err.message
          : err?.message || 'An unexpected error occurred.';

      setError(message);

      if (err?.status === 401 && token) {
        logout();
      }

      return message;
    },
    [logout, token]
  );

  const login = useCallback(
    async (credentials) => {
      setBusy(true);
      clearError();

      try {
        const result = await api.login(credentials);

        localStorage.setItem(STORAGE_TOKEN, result.token);

        const nextUser = {
          staff_id: result.staff_id,
          username: result.username,
          role: result.role,
          must_reset_password: result.must_reset_password,
          extra_permissions: result.extra_permissions || []
        };

        localStorage.setItem(STORAGE_USER, JSON.stringify(nextUser));

        setToken(result.token);
        setUser(nextUser);

        return nextUser;
      } catch (err) {
        surfaceError(err);
        throw err;
      } finally {
        setBusy(false);
      }
    },
    [clearError, surfaceError]
  );

  const refreshPublic = useCallback(async () => {
    try {
      setPublicQueue(await api.publicQueue());
    } catch (err) {
      surfaceError(err);
    }
  }, [surfaceError]);

  const refreshPredictions = useCallback(async () => {
    try {
      setPredictions(await api.predictions());
    } catch {
      setPredictions((previous) => ({
        ...previous,
        degraded: true
      }));
    }
  }, []);

  const refreshQueue = useCallback(async () => {
    // The protected staff queue endpoint is available only to nurses and doctors.
    if (!token || !['NURSE', 'DOCTOR'].includes(user?.role)) return;

    try {
      setStaffQueue(await api.staffQueue(token));
    } catch (err) {
      surfaceError(err);
    }
  }, [token, user?.role, surfaceError]);

  const refreshPatients = useCallback(
    async (q = '') => {
      if (!token) return;

      try {
        setPatients(await api.listPatients(token, q));
      } catch (err) {
        surfaceError(err);
      }
    },
    [token, surfaceError]
  );

  const refreshOverview = useCallback(async () => {
    // The history overview endpoint is restricted to clinical roles and admins.
    if (!token || !['NURSE', 'DOCTOR', 'ADMIN'].includes(user?.role)) return;

    try {
      setOverview(await api.overview(token));
    } catch (err) {
      surfaceError(err);
    }
  }, [token, user?.role, surfaceError]);

  const refreshStaff = useCallback(async () => {
    if (!token) return;

    try {
      setStaff(await api.listStaff(token));
    } catch (err) {
      surfaceError(err);
    }
  }, [token, surfaceError]);

  const refreshShifts = useCallback(
    async (date = '') => {
      if (!token) return;

      try {
        setShifts(await api.listShifts(token, date));
      } catch (err) {
        surfaceError(err);
      }
    },
    [token, surfaceError]
  );

  const refreshPerformance = useCallback(async () => {
    if (!token) return;

    try {
      setStaffPerformance(await api.staffPerformance(token));
    } catch (err) {
      surfaceError(err);
    }
  }, [token, surfaceError]);

  const refreshDischargeLog = useCallback(async () => {
    if (!token) return;

    try {
      setDischargeLog(await api.dischargeLog(token));
    } catch (err) {
      surfaceError(err);
    }
  }, [token, surfaceError]);

  const refreshHistory = useCallback(
    async (identificationNumber) => {
      if (!token || !identificationNumber) {
        setHistory([]);
        return [];
      }

      try {
        const result = await api.history(token, identificationNumber);
        setHistory(result);
        return result;
      } catch (err) {
        surfaceError(err);
        throw err;
      }
    },
    [token, surfaceError]
  );

  const createPatient = useCallback(
    async (payload) => {
      setBusy(true);
      clearError();

      try {
        const result = await api.createPatient(token, payload);
        await refreshPatients('');
        return result;
      } catch (err) {
        surfaceError(err);
        throw err;
      } finally {
        setBusy(false);
      }
    },
    [token, clearError, refreshPatients, surfaceError]
  );

  const checkIn = useCallback(
    async (payload) => {
      clearError();

      try {
        const result = await api.checkIn(payload);

        await Promise.all([
          refreshPublic(),
          refreshPredictions()
        ]);

        return result;
      } catch (err) {
        surfaceError(err);
        throw err;
      }
    },
    [clearError, refreshPredictions, refreshPublic, surfaceError]
  );

  const assistedCheckIn = useCallback(
    async (payload) => {
      clearError();

      try {
        const result = await api.assistedCheckIn(token, payload);

        await Promise.all([
          refreshQueue(),
          refreshPublic(),
          refreshPredictions(),
          refreshOverview()
        ]);

        return result;
      } catch (err) {
        surfaceError(err);
        throw err;
      }
    },
    [
      clearError,
      refreshOverview,
      refreshPredictions,
      refreshPublic,
      refreshQueue,
      surfaceError,
      token
    ]
  );

  const setPriority = useCallback(
    async (id, tier) => {
      try {
        const result = await api.setPriority(token, id, tier);

        await Promise.all([
          refreshQueue(),
          refreshPublic(),
          refreshPredictions()
        ]);

        return result;
      } catch (err) {
        surfaceError(err);
        throw err;
      }
    },
    [
      refreshPredictions,
      refreshPublic,
      refreshQueue,
      surfaceError,
      token
    ]
  );

  const callPatient = useCallback(
    async (id) => {
      try {
        const result = await api.callPatient(token, id);

        await Promise.all([
          refreshQueue(),
          refreshPublic(),
          refreshPredictions()
        ]);

        return result;
      } catch (err) {
        surfaceError(err);
        throw err;
      }
    },
    [
      refreshPredictions,
      refreshPublic,
      refreshQueue,
      surfaceError,
      token
    ]
  );

  const saveNotes = useCallback(
    async (id, notes) => {
      try {
        const result = await api.saveNotes(token, id, notes);
        await refreshQueue();
        return result;
      } catch (err) {
        surfaceError(err);
        throw err;
      }
    },
    [refreshQueue, surfaceError, token]
  );

  const discharge = useCallback(
    async (id) => {
      try {
        const result = await api.discharge(token, id);

        const refreshes = [
          refreshQueue(),
          refreshPublic(),
          refreshPredictions(),
          refreshOverview()
        ];

        if (user?.role === 'ADMIN') {
          refreshes.push(refreshPerformance());
        }

        await Promise.all(refreshes);

        return result;
      } catch (err) {
        surfaceError(err);
        throw err;
      }
    },
    [
      refreshOverview,
      refreshPerformance,
      refreshPredictions,
      refreshPublic,
      refreshQueue,
      surfaceError,
      token,
      user?.role
    ]
  );

  const createStaff = useCallback(
    async (payload) => {
      const result = await api.createStaff(token, payload);
      await refreshStaff();
      return result;
    },
    [refreshStaff, token]
  );

  const updateStaffStatus = useCallback(
    async (id, isActive) => {
      const result = await api.updateStaffStatus(token, id, {
        is_active: isActive
      });

      await refreshStaff();

      return result;
    },
    [refreshStaff, token]
  );

  const updatePermission = useCallback(
    async (id, permission, grant) => {
      const result = await api.updatePermission(token, id, {
        permission,
        grant
      });

      await refreshStaff();

      return result;
    },
    [refreshStaff, token]
  );

  const getLoginHistory = useCallback(
    async (id) => api.loginHistory(token, id),
    [token]
  );

  const changePassword = useCallback(
    async (payload) => api.changePassword(token, payload),
    [token]
  );

  const createShift = useCallback(
    async (payload) => {
      const result = await api.createShift(token, payload);
      await refreshShifts();
      return result;
    },
    [refreshShifts, token]
  );

  const deleteShift = useCallback(
    async (id) => {
      const result = await api.deleteShift(token, id);
      await refreshShifts();
      return result;
    },
    [refreshShifts, token]
  );

  const verifyPatient = useCallback(
    (identificationNumber) => api.verifyPatient(identificationNumber),
    []
  );

  useEffect(() => {
    let active = true;
    let inFlight = false;

    const refreshVisibleLiveData = async () => {
      if (!active || document.visibilityState !== 'visible' || inFlight) return;
      inFlight = true;
      try {
        await Promise.allSettled([refreshPublic(), refreshPredictions()]);
      } finally {
        inFlight = false;
      }
    };

    const refreshOnResume = () => {
      if (document.visibilityState === 'visible') void refreshVisibleLiveData();
    };

    void refreshVisibleLiveData();
    const interval = window.setInterval(refreshOnResume, 15000);
    window.addEventListener('focus', refreshOnResume);
    window.addEventListener('online', refreshOnResume);
    document.addEventListener('visibilitychange', refreshOnResume);

    return () => {
      active = false;
      window.clearInterval(interval);
      window.removeEventListener('focus', refreshOnResume);
      window.removeEventListener('online', refreshOnResume);
      document.removeEventListener('visibilitychange', refreshOnResume);
    };
  }, [refreshPredictions, refreshPublic]);

  useEffect(() => {
// The staff queue is available only to nurses and doctors.
    if (user?.role === 'NURSE' || user?.role === 'DOCTOR') {
      refreshQueue();
    }

    // The patient directory is available to all authenticated staff roles.
    refreshPatients('');

    // The overview is restricted by the backend to clinical roles and admins.
    if (['NURSE', 'DOCTOR', 'ADMIN'].includes(user?.role)) {
      refreshOverview();
    }

    // Admin-only data.
    if (user?.role === 'ADMIN') {
      refreshStaff();
      refreshShifts();
      refreshPerformance();
      refreshDischargeLog();
    }

    const socket = io(SOCKET_URL, {
      transports: ['websocket', 'polling']
    });

    socketRef.current = socket;

    const onConnect = () => {
      setLiveConnected(true);
    };

    const onDisconnect = () => {
      setLiveConnected(false);
    };

    const onUpdate = () => {
      // Only clinical queue users should request the protected staff queue.
      if (user?.role === 'NURSE' || user?.role === 'DOCTOR') {
        refreshQueue();
      }

      refreshPublic();
      refreshPredictions();

      // A queue update can be broadcast to Reception too; do not request
      // the protected clinical overview for roles that cannot access it.
      if (['NURSE', 'DOCTOR', 'ADMIN'].includes(user?.role)) {
        refreshOverview();
      }
    };

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('queue_updated', onUpdate);

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('queue_updated', onUpdate);

      socket.disconnect();

      socketRef.current = null;
      setLiveConnected(false);
    };
  }, [
    token,
    user?.role,
    refreshDischargeLog,
    refreshOverview,
    refreshPatients,
    refreshPerformance,
    refreshPredictions,
    refreshPublic,
    refreshQueue,
    refreshShifts,
    refreshStaff
  ]);

  const activeVisits = useMemo(
    () => staffQueue,
    [staffQueue]
  );

  return {
    token,
    user,
    busy,
    error,
    clearError,
    login,
    logout,
    publicQueue,
    predictions,
    staffQueue: activeVisits,
    patients,
    history,
    overview,
    staff,
    shifts,
    staffPerformance,
    dischargeLog,
    liveConnected,
    refreshPatients,
    refreshHistory,
    refreshOverview,
    refreshStaff,
    refreshShifts,
    refreshPerformance,
    refreshDischargeLog,
    createPatient,
    checkIn,
    assistedCheckIn,
    setPriority,
    callPatient,
    saveNotes,
    discharge,
    createStaff,
    updateStaffStatus,
    updatePermission,
    getLoginHistory,
    changePassword,
    createShift,
    deleteShift,
    verifyPatient
  };
}

export function useIdleLogout(user, onLogout, onNotice) {
  const timer = useRef(null);

  useEffect(() => {
    if (!user) return undefined;

    const reset = () => {
      if (timer.current) {
        clearTimeout(timer.current);
      }

      timer.current = setTimeout(() => {
        onLogout();
        onNotice?.(
          'Your session was locked after five minutes of inactivity.'
        );
      }, 5 * 60 * 1000);
    };

    const events = [
      'mousemove',
      'keydown',
      'click',
      'touchstart'
    ];

    events.forEach((event) => {
      window.addEventListener(event, reset, {
        passive: true
      });
    });

    reset();

    return () => {
      events.forEach((event) => {
        window.removeEventListener(event, reset);
      });

      if (timer.current) {
        clearTimeout(timer.current);
      }
    };
  }, [user, onLogout, onNotice]);
}