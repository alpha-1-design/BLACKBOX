// www/maintenance.js
const MaintenanceModule = {
  async factoryReset() {
    if (confirm("WARNING: This will permanently wipe all secrets, journals, and credentials. Continue?")) {
      localStorage.clear();
      indexedDB.deleteDatabase('BLACKBOX_VAULT');
      
      const cacheKeys = await caches.keys();
      await Promise.all(cacheKeys.map(k => caches.delete(k)));
      
      window.location.reload();
    }
  },
  
  clearCaches() {
    caches.keys().then(keys => keys.forEach(k => caches.delete(k)));
    alert("Cache cleared.");
  }
};
window.MaintenanceModule = MaintenanceModule;
