(function () {
  function reportError(context, error) {
    try {
      console.error(context, error);
    } catch {
    }
  }

  window.addEventListener('error', function (event) {
    reportError('Unhandled error', event.error || event.message);
  });

  window.addEventListener('unhandledrejection', function (event) {
    reportError('Unhandled promise rejection', event.reason);
  });

  document.addEventListener('change', function (event) {
    var target = event.target;
    if (!target || target.tagName !== 'INPUT' || target.type !== 'file') return;
    if (!target.accept || target.accept.indexOf('image') === -1) return;
    if (!target.files || target.files.length === 0) return;
    if (target.files.length > 3) {
      alert('Please select up to 3 images.');
    }
  });
})();
