// =========================================
// js/backup.js — rolling backup API
// =========================================
(function () {
  const MAX_BACKUPS = 50; // keep latest 50 logins by default

  function safeParse(json) {
    try {
      return JSON.parse(json);
    } catch {
      return null;
    }
  }

  async function saveRollingBackup() {
    const visitsRaw = localStorage.getItem('visits');
    const visits = safeParse(visitsRaw);

    const record = {
      createdAt: Date.now(),
      meta: {
        type: 'login-snapshot',
        app: 'bookCrypt',
        version: 1,
      },
      payload: {
        visitsCiphertexts: Array.isArray(visits) ? visits : [],
      },
    };

    await DB.addBackup(record);

    // prune if over cap
    const total = await DB.countBackups();
    const overflow = total - MAX_BACKUPS;
    if (overflow > 0) {
      await DB.deleteOldest(overflow);
    }

    return true;
  }

  async function listBackups(limit = 20) {
    return DB.listBackupsDesc(limit);
  }

  // NEW: delete helpers
  async function deleteBackup(id) {
    return DB.deleteById(id);
  }
  async function deleteBackups(ids = []) {
    return DB.deleteByIds(ids);
  }

  window.Backup = { saveRollingBackup, listBackups, deleteBackup, deleteBackups };
})();
