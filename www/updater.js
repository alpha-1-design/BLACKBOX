const Updater = {
  repo: 'alpha-1-design/Blackbox',
  currentVersion: '2.0.0',
  fdroidUrl: 'https://f-droid.org/packages/com.blackbox.app/',
  githubReleasesUrl: 'https://github.com/alpha-1-design/Blackbox/releases',

  async check() {
    try {
      const res = await fetch(`https://api.github.com/repos/${this.repo}/releases/latest`, {
        headers: { 'Accept': 'application/vnd.github.v3+json' },
        signal: AbortSignal.timeout(10000)
      });
      if (!res.ok) return { error: 'GitHub API unreachable' };
      const data = await res.json();
      const latest = (data.tag_name || '').replace(/^v/i, '');
      const current = this.currentVersion;
      const cmp = this._compareVersions(latest, current);
      return {
        updateAvailable: cmp > 0,
        latestVersion: latest,
        currentVersion: current,
        releaseUrl: data.html_url || this.githubReleasesUrl,
        publishedAt: data.published_at,
        notes: data.body ? data.body.slice(0, 500) : null
      };
    } catch (e) {
      return { error: e.name === 'TimeoutError' ? 'Request timed out' : 'No network' };
    }
  },

  openFdroid() {
    window.open(this.fdroidUrl, '_blank');
  },

  openGitHub() {
    window.open(this.githubReleasesUrl, '_blank');
  },

  _compareVersions(a, b) {
    const pa = a.split('.').map(Number);
    const pb = b.split('.').map(Number);
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
      const na = pa[i] || 0, nb = pb[i] || 0;
      if (na > nb) return 1;
      if (na < nb) return -1;
    }
    return 0;
  }
};
