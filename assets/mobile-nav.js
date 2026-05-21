/* Nova Kingdom Rentals — Mobile Navigation JS
   The drawer and hamburger button live entirely outside React's #root,
   driven by a CSS checkbox (#nk-mnav). This script only handles:
   - Escape key to close the menu
   That is the only behaviour that CSS alone cannot implement.
   No MutationObserver. No React DOM manipulation.
*/
(function () {
  'use strict';
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' || e.keyCode === 27) {
      var cb = document.getElementById('nk-mnav');
      if (cb) cb.checked = false;
    }
  });
})();
