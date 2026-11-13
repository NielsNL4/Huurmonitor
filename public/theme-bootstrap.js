(function () {
  var theme;
  try { theme = localStorage.getItem('huurmonitor-theme-v1'); } catch (_) {}
  if (theme !== 'light' && theme !== 'dark') theme = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
  document.querySelectorAll('meta[name="theme-color"]').forEach(function (meta) { meta.content = theme === 'light' ? '#f5f3ed' : '#141412'; });
}());
