// www/patcher.js
const PatchManager = {
  patchEndpoint: 'https://blackbox-patches.alpha1.design', 

  async checkAndApply() {
    try {
      const remoteManifest = await fetch(`${this.patchEndpoint}/manifest.json?t=${Date.now()}`).then(r => r.json());
      const localManifest = JSON.parse(localStorage.getItem('patch-manifest') || '{}');

      for (const [file, info] of Object.entries(remoteManifest)) {
        if (localManifest[file]?.hash !== info.hash) {
          const content = await fetch(`${this.patchEndpoint}/${file}?v=${info.hash}`).then(r => r.text());
          
          if (file.endsWith('.js')) {
            const blob = new Blob([content], { type: 'application/javascript' });
            const script = document.createElement('script');
            script.src = URL.createObjectURL(blob);
            document.head.appendChild(script);
          } else if (file.endsWith('.css')) {
            const style = document.createElement('style');
            style.innerHTML = content;
            document.head.appendChild(style);
          }
          localManifest[file] = info;
        }
      }
      localStorage.setItem('patch-manifest', JSON.stringify(localManifest));
    } catch (e) {
      console.warn("Patching service inactive.");
    }
  }
};
window.PatchManager = PatchManager;
